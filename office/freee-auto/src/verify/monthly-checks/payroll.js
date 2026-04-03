'use strict';

/**
 * payroll.js — JC2-1, JC2-2: 人件費・預り金チェック
 *
 * チェック一覧:
 *   PY-01 🔴 役員報酬の定期同額性（期中変動は原則NG）
 *   PY-02 🟡 法定福利費の比率異常（給与合計の14-15%から±30%超乖離）
 *   PY-03 🟡 源泉所得税・住民税の滞留（預り金品目が当月変動なし）
 *   PY-04 🔵 給与手当の前月比異常（前月平均比30%超変動）
 *
 * データソース:
 *   PY-01/02/04: data.trialPl（YTD）, data.prevMonth.trialPl（YTD）
 *   PY-03:       data.trialBsByItem（品目別BS）
 *
 * ※ trialPl はYTD累計のため、当月単月 = getMonthlyAmount() で算出する
 */

const {
  findAccountBalance,
  getMonthlyAmount,
  monthsFromFiscalStart,
} = require('./trial-helpers');

// ============================================================
// PY-01: 役員報酬の定期同額性チェック
// ============================================================

function checkOfficerSalaryUniform(trialPl, prevTrialPl, elapsed, targetMonth, findings) {
  // 期首月は前月比較不可
  if (elapsed <= 1 || !prevTrialPl) return;

  const currYTD = findAccountBalance(trialPl, '役員報酬')?.balance ?? 0;
  const prevYTD = findAccountBalance(prevTrialPl, '役員報酬')?.balance ?? 0;

  if (currYTD === 0 && prevYTD === 0) return;

  const actualMonthly   = currYTD - prevYTD;
  const expectedMonthly = prevYTD / (elapsed - 1); // 前月までの月次平均

  if (Math.abs(actualMonthly - expectedMonthly) <= 100) return;

  const diff = actualMonthly - expectedMonthly;
  findings.push({
    severity: '🔴',
    category: 'payroll',
    checkCode: 'PY-01',
    description: `役員報酬が前月と異なります。当月: ${actualMonthly.toLocaleString()}円、前月平均: ${Math.round(expectedMonthly).toLocaleString()}円（差額: ${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString()}円）。役員報酬は定期同額性（税務上の原則）を維持する必要があります。`,
    currentValue: `当月: ${actualMonthly.toLocaleString()}円`,
    suggestedValue: `前月平均と同額の ${Math.round(expectedMonthly).toLocaleString()}円 が正しいか確認してください`,
    confidence: 90,
    targetMonth,
  });
}

// ============================================================
// PY-02: 法定福利費の比率チェック
// ============================================================

function checkSocialInsuranceRatio(trialPl, prevTrialPl, targetMonth, findings) {
  // 当月単月の各科目金額を算出（YTD差分）
  const officerSalary  = getMonthlyAmount(trialPl, prevTrialPl, '役員報酬') ?? 0;
  const salary         = getMonthlyAmount(trialPl, prevTrialPl, '給料手当') ?? 0;
  const wage           = getMonthlyAmount(trialPl, prevTrialPl, '賃金')     ?? 0;
  const socialInsurance = getMonthlyAmount(trialPl, prevTrialPl, '法定福利費') ?? 0;

  const totalSalary = officerSalary + salary + wage;
  if (totalSalary <= 0 || socialInsurance <= 0) return;

  const ratio = socialInsurance / totalSalary;

  // 正常範囲: 14-15%、許容: ±30% → 9.8%〜19.5%
  const LOWER = 0.14 * 0.70; // 9.8%
  const UPPER = 0.15 * 1.30; // 19.5%
  if (ratio >= LOWER && ratio <= UPPER) return;

  const direction = ratio < LOWER ? '低すぎます' : '高すぎます';
  findings.push({
    severity: '🟡',
    category: 'payroll',
    checkCode: 'PY-02',
    description: `法定福利費の比率が${direction}。給与合計 ${totalSalary.toLocaleString()}円 に対し 法定福利費 ${socialInsurance.toLocaleString()}円（${(ratio * 100).toFixed(1)}%）。正常値は概ね14〜15%です。`,
    currentValue: `${(ratio * 100).toFixed(1)}%（給与合計: ${totalSalary.toLocaleString()}円、法定福利費: ${socialInsurance.toLocaleString()}円）`,
    suggestedValue: '法定福利費は社会保険対象の給与合計の14〜15%程度が正常です',
    confidence: 75,
    targetMonth,
  });
}

// ============================================================
// PY-03: 源泉所得税・住民税の滞留チェック
// ============================================================

function checkWithholdingTaxStagnation(trialBsByItem, targetMonth, findings) {
  if (!trialBsByItem) return;

  const balances = trialBsByItem.trial_bs?.balances || [];
  const azukari  = balances.find((b) => b.account_item_name === '預り金');
  if (!azukari) return;

  const TAX_KEYWORDS = ['源泉', '住民税'];

  for (const item of (azukari.items || [])) {
    if (!TAX_KEYWORDS.some((kw) => item.name.includes(kw))) continue;
    if (item.closing_balance <= 0) continue;

    // opening_balance == closing_balance → 当月の納付がゼロ（変動なし）
    if (item.opening_balance !== item.closing_balance) continue;

    findings.push({
      severity: '🟡',
      category: 'payroll',
      checkCode: 'PY-03',
      description: `「預り金」の「${item.name}」（${item.closing_balance.toLocaleString()}円）が当月変動なしです。納付が未処理の可能性があります。`,
      currentValue: `${item.closing_balance.toLocaleString()}円（前月比 変動なし）`,
      suggestedValue: '翌月10日（納期の特例: 7/10 または 1/20）までに納付し、消込処理してください',
      confidence: 75,
      targetMonth,
    });
  }
}

// ============================================================
// PY-04: 給与手当の前月比異常チェック
// ============================================================

function checkSalaryFluctuation(trialPl, prevTrialPl, elapsed, targetMonth, findings) {
  if (elapsed <= 1 || !prevTrialPl) return;

  const currYTD = findAccountBalance(trialPl, '給料手当')?.balance ?? 0;
  const prevYTD = findAccountBalance(prevTrialPl, '給料手当')?.balance ?? 0;

  if (prevYTD === 0) return;

  const actualMonthly   = currYTD - prevYTD;
  const expectedMonthly = prevYTD / (elapsed - 1); // 前月までの月次平均

  if (expectedMonthly === 0) return;
  const changeRate = Math.abs(actualMonthly - expectedMonthly) / Math.abs(expectedMonthly);

  if (changeRate <= 0.30) return; // ±30%以内は正常

  const direction = actualMonthly > expectedMonthly ? '増加' : '減少';
  findings.push({
    severity: '🔵',
    category: 'payroll',
    checkCode: 'PY-04',
    description: `給料手当が前月平均比 ${(changeRate * 100).toFixed(0)}%${direction}しています（当月: ${actualMonthly.toLocaleString()}円、前月平均: ${Math.round(expectedMonthly).toLocaleString()}円）。`,
    currentValue: `当月: ${actualMonthly.toLocaleString()}円`,
    suggestedValue: '入退社・昇給・賞与月などの理由がなければ内容を確認してください',
    confidence: 65,
    targetMonth,
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 人件費・預り金チェック（JC2-1, JC2-2）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function payrollCheck(data) {
  const findings = [];
  const { trialPl, trialBsByItem, prevMonth, targetMonth, startMonth } = data;

  if (!trialPl) return findings;

  const prevTrialPl = prevMonth?.trialPl ?? null;
  const elapsed     = monthsFromFiscalStart(targetMonth, startMonth);

  checkOfficerSalaryUniform(trialPl, prevTrialPl, elapsed, targetMonth, findings);
  checkSocialInsuranceRatio(trialPl, prevTrialPl, targetMonth, findings);
  checkWithholdingTaxStagnation(trialBsByItem, targetMonth, findings);
  checkSalaryFluctuation(trialPl, prevTrialPl, elapsed, targetMonth, findings);

  return findings;
}

module.exports = { payrollCheck };
