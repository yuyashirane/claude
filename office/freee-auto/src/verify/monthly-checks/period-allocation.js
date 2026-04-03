'use strict';

/**
 * period-allocation.js — PA-01〜PA-08: 期間配分チェック
 *
 * 以下の3カテゴリで期間按分の不備・定期費用の欠損を検知する。
 *
 * カテゴリ1: 前払費用の償却チェック
 *   PA-01 🟡 前払費用の残高停滞（月割償却漏れの可能性）
 *   PA-02 🟡 長期前払費用の残高停滞
 *   PA-03 🟡 前払費用の急減（取崩し方法の確認）
 *
 * カテゴリ2: 定期発生費用の欠損検知（取引先×科目）
 *   PA-04 🟡 前月にあった取引先×科目が当月にない（計上漏れの可能性）
 *   PA-05 🔵 定期費用の金額が前月比で大幅に変動
 *
 * カテゴリ3: 決算整理仕訳の洗い替え確認（期首月・期首+1ヶ月のみ）
 *   PA-06 🔴 未払法人税等の洗い替え仕訳が未確認
 *   PA-07 🔴 未払消費税等の洗い替え仕訳が未確認
 *   PA-08 🔵 賞与引当金等の期首残高確認
 *
 * データソース:
 *   data.trialBs                     — BS試算表
 *   data.trialBsByItem               — 品目別BS
 *   data.trialPl                     — PL試算表（YTD）
 *   data.trialPlByPartner            — 取引先別PL（YTD）
 *   data.prevMonth?.trialBs          — 前月BS
 *   data.prevMonth?.trialPlByPartner — 前月取引先別PL（YTD）
 *   data.deals                       — 当月取引
 *   data.companyId / targetMonth / startMonth / fiscalYear
 *
 * 注意: trialPlByPartner は期首からの YTD 累計で返る。
 *       単月金額 = 当月YTD - 前月YTD で算出する。
 */

const { getBalances, findAccountBalance, monthsFromFiscalStart } = require('./trial-helpers');
const {
  extractItemBreakdown,
  buildAccountIdNameMap,
  extractDealDetailsForAccount,
} = require('./balance-anomaly');
const {
  journalsByAccountLink,
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
  formatFiscalStartDate,
} = require('../../shared/freee-links');

// ============================================================
// 定数
// ============================================================

// PA-01/02 最小残高（ノイズ除外）
const PREPAID_MIN_BALANCE = 10000;

// PA-03 急減判定の閾値
const PREPAID_DROP_THRESHOLD = 0.5;  // 50%以上の減少
const PREPAID_DROP_MIN_PREV = 50000; // 前月残高50,000円未満は除外

// PA-04 定期発生が期待される科目リスト（年1回費用は除外）
const RECURRING_EXPENSE_ACCOUNTS = [
  '地代家賃',
  '賃借料',
  '支払手数料',
  '通信費',
  '水道光熱費',
  '支払報酬料',
  'リース料',
  '保険料',
  '支払利息',
];

// PA-04 最小平均月額（以下は「不定期」として除外）
const RECURRING_MIN_AVG = 5000;

// PA-04 1科目あたりの欠損取引先の上限表示件数
const RECURRING_MAX_PARTNERS = 5;

// PA-05 変動率閾値
const VARIATION_THRESHOLD = 0.5;   // 50%以上の変動
const VARIATION_MIN_AMOUNT = 10000; // 前月金額10,000円未満は除外

// PA-03/06/07 deals 詳細の上限
const MAX_DETAILS = 10;

// PA-06/07 を実行する最大期首経過月数（期首 or 期首+1ヶ月）
const REVERSAL_MAX_MONTHS = 2;

// PA-08 対象科目（引当金系）
const PROVISION_ACCOUNTS = ['賞与引当金', '退職給付引当金', '役員退職慰労引当金'];

// ============================================================
// ヘルパー: 月の開始日・終了日を算出
// ============================================================

function getMonthRange(targetMonth) {
  const [year, month] = targetMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate:   `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ============================================================
// ヘルパー: 期首月文字列を構築
// ============================================================

/**
 * data.fiscalYear（数値）と data.startMonth（数値）から
 * 期首月を 'YYYY-MM' 形式で返す
 *
 * 例: fiscalYear=2025, startMonth=10 → '2025-10'
 */
function getFiscalStartMonthStr(data) {
  return `${data.fiscalYear}-${String(data.startMonth).padStart(2, '0')}`;
}

// ============================================================
// ヘルパー: 取引先別PL からの単月金額取得
// ============================================================

/**
 * 当月 trialPlByPartner と前月 trialPlByPartner から
 * 特定科目の「当月単月金額」を取引先別に返す
 *
 * freee trial_pl は YTD 累計で返るため、
 *   単月金額 = 当月YTD - 前月YTD
 * として算出する。
 *
 * @param {Object|null} currPlByPartner - 当月 trialPlByPartner
 * @param {Object|null} prevPlByPartner - 前月 trialPlByPartner
 * @param {string} accountName - 科目名
 * @returns {Array<{id, name, currentMonth, prevYtd, avgMonthly, monthsElapsed}>}
 */
function getPartnerMonthlyAmounts(currPlByPartner, prevPlByPartner, accountName, startMonth) {
  if (!currPlByPartner || !prevPlByPartner) return [];

  const currBalances = currPlByPartner.trial_pl?.balances || [];
  const prevBalances = prevPlByPartner.trial_pl?.balances || [];

  const currAcc = currBalances.find(b => b.account_item_name === accountName)
    || currBalances.find(b => b.account_item_name?.includes(accountName));
  const prevAcc = prevBalances.find(b => b.account_item_name === accountName)
    || prevBalances.find(b => b.account_item_name?.includes(accountName));

  if (!currAcc) return [];

  const prevPartnerMap = new Map((prevAcc?.partners || []).map(p => [p.id, p]));

  // prevMonth の対象月文字列から経過月数を算出
  const prevTarget = prevPlByPartner.targetMonth || '';
  const [, prevMon] = prevTarget ? prevTarget.split('-').map(Number) : [0, 0];
  const prevMsFromStart = prevMon
    ? (prevMon >= startMonth
        ? prevMon - startMonth + 1
        : 12 - startMonth + prevMon + 1)
    : 1;

  const results = [];
  for (const p of (currAcc.partners || [])) {
    const prevP = prevPartnerMap.get(p.id);
    const prevYtd = prevP?.closing_balance || 0;
    const currentMonth = p.closing_balance - prevYtd;
    const avgMonthly = prevMsFromStart > 0 ? Math.abs(prevYtd) / prevMsFromStart : 0;

    results.push({
      id: p.id,
      name: p.name || `ID:${p.id}`,
      currentMonth,  // 当月単月金額（負の場合あり）
      prevYtd,       // 前月YTD残高
      avgMonthly,    // 前月時点の平均月額
      monthsElapsed: prevMsFromStart,
    });
  }

  // 前月にはいたが当月にいないパートナーも追加
  for (const prevP of (prevAcc?.partners || [])) {
    if (!currAcc.partners?.find(p => p.id === prevP.id)) {
      const avgMonthly = prevMsFromStart > 0 ? Math.abs(prevP.closing_balance) / prevMsFromStart : 0;
      results.push({
        id: prevP.id,
        name: prevP.name || `ID:${prevP.id}`,
        currentMonth: 0,
        prevYtd: prevP.closing_balance,
        avgMonthly,
        monthsElapsed: prevMsFromStart,
      });
    }
  }

  return results;
}

// ============================================================
// カテゴリ1: 前払費用の償却チェック
// ============================================================

/**
 * PA-01/PA-02: 前払費用（または長期前払費用）の残高停滞
 */
function checkPrepaidStagnation(data, accountName, checkCode, findings) {
  const { trialBs, prevMonth, trialBsByItem, companyId, targetMonth, startMonth, fiscalYear, fiscalYearId, historicalBs } = data;
  if (!trialBs || !prevMonth?.trialBs) return;

  // 期首月はスキップ（前月は前期なので比較不適切）
  if (monthsFromFiscalStart(targetMonth, startMonth) === 1) return;

  const curr = findAccountBalance(trialBs, accountName);
  if (!curr) return;

  const prev = findAccountBalance(prevMonth.trialBs, accountName);
  if (!prev) return;

  const balance = curr.balance;
  if (Math.abs(balance) < PREPAID_MIN_BALANCE) return;
  if (balance <= 0) return; // マイナス前払費用はBA-01が担当

  // 前月と同額（変動なし）
  if (balance !== prev.balance) return;

  // ドリルダウン: 品目別内訳
  const items = extractItemBreakdown(trialBsByItem, accountName);
  const itemDetail = items.slice(0, 5).map(i => `${i.itemName}: ${i.balance.toLocaleString()}円`).join('、');
  // freeeリンク（総勘定元帳・科目×期間絞り込み）
  const { endDate } = getMonthRange(targetMonth);
  const bsBal = getBalances(trialBs).find(b => b.account_item_name === accountName
    || b.account_item_name?.includes(accountName));
  // 親行リンク: 総勘定元帳（start_date は残高推移で動的決定）
  const { startDate: pa01Start } = determineLinkStartDate(
    bsBal?.opening_balance || 0, balance, fiscalYear, startMonth
  );
  let freeeLink = '';
  if (bsBal?.account_item_name && bsBal?.account_item_id) {
    freeeLink = buildBalanceLink(companyId, bsBal.account_item_name, bsBal.account_item_id, endDate, {
      openingBalance: bsBal.opening_balance || 0, closingBalance: balance,
      fiscalYear, startMonth, fiscalYearId, historicalBs,
    });
  }

  // 子行リンク: 親行と同じ探索結果を使用
  const details = items.slice(0, MAX_DETAILS).map(i => ({
    date: '',
    amount: i.balance,
    counterAccount: '',
    description: `[品目] ${i.itemName}`,
    dealId: null,
    freeeLink: (bsBal?.account_item_name && bsBal?.account_item_id)
      ? buildBalanceLink(companyId, bsBal.account_item_name, bsBal.account_item_id, endDate, {
          openingBalance: bsBal.opening_balance || 0, closingBalance: balance,
          fiscalYear, startMonth, fiscalYearId, historicalBs,
        })
      : '',
  }));

  const isLongTerm = accountName.includes('長期');
  const note = isLongTerm
    ? '（長期前払費用は固定資産台帳への登録状況も確認してください）'
    : '';

  findings.push({
    severity: '🟡',
    category: 'period_allocation',
    checkCode,
    description: `「${accountName}」の残高 ${balance.toLocaleString()}円が前月から変動していません。月割償却が行われていない可能性があります。${note}`,
    currentValue: `${balance.toLocaleString()}円（前月同額）`,
    suggestedValue: '月割で前払費用を取り崩す仕訳を確認してください',
    confidence: 75,
    targetMonth,
    freeeLink,
    details,
  });

  // TODO: Phase 2 — PA-02（長期前払費用）において freee 固定資産台帳 API を取得し、
  // 台帳登録済み / 未登録を判別。登録済みなら自動償却されるはずなので台帳設定ミスの可能性。
  // 未登録なら手動月割仕訳が必要。
}

/**
 * PA-03: 前払費用の急減（一括取崩しの確認）
 */
function checkPrepaidSuddenDrop(data, findings) {
  const { trialBs, prevMonth, deals, trialPl, companyId, targetMonth, startMonth, fiscalYear, fiscalYearId, historicalBs } = data;
  if (!trialBs || !prevMonth?.trialBs) return;

  // 決算月（期末月）判定: monthsFromFiscalStart が 12 ならスキップ
  if (monthsFromFiscalStart(targetMonth, startMonth) === 12) return;

  const curr = findAccountBalance(trialBs, '前払費用');
  if (!curr) return;
  const prev = findAccountBalance(prevMonth.trialBs, '前払費用');
  if (!prev) return;

  const prevBal = prev.balance;
  if (prevBal < PREPAID_DROP_MIN_PREV) return;
  if (curr.balance >= prevBal) return; // 増加・同額はスキップ

  const dropRate = (prevBal - curr.balance) / prevBal;
  if (dropRate < PREPAID_DROP_THRESHOLD) return;

  // ドリルダウン: 当月deals から前払費用の仕訳を抽出
  const bsBal = getBalances(trialBs).find(b => b.account_item_name === '前払費用');
  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl);
  const dealDetails = bsBal?.account_item_id
    ? extractDealDetailsForAccount(deals, bsBal.account_item_id, accountIdNameMap)
    : [];
  const limitedDetails = dealDetails.slice(0, MAX_DETAILS);

  let freeeLink = '';
  const { endDate: dropEndDate } = getMonthRange(targetMonth);
  // PA-03: 当期中に急減 → opening !== closing が確定 → 当期の総勘定元帳
  const dropFiscalStartDate = formatFiscalStartDate(fiscalYear, startMonth);
  if (bsBal?.account_item_name) {
    freeeLink = generalLedgerLink(companyId, bsBal.account_item_name, dropFiscalStartDate, dropEndDate,
      { fiscalYearId });
  }

  const dropPercent = Math.round(dropRate * 100);
  findings.push({
    severity: '🟡',
    category: 'period_allocation',
    checkCode: 'PA-03',
    description: `「前払費用」が前月比 ${dropPercent}% 減少しました（${prevBal.toLocaleString()}円 → ${curr.balance.toLocaleString()}円）。一括取崩しが行われた場合、期間配分が正しいか確認してください。`,
    currentValue: `${curr.balance.toLocaleString()}円（前月: ${prevBal.toLocaleString()}円）`,
    suggestedValue: '期間対応する費用を月割で処理しているか確認してください',
    confidence: 70,
    targetMonth,
    freeeLink,
    details: limitedDetails,
  });
}

// ============================================================
// カテゴリ2: 定期発生費用の欠損検知
// ============================================================

/**
 * PA-04: 前月にあった取引先×科目が当月にない（計上漏れ）
 * PA-05: 定期費用の金額が前月比で大幅に変動
 */
function checkRecurringExpenses(data, findings) {
  const { trialPlByPartner, prevMonth, companyId, targetMonth, startMonth, fiscalYear } = data;
  if (!trialPlByPartner) {
    // trialPlByPartner が取得できていない場合はスキップ（エラーにしない）
    return;
  }
  if (!prevMonth?.trialPlByPartner) return;

  // prevMonth に targetMonth を付与（ない場合は shiftMonth で推定）
  const prevPlByPartner = {
    ...prevMonth.trialPlByPartner,
    targetMonth: prevMonth.targetMonth || '',
  };

  const { endDate } = getMonthRange(targetMonth);
  const fiscalStartDate = `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;

  // --- PA-04: 欠損検知 ---
  const pa04Findings = [];
  // --- PA-05: 変動検知 ---
  const pa05Findings = [];

  for (const accountName of RECURRING_EXPENSE_ACCOUNTS) {
    const currBalances = trialPlByPartner.trial_pl?.balances || [];
    const currAcc = currBalances.find(b => b.account_item_name === accountName)
      || currBalances.find(b => b.account_item_name?.includes(accountName));
    const accountItemId = currAcc?.account_item_id;

    const partnerAmounts = getPartnerMonthlyAmounts(
      trialPlByPartner, prevPlByPartner, accountName, startMonth
    );

    if (partnerAmounts.length === 0) continue;

    // PA-04: 欠損候補（avgMonthly > threshold AND 当月 = 0）
    const missing = partnerAmounts.filter(p =>
      p.name !== '未選択' &&    // 未選択タグは除外（取引先未登録の集合なので欠損検知不要）
      p.avgMonthly >= RECURRING_MIN_AVG &&
      p.currentMonth === 0 &&
      p.prevYtd !== 0
    );

    if (missing.length > 0) {
      const displayed = missing.slice(0, RECURRING_MAX_PARTNERS);
      const overflow = missing.length - displayed.length;

      const partnerLines = displayed.map(p =>
        `「${p.name}」（前月平均: ${Math.round(p.avgMonthly).toLocaleString()}円/月）`
      ).join('、');

      let desc = `「${accountName}」で以下の取引先への計上が当月ありません。計上漏れの可能性があります: ${partnerLines}`;
      if (overflow > 0) desc += `、他${overflow}取引先`;

      let freeeLink = '';
      if (accountItemId) {
        freeeLink = journalsByAccountLink(companyId, accountItemId, fiscalStartDate, endDate, accountName);
      }

      pa04Findings.push({
        severity: '🟡',
        category: 'period_allocation',
        checkCode: 'PA-04',
        description: desc,
        currentValue: '当月 計上なし',
        suggestedValue: displayed.map(p => `${p.name}: 約${Math.round(p.avgMonthly).toLocaleString()}円`).join('、'),
        confidence: 70,
        targetMonth,
        freeeLink,
        details: [],
      });
    }

    // PA-05: 当月・前月ともに金額あり、かつ大幅変動
    const varying = partnerAmounts.filter(p =>
      p.name !== '未選択' &&
      p.currentMonth !== 0 &&
      p.prevYtd !== 0 &&
      p.avgMonthly >= VARIATION_MIN_AMOUNT
    );

    for (const p of varying) {
      if (p.avgMonthly === 0) continue;
      // currentMonth は費用の場合に負になるため絶対値で比較する
      const changeRate = Math.abs(Math.abs(p.currentMonth) - p.avgMonthly) / p.avgMonthly;
      if (changeRate < VARIATION_THRESHOLD) continue;

      const changePercent = Math.round(changeRate * 100);
      pa05Findings.push({
        severity: '🔵',
        category: 'period_allocation',
        checkCode: 'PA-05',
        description: `「${accountName}」の取引先「${p.name}」が前月平均比 ${changePercent}% 変動しています（前月平均: ${Math.round(p.avgMonthly).toLocaleString()}円 → 当月: ${p.currentMonth.toLocaleString()}円）。期間配分の観点から確認を推奨します。`,
        currentValue: `当月: ${p.currentMonth.toLocaleString()}円（前月平均: ${Math.round(p.avgMonthly).toLocaleString()}円）`,
        suggestedValue: '一時的な金額増減か、契約変更等によるものか確認してください',
        confidence: 60,
        targetMonth,
        freeeLink: accountItemId
          ? journalsByAccountLink(companyId, accountItemId, fiscalStartDate, endDate, accountName)
          : '',
        details: [],
      });
    }
  }

  findings.push(...pa04Findings, ...pa05Findings);
}

// ============================================================
// カテゴリ3: 決算整理仕訳の洗い替え確認
// ============================================================

/**
 * PA-06/PA-07: 未払法人税等 / 未払消費税等 の洗い替え確認
 */
function checkPeriodEndReversal(data, accountName, checkCode, findings) {
  const { trialBs, deals, trialPl, companyId, targetMonth, startMonth, fiscalYear, fiscalYearId } = data;
  if (!trialBs) return;

  // 期首月 or 期首+1ヶ月のみ実行
  const months = monthsFromFiscalStart(targetMonth, startMonth);
  if (months > REVERSAL_MAX_MONTHS) return;

  const acc = findAccountBalance(trialBs, accountName);
  if (!acc) return;

  // 期首残高（opening_balance）がゼロなら前期に計上がなかったので何もしない
  const bsBal = getBalances(trialBs).find(b => b.account_item_name === accountName
    || b.account_item_name?.includes(accountName));
  const openingBalance = bsBal?.opening_balance || 0;
  if (openingBalance <= 0) return;

  // 当月 deals に洗い替え仕訳があるか確認
  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl);
  const dealDetails = bsBal?.account_item_id
    ? extractDealDetailsForAccount(deals, bsBal.account_item_id, accountIdNameMap)
    : [];

  // 洗い替え仕訳の有無（deals に当該科目の取引があるか）
  const hasReversal = dealDetails.length > 0;

  // 洗い替え仕訳があっても、金額が一致しているか確認（±10%の許容）
  let amountMismatch = false;
  if (hasReversal) {
    const totalAmount = dealDetails.reduce((s, d) => s + Math.abs(d.amount), 0);
    const diff = Math.abs(totalAmount - openingBalance);
    if (diff > openingBalance * 0.1) amountMismatch = true;
    if (!amountMismatch) return; // 洗い替え仕訳があり金額も合っている
  }

  const { endDate: reversalEndDate } = getMonthRange(targetMonth);
  const reversalFiscalStartDate = formatFiscalStartDate(fiscalYear, startMonth);
  let freeeLink = '';
  if (bsBal?.account_item_name) {
    freeeLink = generalLedgerLink(companyId, bsBal.account_item_name, reversalFiscalStartDate, reversalEndDate,
      { fiscalYearId });
  }

  let desc = '';
  if (!hasReversal) {
    desc = `「${accountName}」の期首残高 ${openingBalance.toLocaleString()}円に対する洗い替え仕訳（逆仕訳）が当月に確認できません。`;
  } else {
    const totalAmount = dealDetails.reduce((s, d) => s + Math.abs(d.amount), 0);
    desc = `「${accountName}」の洗い替え仕訳の金額（${totalAmount.toLocaleString()}円）が期首残高（${openingBalance.toLocaleString()}円）と乖離しています（±10%超）。`;
  }

  findings.push({
    severity: '🔴',
    category: 'period_allocation',
    checkCode,
    description: desc,
    currentValue: `期首残高: ${openingBalance.toLocaleString()}円`,
    suggestedValue: '期首残高と同額で未払税金勘定を借方に立てる逆仕訳を入力してください',
    confidence: 85,
    targetMonth,
    freeeLink,
    details: dealDetails.slice(0, MAX_DETAILS),
  });
}

/**
 * PA-08: 賞与引当金等の期首残高確認
 */
function checkProvisionBalance(data, findings) {
  const { trialBs, companyId, targetMonth, startMonth, fiscalYear, fiscalYearId } = data;
  if (!trialBs) return;

  // 期首月のみ実行
  if (monthsFromFiscalStart(targetMonth, startMonth) !== 1) return;

  const { endDate: provisionEndDate } = getMonthRange(targetMonth);
  const provisionFiscalStartDate = formatFiscalStartDate(fiscalYear, startMonth);

  for (const accountName of PROVISION_ACCOUNTS) {
    const bsBal = getBalances(trialBs).find(b => b.account_item_name === accountName
      || b.account_item_name?.includes(accountName));
    if (!bsBal) continue;

    const openingBalance = bsBal.opening_balance || 0;
    if (openingBalance <= 0) continue;

    let freeeLink = '';
    if (bsBal.account_item_name) {
      freeeLink = generalLedgerLink(companyId, bsBal.account_item_name, provisionFiscalStartDate, provisionEndDate,
        { fiscalYearId });
    }

    findings.push({
      severity: '🔵',
      category: 'period_allocation',
      checkCode: 'PA-08',
      description: `「${accountName}」の期首残高 ${openingBalance.toLocaleString()}円があります。取崩し・洗い替えの処理方針を確認してください。`,
      currentValue: `期首残高: ${openingBalance.toLocaleString()}円`,
      suggestedValue: '賞与の実支払い時に取崩し処理、または洗い替え後に再引当を検討してください',
      confidence: 65,
      targetMonth,
      freeeLink,
      details: [],
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 期間配分チェック
 *
 * @param {Object} data - monthly-checker.js が渡す context オブジェクト
 * @returns {Array<Finding>}
 */
function periodAllocationCheck(data) {
  const findings = [];

  // カテゴリ1: 前払費用の償却チェック
  checkPrepaidStagnation(data, '前払費用',   'PA-01', findings);
  checkPrepaidStagnation(data, '長期前払費用', 'PA-02', findings);
  checkPrepaidSuddenDrop(data, findings);

  // カテゴリ2: 定期発生費用の欠損検知
  checkRecurringExpenses(data, findings);

  // カテゴリ3: 洗い替え確認（期首月・期首+1ヶ月のみ動作）
  checkPeriodEndReversal(data, '未払法人税等', 'PA-06', findings);
  checkPeriodEndReversal(data, '未払消費税等', 'PA-07', findings);
  checkProvisionBalance(data, findings);

  return findings;
}

module.exports = { periodAllocationCheck };
