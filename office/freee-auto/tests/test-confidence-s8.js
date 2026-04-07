#!/usr/bin/env node
/**
 * test-confidence-s8.js
 * confidence-calculator S8テスト
 */

const {
  calculateConfidence,
  calcTypeMatch,
  calcPartnerMatch,
  calcHistoryMatch,
  calcAmountPattern,
  calcAccountMatch,
  calcStability,
  calcAuxiliary,
  SUB_SCORE_MAX,
} = require('../src/classify/confidence-calculator');

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

console.log('=== confidence-calculator S8テスト ===\n');

test('CS01', 'calcTypeMatch: LOAN_REPAY → 15', () => {
  eq(calcTypeMatch('LOAN_REPAY'), 15);
});

test('CS02', 'calcTypeMatch: EXPENSE → 5', () => {
  eq(calcTypeMatch('EXPENSE'), 5);
});

test('CS03', 'calcTypeMatch: null → 0', () => {
  eq(calcTypeMatch(null), 0);
});

test('CS04', 'calcPartnerMatch: dict_exact → 25', () => {
  eq(calcPartnerMatch('dict_exact'), 25);
});

test('CS05', 'calcPartnerMatch: dict_normalized → 18', () => {
  eq(calcPartnerMatch('dict_normalized'), 18);
});

test('CS06', 'calcPartnerMatch: dict_partial → 12', () => {
  eq(calcPartnerMatch('dict_partial'), 12);
});

test('CS07', 'calcPartnerMatch: name_only → 0', () => {
  eq(calcPartnerMatch('name_only'), 0);
});

test('CS08', 'calcHistoryMatch: Phase 1では常に0', () => {
  eq(calcHistoryMatch(50), 0);
  eq(calcHistoryMatch(0), 0);
});

test('CS09', 'calcAmountPattern: existing_rule → 10', () => {
  eq(calcAmountPattern('existing_rule'), 10);
});

test('CS10', 'calcAmountPattern: client_dict → 8', () => {
  eq(calcAmountPattern('client_dict'), 8);
});

test('CS11', 'calcAmountPattern: unmatched → 0', () => {
  eq(calcAmountPattern('unmatched'), 0);
});

test('CS12', 'calcAccountMatch: walletable_name あり → 10', () => {
  eq(calcAccountMatch({ walletable_name: '横浜銀行' }), 10);
});

test('CS13', 'calcAccountMatch: _noWallet → 0', () => {
  eq(calcAccountMatch({ _noWallet: true }), 0);
});

test('CS14', 'calcStability: rulesApplied 3件以上 → 10', () => {
  eq(calcStability({ rulesApplied: ['a','b','c'] }), 10);
});

test('CS15', 'calcStability: rulesApplied 1件 → 5', () => {
  eq(calcStability({ rulesApplied: ['a'] }), 5);
});

test('CS16', 'calcStability: rulesApplied 0件 → 3', () => {
  eq(calcStability({ rulesApplied: [] }), 3);
});

test('CS17', 'calcStability: normResult null → 3', () => {
  eq(calcStability(null), 3);
});

test('CS18', 'calcAuxiliary: 品目+税区分 → 5', () => {
  eq(calcAuxiliary({ item: '配送料', taxClass: '課対仕入' }), 5);
});

test('CS19', 'calcAuxiliary: 税区分のみ → 3', () => {
  eq(calcAuxiliary({ taxClass: '課対仕入' }), 3);
});

test('CS20', 'calcAuxiliary: 情報なし → 0', () => {
  eq(calcAuxiliary({}), 0);
});

test('CS21', 'calculateConfidence: 高スコアケース（辞書完全一致+口座あり+安定+税区分あり）', () => {
  const r = calculateConfidence({
    transactionType: 'CREDIT_PULL',
    partnerSource: 'dict_exact',
    pastPatternScore: 0,
    accountSource: 'client_dict',
    item: { walletable_name: '横浜銀行' },
    normResult: { rulesApplied: ['unicode','whitespace','kana'] },
    classificationResult: { taxClass: '課対仕入', item: '配送料' },
  });
  // type_match=15 + partner_match=25 + history=0 + amount=8 + account=10 + stability=10 + auxiliary=5 = 73
  eq(r.totalConfidence, 73);
  eq(r.subScores.type_match, 15);
  eq(r.subScores.partner_match, 25);
  eq(r.subScores.history_match, 0);
  eq(r.subScores.amount_pattern, 8);
  eq(r.subScores.account_match, 10);
  eq(r.subScores.stability, 10);
  eq(r.subScores.auxiliary, 5);
});

test('CS22', 'calculateConfidence: 低スコアケース（EXPENSE+name_only+unmatched）', () => {
  const r = calculateConfidence({
    transactionType: 'EXPENSE',
    partnerSource: 'name_only',
    pastPatternScore: 0,
    accountSource: 'unmatched',
    item: { _noWallet: true },
    normResult: null,
    classificationResult: {},
  });
  // type=5 + partner=0 + history=0 + amount=0 + account=0 + stability=3 + aux=0 = 8
  eq(r.totalConfidence, 8);
});

test('CS23', 'サブスコアの合計 == totalConfidence', () => {
  const r = calculateConfidence({
    transactionType: 'PERSONAL_PAYMENT',
    partnerSource: 'dict_partial',
    pastPatternScore: 0,
    accountSource: 'general_keywords',
    item: { walletable_name: '横浜銀行' },
    normResult: { rulesApplied: ['a','b'] },
    classificationResult: { taxClass: '課対仕入' },
  });
  const sum = Object.values(r.subScores).reduce((a, b) => a + b, 0);
  eq(r.totalConfidence, sum, 'total should equal sum of sub scores');
});

test('CS24', 'SUB_SCORE_MAX の合計が100', () => {
  const maxTotal = Object.values(SUB_SCORE_MAX).reduce((a, b) => a + b, 0);
  eq(maxTotal, 100);
});

test('CS25', 'classifyMultiStage結果にtotalConfidence+subScoresが含まれる', () => {
  const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
  const r = classifyMultiStage({ description: 'NTT', entry_side: 'expense', amount: 5000 });
  if (typeof r.totalConfidence !== 'number') throw new Error('totalConfidence missing');
  if (!r.subScores) throw new Error('subScores missing');
  if (typeof r.subScores.type_match !== 'number') throw new Error('type_match missing');
  if (typeof r.subScores.partner_match !== 'number') throw new Error('partner_match missing');
  // 合計一致チェック
  const sum = Object.values(r.subScores).reduce((a, b) => a + b, 0);
  eq(r.totalConfidence, sum, 'totalConfidence should match subScores sum');
});

test('CS26', 'autoConfirmBlocked=trueの場合はaction=null（スコア高くても）', () => {
  const { classifyMultiStage, loadClientDict } = require('../src/classify/multi-stage-classifier');
  const clientDictRules = loadClientDict('11890320');
  const r = classifyMultiStage(
    { description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000 },
    { clientDictRules }
  );
  eq(r.autoConfirmBlocked, true, 'SOCIAL_INSURANCE should be blocked');
  eq(r.action, null, 'blocked items should have action=null regardless of score');
});

test('CS27', 'overallConfidence == totalConfidence（後方互換）', () => {
  const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
  const r = classifyMultiStage({ description: 'NTT', entry_side: 'expense', amount: 5000 });
  eq(r.overallConfidence, r.totalConfidence, 'overallConfidence should equal totalConfidence');
});

test('CS28', 'toClassificationFormat: score_breakdownにsubScoresが入る', () => {
  const { classifyMultiStage, toClassificationFormat } = require('../src/classify/multi-stage-classifier');
  const ms = classifyMultiStage({ description: 'NTT', entry_side: 'expense', amount: 5000 });
  const fmt = toClassificationFormat(ms);
  if (!fmt.score_breakdown) throw new Error('score_breakdown missing');
  if (typeof fmt.score_breakdown.type_match !== 'number') throw new Error('type_match not in score_breakdown');
  eq(fmt.confidence_score, ms.totalConfidence, 'confidence_score should match totalConfidence');
});

test('CS29', '辞書一致ケースで高スコアが出る', () => {
  const { classifyMultiStage, loadClientDict } = require('../src/classify/multi-stage-classifier');
  const clientDictRules = loadClientDict('11890320');
  const r = classifyMultiStage(
    { description: 'IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', entry_side: 'expense', amount: 100000, walletable_name: '横浜銀行' },
    { clientDictRules }
  );
  // 辞書一致→ partner_match >= 12, account_match=10, type_match >= 5
  if (r.totalConfidence < 30) throw new Error('dict match should produce decent score: ' + r.totalConfidence);
  if (r.subScores.partner_match < 12) throw new Error('partner_match too low: ' + r.subScores.partner_match);
});

test('CS30', '未知明細は低スコア', () => {
  const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
  const r = classifyMultiStage({ description: 'UNKNOWN_MERCHANT_XYZ', entry_side: 'expense', amount: 999 });
  if (r.totalConfidence > 40) throw new Error('unknown should have low score: ' + r.totalConfidence);
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
