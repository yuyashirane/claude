#!/usr/bin/env node
/**
 * test-type-classifier-s7.js
 * transaction-type-classifier S7拡張テスト
 * autoConfirmBlocked, withholdingPossible, SOCIAL_INSURANCEの独立類型
 */

const { classifyTransactionType } = require('../src/classify/transaction-type-classifier');

let passed = 0, failed = 0;

function test(id, description, fn) {
  try {
    fn();
    console.log('  \u2705 ' + id + '. ' + description);
    passed++;
  } catch (e) {
    console.log('  \u274C ' + id + '. ' + description);
    console.log('    ' + e.message);
    failed++;
  }
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || '') + ' expected ' + e + ' but got ' + a);
}

console.log('=== transaction-type-classifier S7テスト ===\n');

test('TC01', 'LOAN_REPAY: autoConfirmBlocked=true', () => {
  const r = classifyTransactionType({ description: 'ｺﾞﾍﾝｻｲ', entry_side: 'expense', amount: 100000 });
  eq(r.type, 'LOAN_REPAY');
  eq(r.autoConfirmBlocked, true, 'LOAN_REPAY should be blocked');
});

test('TC02', 'ATM: autoConfirmBlocked=true', () => {
  const r = classifyTransactionType({ description: 'ｼﾞﾄﾞｳｷ', entry_side: 'expense', amount: 50000 });
  eq(r.type, 'ATM');
  eq(r.autoConfirmBlocked, true, 'ATM should be blocked');
});

test('TC03', 'SOCIAL_INSURANCE: 厚生保険料（半角カタカナ）→ 独立類型', () => {
  const r = classifyTransactionType({ description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000 });
  eq(r.type, 'SOCIAL_INSURANCE');
  eq(r.autoConfirmBlocked, true, 'SOCIAL_INSURANCE should be blocked');
  if (r.confidence < 80) throw new Error('confidence too low: ' + r.confidence);
});

test('TC04', 'SOCIAL_INSURANCE: 社会保険（半角カタカナ）', () => {
  const r = classifyTransactionType({ description: 'ｼﾔｶｲﾎｹﾝ', entry_side: 'expense', amount: 150000 });
  eq(r.type, 'SOCIAL_INSURANCE');
  eq(r.autoConfirmBlocked, true);
});

test('TC05', 'SOCIAL_INSURANCE: 厚生年金（全角漢字）', () => {
  const r = classifyTransactionType({ description: '厚生年金', entry_side: 'expense', amount: 150000 });
  eq(r.type, 'SOCIAL_INSURANCE');
  eq(r.autoConfirmBlocked, true);
});

test('TC06', 'SOCIAL_INSURANCE: 国民健康保険（半角カタカナ）', () => {
  const r = classifyTransactionType({ description: 'ｺｸﾐﾝｹﾝｺｳﾎｹﾝ', entry_side: 'expense', amount: 50000 });
  eq(r.type, 'SOCIAL_INSURANCE');
});

test('TC07', 'PERSONAL_PAYMENT: autoConfirmBlocked + withholdingPossible', () => {
  const r = classifyTransactionType({ description: 'IBﾌﾘｺﾐ   ﾀﾅｶ ﾀﾛｳ', entry_side: 'expense', amount: 300000 });
  eq(r.type, 'PERSONAL_PAYMENT');
  eq(r.autoConfirmBlocked, true, 'PERSONAL_PAYMENT should be blocked');
  eq(r.withholdingPossible, true, 'PERSONAL_PAYMENT should flag withholding');
});

test('TC08', 'SALES_IN: 決済サービス入金はautoConfirmBlocked=false', () => {
  const r = classifyTransactionType({ description: 'ｽｸｴｱ', entry_side: 'income', amount: 100000 });
  eq(r.type, 'SALES_IN');
  eq(r.autoConfirmBlocked, false, 'known payment service should not be blocked');
});

test('TC09', 'SALES_IN: 人名入金はautoConfirmBlocked=true（不明入金）', () => {
  const r = classifyTransactionType({ description: 'ﾀﾅｶ ﾀﾛｳ', entry_side: 'income', amount: 50000 });
  eq(r.type, 'SALES_IN');
  eq(r.autoConfirmBlocked, true, 'unknown person income should be blocked');
});

test('TC10', 'SALES_IN: 法人入金はautoConfirmBlocked=false', () => {
  const kabu = String.fromCharCode(0xff76) + ')';
  const r = classifyTransactionType({ description: kabu + 'TEST', entry_side: 'income', amount: 100000 });
  eq(r.type, 'SALES_IN');
  eq(r.autoConfirmBlocked, false, 'corp income should not be blocked');
});

test('TC11', 'SALES_IN: noteに仮受金/借入/立替回収の可能性が記載', () => {
  const r = classifyTransactionType({ description: 'ｽｸｴｱ', entry_side: 'income', amount: 100000 });
  if (!r.note.includes('仮受金')) throw new Error('note should mention 仮受金: ' + r.note);
});

test('TC12', 'CREDIT_PULL: autoConfirmBlockedは未設定', () => {
  const r = classifyTransactionType({ description: 'ｸﾚｼﾞﾂﾄ   JCB', entry_side: 'expense', walletable_type: 'bank_account', amount: 50000 });
  eq(r.type, 'CREDIT_PULL');
  eq(r.autoConfirmBlocked, undefined, 'CREDIT_PULL should not have autoConfirmBlocked');
});

test('TC13', 'EXPENSE: autoConfirmBlockedは未設定', () => {
  const r = classifyTransactionType({ description: 'NTT', entry_side: 'expense', amount: 5000 });
  eq(r.type, 'EXPENSE');
  eq(r.autoConfirmBlocked, undefined, 'EXPENSE should not have autoConfirmBlocked');
});

test('TC14', 'classifyMultiStage: autoConfirmBlockedがresultに伝播', () => {
  const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
  const r = classifyMultiStage({ description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000 });
  eq(r.autoConfirmBlocked, true, 'multi-stage should propagate autoConfirmBlocked');
  eq(r.transactionType, 'SOCIAL_INSURANCE');
});

test('TC15', 'classifyMultiStage: withholdingPossibleがresultに伝播', () => {
  const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
  const r = classifyMultiStage({ description: 'IBﾌﾘｺﾐ   ﾀﾅｶ ﾀﾛｳ', entry_side: 'expense', amount: 300000 });
  eq(r.withholdingPossible, true, 'multi-stage should propagate withholdingPossible');
});

test('TC16', 'toClassificationFormat: SOCIAL_INSURANCEはexcluded=true', () => {
  const { classifyMultiStage, toClassificationFormat } = require('../src/classify/multi-stage-classifier');
  const ms = classifyMultiStage({ description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000 });
  const fmt = toClassificationFormat(ms);
  eq(fmt.excluded, true, 'SOCIAL_INSURANCE should be excluded');
});


console.log('');
console.log('--- 結果 ---');
if (failed > 0) {
  console.log('\u274C 失敗: ' + failed + '件 / 通過: ' + passed + '件');
  process.exit(1);
} else {
  console.log('\u2705 通過: ' + passed + '件');
  console.log('全テスト通過 \uD83C\uDF89');
}
