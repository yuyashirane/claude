/**
 * test-multi-stage-classifier.js
 * 多段階推測オーケストレーターのテスト
 */

const {
  classifyMultiStage,
  toClassificationFormat,
  loadClientDict,
  matchClientDict,
  matchGeneralKeywords,
  determineAction,
} = require('../src/classify/multi-stage-classifier');
const { loadRuleCsv } = require('../src/classify/existing-rule-matcher');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (e) {
    console.log('  ❌ ' + name + ': ' + e.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '') + ' expected "' + expected + '" but got "' + actual + '"');
  }
}

function makeItem(overrides) {
  return {
    description: '',
    entry_side: 'expense',
    walletable_type: 'bank_account',
    walletable_name: '三菱UFJ銀行',
    amount: 10000,
    ...overrides,
  };
}

// テスト用顧問先固有辞書
const TEST_DICT = [
  {
    pattern: 'ｸﾛﾚﾗｺｳｷﾞﾖ',
    matchType: 'partial',
    account: '仕入高',
    taxClass: '課対仕入',
    partner: 'クロレラ工業㌈',
    item: null,
    priority: 10,
    reason: '薬局向け製薬会社',
  },
  {
    pattern: 'ﾄﾖﾀﾌｱｲﾅﾝｽ',
    matchType: 'partial',
    account: 'リース料',
    taxClass: '課対仕入',
    partner: 'トヨタファイナンス㌈',
    item: null,
    priority: 10,
    reason: 'リース会社',
  },
];

console.log('\n━━━ matchGeneralKeywords テスト ━━━');

test('GK01: 電話料 → 通信費', () => {
  const r = matchGeneralKeywords('電話料', 'expense');
  assert(r !== null, 'should match');
  assertEqual(r.account, '通信費');
  assertEqual(r.source, 'general_keywords');
});

test('GK02: 不明な文字列 → null（雑費フォールバック禁止）', () => {
  const r = matchGeneralKeywords('XXXYYY', 'expense');
  assert(r === null, 'should not match (no zapphi fallback)');
});

test('GK03: Amazon → 消耗品費', () => {
  const r = matchGeneralKeywords('Amazon文具', 'expense');
  assert(r !== null, 'should match');
  assertEqual(r.account, '消耗品費');
});

console.log('\n━━━ matchClientDict テスト ━━━');

test('CD01: クロレラ一致', () => {
  const r = matchClientDict(
    'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    TEST_DICT
  );
  assert(r !== null, 'should match');
  assertEqual(r.account, '仕入高');
  assertEqual(r.source, 'client_dict');
});

test('CD02: マッチなし', () => {
  const r = matchClientDict('XXXX', TEST_DICT);
  assert(r === null, 'no match');
});

test('CD03: 空辞書', () => {
  const r = matchClientDict('test', []);
  assert(r === null, 'empty dict');
});

console.log('\n━━━ determineAction テスト ━━━');

test('DA01: 高信頼度 → 推測する（登録するではない）', () => {
  assertEqual(determineAction(95), '取引を推測する');
});

test('DA02: 中信頼度 → 推測する', () => {
  assertEqual(determineAction(60), '取引を推測する');
});

test('DA03: 低信頼度 → null（CSVに含めない）', () => {
  assertEqual(determineAction(30), null);
});

test('DA04: 0点 → null', () => {
  assertEqual(determineAction(0), null);
});

console.log('\n━━━ classifyMultiStage テスト ━━━');

test('MS01: ATM → 振替（科目なし）', () => {
  const r = classifyMultiStage(makeItem({ description: 'ｼﾞﾄﾞｳｷ' }));
  assertEqual(r.transactionType, 'ATM');
  assertEqual(r.account, null, 'account should be null for ATM');
  assertEqual(r.accountSource, 'type_rule');
});

test('MS02: 借入返済 → LOAN_REPAY', () => {
  const r = classifyMultiStage(makeItem({ description: 'ｺﾞﾍﾝｻｲ' }));
  assertEqual(r.transactionType, 'LOAN_REPAY');
  assertEqual(r.account, null);
});

test('MS03: クレカ引落 → CREDIT_PULL', () => {
  const r = classifyMultiStage(makeItem({
    description: 'ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ',
    walletable_type: 'bank_account',
  }));
  assertEqual(r.transactionType, 'CREDIT_PULL');
});

test('MS04: 人名パターン → PERSONAL_PAYMENT（給料手当ではない）', () => {
  const r = classifyMultiStage(makeItem({
    description: 'IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ',
    entry_side: 'expense',
  }));
  assertEqual(r.transactionType, 'PERSONAL_PAYMENT');
  assert(r.account !== '給料手当', 'should NOT be 給料手当 directly');
  assert(r.isPersonName, 'isPersonName');
});

test('MS05: 電話料 → 一般キーワード辞書で通信費', () => {
  const r = classifyMultiStage(makeItem({ description: '電話料' }));
  assertEqual(r.transactionType, 'EXPENSE');
  assertEqual(r.account, '通信費');
  assertEqual(r.accountSource, 'general_keywords');
});

test('MS06: 不明な文字列 → 未判定（雑費ではない）', () => {
  const r = classifyMultiStage(makeItem({ description: 'XXXYYYｸﾞｸﾞ' }));
  assertEqual(r.account, null, 'should be null, not 雑費');
  assertEqual(r.accountSource, 'unmatched');
  assertEqual(r.action, null);
});

test('MS07: 顧問先辞書でクロレラ → 仕入高', () => {
  const r = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  assertEqual(r.account, '仕入高');
  assertEqual(r.accountSource, 'client_dict');
});

test('MS08: 売上入金 → SALES_IN + 売上高', () => {
  const r = classifyMultiStage(makeItem({
    description: 'ｽｸｴｱ(ｶ',
    entry_side: 'income',
    amount: 30115,
  }));
  assertEqual(r.transactionType, 'SALES_IN');
  assertEqual(r.account, '売上高');
});

test('MS09: 初回は全件「推測」か「要確認」', () => {
  const r = classifyMultiStage(makeItem({ description: '電話料' }));
  assert(r.action === '取引を推測する' || r.action === null,
    'action should be suggest or null, got: ' + r.action);
  assert(r.action !== '取引を登録する', 'should NOT be auto-register');
});

test('MS10: 取引先名が正規化されている', () => {
  const r = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  // 顧問先辞書でpartnerが指定されている場合はそちらを採用
  assertEqual(r.partner, 'クロレラ工業㌈');
});

test('MS11: 税区分が独立して推測される', () => {
  const r = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  assertEqual(r.taxClass, '課対仕入');
  assert(r.taxClassConfidence > 0, 'taxClassConfidence > 0');
});

test('MS12: 未判定の税区分はnull（「課対仕入」にしない）', () => {
  const r = classifyMultiStage(makeItem({ description: 'XXXYYYｸﾞｸﾞ' }));
  assertEqual(r.taxClass, null);
  assertEqual(r.taxClassConfidence, 0);
});

console.log('\n━━━ 仕様書追加テスト ━━━');

test('MS13: 科目と税区分が異なるソースから解決', () => {
  // 科目は顧問先辞書、税区分も顧問先辞書（同時解決）
  const r = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  // 科目と税区分がそれぞれ独立に推測される
  assert(r.account !== null, 'account resolved');
  assert(r.taxClass !== null, 'taxClass resolved');
  assert(r.accountConfidence > 0, 'accountConf > 0');
  assert(r.taxClassConfidence > 0, 'taxClassConf > 0');
});

test('MS14: 科目解決・税区分未解決のケース', () => {
  // 科目のみ指定した辞書
  const dictNoTax = [{
    pattern: 'TESTONLY',
    matchType: 'partial',
    account: '消耗品費',
    taxClass: null,  // 税区分なし
    partner: null,
    priority: 10,
  }];
  const r = classifyMultiStage(
    makeItem({ description: 'TESTONLY明細' }),
    { clientDictRules: dictNoTax }
  );
  assertEqual(r.account, '消耗品費', 'account from dict');
  assertEqual(r.accountSource, 'client_dict');
  // 税区分は未解決のまま
  assertEqual(r.taxClass, null, 'taxClass still unresolved');
});

test('MS15: confidence 90でも「推測する」（登録するではない）', () => {
  // ATMはconfidence 90だが推測するか確認
  const r = classifyMultiStage(makeItem({ description: 'ｼﾞﾄﾞｳｷ' }));
  assertEqual(r.overallConfidence, 90);
  assertEqual(r.action, '取引を推測する');
  assert(r.action !== '取引を登録する', 'never auto-register in Phase 1');
});

test('MS16: partnerResultネストオブジェクトが存在', () => {
  const r = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  assert(r.partnerResult !== undefined, 'partnerResult exists');
  assert(r.partnerResult.matchText !== undefined, 'matchText in partnerResult');
  assert(r.partnerResult.original !== undefined, 'original in partnerResult');
});

test('MS17: reasoning/noteフィールド', () => {
  const r = classifyMultiStage(
    makeItem({ description: '電話料' })
  );
  assert(r.note !== undefined, 'note exists');
  assert(r.reasoning !== undefined, 'reasoning exists');
});

test('MS18: itemTagフィールド', () => {
  const r = classifyMultiStage(makeItem({ description: '電話料' }));
  assert(r.itemTag !== undefined, 'itemTag field exists');
});

console.log('\n━━━ toClassificationFormat テスト ━━━');

test('CF01: 既存形式への変換', () => {
  const ms = classifyMultiStage(makeItem({ description: '電話料' }));
  const cls = toClassificationFormat(ms);
  assertEqual(cls.estimated_account, '通信費');
  assert(cls.confidence_score > 0, 'confidence > 0');
  assert(cls._multiStage !== undefined, 'has _multiStage');
  assert(cls._multiStage.transactionType === 'EXPENSE', 'preserved type');
});

test('CF02: ATMは除外フラグ', () => {
  const ms = classifyMultiStage(makeItem({ description: 'ｼﾞﾄﾞｳｷ' }));
  const cls = toClassificationFormat(ms);
  assert(cls.excluded === true, 'ATM should be excluded');
});

test('CF03: 未判定 → 要確認（雑費ではない）', () => {
  const ms = classifyMultiStage(makeItem({ description: 'XXXYYY' }));
  const cls = toClassificationFormat(ms);
  assertEqual(cls.estimated_account, '要確認');
  assertEqual(cls.confidence_rank, 'Low');
});

test('CF04: _multiStageが元データを保持', () => {
  const ms = classifyMultiStage(
    makeItem({ description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ' }),
    { clientDictRules: TEST_DICT }
  );
  const cls = toClassificationFormat(ms);
  assertEqual(cls._multiStage.accountSource, 'client_dict');
  assertEqual(cls._multiStage.transactionType, 'EXPENSE');
});

// --- 結果 ---
console.log('\n--- 結果 ---');
console.log('✅ 通過: ' + passed + '件');
if (failed > 0) {
  console.log('❌ 失敗: ' + failed + '件');
  process.exit(1);
} else {
  console.log('全テスト通過 🎉');
}
