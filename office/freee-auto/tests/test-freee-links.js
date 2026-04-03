/**
 * freee-links.js のテスト
 *
 * 各関数が正しいURLを返すことを検証
 * 期待: 34テスト通過
 *
 * 使い方: node tests/test-freee-links.js
 */

const assert = require('assert');
const {
  FREEE_BASE,
  walletTxnLink,
  receiptLink,
  dealLink,
  dealDetailLink,
  trialBsDetailLink,
  journalsByAccountLink,
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
  formatFiscalStartDate,
} = require('../src/shared/freee-links');

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

console.log('\n=== freee-links テスト ===\n');

test('FREEE_BASE は https://secure.freee.co.jp', () => {
  assert.strictEqual(FREEE_BASE, 'https://secure.freee.co.jp');
});

test('walletTxnLink: 口座明細リンク生成', () => {
  const url = walletTxnLink(12345, '2026-03-01');
  assert.strictEqual(
    url,
    'https://secure.freee.co.jp/wallet_txns#walletable=12345&start_date=2026-03-01'
  );
});

test('receiptLink: 証憑リンク生成', () => {
  const url = receiptLink(99999);
  assert.strictEqual(url, 'https://secure.freee.co.jp/receipts/99999');
});

test('dealLink: 仕訳帳リンク生成', () => {
  const url = dealLink(54321);
  assert.strictEqual(
    url,
    'https://secure.freee.co.jp/reports/journals?deal_id=54321'
  );
});

test('dealDetailLink: 取引詳細リンク生成', () => {
  const url = dealDetailLink(54321);
  assert.strictEqual(url, 'https://secure.freee.co.jp/deals/54321');
});

// ── trialBsDetailLink ──
console.log('\n--- trialBsDetailLink ---');

test('trialBsDetailLink: 正常系（数値ID）', () => {
  const url = trialBsDetailLink(474381, 12345);
  assert.strictEqual(
    url,
    'https://secure.freee.co.jp/reports/trial_bs_details?account_item_id=12345'
  );
});

test('trialBsDetailLink: accountItemIdが文字列でも動作する', () => {
  const url = trialBsDetailLink(474381, '12345');
  assert.strictEqual(
    url,
    'https://secure.freee.co.jp/reports/trial_bs_details?account_item_id=12345'
  );
});

test('trialBsDetailLink: accountItemIdがnullでもクラッシュしない', () => {
  const url = trialBsDetailLink(474381, null);
  assert.ok(typeof url === 'string');
});

// ── journalsByAccountLink ──
console.log('\n--- journalsByAccountLink ---');

test('journalsByAccountLink: 正常系（全パラメータ）', () => {
  const url = journalsByAccountLink(474381, 12345, '2026-03-01', '2026-03-31');
  assert.ok(url.includes('account_item_id=12345'));
  assert.ok(url.includes('start_date=2026-03-01'));
  assert.ok(url.includes('end_date=2026-03-31'));
  assert.ok(url.includes('page=1'));
  assert.ok(url.includes('per_page=50'));
  assert.ok(url.includes('order_by=txn_date'));
  assert.ok(url.startsWith('https://secure.freee.co.jp/reports/journals?'));
});

test('journalsByAccountLink: 日付形式がYYYY-MM-DDで出力される', () => {
  const url = journalsByAccountLink(474381, 99, '2026-01-01', '2026-01-31');
  assert.ok(url.includes('start_date=2026-01-01'));
  assert.ok(url.includes('end_date=2026-01-31'));
});

test('journalsByAccountLink: accountItemIdが文字列でも動作する', () => {
  const url = journalsByAccountLink(474381, '99', '2026-03-01', '2026-03-31');
  assert.ok(url.includes('account_item_id=99'));
});

test('journalsByAccountLink: accountName指定時にnameパラメータが付与される', () => {
  const url = journalsByAccountLink(474381, 12345, '2025-10-01', '2026-03-31', '前払費用');
  assert.ok(url.includes('name='));
  assert.ok(url.includes('%E5%89%8D%E6%89%95%E8%B2%BB%E7%94%A8')); // 「前払費用」のURLエンコード
});

test('journalsByAccountLink: partnerId指定時にpartner_idパラメータが付与される', () => {
  const url = journalsByAccountLink(474381, 12345, '2020-10-01', '2026-03-31', '長期借入金', { partnerId: 98765 });
  assert.ok(url.includes('partner_id=98765'));
  assert.ok(url.includes('account_item_id=12345'));
});

test('journalsByAccountLink: partnerId未指定ではpartner_idパラメータなし', () => {
  const url = journalsByAccountLink(474381, 12345, '2025-10-01', '2026-03-31', '売掛金');
  assert.ok(!url.includes('partner_id'));
});

// ── generalLedgerLink ──
console.log('\n--- generalLedgerLink ---');

test('generalLedgerLink: パスが /reports/general_ledgers/show? であること', () => {
  const url = generalLedgerLink(474381, '未収還付法人税等', '2025-10-01', '2026-03-31');
  assert.ok(url.startsWith('https://secure.freee.co.jp/reports/general_ledgers/show?'));
});

test('generalLedgerLink: 科目名がURLエンコードされてnameパラメータに設定される', () => {
  const url = generalLedgerLink(474381, '未収還付法人税等', '2025-10-01', '2026-03-31');
  assert.ok(url.includes('name=%E6%9C%AA%E5%8F%8E%E9%82%84%E4%BB%98%E6%B3%95%E4%BA%BA%E7%A8%8E%E7%AD%89'));
  assert.ok(!url.includes('account_item_id'));
  assert.ok(url.includes('start_date=2025-10-01'));
  assert.ok(url.includes('end_date=2026-03-31'));
});

test('generalLedgerLink: adjustment=all が含まれること', () => {
  const url = generalLedgerLink(474381, '売掛金', '2025-10-01', '2026-03-31');
  assert.ok(url.includes('adjustment=all'));
});

test('generalLedgerLink: fiscalYearId が設定されること', () => {
  const url = generalLedgerLink(474381, '売掛金', '2025-10-01', '2026-03-31', { fiscalYearId: 10840688 });
  assert.ok(url.includes('fiscal_year_id=10840688'));
});

test('generalLedgerLink: fiscalYearId なしでもエラーにならないこと', () => {
  const url = generalLedgerLink(474381, '売掛金', '2025-10-01', '2026-03-31');
  assert.ok(!url.includes('fiscal_year_id'));
  assert.ok(typeof url === 'string');
});

test('generalLedgerLink: partnerId指定時にpartner_idパラメータ付与', () => {
  const url = generalLedgerLink(474381, '長期借入金', '2020-10-01', '2026-03-31', { partnerId: 98765, fiscalYearId: 10840688 });
  assert.ok(url.includes('partner_id=98765'));
  assert.ok(url.includes('fiscal_year_id=10840688'));
  assert.ok(url.includes('name=%E9%95%B7%E6%9C%9F%E5%80%9F%E5%85%A5%E9%87%91'));
});

test('generalLedgerLink: partnerId未指定ではpartner_idなし', () => {
  const url = generalLedgerLink(474381, '売掛金', '2025-10-01', '2026-03-31');
  assert.ok(!url.includes('partner_id'));
});

// ── determineLinkStartDate ──
console.log('\n--- determineLinkStartDate ---');

test('determineLinkStartDate: opening ≠ closing → 当期首, crossesFiscalYear=false', () => {
  const result = determineLinkStartDate(100000, 200000, 2025, 10);
  assert.strictEqual(result.startDate, '2025-10-01');
  assert.ok(result.reason.includes('当期中に残高変動'));
  assert.strictEqual(result.crossesFiscalYear, false);
});

test('determineLinkStartDate: opening === closing, historicalBsなし → 5期前（後方互換）', () => {
  const result = determineLinkStartDate(500000, 500000, 2025, 10);
  assert.strictEqual(result.startDate, '2020-10-01');
  assert.ok(result.reason.includes('5期前'));
  assert.strictEqual(result.crossesFiscalYear, true);
});

test('determineLinkStartDate: 両方0でも opening === closing として5期前', () => {
  const result = determineLinkStartDate(0, 0, 2025, 10);
  assert.strictEqual(result.startDate, '2020-10-01');
  assert.strictEqual(result.crossesFiscalYear, true);
});

// historicalBs を使った動的探索テスト
const mockHistoricalBs = {
  '2024': { '売掛金': { opening: 100, closing: 150 }, '出資金': { opening: 20000, closing: 20000 } },
  '2023': { '売掛金': { opening: 80, closing: 100 }, '出資金': { opening: 20000, closing: 20000 } },
  '2022': { '売掛金': { opening: 80, closing: 80 }, '出資金': { opening: 20000, closing: 20000 } },
  '2021': { '売掛金': { opening: 50, closing: 80 }, '出資金': { opening: 10000, closing: 20000 } },
};

test('determineLinkStartDate: historicalBsあり, 前期で変動あり → 前期首', () => {
  // 売掛金: 当期 opening=150, closing=150（不変）→ 前期(2024) opening=100, closing=150（変動）
  const result = determineLinkStartDate(150, 150, 2025, 10,
    { historicalBs: mockHistoricalBs, accountName: '売掛金' });
  assert.strictEqual(result.startDate, '2024-10-01');
  assert.ok(result.reason.includes('2024'));
  assert.strictEqual(result.crossesFiscalYear, true);
});

test('determineLinkStartDate: historicalBsあり, 前々期まで遡って変動発見 → 前々期首', () => {
  // 出資金: 当期 opening=20000, closing=20000, 前期(2024)も同額, 前々期(2023)も同額,
  // 3期前(2022)も同額, 4期前(2021) opening=10000, closing=20000（変動）
  const result = determineLinkStartDate(20000, 20000, 2025, 10,
    { historicalBs: mockHistoricalBs, accountName: '出資金' });
  assert.strictEqual(result.startDate, '2021-10-01');
  assert.ok(result.reason.includes('2021'));
  assert.strictEqual(result.crossesFiscalYear, true);
});

test('determineLinkStartDate: historicalBsあり, 途中でデータなし → その期の期首', () => {
  // 存在しない科目 → 2024期のデータなし → 2024期首を返す
  const result = determineLinkStartDate(5000, 5000, 2025, 10,
    { historicalBs: mockHistoricalBs, accountName: '存在しない科目' });
  assert.strictEqual(result.startDate, '2024-10-01');
  assert.strictEqual(result.crossesFiscalYear, true);
});

test('determineLinkStartDate: historicalBsあり, 全期不変 → 5期前', () => {
  // 全期で opening === closing な科目（historicalBsが5期分ないので途中でデータなし）
  const allSameHist = {
    '2024': { '固定科目': { opening: 100, closing: 100 } },
    '2023': { '固定科目': { opening: 100, closing: 100 } },
    '2022': { '固定科目': { opening: 100, closing: 100 } },
    '2021': { '固定科目': { opening: 100, closing: 100 } },
    '2020': { '固定科目': { opening: 100, closing: 100 } },
  };
  const result = determineLinkStartDate(100, 100, 2025, 10,
    { historicalBs: allSameHist, accountName: '固定科目' });
  assert.strictEqual(result.startDate, '2020-10-01');
  assert.ok(result.reason.includes('5期前'));
  assert.strictEqual(result.crossesFiscalYear, true);
});

// ── buildBalanceLink ──
console.log('\n--- buildBalanceLink ---');

test('buildBalanceLink: 当期変動あり → generalLedgerLink（総勘定元帳）', () => {
  const url = buildBalanceLink(474381, '売掛金', 12345, '2026-03-31', {
    openingBalance: 100, closingBalance: 200,
    fiscalYear: 2025, startMonth: 10, fiscalYearId: 10840688,
  });
  assert.ok(url.includes('/general_ledgers/show'));
  assert.ok(url.includes('fiscal_year_id=10840688'));
});

test('buildBalanceLink: 当期不変 + historicalBsで前期変動 → journalsByAccountLink（仕訳帳）', () => {
  const url = buildBalanceLink(474381, '売掛金', 12345, '2026-03-31', {
    openingBalance: 150, closingBalance: 150,
    fiscalYear: 2025, startMonth: 10, fiscalYearId: 10840688,
    historicalBs: mockHistoricalBs,
  });
  assert.ok(url.includes('/reports/journals'));
  assert.ok(url.includes('account_item_id=12345'));
  assert.ok(url.includes('start_date=2024-10-01'));
});

test('buildBalanceLink: fiscalYearIdなし → journalsByAccountLink（フォールバック）', () => {
  const url = buildBalanceLink(474381, '売掛金', 12345, '2026-03-31', {
    openingBalance: 100, closingBalance: 200,
    fiscalYear: 2025, startMonth: 10,
    // fiscalYearId 未指定
  });
  assert.ok(url.includes('/reports/journals'));
});

// ── formatFiscalStartDate ──
console.log('\n--- formatFiscalStartDate ---');

test('formatFiscalStartDate: 2桁月の場合', () => {
  assert.strictEqual(formatFiscalStartDate(2025, 10), '2025-10-01');
});

test('formatFiscalStartDate: 1桁月はゼロパディング', () => {
  assert.strictEqual(formatFiscalStartDate(2025, 4), '2025-04-01');
});

console.log(`\n--- freee-links: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
if (failed > 0) process.exit(1);
