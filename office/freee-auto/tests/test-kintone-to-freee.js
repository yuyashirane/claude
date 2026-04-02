/**
 * kintone-to-freee.js のテスト
 *
 * resolveAccountAndTax, buildDealPayload, filterDuplicates, resolveTaxCode
 * 期待: 17テスト通過
 *
 * 使い方: node tests/test-kintone-to-freee.js
 */

const assert = require('assert');
const {
  resolveAccountAndTax,
  buildDealPayload,
  filterDuplicates,
  resolveTaxCode,
} = require('../src/register/kintone-to-freee');
const { TAX_CLASS_TO_CODE } = require('../src/classify/account-matcher');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

// --- モックデータ ---
const MOCK_ACCOUNT_MAP = {
  '旅費交通費': 236940269,
  '通信費': 236940270,
  '売上高': 236940260,
};

function mockRecord(overrides = {}) {
  return {
    $id: { value: '1' },
    company_id: { value: '474381' },
    wallet_txn_id: { value: '99999' },
    date: { value: '2026-03-15' },
    amount: { value: '3500' },
    description: { value: 'タクシー代' },
    ai_guess_account: { value: '旅費交通費' },
    ai_guess_tax: { value: '課税10%' },
    confidence_score: { value: '75' },
    corrected_account: { value: '' },
    corrected_tax: { value: '' },
    correction_reason: { value: '' },
    freee_deal_id: { value: '' },
    walletable_type: { value: 'credit_card' },
    walletable_id: { value: '12345' },
    ...overrides,
  };
}

// =============================================
console.log('\n=== kintone-to-freee テスト ===\n');

// --- resolveAccountAndTax ---
console.log('--- resolveAccountAndTax ---');

test('修正なし → AI推定値を使用', () => {
  const record = mockRecord();
  const result = resolveAccountAndTax(record);
  assert.strictEqual(result.account, '旅費交通費');
  assert.strictEqual(result.tax, '課税10%');
  assert.strictEqual(result.wasModified, false);
});

test('科目のみ修正 → 修正科目 + AI税区分', () => {
  const record = mockRecord({
    corrected_account: { value: '通信費' },
  });
  const result = resolveAccountAndTax(record);
  assert.strictEqual(result.account, '通信費');
  assert.strictEqual(result.tax, '課税10%');
  assert.strictEqual(result.wasModified, true);
});

test('税区分のみ修正 → AI科目 + 修正税区分', () => {
  const record = mockRecord({
    corrected_tax: { value: '非課税' },
  });
  const result = resolveAccountAndTax(record);
  assert.strictEqual(result.account, '旅費交通費');
  assert.strictEqual(result.tax, '非課税');
  assert.strictEqual(result.wasModified, true);
});

test('両方修正 → 両方修正値', () => {
  const record = mockRecord({
    corrected_account: { value: '通信費' },
    corrected_tax: { value: '不課税' },
    correction_reason: { value: '海外出張のため' },
  });
  const result = resolveAccountAndTax(record);
  assert.strictEqual(result.account, '通信費');
  assert.strictEqual(result.tax, '不課税');
  assert.strictEqual(result.wasModified, true);
  assert.strictEqual(result.correctionReason, '海外出張のため');
});

// --- buildDealPayload ---
console.log('--- buildDealPayload ---');

test('正常ケース（支出）: details + payments が正しい', () => {
  const record = mockRecord();
  const payload = buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381);
  assert.strictEqual(payload.company_id, 474381);
  assert.strictEqual(payload.issue_date, '2026-03-15');
  assert.strictEqual(payload.type, 'expense');
  // details
  assert.strictEqual(payload.details[0].account_item_id, 236940269);
  assert.strictEqual(payload.details[0].tax_code, TAX_CLASS_TO_CODE['課税10%']);
  assert.strictEqual(payload.details[0].amount, 3500);
  assert.strictEqual(payload.details[0].description, 'タクシー代');
  // payments（消込）
  assert.ok(Array.isArray(payload.payments), 'payments は配列');
  assert.strictEqual(payload.payments[0].from_walletable_type, 'credit_card');
  assert.strictEqual(payload.payments[0].from_walletable_id, 12345);
  assert.strictEqual(payload.payments[0].amount, 3500);
  assert.strictEqual(payload.payments[0].date, '2026-03-15');
});

test('正常ケース（収入）: payments.amount = details.amount', () => {
  const record = mockRecord({
    amount: { value: '-50000' },
    ai_guess_account: { value: '売上高' },
    ai_guess_tax: { value: '課税売上10%' },
    description: { value: '顧問料入金' },
    walletable_type: { value: 'bank_account' },
    walletable_id: { value: '67890' },
  });
  const payload = buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381);
  assert.strictEqual(payload.type, 'income');
  assert.strictEqual(payload.details[0].amount, 50000);
  assert.strictEqual(payload.payments[0].amount, 50000);
  assert.strictEqual(payload.payments[0].from_walletable_type, 'bank_account');
  assert.strictEqual(payload.payments[0].from_walletable_id, 67890);
});

test('科目ID未解決 → エラー', () => {
  const record = mockRecord({
    ai_guess_account: { value: '存在しない科目' },
  });
  assert.throws(
    () => buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381),
    /科目ID未解決/
  );
});

test('walletable_type 空 → エラー「口座情報が不足」', () => {
  const record = mockRecord({
    walletable_type: { value: '' },
  });
  assert.throws(
    () => buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381),
    /口座情報が不足/
  );
});

test('walletable_id 空 → エラー「口座情報が不足」', () => {
  const record = mockRecord({
    walletable_id: { value: '' },
  });
  assert.throws(
    () => buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381),
    /口座情報が不足/
  );
});

test('walletable_type 空 + walletable_id あり → エラー', () => {
  const record = mockRecord({
    walletable_type: { value: '' },
    walletable_id: { value: '12345' },
  });
  assert.throws(
    () => buildDealPayload(record, MOCK_ACCOUNT_MAP, 474381),
    /口座情報が不足/
  );
});

// --- filterDuplicates ---
console.log('--- filterDuplicates ---');

test('deal_id空 → valid に分類', () => {
  const records = [mockRecord()];
  const { valid, skipped } = filterDuplicates(records);
  assert.strictEqual(valid.length, 1);
  assert.strictEqual(skipped.length, 0);
});

test('deal_id入り → skipped に分類', () => {
  const records = [mockRecord({ freee_deal_id: { value: '12345' } })];
  const { valid, skipped } = filterDuplicates(records);
  assert.strictEqual(valid.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.ok(skipped[0].reason.includes('12345'));
});

test('混合 → 正しく分類', () => {
  const records = [
    mockRecord({ $id: { value: '1' } }),
    mockRecord({ $id: { value: '2' }, freee_deal_id: { value: '999' } }),
    mockRecord({ $id: { value: '3' } }),
  ];
  const { valid, skipped } = filterDuplicates(records);
  assert.strictEqual(valid.length, 2);
  assert.strictEqual(skipped.length, 1);
});

// --- resolveTaxCode ---
console.log('--- resolveTaxCode ---');

test('課税10% → 正しいコード', () => {
  const code = resolveTaxCode('課税10%');
  assert.strictEqual(code, TAX_CLASS_TO_CODE['課税10%']);
});

test('非課税 → 正しいコード', () => {
  const code = resolveTaxCode('非課税');
  assert.strictEqual(code, TAX_CLASS_TO_CODE['非課税']);
});

test('Kintone表示名エイリアス: 課税仕入10% → 課税10%相当コード', () => {
  const code = resolveTaxCode('課税仕入10%');
  assert.strictEqual(code, TAX_CLASS_TO_CODE['課税10%']);
});

test('未知の税区分 → エラー', () => {
  assert.throws(
    () => resolveTaxCode('存在しない税区分'),
    /税区分コード未解決/
  );
});

// --- サマリー ---
console.log(`\n--- kintone-to-freee: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
if (failed > 0) process.exit(1);
