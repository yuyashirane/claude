'use strict';

/**
 * loan-lease.js — HB1-1: 借入金・リースチェック
 *
 * チェック一覧:
 *   LL-01 🔴 借入金残高がマイナス（借貸逆転・仕訳ミス）
 *   LL-02 🟡 借入金に品目タグ漏れ（「未選択」に残高あり）
 *   LL-03 🟡 借入金の当月返済なし（opening = closing で変動ゼロ）
 *
 * データソース: data.trialBsByItem（品目別BS試算表）
 *   各行に items: [{ id, name, opening_balance, closing_balance }] を持つ
 */

// ============================================================
// 借入金・リース対象科目キーワード
// ============================================================

const LOAN_KEYWORDS = ['借入金', 'リース債務', 'ファイナンスリース'];

// ============================================================
// 借入金科目の抽出
// ============================================================

/**
 * trialBsByItem から借入金・リース関連科目の balances 行を返す
 * @param {Object|null} trialBsByItem
 * @returns {Array}
 */
function getLoanAccounts(trialBsByItem) {
  if (!trialBsByItem) return [];
  const balances = trialBsByItem.trial_bs?.balances || [];
  return balances.filter(
    (b) =>
      b.account_item_name &&
      LOAN_KEYWORDS.some((kw) => b.account_item_name.includes(kw))
  );
}

// ============================================================
// LL-01: 借入金マイナスチェック
// ============================================================

function checkLoanMinus(loanAccounts, targetMonth, findings) {
  for (const acc of loanAccounts) {
    if (acc.closing_balance < 0) {
      findings.push({
        severity: '🔴',
        category: 'loan_lease',
        checkCode: 'LL-01',
        description: `「${acc.account_item_name}」の残高がマイナス（${acc.closing_balance.toLocaleString()}円）です。借方・貸方が逆転しています。返済仕訳の方向を確認してください。`,
        currentValue: `${acc.closing_balance.toLocaleString()}円`,
        suggestedValue: '返済仕訳を確認し、借入金の相手勘定が正しいか確認してください',
        confidence: 95,
        targetMonth,
      });
    }
  }
}

// ============================================================
// LL-02: 品目タグ漏れチェック
// ============================================================

function checkItemTagMissing(loanAccounts, targetMonth, findings) {
  for (const acc of loanAccounts) {
    const items = acc.items || [];
    // id=0 または name='未選択' が品目タグ未設定の行
    const untagged = items.find(
      (it) => it.id === 0 || it.name === '未選択'
    );
    if (!untagged || untagged.closing_balance === 0) continue;

    findings.push({
      severity: '🟡',
      category: 'loan_lease',
      checkCode: 'LL-02',
      description: `「${acc.account_item_name}」に品目タグなしの残高（${untagged.closing_balance.toLocaleString()}円）があります。どの借入先・リース契約に属するか不明です。`,
      currentValue: `未選択: ${untagged.closing_balance.toLocaleString()}円`,
      suggestedValue: '各借入先・リース契約ごとに品目タグを設定し、内訳を明確にしてください',
      confidence: 85,
      targetMonth,
    });
  }
}

// ============================================================
// LL-03: 返済なしチェック（当月 opening = closing）
// ============================================================

function checkNoRepayment(loanAccounts, targetMonth, findings) {
  for (const acc of loanAccounts) {
    const items = acc.items || [];

    // 品目タグが設定されていて、残高があり、当月変動がゼロの品目を抽出
    const noMovement = items.filter(
      (it) =>
        it.id !== 0 &&
        it.name !== '未選択' &&
        it.opening_balance > 0 &&
        it.closing_balance === it.opening_balance
    );

    for (const item of noMovement) {
      findings.push({
        severity: '🟡',
        category: 'loan_lease',
        checkCode: 'LL-03',
        description: `「${acc.account_item_name}」の「${item.name}」で当月の返済が確認できません（残高変動なし: ${item.closing_balance.toLocaleString()}円）。`,
        currentValue: `前月: ${item.opening_balance.toLocaleString()}円 → 当月: ${item.closing_balance.toLocaleString()}円（変動 0円）`,
        suggestedValue: '返済日の出金が正しく記帳されているか確認してください。据置期間中の場合は問題ありません',
        confidence: 70,
        targetMonth,
      });
    }
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 借入金・リースチェック（HB1-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function loanLeaseCheck(data) {
  const findings = [];
  const { trialBsByItem, targetMonth } = data;

  if (!trialBsByItem) return findings;

  const loanAccounts = getLoanAccounts(trialBsByItem);
  if (loanAccounts.length === 0) return findings;

  checkLoanMinus(loanAccounts, targetMonth, findings);
  checkItemTagMissing(loanAccounts, targetMonth, findings);
  checkNoRepayment(loanAccounts, targetMonth, findings);

  return findings;
}

module.exports = { loanLeaseCheck };
