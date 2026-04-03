'use strict';

/**
 * balance-anomaly.js — BA-01〜BA-05: BS残高異常検知 + ドリルダウン
 *
 * 「鳥の目→虫の目」アプローチで、BS残高の異常を検知し、
 * 原因となる具体的な仕訳明細まで掘り下げる。
 *
 * チェック一覧:
 *   BA-01 🔴 BS科目のマイナス残高（現預金は除外 → CD-01/CD-02が担当）
 *   BA-02 🟡 滞留残高（2ヶ月以上変動なし、前月データ必須）
 *   BA-03 🟡 仮勘定の未解消（仮払金・仮受金・立替金・前渡金・前受金）
 *   BA-04 🟡 前月比50%超変動（大口BS科目、前月データ必須）
 *   BA-05 🔵 本来ゼロであるべき科目に残高（未確定勘定・資金諸口等）
 *
 * データソース:
 *   data.trialBs          — BS試算表（全科目残高）
 *   data.prevMonth?.trialBs — 前月BS試算表
 *   data.deals             — 当月の取引一覧（ドリルダウン用）
 *   data.trialBsByPartner  — 取引先別BS残高
 *   data.trialBsByItem     — 品目別BS残高
 *   data.trialPl           — PL試算表（account_item_id → name マップ構築用）
 *   data.companyId         — 事業所ID（freeeリンク生成用）
 *   data.targetMonth       — 対象月 'YYYY-MM'
 *
 * Finding 拡張:
 *   このモジュールは Finding 型に details 配列を初めて導入する。
 *   details には原因仕訳の明細（日付・金額・相手科目・摘要・freeeリンク）を格納。
 */

const { getAllBalances, getBalances } = require('./trial-helpers');
const {
  dealLink,
  journalsByAccountLink,
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
  formatFiscalStartDate,
} = require('../../shared/freee-links');

// ============================================================
// 定数
// ============================================================

// 現預金科目名パターン（BA-01/BA-04 で除外。CD系が担当）
const CASH_DEPOSIT_PATTERNS = ['現金', '普通預金', '当座預金', '定期預金', 'ＰａｙＰａｙ銀行', 'PayPay銀行'];
// ただし「現金過不足」は除外しない
const CASH_OVERCOUNT_PATTERN = '現金過不足';

/**
 * 評価勘定（contra accounts）のキーワードリスト
 * これらの科目はマイナス残高が正常（資産の帳簿価額を減額するための科目）。
 * 部分一致で判定するため、「建物減価償却累計額」「器具備品減価償却累計額」等も一致する。
 */
const CONTRA_ACCOUNT_KEYWORDS = [
  '貸倒引当金',      // 売掛金・受取手形等の評価勘定
  '減価償却累計額',  // 有形固定資産の評価勘定
];

// BA-02 滞留チェックの除外科目（長期で変動しないのが正常）
const STAGNATION_EXCLUDE = [
  // 資本・純資産系（定款変更等がない限り変動しない）
  '資本金', '資本準備金', '利益準備金', '自己株式',
  // 期中は変動しないのが正常な純資産（決算時のみ変動）
  '繰越利益',
  // 長期保証金系（返還まで変動しないのが正常）
  '敷金', '保証金', '差入保証金',
  // 評価勘定（マイナスが正常であり、滞留チェックは不要）
  '貸倒引当金', '減価償却累計額',
];

// BA-02 滞留チェックの最小残高（ノイズ除外）
const STAGNATION_MIN_BALANCE = 10000;

// BA-03 仮勘定チェック対象
const TEMPORARY_ACCOUNTS = ['仮払金', '仮受金', '立替金', '前渡金', '前受金'];
// BA-03 除外（正常な会計科目）
const TEMPORARY_EXCLUDE = ['仮払消費税', '仮受消費税'];

// BA-04 前月比変動の閾値
const CHANGE_RATE_THRESHOLD = 0.5; // 50%
const CHANGE_MIN_PREV_BALANCE = 100000; // 前月残高10万円未満は除外
// BA-04 追加除外（決算時に大きく動くのが正常）
const CHANGE_EXCLUDE = ['仮払消費税', '仮受消費税'];

// BA-05 本来ゼロであるべき科目
const SHOULD_BE_ZERO_ACCOUNTS = ['未確定勘定', '資金諸口', '現金過不足', '仮勘定'];

// 1つの Finding に含める details の上限
const MAX_DETAILS = 10;

// 純資産カテゴリ名のパターン（BA-01でマイナスを🟡に格下げ）
const NET_ASSET_CATEGORIES = ['株主資本', '純資産'];

// ============================================================
// ヘルパー: account_item_id → account_item_name マップ構築
// ============================================================

/**
 * trialBs + trialPl から account_item_id → account_item_name のマッピングを構築
 * deals.details には account_item_name が含まれないため、このマップで解決する
 *
 * @param {Object|null} trialBs
 * @param {Object|null} trialPl
 * @returns {Map<number, string>}
 */
function buildAccountIdNameMap(trialBs, trialPl) {
  const map = new Map();
  for (const trial of [trialBs, trialPl]) {
    const balances = getBalances(trial);
    for (const b of balances) {
      if (b.account_item_id && b.account_item_name) {
        map.set(b.account_item_id, b.account_item_name);
      }
    }
  }
  return map;
}

// ============================================================
// ヘルパー: 現預金科目判定
// ============================================================

/**
 * 科目名が現預金パターンに該当するか判定（BA-01/BA-04の除外用）
 * 「現金過不足」は除外しない
 */
function isCashDeposit(accountName) {
  if (accountName.includes(CASH_OVERCOUNT_PATTERN)) return false;
  return CASH_DEPOSIT_PATTERNS.some(p => accountName.includes(p));
}

// ============================================================
// ヘルパー: 評価勘定（contra account）判定
// ============================================================

/**
 * 科目名が評価勘定（マイナス残高が正常な科目）かどうかを判定
 * 部分一致で判定するため、補助科目名（「建物減価償却累計額」等）も一致する
 *
 * @param {string} accountName
 * @returns {boolean}
 */
function isContraAccount(accountName) {
  return CONTRA_ACCOUNT_KEYWORDS.some(kw => accountName.includes(kw));
}

// ============================================================
// ヘルパー: 純資産カテゴリ判定
// ============================================================

/**
 * account_category_name が純資産系か判定
 */
function isNetAssetCategory(categoryName) {
  if (!categoryName) return false;
  return NET_ASSET_CATEGORIES.some(p => categoryName.includes(p));
}

// ============================================================
// ヘルパー: deals から特定科目の仕訳明細を抽出
// ============================================================

/**
 * deals 配列から特定の account_item_id に関連する仕訳明細を抽出する
 *
 * freee deals.details には account_item_name が含まれないため、
 * account_item_id で検索し、accountIdNameMap で科目名を解決する。
 *
 * @param {Array} deals - data.deals
 * @param {number} accountItemId - 検索する科目ID
 * @param {Map<number, string>} accountIdNameMap - ID→名前マップ
 * @returns {Array<{date, amount, counterAccount, description, dealId, freeeLink}>}
 */
function extractDealDetailsForAccount(deals, accountItemId, accountIdNameMap) {
  if (!deals || !Array.isArray(deals) || !accountItemId) return [];

  const results = [];
  for (const deal of deals) {
    if (!deal.details || !Array.isArray(deal.details)) continue;
    for (const det of deal.details) {
      if (det.account_item_id === accountItemId) {
        // 相手科目: 同じdealの他のdetailsから取得
        const counterDetails = deal.details.filter(d => d !== det);
        let counterAccount = '（不明）';
        if (counterDetails.length > 0) {
          counterAccount = accountIdNameMap.get(counterDetails[0].account_item_id)
            || `ID:${counterDetails[0].account_item_id}`;
        }
        results.push({
          date: deal.issue_date,
          amount: det.amount,
          counterAccount,
          description: det.description || '',
          dealId: deal.id,
          freeeLink: dealLink(deal.id),
        });
      }
    }
  }
  // 金額の絶対値降順でソート
  return results.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * details 配列を上限付きで返す
 * 上限超過時は切り詰めたことを示す残件数も返す
 */
function limitDetails(details, max = MAX_DETAILS) {
  if (details.length <= max) return { limited: details, overflowCount: 0 };
  return {
    limited: details.slice(0, max),
    overflowCount: details.length - max,
  };
}

// ============================================================
// ヘルパー: trialBsByPartner から取引先別内訳を抽出
// ============================================================

/**
 * trialBsByPartner から特定科目の取引先別残高を抽出する
 *
 * freee APIレスポンス構造:
 *   trialBsByPartner.trial_bs.balances[].partners[]
 *     { id, name, opening_balance, closing_balance, ... }
 *
 * @param {Object|null} trialBsByPartner - data.trialBsByPartner
 * @param {string} accountName - 科目名
 * @returns {Array<{partnerName: string, balance: number, openingBalance: number}>}
 */
function extractPartnerBreakdown(trialBsByPartner, accountName) {
  if (!trialBsByPartner) return [];
  const balances = trialBsByPartner.trial_bs?.balances || [];
  const acc = balances.find(b => b.account_item_name === accountName)
    || balances.find(b => b.account_item_name?.includes(accountName));
  if (!acc || !acc.partners) return [];

  return acc.partners
    .filter(p => p.closing_balance !== 0 || p.opening_balance !== 0)
    .map(p => ({
      partnerId: p.id,
      partnerName: p.name || `ID:${p.id}`,
      balance: p.closing_balance,
      openingBalance: p.opening_balance,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

// ============================================================
// ヘルパー: trialBsByItem から品目別内訳を抽出
// ============================================================

/**
 * trialBsByItem から特定科目の品目別残高を抽出する
 *
 * freee APIレスポンス構造:
 *   trialBsByItem.trial_bs.balances[].items[]
 *     { id, name, opening_balance, closing_balance, ... }
 *
 * @param {Object|null} trialBsByItem - data.trialBsByItem
 * @param {string} accountName - 科目名
 * @returns {Array<{itemName: string, balance: number}>}
 */
function extractItemBreakdown(trialBsByItem, accountName) {
  if (!trialBsByItem) return [];
  const balances = trialBsByItem.trial_bs?.balances || [];
  const acc = balances.find(b => b.account_item_name === accountName)
    || balances.find(b => b.account_item_name?.includes(accountName));
  if (!acc || !acc.items) return [];

  return acc.items
    .filter(i => i.closing_balance !== 0)
    .map(i => ({
      itemName: i.name || `ID:${i.id}`,
      balance: i.closing_balance,
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

// ============================================================
// ヘルパー: 月の開始日・終了日を算出
// ============================================================

function getMonthRange(targetMonth) {
  const [year, month] = targetMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

// 期首月の日付を返す（仕訳帳リンクの start_date に使用）
// freee の仕訳帳フィルタは期首月からの表示が実際の画面操作と一致する
function getFiscalStartDate(fiscalYear, startMonth) {
  return `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;
}

// ============================================================
// BA-01: BS科目のマイナス残高
// ============================================================

function checkNegativeBalance(data, accountIdNameMap, findings) {
  const { trialBs, deals, trialBsByPartner, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId, historicalBs } = data;
  if (!trialBs) return;

  const allBalances = getBalances(trialBs);
  const { endDate } = getMonthRange(targetMonth);
  const fiscalStart = getFiscalStartDate(fiscalYear, startMonth);

  for (const b of allBalances) {
    if (!b.account_item_name) continue; // 合計行スキップ
    if (b.closing_balance >= 0) continue; // マイナスでない

    // 現預金は CD-01/CD-02 が担当するので除外
    if (isCashDeposit(b.account_item_name)) continue;

    // 評価勘定（貸倒引当金・減価償却累計額等）はマイナスが正常なので除外
    if (isContraAccount(b.account_item_name)) continue;

    // 純資産のマイナスは🟡に格下げ（繰越利益剰余金等は正常なケースあり）
    const isNetAsset = isNetAssetCategory(b.account_category_name);
    const severity = isNetAsset ? '🟡' : '🔴';

    // --- ドリルダウン ---
    const dealDetails = extractDealDetailsForAccount(
      deals, b.account_item_id, accountIdNameMap
    );
    const { limited, overflowCount } = limitDetails(dealDetails);

    // 取引先別内訳
    const partners = extractPartnerBreakdown(trialBsByPartner, b.account_item_name);
    const partnerInfo = partners.length > 0
      ? partners
        .filter(p => p.balance < 0)
        .slice(0, 3)
        .map(p => `取引先「${p.partnerName}」: ${p.balance.toLocaleString()}円`)
        .join('、')
      : '';

    // freeeリンク（残高変動期を自動探索 → 総勘定元帳 or 仕訳帳を選択）
    let freeeLink = '';
    if (b.account_item_name && b.account_item_id) {
      freeeLink = buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDate, {
        openingBalance: b.opening_balance, closingBalance: b.closing_balance,
        fiscalYear, startMonth, fiscalYearId, historicalBs,
      });
    }

    // 当月dealsで原因特定できない場合のメッセージ
    let note = '';
    if (dealDetails.length === 0) {
      note = '※当月取引からは原因を特定できません。期首からの累積の可能性があります。';
    }

    const descParts = [
      `「${b.account_item_name}」にマイナス残高 ${b.closing_balance.toLocaleString()}円があります。`,
    ];
    if (partnerInfo) descParts.push(partnerInfo);
    if (note) descParts.push(note);
    if (overflowCount > 0) descParts.push(`（他${overflowCount}件の取引あり）`);

    findings.push({
      severity,
      category: 'balance_anomaly',
      checkCode: 'BA-01',
      description: descParts.join(' '),
      currentValue: `${b.closing_balance.toLocaleString()}円`,
      suggestedValue: '記帳漏れまたは過大計上を確認してください',
      confidence: isNetAsset ? 70 : 90,
      targetMonth,
      freeeLink,
      details: limited,
    });
  }
}

// ============================================================
// BA-02: 滞留残高（2ヶ月以上変動なし）
// ============================================================

function checkStagnantBalance(data, findings) {
  const { trialBs, prevMonth, trialBsByPartner, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId, historicalBs } = data;
  if (!trialBs || !prevMonth?.trialBs) return; // 前月データ必須

  const currBalances = getBalances(trialBs);
  const prevBalances = getBalances(prevMonth.trialBs);

  // 前月残高マップ
  const prevMap = new Map();
  for (const b of prevBalances) {
    if (b.account_item_name) {
      prevMap.set(b.account_item_name, b.closing_balance);
    }
  }

  for (const b of currBalances) {
    if (!b.account_item_name) continue;
    if (Math.abs(b.closing_balance) < STAGNATION_MIN_BALANCE) continue;

    // 除外科目
    if (STAGNATION_EXCLUDE.some(ex => b.account_item_name.includes(ex))) continue;

    const prevBalance = prevMap.get(b.account_item_name);
    if (prevBalance === undefined) continue; // 前月に存在しない科目

    // 2ヶ月同額で変動なし
    if (b.closing_balance !== prevBalance) continue;
    if (b.closing_balance === 0) continue;

    // --- ドリルダウン: 取引先別滞留 ---
    const partners = extractPartnerBreakdown(trialBsByPartner, b.account_item_name);
    const stagnantPartners = partners
      .filter(p => p.balance !== 0 && p.balance === p.openingBalance)
      .slice(0, 5);
    const partnerInfo = stagnantPartners.length > 0
      ? stagnantPartners
        .map(p => `取引先「${p.partnerName}」: ${p.balance.toLocaleString()}円で滞留`)
        .join('、')
      : '';

    const { endDate: endDateBA02 } = getMonthRange(targetMonth);

    // 親行リンク（残高変動期を自動探索 → 総勘定元帳 or 仕訳帳を選択）
    let freeeLink = '';
    if (b.account_item_name && b.account_item_id) {
      freeeLink = buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDateBA02, {
        openingBalance: b.opening_balance, closingBalance: b.closing_balance,
        fiscalYear, startMonth, fiscalYearId, historicalBs,
      });
    }

    const descParts = [
      `「${b.account_item_name}」の残高 ${b.closing_balance.toLocaleString()}円が前月から変動ありません（滞留の可能性）。`,
    ];
    if (partnerInfo) descParts.push(partnerInfo);

    // 子行リンク: 取引先ごとに partner_id フィルタ付き
    // historicalBs は科目レベルなので、科目の変動期を探索して子行にも適用
    const { startDate: detailStartBA02 } = determineLinkStartDate(
      b.opening_balance, b.closing_balance, fiscalYear, startMonth,
      { historicalBs, accountName: b.account_item_name }
    );
    const details = stagnantPartners.map(p => ({
      date: '',
      amount: p.balance,
      counterAccount: '',
      description: `取引先「${p.partnerName}」で滞留`,
      dealId: null,
      freeeLink: (b.account_item_name && b.account_item_id)
        ? journalsByAccountLink(companyId, b.account_item_id, detailStartBA02, endDateBA02,
            b.account_item_name, p.partnerId ? { partnerId: p.partnerId } : undefined)
        : '',
    }));

    findings.push({
      severity: '🟡',
      category: 'balance_anomaly',
      checkCode: 'BA-02',
      description: descParts.join(' '),
      currentValue: `${b.closing_balance.toLocaleString()}円（前月同額）`,
      suggestedValue: '回収・支払状況を確認し、必要に応じて貸倒処理や振替を検討してください',
      confidence: 75,
      targetMonth,
      freeeLink,
      details,
    });
  }
}

// ============================================================
// BA-03: 仮勘定の未解消
// ============================================================

function checkTemporaryAccounts(data, accountIdNameMap, findings) {
  const { trialBs, deals, trialBsByItem, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId, historicalBs } = data;
  if (!trialBs) return;

  const allBalances = getBalances(trialBs);

  for (const b of allBalances) {
    if (!b.account_item_name) continue;

    // 仮勘定チェック対象かどうか
    const isTarget = TEMPORARY_ACCOUNTS.some(t => b.account_item_name.includes(t));
    if (!isTarget) continue;

    // 除外科目（仮払消費税・仮受消費税）
    if (TEMPORARY_EXCLUDE.some(ex => b.account_item_name.includes(ex))) continue;

    // 残高がゼロなら正常
    if (b.closing_balance === 0) continue;

    // --- ドリルダウン: 当月deals ---
    const dealDetails = extractDealDetailsForAccount(
      deals, b.account_item_id, accountIdNameMap
    );
    const { limited: limitedDeals, overflowCount: dealOverflow } = limitDetails(dealDetails, 5);

    // --- ドリルダウン: 品目別内訳 ---
    const items = extractItemBreakdown(trialBsByItem, b.account_item_name);
    const itemBreakdown = items.length > 0
      ? items
        .slice(0, 5)
        .map(i => `${i.itemName}: ${i.balance.toLocaleString()}円`)
        .join('、')
      : '';

    // details: 品目内訳 + deals明細
    const { endDate: endDateBA03 } = getMonthRange(targetMonth);
    // 親行リンク: 総勘定元帳（start_date は残高推移で動的決定）
    const { startDate: ba03Start } = determineLinkStartDate(
      b.opening_balance, b.closing_balance, fiscalYear, startMonth
    );
    const details = [];
    // 品目別内訳を details に追加
    for (const item of items.slice(0, 5)) {
      details.push({
        date: '',
        amount: item.balance,
        counterAccount: '',
        description: `[品目] ${item.itemName}`,
        dealId: null,
        freeeLink: (b.account_item_name && b.account_item_id)
          ? buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDateBA03, {
              openingBalance: b.opening_balance, closingBalance: b.closing_balance,
              fiscalYear, startMonth, fiscalYearId, historicalBs,
            })
          : '',
      });
    }
    // deals明細を追加
    details.push(...limitedDeals);

    let freeeLink = '';
    if (b.account_item_name && b.account_item_id) {
      freeeLink = buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDateBA03, {
        openingBalance: b.opening_balance, closingBalance: b.closing_balance,
        fiscalYear, startMonth, fiscalYearId, historicalBs,
      });
    }

    const descParts = [
      `仮勘定「${b.account_item_name}」に ${b.closing_balance.toLocaleString()}円の残高があります。`,
    ];
    if (itemBreakdown) descParts.push(`内訳: ${itemBreakdown}`);
    if (dealOverflow > 0) descParts.push(`（他${dealOverflow}件の取引あり）`);

    findings.push({
      severity: '🟡',
      category: 'balance_anomaly',
      checkCode: 'BA-03',
      description: descParts.join(' '),
      currentValue: `${b.closing_balance.toLocaleString()}円`,
      suggestedValue: '内容を確認し、適切な科目に振り替えてください',
      confidence: 80,
      targetMonth,
      freeeLink,
      details: limitDetails(details).limited,
    });
  }
}

// ============================================================
// BA-04: 前月比50%超変動（大口BS科目）
// ============================================================

function checkLargeChange(data, accountIdNameMap, findings) {
  const { trialBs, prevMonth, deals, trialBsByPartner, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId, historicalBs } = data;
  if (!trialBs || !prevMonth?.trialBs) return; // 前月データ必須

  const currBalances = getBalances(trialBs);
  const prevBalances = getBalances(prevMonth.trialBs);

  // 前月残高マップ
  const prevMap = new Map();
  for (const b of prevBalances) {
    if (b.account_item_name) {
      prevMap.set(b.account_item_name, b.closing_balance);
    }
  }

  for (const b of currBalances) {
    if (!b.account_item_name) continue;

    // 現預金は CD-04 が担当するので除外
    if (isCashDeposit(b.account_item_name)) continue;

    // 追加除外科目
    if (CHANGE_EXCLUDE.some(ex => b.account_item_name.includes(ex))) continue;

    const prevBalance = prevMap.get(b.account_item_name);
    if (prevBalance === undefined) continue;

    // 前月残高が小さい場合は除外
    if (Math.abs(prevBalance) < CHANGE_MIN_PREV_BALANCE) continue;

    // 変動率
    const changeAmt = b.closing_balance - prevBalance;
    const changeRate = Math.abs(changeAmt) / Math.abs(prevBalance);
    if (changeRate <= CHANGE_RATE_THRESHOLD) continue;

    // --- ドリルダウン: 当月deals から上位取引 ---
    const dealDetails = extractDealDetailsForAccount(
      deals, b.account_item_id, accountIdNameMap
    );
    const { limited, overflowCount } = limitDetails(dealDetails, 5);

    // 取引先別内訳
    const partners = extractPartnerBreakdown(trialBsByPartner, b.account_item_name);
    const topDealInfo = limited.length > 0
      ? limited
        .slice(0, 3)
        .map(d => `${d.date} ${d.amount.toLocaleString()}円 ${d.counterAccount}`)
        .join('、')
      : '';

    const { startDate: startDateBA04, endDate: endDateBA04 } = getMonthRange(targetMonth);
    // BA-04: 当月に変動が発生 → 対象月のみで表示
    let freeeLink = '';
    if (b.account_item_name) {
      freeeLink = generalLedgerLink(companyId, b.account_item_name, startDateBA04, endDateBA04,
        { fiscalYearId });
    }

    const changePercent = Math.round(changeRate * 100);
    const descParts = [
      `「${b.account_item_name}」が前月比 ${changePercent}% 変動（${prevBalance.toLocaleString()}円 → ${b.closing_balance.toLocaleString()}円）。`,
    ];
    if (topDealInfo) descParts.push(`主な取引: ${topDealInfo}`);
    if (overflowCount > 0) descParts.push(`（他${overflowCount}件の取引あり）`);

    findings.push({
      severity: '🟡',
      category: 'balance_anomaly',
      checkCode: 'BA-04',
      description: descParts.join(' '),
      currentValue: `${b.closing_balance.toLocaleString()}円（前月: ${prevBalance.toLocaleString()}円、変動率: ${changePercent}%）`,
      suggestedValue: '変動原因を確認してください',
      confidence: 70,
      targetMonth,
      freeeLink,
      details: limited,
    });
  }
}

// ============================================================
// BA-05: 本来ゼロであるべき科目に残高
// ============================================================

function checkShouldBeZero(data, accountIdNameMap, findings) {
  const { trialBs, deals, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId, historicalBs } = data;
  if (!trialBs) return;

  const allBalances = getBalances(trialBs);
  const { endDate } = getMonthRange(targetMonth);

  for (const b of allBalances) {
    if (!b.account_item_name) continue;

    const isTarget = SHOULD_BE_ZERO_ACCOUNTS.some(t => b.account_item_name.includes(t));
    if (!isTarget) continue;
    if (b.closing_balance === 0) continue;

    // --- ドリルダウン: 原因仕訳を全件抽出 ---
    const dealDetails = extractDealDetailsForAccount(
      deals, b.account_item_id, accountIdNameMap
    );
    const { limited, overflowCount } = limitDetails(dealDetails);

    // freeeリンク（残高変動期を自動探索 → 総勘定元帳 or 仕訳帳を選択）
    let freeeLink = '';
    if (b.account_item_name && b.account_item_id) {
      freeeLink = buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDate, {
        openingBalance: b.opening_balance, closingBalance: b.closing_balance,
        fiscalYear, startMonth, fiscalYearId, historicalBs,
      });
    }

    const descParts = [
      `「${b.account_item_name}」に ${b.closing_balance.toLocaleString()}円の残高があります（本来ゼロであるべき科目）。`,
    ];
    if (overflowCount > 0) descParts.push(`（他${overflowCount}件の取引あり）`);

    findings.push({
      severity: '🔵',
      category: 'balance_anomaly',
      checkCode: 'BA-05',
      description: descParts.join(' '),
      currentValue: `${b.closing_balance.toLocaleString()}円`,
      suggestedValue: '内容を確認し、適切な科目に振り替えてください',
      confidence: 85,
      targetMonth,
      freeeLink,
      details: limited,
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * BS残高異常検知 + ドリルダウン
 *
 * @param {Object} data - monthly-checker.js が渡す context オブジェクト
 * @returns {Array<Finding>}
 */
function balanceAnomalyCheck(data) {
  const findings = [];
  const { trialBs, trialPl } = data;

  if (!trialBs) return findings;

  // account_item_id → account_item_name マッピングを構築
  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl);

  checkNegativeBalance(data, accountIdNameMap, findings);
  checkStagnantBalance(data, findings);
  checkTemporaryAccounts(data, accountIdNameMap, findings);
  checkLargeChange(data, accountIdNameMap, findings);
  checkShouldBeZero(data, accountIdNameMap, findings);

  return findings;
}

module.exports = {
  balanceAnomalyCheck,
  // テスト用にヘルパーもエクスポート
  extractDealDetailsForAccount,
  extractPartnerBreakdown,
  extractItemBreakdown,
  buildAccountIdNameMap,
  isCashDeposit,
  isContraAccount,
};
