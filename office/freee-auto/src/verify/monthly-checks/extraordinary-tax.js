'use strict';

/**
 * extraordinary-tax.js — HC-1〜HC-4, JC3-5〜JC3-8: 営業外・税金チェック
 *
 * チェック一覧:
 *   ET-01 🔴 未確定勘定に残高（あるべきでない科目にゼロ以外の残高）
 *   ET-02 🔴 資金諸口に残高（仕訳の片側漏れ）
 *   ET-03 🟡 仮受金・仮払金に残高（決算前に解消すべき）
 *   ET-04 🟡 未払法人税等がゼロでない（期首+3ヶ月以降）
 *   ET-05 🟡 未払消費税等がゼロでない（期首+3ヶ月以降）
 *   ET-06 🔵 雑収入・雑損失に残高（内容確認推奨）
 *   ET-07 🔵 受取利息の源泉税確認（6円以上の法人）
 *
 * データソース: data.trialBs（BS残高）, data.trialPl（PL残高）
 */

const { findAccountBalance, getAllBalances } = require('./trial-helpers');

// ============================================================
// 期首からの経過月数を計算
// ============================================================

/**
 * 対象月が期首から何ヶ月目かを返す（1始まり）
 * 例: 期首10月、対象月3月 → 6ヶ月目
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {number} startMonth  - 期首月 (1-12)
 * @returns {number}
 */
function monthsFromFiscalStart(targetMonth, startMonth) {
  const [, targetMonthNum] = targetMonth.split('-').map(Number);
  const elapsed =
    targetMonthNum >= startMonth
      ? targetMonthNum - startMonth + 1
      : 12 - startMonth + targetMonthNum + 1;
  return elapsed;
}

// ============================================================
// ET-01: 未確定勘定チェック
// ============================================================

function checkUncertainAccount(trialBs, targetMonth, findings) {
  // freeeでの「未確定勘定」は科目名「未確定勘定」または「諸口」で出ることがある
  // ※「資金諸口」は ET-02 で別途チェック
  const targets = ['未確定勘定'];
  for (const name of targets) {
    const acc = findAccountBalance(trialBs, name);
    if (acc && acc.balance !== 0) {
      findings.push({
        severity: '🔴',
        category: 'extraordinary_tax',
        checkCode: 'ET-01',
        description: `「${acc.name}」に${acc.balance.toLocaleString()}円の残高があります。本来ゼロであるべき科目です。`,
        currentValue: `${acc.balance.toLocaleString()}円`,
        suggestedValue: '未処理の取引内容を確認し、適切な科目に振り替えてください',
        confidence: 95,
        targetMonth,
      });
    }
  }
}

// ============================================================
// ET-02: 資金諸口チェック
// ============================================================

function checkShikinShokuchi(trialBs, targetMonth, findings) {
  const acc = findAccountBalance(trialBs, '資金諸口');
  if (!acc || acc.balance === 0) return;

  findings.push({
    severity: '🔴',
    category: 'extraordinary_tax',
    checkCode: 'ET-02',
    description: `資金諸口に${acc.balance.toLocaleString()}円の残高があります。本来ゼロであるべき科目です。入出金の登録はあるが、相手方の仕訳が未処理の状態と考えられます。`,
    currentValue: `${acc.balance.toLocaleString()}円`,
    suggestedValue: '入出金の相手勘定（仕訳の片側）が未登録の取引を特定し、相手側を登録してください',
    confidence: 95,
    targetMonth,
  });
}

// ============================================================
// ET-03: 仮受金・仮払金チェック
// ============================================================

function checkKarikin(trialBs, targetMonth, findings) {
  const checkItems = [
    { search: '仮受金', label: '仮受金' },
    { search: '仮払金', label: '仮払金' },
  ];

  for (const { search, label } of checkItems) {
    const acc = findAccountBalance(trialBs, search);
    if (!acc || acc.balance === 0) continue;

    findings.push({
      severity: '🟡',
      category: 'extraordinary_tax',
      checkCode: 'ET-03',
      description: `「${label}」に${acc.balance.toLocaleString()}円の残高があります。内容を確認し、決算前までに適切な科目に振り替えてください。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '取引の内容を確認し、本来の勘定科目に振り替えてください',
      confidence: 80,
      targetMonth,
    });
  }
}

// ============================================================
// ET-04, ET-05: 未払法人税等・未払消費税等チェック
// ============================================================

function checkUnpaidTax(trialBs, targetMonth, startMonth, findings) {
  // 期首+3ヶ月以降に残高があれば指摘
  // 例: 9月決算 → 期首10月 → 12月（期首+2ヶ月、3ヶ月目）以降に残高があれば要確認
  const elapsed = monthsFromFiscalStart(targetMonth, startMonth);
  if (elapsed < 3) return; // 期首から2ヶ月以内はまだ納付期限内

  const checks = [
    { search: '未払法人税等', code: 'ET-04', label: '未払法人税等' },
    { search: '未払消費税等', code: 'ET-05', label: '未払消費税等' },
  ];

  for (const { search, code, label } of checks) {
    const acc = findAccountBalance(trialBs, search);
    if (!acc || acc.balance <= 0) continue;

    findings.push({
      severity: '🟡',
      category: 'extraordinary_tax',
      checkCode: code,
      description: `「${label}」に${acc.balance.toLocaleString()}円の残高があります（期首${startMonth}月から${elapsed}ヶ月経過）。既に納付済みであれば消込処理が必要です。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '納付済みの場合は当座預金からの出金で消込してください',
      confidence: 75,
      targetMonth,
    });
  }
}

// ============================================================
// ET-06: 雑収入・雑損失（PLから）
// ============================================================

function checkZatsu(trialPl, targetMonth, findings) {
  if (!trialPl) return;

  const checks = [
    { search: '雑収入', code: 'ET-06', label: '雑収入', severity: '🔵' },
    { search: '雑損失', code: 'ET-06', label: '雑損失', severity: '🔵' },
  ];

  for (const { search, code, label, severity } of checks) {
    const acc = findAccountBalance(trialPl, search);
    if (!acc || acc.balance === 0) continue;

    findings.push({
      severity,
      category: 'extraordinary_tax',
      checkCode: code,
      description: `「${label}」に${acc.balance.toLocaleString()}円が計上されています。内容を確認し、適切な科目で記録されているか確認してください。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '受取手数料・受取保険金等、適切な科目への振替を検討してください',
      confidence: 65,
      targetMonth,
    });
  }
}

// ============================================================
// ET-07: 受取利息の源泉税確認（法人のみ）
// ============================================================

function checkInterestWithholding(trialPl, targetMonth, findings) {
  if (!trialPl) return;

  const acc = findAccountBalance(trialPl, '受取利息');
  if (!acc || acc.balance < 6) return; // 6円未満は無視

  findings.push({
    severity: '🔵',
    category: 'extraordinary_tax',
    checkCode: 'ET-07',
    description: `受取利息${acc.balance.toLocaleString()}円に対する源泉所得税（15.315%）の計上を確認してください。`,
    currentValue: `受取利息: ${acc.balance.toLocaleString()}円`,
    suggestedValue: `源泉税 約${Math.floor(acc.balance * 0.15315).toLocaleString()}円を「法人税・住民税及び事業税」または「仮払法人税等」で処理してください`,
    confidence: 70,
    targetMonth,
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 営業外・税金チェック（HC-1〜HC-4, JC3-5〜JC3-8）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function extraordinaryTaxCheck(data) {
  const findings = [];
  const { trialBs, trialPl, targetMonth, startMonth } = data;

  if (!trialBs) return findings;

  checkUncertainAccount(trialBs, targetMonth, findings);
  checkShikinShokuchi(trialBs, targetMonth, findings);
  checkKarikin(trialBs, targetMonth, findings);
  checkUnpaidTax(trialBs, targetMonth, startMonth, findings);
  checkZatsu(trialPl, targetMonth, findings);
  checkInterestWithholding(trialPl, targetMonth, findings);

  return findings;
}

module.exports = { extraordinaryTaxCheck };
