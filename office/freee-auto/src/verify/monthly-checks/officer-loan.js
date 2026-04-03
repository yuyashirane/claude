'use strict';

/**
 * officer-loan.js — JB-1: 役員・株主関係チェック
 *
 * チェック一覧:
 *   OL-01 🔴 役員貸付金に残高（認定利息課税・法人税リスク）
 *   OL-02 🟡 役員借入金の前月比増加
 *   OL-03 🟡 未払役員報酬に残高（期首+3ヶ月以降）
 *   OL-04 🔴 未払金・未払費用・買掛金の借方残（マイナス残高）
 *
 * データソース:
 *   OL-01〜OL-04: data.trialBs（BS残高）
 *   OL-02比較:    data.prevMonth.trialBs（前月BS）
 */

const { findAccountBalance, getAllBalances } = require('./trial-helpers');

// ============================================================
// キーワード定義
// ============================================================

// 役員貸付金（資産）: 残高があると問題
const OFFICER_LOAN_KEYWORDS    = ['役員貸付金', '株主貸付金', '役員短期貸付', '役員長期貸付'];
// 役員借入金（負債）: 増加が問題
const OFFICER_BORROW_KEYWORDS  = ['役員借入金', '株主借入金'];
// 未払役員報酬（負債）: 長期残高が問題
const OFFICER_SALARY_KEYWORDS  = ['未払役員報酬', '未払役員給与', '未払役員賞与'];
// マイナス残高が異常な負債系科目
const PAYABLE_KEYWORDS         = ['未払金', '未払費用', '買掛金'];

// ============================================================
// OL-01: 役員貸付金チェック
// ============================================================

function checkOfficerLoan(trialBs, targetMonth, findings) {
  const balances = getAllBalances(trialBs);
  const loanAccounts = balances.filter(
    (b) =>
      OFFICER_LOAN_KEYWORDS.some((kw) => b.name.includes(kw)) &&
      b.balance > 0
  );

  for (const acc of loanAccounts) {
    findings.push({
      severity: '🔴',
      category: 'officer_loan',
      checkCode: 'OL-01',
      description: `「${acc.name}」に${acc.balance.toLocaleString()}円の残高があります。役員への貸付は認定利息（現在 1.6%/年）が課税され、また法人の損金算入に制限が生じる可能性があります。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '役員からの返済計画を策定するか、役員給与との相殺処理を検討してください',
      confidence: 90,
      targetMonth,
    });
  }
}

// ============================================================
// OL-02: 役員借入金の増加チェック
// ============================================================

function checkOfficerBorrowIncrease(trialBs, prevMonthTrialBs, targetMonth, findings) {
  if (!prevMonthTrialBs) return;

  const currBalances = getAllBalances(trialBs);
  const prevBalances = getAllBalances(prevMonthTrialBs);

  const officerBorrows = currBalances.filter((b) =>
    OFFICER_BORROW_KEYWORDS.some((kw) => b.name.includes(kw))
  );

  for (const curr of officerBorrows) {
    const prev = prevBalances.find((p) => p.name === curr.name);
    if (!prev) continue;

    const increase = curr.balance - prev.balance;
    if (increase <= 0) continue;

    findings.push({
      severity: '🟡',
      category: 'officer_loan',
      checkCode: 'OL-02',
      description: `「${curr.name}」が前月比${increase.toLocaleString()}円増加しています（前月: ${prev.balance.toLocaleString()}円 → 当月: ${curr.balance.toLocaleString()}円）。役員からの新規借入が発生しています。`,
      currentValue: `${curr.balance.toLocaleString()}円`,
      suggestedValue: '借入の目的と返済計画を確認してください。継続的な増加は資金繰り悪化のサインです',
      confidence: 75,
      targetMonth,
    });
  }
}

// ============================================================
// OL-03: 未払役員報酬チェック（期首+3ヶ月以降）
// ============================================================

function checkUnpaidOfficerSalary(trialBs, targetMonth, startMonth, findings) {
  // 期首から3ヶ月以上経過している場合のみ指摘
  const [, targetMonthNum] = targetMonth.split('-').map(Number);
  const elapsed =
    targetMonthNum >= startMonth
      ? targetMonthNum - startMonth + 1
      : 12 - startMonth + targetMonthNum + 1;

  if (elapsed < 3) return;

  for (const kw of OFFICER_SALARY_KEYWORDS) {
    const acc = findAccountBalance(trialBs, kw);
    if (!acc || acc.balance <= 0) continue;

    findings.push({
      severity: '🟡',
      category: 'officer_loan',
      checkCode: 'OL-03',
      description: `「${acc.name}」に${acc.balance.toLocaleString()}円の残高があります（期首${startMonth}月から${elapsed}ヶ月経過）。役員報酬の支払が遅延している可能性があります。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '役員報酬を支払済みであれば消込処理してください。未払のまま放置は原則不可です',
      confidence: 75,
      targetMonth,
    });
  }
}

// ============================================================
// OL-04: 未払金・未払費用・買掛金のマイナス残高チェック
// ============================================================

function checkPayableMinus(trialBs, targetMonth, findings) {
  const balances = getAllBalances(trialBs);

  // 負債科目（通常は貸方残高）がマイナス（借方残高）になっている科目を検出
  const minusPayables = balances.filter(
    (b) =>
      PAYABLE_KEYWORDS.some((kw) => b.name.includes(kw)) &&
      b.balance < 0
  );

  for (const acc of minusPayables) {
    findings.push({
      severity: '🔴',
      category: 'officer_loan',
      checkCode: 'OL-04',
      description: `「${acc.name}」の残高がマイナス（${acc.balance.toLocaleString()}円）です。支払超過または仕訳の借貸逆転が考えられます。`,
      currentValue: `${acc.balance.toLocaleString()}円`,
      suggestedValue: '過払い・二重支払いの有無を確認し、相手方への返金または仕訳修正を行ってください',
      confidence: 90,
      targetMonth,
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 役員・株主関係チェック（JB-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function officerLoanCheck(data) {
  const findings = [];
  const { trialBs, prevMonth, targetMonth, startMonth } = data;

  if (!trialBs) return findings;

  checkOfficerLoan(trialBs, targetMonth, findings);
  checkOfficerBorrowIncrease(trialBs, prevMonth?.trialBs ?? null, targetMonth, findings);
  checkUnpaidOfficerSalary(trialBs, targetMonth, startMonth, findings);
  checkPayableMinus(trialBs, targetMonth, findings);

  return findings;
}

module.exports = { officerLoanCheck };
