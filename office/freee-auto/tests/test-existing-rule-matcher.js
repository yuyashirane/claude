/**
 * test-existing-rule-matcher.js
 * 既存ルール照合モジュールのテスト
 */

const path = require('path');
const {
  loadRuleCsv,
  matchExistingRules,
  matchText,
  parseCsvLine,
} = require('../src/classify/existing-rule-matcher');

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

// テスト用ルールセット
const TEST_RULES = [
  {
    entrySide: '支出', walletName: '', cardLabel: '', content: 'NTT',
    matchType: '部分一致', amountMin: null, amountMax: null,
    priority: 0, action: '取引を推測する', transferAccount: '',
    partner: 'NTT東日本', invoiceType: '', account: '通信費',
    taxClass: '課対仕入', item: '電話代', _lineNumber: 2,
  },
  {
    entrySide: '支出', walletName: '三菱UFJ銀行', cardLabel: '',
    content: 'ｸﾛﾚﾗｺｳｷﾞﾖ',
    matchType: '部分一致', amountMin: null, amountMax: null,
    priority: 10, action: '取引を登録する', transferAccount: '',
    partner: 'クロレラ工業㌈', invoiceType: '', account: '仕入高',
    taxClass: '課対仕入', item: '', _lineNumber: 3,
  },
  {
    entrySide: '支出', walletName: '', cardLabel: '',
    content: 'ｿﾝﾎﾟｼﾞﾔﾊﾟﾝ',
    matchType: '部分一致', amountMin: null, amountMax: 50000,
    priority: 0, action: '取引を推測する', transferAccount: '',
    partner: '損害保険ジャパン㌈', invoiceType: '',
    account: '保険料', taxClass: '対象外', item: '', _lineNumber: 4,
  },
  {
    entrySide: '支出', walletName: '', cardLabel: '',
    content: 'ｿﾝﾎﾟｼﾞﾔﾊﾟﾝ',
    matchType: '部分一致', amountMin: 50001, amountMax: null,
    priority: 0, action: '取引を推測する', transferAccount: '',
    partner: '損害保険ジャパン㌈', invoiceType: '',
    account: '保険料', taxClass: '対象外', item: '', _lineNumber: 5,
  },
  {
    entrySide: '収入', walletName: '', cardLabel: '',
    content: 'ｽｸｴｱ',
    matchType: '部分一致', amountMin: null, amountMax: null,
    priority: 0, action: '取引を推測する', transferAccount: '',
    partner: 'Square㌈', invoiceType: '', account: '売上高',
    taxClass: '課税売上', item: '', _lineNumber: 6,
  },
];

console.log('\n━━━ parseCsvLine テスト ━━━');

test('CSV01: 通常行のパース', () => {
  const fields = parseCsvLine('支出,,,NTT,部分一致,,,0,取引を推測する');
  assertEqual(fields[0], '支出');
  assertEqual(fields[3], 'NTT');
});

test('CSV02: ダブルクォート付き', () => {
  const fields = parseCsvLine('支出,,,"NTT,East",完全一致');
  assertEqual(fields[3], 'NTT,East');
});

test('CSV03: エスケープ済みダブルクォート', () => {
  const fields = parseCsvLine('支出,,,"test""data""",完全一致');
  assertEqual(fields[3], 'test"data"');
});

console.log('\n━━━ matchText テスト ━━━');

test('MT01: 完全一致', () => {
  assert(matchText(
    'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    '完全一致'
  ));
});

test('MT02: 部分一致', () => {
  assert(matchText(
    'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    'ｸﾛﾚﾗｺｳｷﾞﾖ',
    '部分一致'
  ));
});

test('MT03: 前方一致', () => {
  assert(matchText(
    'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    'ｺｳｻﾞﾌﾘｶｴ',
    '前方一致'
  ));
});

test('MT04: スペース正規化', () => {
  assert(matchText(
    'ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ',
    'ｸﾚｼﾞﾂﾄ ﾄﾖﾀﾌｱｲﾅﾝｽ',
    '完全一致'
  ));
});

test('MT05: 部分一致不一致', () => {
  assert(!matchText('abc', 'xyz', '部分一致'));
});

console.log('\n━━━ matchExistingRules テスト ━━━');

test('R01: NTT部分一致', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ NTTﾋｶﾞｼﾆﾎﾝ',
    entrySideJa: '支出',
    amount: 5000,
  }, TEST_RULES);
  assert(result !== null, 'should match');
  assertEqual(result.account, '通信費');
  assertEqual(result.partner, 'NTT東日本');
});

test('R02: 収支区分不一致で不採用', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ NTT',
    entrySideJa: '収入',
    amount: 5000,
  }, TEST_RULES);
  assert(result === null, 'should not match');
});

test('R03: 口座指定ルール一致', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    entrySideJa: '支出',
    walletableName: '三菱UFJ銀行',
    amount: 1208006,
  }, TEST_RULES);
  assert(result !== null, 'should match');
  assertEqual(result.account, '仕入高');
});

test('R04: 口座不一致で不採用', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    entrySideJa: '支出',
    walletableName: 'みずほ銀行',
    amount: 1208006,
  }, TEST_RULES);
  assert(result === null, 'wallet mismatch');
});

test('R05: 金額上限以内', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ ｿﾝﾎﾟｼﾞﾔﾊﾟﾝ',
    entrySideJa: '支出',
    amount: 7728,
  }, TEST_RULES);
  assert(result !== null, 'should match');
  assertEqual(result.account, '保険料');
});

test('R06: 金額上限超過で別ルール', () => {
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ ｿﾝﾎﾟｼﾞﾔﾊﾟﾝ',
    entrySideJa: '支出',
    amount: 60000,
  }, TEST_RULES);
  assert(result !== null, 'should match high-amount rule');
  assertEqual(result.account, '保険料');
});

test('R07: 収入ルール（スクエア）', () => {
  const result = matchExistingRules({
    description: 'ｽｸｴｱ(ｶ',
    entrySideJa: '収入',
    amount: 30115,
  }, TEST_RULES);
  assert(result !== null, 'should match');
  assertEqual(result.account, '売上高');
});

test('R08: マッチなし', () => {
  const result = matchExistingRules({
    description: 'XXXX',
    entrySideJa: '支出',
    amount: 1000,
  }, TEST_RULES);
  assert(result === null, 'no match');
});

test('R09: 空ルール', () => {
  assert(matchExistingRules({ description: 'NTT', entrySideJa: '支出' }, []) === null);
});

test('R10: nullルール', () => {
  assert(matchExistingRules({ description: 'NTT', entrySideJa: '支出' }, null) === null);
});

console.log('\n━━━ loadRuleCsv テスト ━━━');

test('L01: 実際のCSV読み込み', () => {
  const csvPath = path.join(__dirname, '..', 'rule-csv', '11890320_rules_20260404055537.csv');
  const rules = loadRuleCsv(csvPath);
  assert(rules.length > 0, 'should load rules, got ' + rules.length);
  assert(rules[0].entrySide !== undefined, 'has entrySide');
  assert(rules[0].account !== undefined, 'has account');
});

test('L02: 存在しないファイル', () => {
  assertEqual(loadRuleCsv('/nonexistent/file.csv').length, 0, 'length');
});

test('L03: 読み込みルールで照合', () => {
  const csvPath = path.join(__dirname, '..', 'rule-csv', '11890320_rules_20260404055537.csv');
  const rules = loadRuleCsv(csvPath);
  const result = matchExistingRules({
    description: 'ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ',
    entrySideJa: '支出',
    amount: 69500,
  }, rules);
  assert(result !== null, 'should match existing CSV rule');
});

console.log('\n━━━ 優先順位テスト ━━━');

test('P01: 前方一致ヒット', () => {
  const rules = [
    {
      entrySide: '支出', walletName: '', cardLabel: '',
      content: 'ｺｳｻﾞﾌﾘｶｴ DF.',
      matchType: '前方一致', amountMin: null, amountMax: null,
      priority: 0, action: '取引を推測する', transferAccount: '',
      partner: '', invoiceType: '', account: '未払金',
      taxClass: '対象外', item: '', _lineNumber: 2,
    },
  ];
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
    entrySideJa: '支出',
    amount: 500000,
  }, rules);
  assert(result !== null, 'should match');
  assertEqual(result.matchType, '前方一致');
  assertEqual(result.account, '未払金');
});

test('P02: 完全一致 > 部分一致（完全一致優先）', () => {
  const rules = [
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'NTT',
      matchType: '部分一致', amountMin: null, amountMax: null,
      priority: 0, action: '取引を推測する', transferAccount: '',
      partner: 'NTTグループ', invoiceType: '', account: '通信費',
      taxClass: '課対仕入', item: '', _lineNumber: 2,
    },
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'NTT',
      matchType: '完全一致', amountMin: null, amountMax: null,
      priority: 0, action: '取引を登録する', transferAccount: '',
      partner: 'NTT東日本', invoiceType: '', account: '電話代',
      taxClass: '課対仕入', item: '', _lineNumber: 3,
    },
  ];
  const result = matchExistingRules({
    description: 'NTT',
    entrySideJa: '支出',
    amount: 5000,
  }, rules);
  assert(result !== null, 'should match');
  assertEqual(result.account, '電話代', '完全一致の方を採用');
  assertEqual(result.matchType, '完全一致');
});

test('P03: 同じマッチ条件では優先度が高い方', () => {
  const rules = [
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'NTT',
      matchType: '部分一致', amountMin: null, amountMax: null,
      priority: 5, action: '取引を推測する', transferAccount: '',
      partner: 'NTT東日本', invoiceType: '', account: '通信費',
      taxClass: '課対仕入', item: '', _lineNumber: 2,
    },
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'NTT',
      matchType: '部分一致', amountMin: null, amountMax: null,
      priority: 10, action: '取引を登録する', transferAccount: '',
      partner: 'NTTコミュニケーションズ', invoiceType: '',
      account: '電話代', taxClass: '課対仕入', item: '', _lineNumber: 3,
    },
  ];
  const result = matchExistingRules({
    description: 'NTTヒガシ',
    entrySideJa: '支出',
    amount: 5000,
  }, rules);
  assert(result !== null, 'should match');
  assertEqual(result.account, '電話代', '優先度10の方を採用');
  assertEqual(result.priority, '10');
});

test('P04: 同じマッチ条件・同じ優先度では条件指定の多い方', () => {
  const rules = [
    {
      entrySide: '支出', walletName: '', cardLabel: '',
      content: 'NTT',
      matchType: '部分一致', amountMin: null, amountMax: null,
      priority: 0, action: '取引を推測する', transferAccount: '',
      partner: 'NTT東日本', invoiceType: '', account: '通信費',
      taxClass: '課対仕入', item: '', _lineNumber: 2,
    },
    {
      entrySide: '支出', walletName: '三菱UFJ銀行', cardLabel: '',
      content: 'NTT',
      matchType: '部分一致', amountMin: null, amountMax: 100000,
      priority: 0, action: '取引を登録する', transferAccount: '',
      partner: 'NTT東日本', invoiceType: '', account: '電話代',
      taxClass: '課対仕入', item: '', _lineNumber: 3,
    },
  ];
  const result = matchExistingRules({
    description: 'NTTヒガシ',
    entrySideJa: '支出',
    walletableName: '三菱UFJ銀行',
    amount: 5000,
  }, rules);
  assert(result !== null, 'should match');
  assertEqual(result.account, '電話代', '条件指定が多い方を採用');
});

test('P05: 完全一致 > 前方一致 > 部分一致の順序', () => {
  const rules = [
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'ｺｳｻﾞﾌﾘｶｴ',
      matchType: '部分一致', amountMin: null, amountMax: null,
      priority: 0, action: '', transferAccount: '',
      partner: '', invoiceType: '', account: '雑費',
      taxClass: '', item: '', _lineNumber: 2,
    },
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'ｺｳｻﾞﾌﾘｶｴ',
      matchType: '前方一致', amountMin: null, amountMax: null,
      priority: 0, action: '', transferAccount: '',
      partner: '', invoiceType: '', account: '未払金',
      taxClass: '', item: '', _lineNumber: 3,
    },
    {
      entrySide: '', walletName: '', cardLabel: '',
      content: 'ｺｳｻﾞﾌﾘｶｴ',
      matchType: '完全一致', amountMin: null, amountMax: null,
      priority: 0, action: '', transferAccount: '',
      partner: '', invoiceType: '', account: '普通預金',
      taxClass: '', item: '', _lineNumber: 4,
    },
  ];
  const result = matchExistingRules({
    description: 'ｺｳｻﾞﾌﾘｶｴ',
    entrySideJa: '支出',
    amount: 1000,
  }, rules);
  assert(result !== null, 'should match');
  assertEqual(result.account, '普通預金', '完全一致が最優先');
  assertEqual(result.matchType, '完全一致');
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
