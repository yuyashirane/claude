/**
 * test-transaction-type-classifier.js
 * 取引類型判定モジュールのテスト
 */

const {
  classifyTransactionType,
  isPersonName,
  hasPersonName,
  stripPrefix,
} = require('../src/classify/transaction-type-classifier');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || ''} expected "${expected}" but got "${actual}"`);
  }
}

// ヘルパー: テスト用明細を生成
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

console.log('\n━━━ stripPrefix テスト ━━━');

test('P01: IBﾌﾘｺﾐ プレフィックス除去', () => {
  assertEqual(stripPrefix('IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ'), 'ﾊﾞﾊﾞ ﾉﾘﾌﾐ');
});

test('P02: ｺｳｻﾞﾌﾘｶｴ プレフィックス除去', () => {
  assertEqual(stripPrefix('ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ'), 'DF.ｸﾛﾚﾗｺｳｷﾞﾖ');
});

test('P03: プレフィックスなし → そのまま', () => {
  assertEqual(stripPrefix('ﾓﾘﾑﾗ ﾒｲ'), 'ﾓﾘﾑﾗ ﾒｲ');
});

test('P04: ｿｳｷﾝ プレフィックス除去', () => {
  assertEqual(stripPrefix('ｿｳｷﾝ     ｵｲｶﾜ ｾﾝｼﾞ'), 'ｵｲｶﾜ ｾﾝｼﾞ');
});

console.log('\n━━━ isPersonName テスト ━━━');

test('N01: ﾊﾞﾊﾞ ﾉﾘﾌﾐ → 人名', () => {
  assert(isPersonName('ﾊﾞﾊﾞ ﾉﾘﾌﾐ'));
});

test('N02: ｲﾜﾓﾄ ﾄﾓｱｷ → 人名', () => {
  assert(isPersonName('ｲﾜﾓﾄ ﾄﾓｱｷ'));
});

test('N03: ﾓﾘﾑﾗ ﾒｲ → 人名（名が2文字）', () => {
  assert(isPersonName('ﾓﾘﾑﾗ ﾒｲ'));
});

test('N04: ｵｲｶﾜ ｾﾝｼﾞ → 人名', () => {
  assert(isPersonName('ｵｲｶﾜ ｾﾝｼﾞ'));
});

test('N05: ﾓﾘﾑﾗ ｱﾔｶ → 人名', () => {
  assert(isPersonName('ﾓﾘﾑﾗ ｱﾔｶ'));
});

test('N06: ﾔﾂﾒｾｲﾔｸ → 人名でない（スペースなし）', () => {
  assert(!isPersonName('ﾔﾂﾒｾｲﾔｸ'));
});

test('N07: ｶ)ｷﾒｲﾄﾞｳ → 人名でない（法人）', () => {
  assert(!isPersonName('ｶ)ｷﾒｲﾄﾞｳ'));
});

test('N08: DF.ｸﾛﾚﾗｺｳｷﾞﾖ → 人名でない（引落代行）', () => {
  assert(!isPersonName('DF.ｸﾛﾚﾗｺｳｷﾞﾖ'));
});

test('N09: ｱﾝｻﾞｲﾋﾞﾙ ﾀﾞｲﾋﾖｳ ｱﾝｻﾞｲ ﾔｽﾋｺ → 人名でない（3語以上）', () => {
  assert(!isPersonName('ｱﾝｻﾞｲﾋﾞﾙ ﾀﾞｲﾋﾖｳ ｱﾝｻﾞｲ ﾔｽﾋｺ'));
});

test('N10: 空文字 → 人名でない', () => {
  assert(!isPersonName(''));
});

test('N11: ﾏﾂﾀﾞ ﾉﾘｺ → 人名', () => {
  assert(isPersonName('ﾏﾂﾀﾞ ﾉﾘｺ'));
});

test('N12: ﾊﾞﾊﾞ ｴﾐ → 人名（名が2文字）', () => {
  assert(isPersonName('ﾊﾞﾊﾞ ｴﾐ'));
});

console.log('\n━━━ hasPersonName テスト ━━━');

test('H01: IBﾌﾘｺﾐ付き人名検出', () => {
  assert(hasPersonName('IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ'));
});

test('H02: プレフィックスなし人名検出', () => {
  assert(hasPersonName('ﾓﾘﾑﾗ ﾒｲ'));
});

test('H03: ｿｳｷﾝ付き人名検出', () => {
  assert(hasPersonName('ｿｳｷﾝ     ｵｲｶﾜ ｾﾝｼﾞ'));
});

test('H04: 法人名 → 人名でない', () => {
  assert(!hasPersonName('IBﾌﾘｺﾐ   ｶ)ｷﾒｲﾄﾞｳ'));
});

console.log('\n━━━ classifyTransactionType テスト ━━━');

test('T01: ｺﾞﾍﾝｻｲ → LOAN_REPAY', () => {
  const result = classifyTransactionType(makeItem({ description: 'ｺﾞﾍﾝｻｲ' }));
  assertEqual(result.type, 'LOAN_REPAY', 'type');
  assert(result.confidence >= 85, 'confidence >= 85');
});

test('T02: ｼﾞﾄﾞｳｷ expense → ATM', () => {
  const result = classifyTransactionType(makeItem({ description: 'ｼﾞﾄﾞｳｷ' }));
  assertEqual(result.type, 'ATM', 'type');
  assert(result.note.includes('引出'), 'note should mention 引出');
});

test('T03: ｼﾞﾄﾞｳｷ income → ATM（預入）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｼﾞﾄﾞｳｷ   (618)',
    entry_side: 'income',
  }));
  assertEqual(result.type, 'ATM', 'type');
  assert(result.note.includes('預入'), 'note should mention 預入');
});

test('T04: ｸﾚｼﾞﾂﾄ（銀行口座）→ CREDIT_PULL', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ',
    walletable_type: 'bank_account',
  }));
  assertEqual(result.type, 'CREDIT_PULL', 'type');
});

test('T05: ｸﾚｼﾞﾂﾄ（クレカ口座）→ CREDIT_PULLにならない', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ',
    walletable_type: 'credit_card',
  }));
  assert(result.type !== 'CREDIT_PULL', 'credit_card should not be CREDIT_PULL');
});

test('T06: IBﾌﾘｺﾐ + 人名（expense）→ PERSONAL_PAYMENT', () => {
  const result = classifyTransactionType(makeItem({
    description: 'IBﾌﾘｺﾐ   ｲﾜﾓﾄ ﾄﾓｱｷ',
    entry_side: 'expense',
  }));
  assertEqual(result.type, 'PERSONAL_PAYMENT', 'type');
  assert(result.note.includes('個人宛支払'), 'note should mention 個人宛支払');
});

test('T07: 人名でない法人（expense）→ EXPENSE', () => {
  const result = classifyTransactionType(makeItem({
    description: 'IBﾌﾘｺﾐ   ｶ)ｷﾒｲﾄﾞｳ',
    entry_side: 'expense',
  }));
  assertEqual(result.type, 'EXPENSE', 'type');
});

test('T08: ﾔﾂﾒｾｲﾔｸ → EXPENSE（人名パターンに一致しない）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾂﾒｾｲﾔｸ',
  }));
  assertEqual(result.type, 'EXPENSE', 'type');
});

test('T09: ｽｸｴｱ(ｶ income → SALES_IN', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｽｸｴｱ(ｶ',
    entry_side: 'income',
    amount: 30115,
  }));
  assertEqual(result.type, 'SALES_IN', 'type');
});

test('T10: ﾊﾟ-ｸ24(ｶ)ﾀｲﾑｽﾞﾍﾟｲ income → SALES_IN', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ﾊﾟ-ｸ24(ｶ)ﾀｲﾑｽﾞﾍﾟｲ',
    entry_side: 'income',
    amount: 1739673,
  }));
  assertEqual(result.type, 'SALES_IN', 'type');
});

test('T11: ﾓﾘﾑﾗ ﾒｲ income → SALES_IN（個人顧客からの入金）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ﾓﾘﾑﾗ ﾒｲ',
    entry_side: 'income',
    amount: 102982,
  }));
  assertEqual(result.type, 'SALES_IN', 'type');
});

test('T12: ｶ)ｷﾒｲﾄﾞｳ income → SALES_IN（法人からの入金）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｶ)ｷﾒｲﾄﾞｳ',
    entry_side: 'income',
    amount: 1400000,
  }));
  assertEqual(result.type, 'SALES_IN', 'type');
});

test('T13: 口座間振替（自社口座名一致）→ TRANSFER', () => {
  const result = classifyTransactionType(
    makeItem({ description: 'IBﾌﾘｺﾐ   みずほ銀行普通' }),
    ['みずほ銀行普通', '三菱UFJ銀行普通']
  );
  assertEqual(result.type, 'TRANSFER', 'type');
});

test('T14: 口座間振替判定用の口座名なし → TRANSFERにならない', () => {
  const result = classifyTransactionType(
    makeItem({ description: 'IBﾌﾘｺﾐ   みずほ銀行普通' }),
    [] // 口座名一覧なし
  );
  assert(result.type !== 'TRANSFER', 'should not be TRANSFER without own account names');
});

test('T15: 社会保険料 → LOAN_REPAY（複合仕訳）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｺｳｻﾞﾌﾘｶｴ ｺｳｾｲﾎｹﾝﾘﾖｳ',
  }));
  assertEqual(result.type, 'LOAN_REPAY', 'type');
  assert(result.note.includes('社会保険'), 'note should mention 社会保険');
});

test('T16: ﾃｽｳﾘﾖｳ → EXPENSE（手数料は通常経費）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ﾃｽｳﾘﾖｳ   (618)',
  }));
  assertEqual(result.type, 'EXPENSE', 'type');
});

test('T17: ｱﾝｻﾞｲ ﾔｽﾋｺ（expense）→ PERSONAL_PAYMENT', () => {
  const result = classifyTransactionType(makeItem({
    description: 'IBﾌﾘｺﾐ   ｱﾝｻﾞｲ ﾔｽﾋｺ',
    entry_side: 'expense',
  }));
  assertEqual(result.type, 'PERSONAL_PAYMENT', 'type');
});

test('T18: ｱﾝｻﾞｲﾋﾞﾙ ﾀﾞｲﾋﾖｳ ｱﾝｻﾞｲ ﾔｽﾋｺ → EXPENSE（3語以上は法人）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'IBﾌﾘｺﾐ   ｱﾝｻﾞｲﾋﾞﾙ ﾀﾞｲﾋﾖｳ ｱﾝｻﾞｲ ﾔｽﾋｺ',
    entry_side: 'expense',
  }));
  assertEqual(result.type, 'EXPENSE', 'type');
});

test('T19: ｼﾔｶｲﾎｹﾝｼﾝﾘﾖｳﾎｳｼﾕｳｼﾊﾗｲｷｷﾝ income → 社保関連の入金', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｼﾔｶｲﾎｹﾝｼﾝﾘﾖｳﾎｳｼﾕｳｼﾊﾗｲｷｷﾝ',
    entry_side: 'income',
  }));
  // 社会保険料のキーワード「ｼﾔｶｲﾎｹﾝ」に一致 → LOAN_REPAY
  assertEqual(result.type, 'LOAN_REPAY', 'type');
});

test('T20: ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ → EXPENSE（口座振替経由の通常支出）', () => {
  const result = classifyTransactionType(makeItem({
    description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
  }));
  assertEqual(result.type, 'EXPENSE', 'type');
});

// --- 結果 ---
console.log(`\n--- 結果 ---`);
console.log(`✅ 通過: ${passed}件`);
if (failed > 0) {
  console.log(`❌ 失敗: ${failed}件`);
  process.exit(1);
} else {
  console.log('全テスト通過 🎉');
}
