/**
 * freee-links.js のテスト
 *
 * 各関数が正しいURLを返すことを検証
 * 期待: 5テスト通過
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

console.log(`\n--- freee-links: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
if (failed > 0) process.exit(1);
