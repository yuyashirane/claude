'use strict';

/**
 * trial-helpers.js
 *
 * freee 試算表API（trial_bs / trial_pl）のレスポンスから
 * 勘定科目残高を取り出すユーティリティ。
 *
 * === freee API レスポンス構造 ===
 *
 * trialBs: {
 *   trial_bs: {
 *     company_id, fiscal_year, start_month, end_month, created_at,
 *     balances: [
 *       {
 *         account_item_id?: number,
 *         account_item_name?: string,   // 科目固有行にあり。合計行は undefined
 *         account_category_name: string,
 *         hierarchy_level: number,      // 1=大カテゴリ, 2=中, 3=科目, 4=補助
 *         opening_balance: number,
 *         debit_amount: number,
 *         credit_amount: number,
 *         closing_balance: number,      // 月末残高
 *         composition_ratio: number,
 *         total_line?: boolean,         // 合計行フラグ（PLのみ）
 *       }, ...
 *     ]
 *   }
 * }
 *
 * trialPl 構造も同様。キーが trial_pl になる。
 * ※ account_item_name が undefined の行は分類合計行（total_line）。
 */

// ============================================================
// 内部: balances 配列を取り出す
// ============================================================

/**
 * trialBs または trialPl のオブジェクトから balances 配列を返す
 * @param {Object|null} trialData
 * @returns {Array}
 */
function getBalances(trialData) {
  if (!trialData) return [];
  // trialBs: trialData.trial_bs.balances
  if (trialData.trial_bs?.balances) return trialData.trial_bs.balances;
  // trialPl: trialData.trial_pl.balances
  if (trialData.trial_pl?.balances) return trialData.trial_pl.balances;
  // prevMonth/prevYearMonth の部分データ（{ trialBs, trialPl }）が渡された場合
  if (trialData.trial_bs) return trialData.trial_bs.balances || [];
  if (trialData.trial_pl) return trialData.trial_pl.balances || [];
  return [];
}

// ============================================================
// findAccountBalance
// ============================================================

/**
 * trialBs/trialPl のレスポンスから科目名で残高を検索する
 *
 * 検索優先順位:
 *   1. account_item_name の完全一致
 *   2. account_category_name の完全一致（合計行）
 *   3. account_item_name の部分一致
 *   4. account_category_name の部分一致
 *
 * @param {Object|null} trialData - trialBs or trialPl のレスポンス
 * @param {string} accountName    - 検索する科目名
 * @returns {{ name: string, balance: number, openingBalance: number, category: string } | null}
 */
function findAccountBalance(trialData, accountName) {
  const balances = getBalances(trialData);
  if (balances.length === 0) return null;

  const toEntry = (b) => ({
    name: b.account_item_name || b.account_category_name,
    balance: b.closing_balance,
    openingBalance: b.opening_balance,
    category: b.account_category_name,
  });

  // 1. account_item_name 完全一致
  const byItem = balances.find((b) => b.account_item_name === accountName);
  if (byItem) return toEntry(byItem);

  // 2. account_category_name 完全一致
  const byCategory = balances.find((b) => b.account_category_name === accountName);
  if (byCategory) return toEntry(byCategory);

  // 3. account_item_name 部分一致
  const byItemPartial = balances.find((b) => b.account_item_name?.includes(accountName));
  if (byItemPartial) return toEntry(byItemPartial);

  // 4. account_category_name 部分一致
  const byCategoryPartial = balances.find((b) => b.account_category_name?.includes(accountName));
  if (byCategoryPartial) return toEntry(byCategoryPartial);

  return null;
}

// ============================================================
// findMultipleBalances
// ============================================================

/**
 * 複数科目の残高をまとめて取得
 *
 * @param {Object|null} trialData
 * @param {Array<string>} accountNames
 * @returns {Array<{ name: string, balance: number, openingBalance: number, category: string }>}
 */
function findMultipleBalances(trialData, accountNames) {
  return accountNames
    .map((name) => findAccountBalance(trialData, name))
    .filter(Boolean);
}

// ============================================================
// getAllBalances
// ============================================================

/**
 * 全科目の残高一覧を取得（科目固有行のみ。合計行は除く）
 *
 * @param {Object|null} trialData
 * @returns {Array<{ name: string, balance: number, openingBalance: number, category: string }>}
 */
function getAllBalances(trialData) {
  const balances = getBalances(trialData);
  return balances
    .filter((b) => b.account_item_name) // 合計行（account_item_name が undefined）を除外
    .map((b) => ({
      name: b.account_item_name,
      balance: b.closing_balance,
      openingBalance: b.opening_balance,
      category: b.account_category_name,
    }));
}

// ============================================================
// isTotalZero: PL全ゼロ判定
// ============================================================

/**
 * trial_pl の全勘定科目の closing_balance がゼロかどうかを判定
 * （当期仕訳未登録の検出に使用）
 *
 * @param {Object|null} trialPl
 * @returns {boolean}
 */
function isPLAllZero(trialPl) {
  const balances = getBalances(trialPl);
  if (balances.length === 0) return true;
  return balances.every((b) => b.closing_balance === 0);
}

// ============================================================
// getMonthlyAmount: YTD累計から当月単月金額を算出
// ============================================================

/**
 * YTD累計の trialPl から「当月単月の金額」を返す
 *
 * freee の trial_pl は start_month=期首月 〜 end_month=対象月 のYTD累計で返るため、
 * 当月単月の金額 = 当月YTD累計 − 前月YTD累計 で算出する。
 *
 * 前月データがない場合（期首月など）は curr.balance をそのまま返す。
 *
 * @param {Object|null} currTrialPl  - 当月の trialPl（YTD）
 * @param {Object|null} prevTrialPl  - 前月の trialPl（YTD: start_month=期首, end_month=前月）
 * @param {string} accountName       - 科目名（findAccountBalance と同じ検索ロジック）
 * @returns {number|null} 当月単月の金額（科目が見つからない場合は null）
 */
function getMonthlyAmount(currTrialPl, prevTrialPl, accountName) {
  const curr = findAccountBalance(currTrialPl, accountName);
  if (curr === null) return null;
  const prevBalance = prevTrialPl
    ? (findAccountBalance(prevTrialPl, accountName)?.balance ?? 0)
    : 0;
  return curr.balance - prevBalance;
}

// ============================================================
// getPartnerBalances: 取引先別残高一覧を返す（PL・BS共用）
// ============================================================

/**
 * trialPlByPartner または trialBsByPartner から科目名でパートナー別残高配列を返す
 *
 * @param {Object|null} trialByPartner - trialPlByPartner or trialBsByPartner
 * @param {string} accountName
 * @returns {Array<{id:number, name:string, closing_balance:number, opening_balance:number}>}
 */
function getPartnerBalances(trialByPartner, accountName) {
  if (!trialByPartner) return [];
  const balances =
    trialByPartner.trial_pl?.balances ||
    trialByPartner.trial_bs?.balances ||
    [];
  const acc =
    balances.find((b) => b.account_item_name === accountName) ||
    balances.find((b) => b.account_item_name?.includes(accountName));
  return acc?.partners ?? [];
}

// ============================================================
// monthsFromFiscalStart: 期首からの経過月数（1始まり）
// ============================================================

/**
 * 対象月が期首から何ヶ月目かを返す（1始まり）
 * 例: 期首10月、対象月3月 → 6ヶ月目
 *
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {number} startMonth  - 期首月 (1-12)
 * @returns {number}
 */
function monthsFromFiscalStart(targetMonth, startMonth) {
  const [, mn] = targetMonth.split('-').map(Number);
  return mn >= startMonth
    ? mn - startMonth + 1
    : 12 - startMonth + mn + 1;
}

// ============================================================
// deal の取引先名解決
// ============================================================

/**
 * deal から取引先名を取得するヘルパー（全チェックモジュール共通）
 * freee API の deals レスポンスには partner_name が含まれないケースがあり、
 * partner_id のみの場合は partners マスタから逆引きする。
 *
 * @param {Object} deal - freee deal オブジェクト
 * @param {Array}  partners - partners マスタ配列 [{ id, name, ... }]
 * @returns {string} 取引先名（解決できない場合は空文字）
 */
function resolvePartnerName(deal, partners) {
  if (deal.partner_name) return deal.partner_name;
  if (deal.partner_id && Array.isArray(partners)) {
    const p = partners.find(p => p.id === deal.partner_id);
    if (p) return p.name || '';
  }
  return '';
}

// ============================================================
// エクスポート
// ============================================================

module.exports = {
  getBalances,
  findAccountBalance,
  findMultipleBalances,
  getAllBalances,
  isPLAllZero,
  getMonthlyAmount,
  getPartnerBalances,
  monthsFromFiscalStart,
  resolvePartnerName,
};
