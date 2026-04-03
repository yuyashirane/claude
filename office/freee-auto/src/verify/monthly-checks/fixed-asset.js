'use strict';

/**
 * fixed-asset.js — GD-1, JC1-1: 固定資産チェック
 *
 * チェック一覧:
 *   FA-01 🔴 消耗品費に10万円以上の取引（固定資産計上漏れの疑い）
 *   FA-02 🟡 修繕費に20万円以上の取引（資本的支出の疑い）
 *   FA-03 TODO: 減価償却費の計上確認（Step 5 以降で実装）
 *
 * データソース: data.deals（対象月の取引一覧）
 *   各 deal の details[].account_item_name / details[].amount を参照
 */

// ============================================================
// 閾値定数
// ============================================================

const THRESHOLD_SHOUMOUHIN    = 100_000; // 消耗品費: 10万円以上
const THRESHOLD_SHUZENHI      = 200_000; // 修繕費:   20万円以上

// ============================================================
// 内部ヘルパー: 高額費用チェック共通処理
// ============================================================

/**
 * deals の各 detail 行を走査し、accountKeyword に一致して threshold 以上の行を指摘
 *
 * @param {Array}  deals         - 対象月の取引一覧
 * @param {string} accountKeyword - 科目名キーワード（部分一致）
 * @param {number} threshold      - 閾値（円）
 * @param {string} checkCode
 * @param {'🔴'|'🟡'} severity
 * @param {string} suggestedMsg   - suggestedValue に使うメッセージ
 * @param {Array}  findings
 * @param {string} targetMonth
 */
function checkHighAmountExpense(
  deals, accountKeyword, threshold, checkCode, severity, suggestedMsg, findings, targetMonth
) {
  if (!deals || deals.length === 0) return;

  for (const deal of deals) {
    const details = deal.details || [];

    for (const detail of details) {
      const name   = detail.account_item_name || '';
      if (!name.includes(accountKeyword)) continue;

      const amount = Math.abs(detail.amount || 0);
      if (amount < threshold) continue;

      findings.push({
        severity,
        category: 'fixed_asset',
        checkCode,
        description: `${deal.issue_date} の「${name}」${amount.toLocaleString()}円は、固定資産計上の閾値（${threshold.toLocaleString()}円以上）に該当します。${suggestedMsg}`,
        currentValue: `${amount.toLocaleString()}円（deal_id: ${deal.id}）`,
        suggestedValue: `${threshold.toLocaleString()}円以上の場合は固定資産として計上することを検討してください`,
        confidence: 85,
        targetMonth,
      });
    }
  }
}

// ============================================================
// FA-01: 消耗品費 10万円以上チェック
// ============================================================

function checkShoumouhinOver(deals, targetMonth, findings) {
  checkHighAmountExpense(
    deals,
    '消耗品費',
    THRESHOLD_SHOUMOUHIN,
    'FA-01',
    '🔴',
    '工具器具備品または一括償却資産として計上が必要な可能性があります。',
    findings,
    targetMonth
  );
}

// ============================================================
// FA-02: 修繕費 20万円以上チェック
// ============================================================

function checkShuzenOver(deals, targetMonth, findings) {
  checkHighAmountExpense(
    deals,
    '修繕費',
    THRESHOLD_SHUZENHI,
    'FA-02',
    '🟡',
    '資本的支出（建物・設備の価値を高める修繕）に該当する場合は固定資産計上が必要です。',
    findings,
    targetMonth
  );
}

// ============================================================
// FA-03: 減価償却費の計上確認（TODO）
// ============================================================

// function checkDepreciation(trialPl, trialBs, targetMonth, findings) {
//   // TODO Step 5: 減価償却費の毎月計上を確認する
//   // - PLの「減価償却費」が0であれば🟡を発行
//   // - BSの固定資産残高がある場合に限定
// }

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 固定資産チェック（GD-1, JC1-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function fixedAssetCheck(data) {
  const findings = [];
  const { deals, targetMonth } = data;

  checkShoumouhinOver(deals, targetMonth, findings);
  checkShuzenOver(deals, targetMonth, findings);
  // TODO Step 5: checkDepreciation(data.trialPl, data.trialBs, targetMonth, findings);

  return findings;
}

module.exports = { fixedAssetCheck };
