'use strict';

/**
 * advance-tax-payment.js — AT-01〜AT-03: 予定納税チェック（月次モードB）
 *
 * 法人の中間申告（予定納税）の処理漏れを検知する。
 *
 * チェック一覧:
 *   AT-01 🟡 法人税の中間納付確認
 *   AT-02 🟡 消費税の中間納付確認
 *   AT-03 🔵 未払法人税等・未払消費税等の残高推移チェック
 *
 * 中間申告タイミング:
 *   期首から6ヶ月目が中間申告の基準月。
 *   中間申告期限は基準月の翌々月末。
 *   例: 10月決算 → 期首10月 → 6ヶ月目=3月 → 申告期限=5月末
 *
 * データソース:
 *   data.deals       — 当月の取引一覧
 *   data.trialBs     — BS試算表
 *   data.trialPl     — PL試算表（account_item_id → name マップ構築用）
 *   data.prevMonth   — 前月データ
 *   data.startMonth  — 期首月
 *   data.fiscalYear  — 期首年
 *   data.targetMonth — 対象月 'YYYY-MM'
 */

const { getBalances, findAccountBalance } = require('./trial-helpers');
const { generalLedgerLink } = require('../../shared/freee-links');

// ============================================================
// 定数
// ============================================================

// AT-01: 法人税の中間納付に使われる科目キーワード
const CORP_TAX_ACCOUNTS = [
  '法人税、住民税及び事業税', '法人税',
  '仮払税金', '仮払法人税', '仮払法人税等',
  '未払法人税', '未払法人税等',
];

// AT-02: 消費税の中間納付に使われる科目キーワード
const CONSUMPTION_TAX_ACCOUNTS = [
  '仮払消費税', '未払消費税', '未払消費税等',
  '消費税', // 幅広くキャッチ
];

// AT-03: 残高推移チェック対象
const UNPAID_TAX_ACCOUNTS = [
  { name: '未払法人税等', label: '法人税' },
  { name: '未払消費税等', label: '消費税' },
];

// ============================================================
// ヘルパー: account_item_id → name マップ構築
// ============================================================

function buildAccountIdNameMap(trialBs, trialPl, accountItems) {
  const map = new Map();

  // 優先: accountItems マスタ（全科目を網羅）
  if (accountItems && Array.isArray(accountItems)) {
    for (const item of accountItems) {
      if (item.id && item.name) {
        map.set(item.id, item.name);
      }
    }
  }

  // フォールバック: trialBs / trialPl の balances（マスタ未取得時）
  for (const trial of [trialBs, trialPl]) {
    const balances = getBalances(trial);
    for (const b of balances) {
      if (b.account_item_id && b.account_item_name && !map.has(b.account_item_id)) {
        map.set(b.account_item_id, b.account_item_name);
      }
    }
  }
  return map;
}

// ============================================================
// ヘルパー: 月範囲
// ============================================================

function getMonthRange(targetMonth) {
  const [year, month] = targetMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ============================================================
// ヘルパー: 中間申告タイミング計算
// ============================================================

/**
 * 中間申告の基準月・申告期限月・チェック対象範囲を計算
 *
 * @param {number} startMonth - 期首月（1-12）
 * @returns {{
 *   midMonth: number,           // 6ヶ月目の月（中間申告基準月）
 *   deadlineMonth: number,      // 中間申告期限月（基準月の翌々月）
 *   checkRange: number[],       // AT-01/02のチェック対象月（基準月〜期限月）
 *   extendedRange: number[],    // AT-03の拡張対象月（基準月の前1ヶ月〜期限月の後1ヶ月）
 * }}
 */
function calculateMidTermTiming(startMonth) {
  // 期首から6ヶ月目（0-indexed計算）
  const midMonth = ((startMonth - 1 + 5) % 12) + 1;
  // 中間申告期限: 基準月の翌々月
  const deadlineMonth = ((midMonth - 1 + 2) % 12) + 1;

  // AT-01/02: 基準月〜期限月（3ヶ月間）
  const checkRange = [];
  for (let i = 0; i < 3; i++) {
    checkRange.push(((midMonth - 1 + i) % 12) + 1);
  }

  // AT-03: 基準月の前1ヶ月〜期限月の後1ヶ月（5ヶ月間）
  const extendedRange = [];
  for (let i = -1; i < 4; i++) {
    extendedRange.push(((midMonth - 1 + i + 12) % 12) + 1);
  }

  return { midMonth, deadlineMonth, checkRange, extendedRange };
}

/**
 * 対象月が指定の月配列に含まれるか
 */
function isInRange(targetMonth, monthRange) {
  const [, month] = targetMonth.split('-').map(Number);
  return monthRange.includes(month);
}

// ============================================================
// ヘルパー: deals内に特定科目キーワードへの支出があるか
// ============================================================

function hasPaymentToAccounts(deals, accountKeywords, accountIdNameMap) {
  if (!deals) return false;
  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName) continue;
      if (accountKeywords.some(kw => accountName.includes(kw))) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// AT-01: 法人税の中間納付確認
// ============================================================

function checkCorpTaxInterim(data, accountIdNameMap, timing, findings) {
  const { deals, targetMonth, companyId, fiscalYearId } = data;

  if (!isInRange(targetMonth, timing.checkRange)) return;

  if (hasPaymentToAccounts(deals, CORP_TAX_ACCOUNTS, accountIdNameMap)) return;

  const { startDate, endDate } = getMonthRange(targetMonth);
  findings.push({
    severity: '🟡',
    category: 'advance_tax',
    checkCode: 'AT-01',
    description: `法人税の中間納付（予定納税）が当月処理されていない可能性があります。中間申告期限（${timing.deadlineMonth}月末）を確認してください。前期の法人税額が20万円以下の場合は中間申告不要です。`,
    currentValue: '法人税関連の仕訳なし',
    suggestedValue: '中間申告の要否と納付状況を確認',
    confidence: 60,
    targetMonth,
    freeeLink: generalLedgerLink(companyId, '法人税、住民税及び事業税', startDate, endDate, { fiscalYearId }),
    details: [],
  });
}

// ============================================================
// AT-02: 消費税の中間納付確認
// ============================================================

function checkConsumptionTaxInterim(data, accountIdNameMap, timing, findings) {
  const { deals, targetMonth, companyId, fiscalYearId } = data;

  if (!isInRange(targetMonth, timing.checkRange)) return;

  if (hasPaymentToAccounts(deals, CONSUMPTION_TAX_ACCOUNTS, accountIdNameMap)) return;

  const { startDate, endDate } = getMonthRange(targetMonth);
  findings.push({
    severity: '🟡',
    category: 'advance_tax',
    checkCode: 'AT-02',
    description: `消費税の中間納付が当月処理されていない可能性があります。中間申告期限（${timing.deadlineMonth}月末）を確認してください。前期の消費税額が48万円以下の場合は中間申告不要です。`,
    currentValue: '消費税関連の仕訳なし',
    suggestedValue: '中間申告の要否と納付状況を確認',
    confidence: 55,
    targetMonth,
    freeeLink: generalLedgerLink(companyId, '未払消費税等', startDate, endDate, { fiscalYearId }),
    details: [],
  });
}

// ============================================================
// AT-03: 未払法人税等・未払消費税等の残高推移チェック
// ============================================================

function checkUnpaidTaxStagnation(data, timing, findings) {
  const { trialBs, prevMonth, companyId, targetMonth, fiscalYearId } = data;
  if (!trialBs || !prevMonth?.trialBs) return;

  if (!isInRange(targetMonth, timing.extendedRange)) return;

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const { name, label } of UNPAID_TAX_ACCOUNTS) {
    const curr = findAccountBalance(trialBs, name);
    if (!curr) continue;
    if (curr.balance === 0) continue;

    const prev = findAccountBalance(prevMonth.trialBs, name);
    if (!prev) continue;

    // 前月と同額 → 滞留
    if (curr.balance !== prev.balance) continue;

    findings.push({
      severity: '🔵',
      category: 'advance_tax',
      checkCode: 'AT-03',
      description: `「${name}」の残高 ${curr.balance.toLocaleString()}円が前月から変動していません。${label}の中間納付のタイミングを確認してください。`,
      currentValue: `${curr.balance.toLocaleString()}円（前月同額）`,
      suggestedValue: '中間納付の処理状況を確認',
      confidence: 50,
      targetMonth,
      freeeLink: generalLedgerLink(companyId, name, startDate, endDate, { fiscalYearId }),
      details: [],
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 予定納税チェック（月次モードB）
 *
 * @param {Object} data - monthly-checker.js が渡す context オブジェクト
 * @returns {Array<Finding>}
 */
function advanceTaxPaymentCheck(data) {
  const findings = [];
  const { trialBs, trialPl, startMonth, accountItems } = data;

  if (!startMonth) return findings;

  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl, accountItems);
  const timing = calculateMidTermTiming(startMonth);

  checkCorpTaxInterim(data, accountIdNameMap, timing, findings);        // AT-01
  checkConsumptionTaxInterim(data, accountIdNameMap, timing, findings);  // AT-02
  checkUnpaidTaxStagnation(data, timing, findings);                      // AT-03

  return findings;
}

module.exports = {
  advanceTaxPaymentCheck,
  // テスト用
  calculateMidTermTiming,
  isInRange,
};
