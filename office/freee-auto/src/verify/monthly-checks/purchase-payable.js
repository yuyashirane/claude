'use strict';

/**
 * purchase-payable.js — JC3-1〜JC3-4: 仕入・経費チェック
 *
 * チェック一覧:
 *   PP-01 🟡 仕入の月次推移異常（前月平均比50%超変動）
 *   PP-02 🟡 買掛金・未払金・未払費用の滞留（取引先別2ヶ月連続同額）
 *   PP-03 🟡 クレジットカード未払金の増加（残高が前月比増加）
 *   PP-04 🔵 その他経費の異常（販売管理費の前月平均比50%超変動、上位5件）
 *
 * データソース:
 *   PP-01/04: data.trialPl（YTD）, data.prevMonth.trialPl（YTD）
 *   PP-02:    data.trialBsByPartner, data.prevMonth.trialBsByPartner
 *   PP-03:    data.trialBs, data.prevMonth.trialBs
 */

const {
  findAccountBalance,
  getAllBalances,
  getPartnerBalances,
  monthsFromFiscalStart,
} = require('./trial-helpers');

// ============================================================
// PP-01: 仕入の月次推移チェック
// ============================================================

const PURCHASE_ACCOUNTS = ['仕入高', '売上原価', '材料費', '外注費'];

function checkPurchaseTrend(trialPl, prevTrialPl, elapsed, targetMonth, findings) {
  if (elapsed <= 1 || !prevTrialPl) return;

  for (const accountName of PURCHASE_ACCOUNTS) {
    const currYTD = findAccountBalance(trialPl, accountName)?.balance ?? 0;
    const prevYTD = findAccountBalance(prevTrialPl, accountName)?.balance ?? 0;

    if (prevYTD === 0 || currYTD === 0) continue;

    const actualMonthly   = currYTD - prevYTD;
    const expectedMonthly = prevYTD / (elapsed - 1);
    if (expectedMonthly === 0) continue;

    const changeRate = Math.abs(actualMonthly - expectedMonthly) / Math.abs(expectedMonthly);
    if (changeRate <= 0.50) continue;

    const direction = actualMonthly > expectedMonthly ? '増加' : '減少';
    findings.push({
      severity: '🟡',
      category: 'purchase_payable',
      checkCode: 'PP-01',
      description: `「${accountName}」が前月平均比 ${(changeRate * 100).toFixed(0)}%${direction}しています（当月: ${actualMonthly.toLocaleString()}円、前月平均: ${Math.round(expectedMonthly).toLocaleString()}円）。`,
      currentValue: `当月: ${actualMonthly.toLocaleString()}円`,
      suggestedValue: '季節変動・大口発注以外の原因がなければ、計上漏れや二重計上を確認してください',
      confidence: 70,
      targetMonth,
    });
  }
}

// ============================================================
// PP-02: 買掛金・未払金の滞留チェック
// ============================================================

const PAYABLE_ACCOUNTS = ['買掛金', '未払金', '未払費用'];

function checkPayableStagnation(trialBsByPartner, prevMonthBsByPartner, targetMonth, findings) {
  if (!trialBsByPartner || !prevMonthBsByPartner) return;

  const TOLERANCE = 100;

  for (const accountName of PAYABLE_ACCOUNTS) {
    const currPartners = getPartnerBalances(trialBsByPartner, accountName);
    const prevPartners = getPartnerBalances(prevMonthBsByPartner, accountName);

    for (const cp of currPartners) {
      if (cp.id === 0 || cp.name === '未選択') continue;
      if (cp.closing_balance <= 0) continue;

      const pp = prevPartners.find((p) => p.id === cp.id);
      if (!pp || pp.closing_balance <= 0) continue;

      if (Math.abs(cp.closing_balance - pp.closing_balance) <= TOLERANCE) {
        findings.push({
          severity: '🟡',
          category: 'purchase_payable',
          checkCode: 'PP-02',
          description: `「${accountName}」の「${cp.name}」残高が2ヶ月連続で同額（${cp.closing_balance.toLocaleString()}円）です。支払が滞留している可能性があります。`,
          currentValue: `${cp.closing_balance.toLocaleString()}円（前月比変動なし）`,
          suggestedValue: '支払期日を確認し、消込処理または支払を実施してください',
          confidence: 80,
          targetMonth,
        });
      }
    }
  }
}

// ============================================================
// PP-03: クレジットカード未払金の増加チェック
// ============================================================

const CREDIT_CARD_KEYWORDS = ['クレジット', 'カード', 'VISA', 'Master', 'Mastercard', 'Amex', 'JCB'];

function checkCreditCardIncrease(trialBs, prevMonthTrialBs, targetMonth, findings) {
  if (!trialBs || !prevMonthTrialBs) return;

  const currBalances = getAllBalances(trialBs);
  const prevBalances = getAllBalances(prevMonthTrialBs);

  const creditCards = currBalances.filter(
    (b) => CREDIT_CARD_KEYWORDS.some((kw) => b.name.includes(kw))
  );

  for (const curr of creditCards) {
    const prev = prevBalances.find((p) => p.name === curr.name);
    if (!prev) continue;

    // BS上のクレジットカード: 未払金として負債側（正値）または資産側（負値）で管理
    // 残高増加 = 未払いが増えている
    const increase = Math.abs(curr.balance) - Math.abs(prev.balance);
    if (increase <= 0) continue;
    if (Math.abs(increase) < 10_000) continue; // 1万円未満は無視

    findings.push({
      severity: '🟡',
      category: 'purchase_payable',
      checkCode: 'PP-03',
      description: `「${curr.name}」の残高が前月比 ${increase.toLocaleString()}円増加しています（前月: ${Math.abs(prev.balance).toLocaleString()}円 → 当月: ${Math.abs(curr.balance).toLocaleString()}円）。クレジットカードの支払が済んでいない可能性があります。`,
      currentValue: `${curr.balance.toLocaleString()}円`,
      suggestedValue: '口座引落後に消込処理が完了しているか確認してください',
      confidence: 70,
      targetMonth,
    });
  }
}

// ============================================================
// PP-04: その他経費の異常チェック
// ============================================================

// 他チェックでカバー済みのため除外する科目
const EXCLUDED_FROM_PP04 = new Set([
  '売上高', '仕入高', '売上原価', '材料費',
  '役員報酬', '給料手当', '賃金', '法定福利費',
  '地代家賃', '外注費', '消耗品費', '修繕費',   // FA/LL でカバー
]);

function checkOtherExpenseAnomaly(trialPl, prevTrialPl, elapsed, targetMonth, findings) {
  if (elapsed <= 1 || !prevTrialPl) return;

  const currBalances = trialPl?.trial_pl?.balances ?? [];
  const EXPENSE_CATEGORIES = ['販売管理費', '売上原価', '営業外費用'];

  const anomalies = [];

  for (const b of currBalances) {
    if (!b.account_item_name) continue;
    if (!EXPENSE_CATEGORIES.some((cat) => b.account_category_name === cat)) continue;
    if (EXCLUDED_FROM_PP04.has(b.account_item_name)) continue;

    const currYTD = b.closing_balance;
    const prevB   = (prevTrialPl?.trial_pl?.balances ?? []).find(
      (pb) => pb.account_item_name === b.account_item_name
    );
    const prevYTD = prevB?.closing_balance ?? 0;

    const actualMonthly   = currYTD - prevYTD;
    const expectedMonthly = prevYTD / (elapsed - 1);

    // 新規出現: 前月ゼロ・当月あり（1万円以上）
    if (prevYTD === 0 && actualMonthly >= 10_000) {
      anomalies.push({
        name: b.account_item_name,
        actual: actualMonthly,
        expected: 0,
        changeRate: Infinity,
        isNew: true,
      });
      continue;
    }

    if (expectedMonthly === 0 || actualMonthly === 0) continue;

    const changeRate = Math.abs(actualMonthly - expectedMonthly) / Math.abs(expectedMonthly);
    if (changeRate <= 0.50) continue;
    if (Math.abs(actualMonthly - expectedMonthly) < 10_000) continue; // 変動額1万円未満は除外

    anomalies.push({
      name: b.account_item_name,
      actual: actualMonthly,
      expected: expectedMonthly,
      changeRate,
      isNew: false,
    });
  }

  // 変動率降順でソートし上位5件のみ報告（ノイズ抑制）
  anomalies.sort((a, b) => b.changeRate - a.changeRate);
  for (const item of anomalies.slice(0, 5)) {
    const description = item.isNew
      ? `「${item.name}」が今月新たに計上されています（${item.actual.toLocaleString()}円）。`
      : `「${item.name}」が前月平均比 ${(item.changeRate * 100).toFixed(0)}%変動しています（当月: ${item.actual.toLocaleString()}円、前月平均: ${Math.round(item.expected).toLocaleString()}円）。`;

    findings.push({
      severity: '🔵',
      category: 'purchase_payable',
      checkCode: 'PP-04',
      description,
      currentValue: `当月: ${item.actual.toLocaleString()}円`,
      suggestedValue: '計上内容と金額の妥当性を確認してください',
      confidence: 60,
      targetMonth,
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 仕入・経費チェック（JC3-1〜JC3-4）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function purchasePayableCheck(data) {
  const findings = [];
  const {
    trialPl, trialBs, trialBsByPartner,
    prevMonth,
    targetMonth, startMonth,
  } = data;

  const prevTrialPl          = prevMonth?.trialPl         ?? null;
  const prevMonthBsByPartner = prevMonth?.trialBsByPartner ?? null;
  const prevMonthTrialBs     = prevMonth?.trialBs         ?? null;
  const elapsed              = monthsFromFiscalStart(targetMonth, startMonth);

  if (trialPl) {
    checkPurchaseTrend(trialPl, prevTrialPl, elapsed, targetMonth, findings);
    checkOtherExpenseAnomaly(trialPl, prevTrialPl, elapsed, targetMonth, findings);
  }
  checkPayableStagnation(trialBsByPartner, prevMonthBsByPartner, targetMonth, findings);
  checkCreditCardIncrease(trialBs, prevMonthTrialBs, targetMonth, findings);

  return findings;
}

module.exports = { purchasePayableCheck };
