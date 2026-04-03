'use strict';

const {
  normalizeRoute,
  normalizeAccount,
  normalizeEntrySide,
  normalizeAmount,
  normalizeDescription,
  normalizeWalletTxnId,
} = require('./normalize-helpers');

/**
 * 勘定科目の妥当性チェッカー
 * @param {Array} items - classifiedItems配列
 * @param {string} companyId - 事業所ID（将来拡張用）
 * @returns {Array} Finding配列
 */
function accountChecker(items, companyId) {
  const findings = [];
  const targets = items.filter(i => ['register', 'suggest'].includes(normalizeRoute(i)));

  // A-01: 雑費率が高い（全体指摘）
  const totalCount = targets.length;
  if (totalCount > 0) {
    const miscCount = targets.filter(i => normalizeAccount(i) === '雑費').length;
    const miscRate = miscCount / totalCount;
    if (miscRate >= 0.20) {
      findings.push({
        severity: '🔴',
        category: 'account',
        checkCode: 'A-01',
        walletTxnId: null,
        description: `雑費の割合が${Math.round(miscRate * 100)}%（${miscCount}/${totalCount}件）です。辞書・ルールの改善を検討してください。`,
        currentValue: `雑費 ${miscCount}件 / 全体 ${totalCount}件`,
        suggestedValue: '各取引に適切な勘定科目を設定',
        confidence: 90,
      });
    }
  }

  // 個別取引チェック（A-02〜A-07）
  for (const item of targets) {
    const account  = normalizeAccount(item);
    const side     = normalizeEntrySide(item);
    const amount   = normalizeAmount(item);   // normalize-helpersでMath.abs済み
    const desc     = normalizeDescription(item);
    const id       = normalizeWalletTxnId(item);

    // A-02: 雑費1万円以上
    if (account === '雑費' && amount >= 10000) {
      findings.push({
        severity: '🟡',
        category: 'account',
        checkCode: 'A-02',
        walletTxnId: id,
        description: `雑費 ${amount.toLocaleString()}円「${desc}」: より適切な勘定科目がないか確認してください。`,
        currentValue: '雑費',
        suggestedValue: '適切な勘定科目',
        confidence: 75,
      });
    }

    // A-03: 利息の方向間違い
    if (account === '支払利息' && side === 'income') {
      findings.push({
        severity: '🔴',
        category: 'account',
        checkCode: 'A-03',
        walletTxnId: id,
        description: `入金取引に「支払利息」が設定されています。「${desc}」: 科目が逆の可能性があります。`,
        currentValue: '支払利息',
        suggestedValue: '受取利息',
        confidence: 95,
      });
    }
    if (account === '受取利息' && side === 'expense') {
      findings.push({
        severity: '🔴',
        category: 'account',
        checkCode: 'A-03',
        walletTxnId: id,
        description: `出金取引に「受取利息」が設定されています。「${desc}」: 科目が逆の可能性があります。`,
        currentValue: '受取利息',
        suggestedValue: '支払利息',
        confidence: 95,
      });
    }

    // A-04: 売上高に出金
    if (account === '売上高' && side === 'expense') {
      findings.push({
        severity: '🟡',
        category: 'account',
        checkCode: 'A-04',
        walletTxnId: id,
        description: `出金取引に「売上高」が設定されています。「${desc}」: 返金・値引の場合は適切ですが確認してください。`,
        currentValue: '売上高（出金）',
        suggestedValue: '売上高（返金の場合はそのまま）または費用科目',
        confidence: 80,
      });
    }

    // A-05: 仕入高に入金（返品・返金・戻し を含む摘要は除外）
    if (account === '仕入高' && side === 'income') {
      const isReturn = ['返品', '返金', '戻し'].some(kw => desc.includes(kw));
      if (!isReturn) {
        findings.push({
          severity: '🟡',
          category: 'account',
          checkCode: 'A-05',
          walletTxnId: id,
          description: `入金取引に「仕入高」が設定されています。「${desc}」: 売上高等が適切でないか確認してください。`,
          currentValue: '仕入高（入金）',
          suggestedValue: '売上高または適切な収益科目',
          confidence: 80,
        });
      }
    }

    // A-06: 消耗品費10万円以上
    if (account === '消耗品費' && amount >= 100000) {
      findings.push({
        severity: '🔵',
        category: 'account',
        checkCode: 'A-06',
        walletTxnId: id,
        description: `消耗品費 ${amount.toLocaleString()}円「${desc}」: 固定資産計上の可能性があります（10万円以上）。`,
        currentValue: `消耗品費 ${amount.toLocaleString()}円`,
        suggestedValue: '固定資産（工具器具備品等）',
        confidence: 70,
      });
    }

    // A-07: 修繕費20万円以上
    if (account === '修繕費' && amount >= 200000) {
      findings.push({
        severity: '🔵',
        category: 'account',
        checkCode: 'A-07',
        walletTxnId: id,
        description: `修繕費 ${amount.toLocaleString()}円「${desc}」: 資本的支出の可能性があります（20万円以上）。`,
        currentValue: `修繕費 ${amount.toLocaleString()}円`,
        suggestedValue: '資本的支出として固定資産計上を検討',
        confidence: 70,
      });
    }
  }

  return findings;
}

module.exports = { accountChecker };
