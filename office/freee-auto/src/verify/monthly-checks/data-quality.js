'use strict';

/**
 * data-quality.js — F-1〜F-4: データ品質チェック
 *
 * チェック一覧:
 *   DQ-01 🟡 未登録取引が残っている（walletTxns）
 *   DQ-02 🟡 重複計上の疑い（deals: 同日・同額・同科目が2件以上）
 *   DQ-03 🟡 当期PL全ゼロ（仕訳未登録の可能性）
 */

const { isPLAllZero } = require('./trial-helpers');
const { walletTxnsStreamLink } = require('../../shared/freee-links');

// ============================================================
// DQ-01: 未登録取引チェック
// ============================================================

function checkUnregisteredTxns(data, findings) {
  const txns = data.walletTxns;
  if (!txns || txns.length === 0) return;

  const targetMonth = data.targetMonth
    || `${data.year}-${String(data.month).padStart(2, '0')}`;

  findings.push({
    severity: '🟡',
    category: 'data_quality',
    checkCode: 'DQ-01',
    description: `対象月（${targetMonth}）末時点で、未登録の明細があります。freeeの「自動で経理」画面で確認してください。`,
    currentValue: 'あり',
    suggestedValue: '「取引＞自動で経理」で全件登録してください',
    confidence: 95,
    targetMonth: data.targetMonth,
    freeeLink: walletTxnsStreamLink(targetMonth),
  });
}

// ============================================================
// DQ-02: 重複計上チェック
// ============================================================

function checkDuplicateDeals(data, findings) {
  const deals = data.deals;
  if (!deals || deals.length === 0) return;

  // deals のdetails[0].account_item_id で科目IDを特定し、
  // (issue_date, amount, account_item_id) のキーでグループ化
  const groupMap = new Map();
  for (const deal of deals) {
    const accountItemId = deal.details?.[0]?.account_item_id;
    if (!accountItemId) continue;

    const key = `${deal.issue_date}__${Math.abs(deal.amount)}__${accountItemId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(deal);
  }

  const duplicates = [...groupMap.values()].filter((group) => group.length >= 2);

  for (const group of duplicates) {
    const sample = group[0];
    const accountItemId = sample.details?.[0]?.account_item_id;
    findings.push({
      severity: '🟡',
      category: 'data_quality',
      checkCode: 'DQ-02',
      description: `${sample.issue_date} に同日・同額（${Math.abs(sample.amount).toLocaleString()}円）・同科目(ID:${accountItemId})の取引が ${group.length} 件あります。重複計上の可能性があります。`,
      currentValue: `deal_id: ${group.map((d) => d.id).join(', ')}`,
      suggestedValue: '重複していないか確認してください',
      confidence: 70,
      targetMonth: data.targetMonth,
    });
  }
}

// ============================================================
// DQ-03: 当期PL全ゼロ検知
// ============================================================

function checkPLAllZero(data, findings) {
  const { trialPl, targetMonth } = data;
  if (!trialPl) return;

  if (isPLAllZero(trialPl)) {
    findings.push({
      severity: '🟡',
      category: 'data_quality',
      checkCode: 'DQ-03',
      description: `${targetMonth} のPL（損益計算書）が全科目ゼロです。当期の仕訳が未登録の可能性があります。`,
      currentValue: 'PL全ゼロ',
      suggestedValue: '「取引＞自動で経理」で仕訳を登録してください',
      confidence: 85,
      targetMonth,
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * データ品質チェック（F-1〜F-4）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function dataQualityCheck(data) {
  const findings = [];

  checkUnregisteredTxns(data, findings);
  checkDuplicateDeals(data, findings);
  checkPLAllZero(data, findings);

  // DQ-04: 自動登録ルール最適化提案（TODO: freee管理画面API未対応のため将来実装）

  return findings;
}

module.exports = { dataQualityCheck };
