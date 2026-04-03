'use strict';

/**
 * test-report-details.js — monthly-report-generator.js の details 子行展開テスト
 *
 * テストケース一覧:
 *   1. details なしの Finding → 親行のみ1行出力
 *   2. details 1件の Finding → 親行1 + 子行1 = 2行
 *   3. details 3件の Finding → 親1 + 子3 = 4行
 *   4. 子行の背景色が #F5F5F5 であること
 *   5. 子行の freeeLink がハイパーリンクになっていること
 *   6. details が空配列の Finding → 子行なし
 *   7. 混在: details あり2件 + details なし3件 → 合計行数が正しい
 *
 * 使い方: node tests/test-report-details.js
 */

const assert  = require('assert');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const ExcelJS = require('exceljs');

const { generateMonthlyReport } = require('../src/verify/monthly-report-generator');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

// ============================================================
// ヘルパー
// ============================================================

function tmpDir() {
  const d = path.join(os.tmpdir(), `freee-details-test-${Date.now()}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function mkFinding(overrides = {}) {
  return {
    severity: '🟡',
    category: 'balance_anomaly',
    checkCode: 'BA-01',
    description: 'テスト指摘',
    currentValue: '100,000円',
    suggestedValue: '確認してください',
    confidence: 80,
    targetMonth: '2026-03',
    freeeLink: 'https://secure.freee.co.jp/reports/trial_bs_details?account_item_id=101',
    details: [],
    ...overrides,
  };
}

function mkDetail(overrides = {}) {
  return {
    date: '2026-03-15',
    amount: 50000,
    counterAccount: '普通預金',
    description: 'テスト取引',
    dealId: 9999,
    freeeLink: 'https://secure.freee.co.jp/deals/9999',
    ...overrides,
  };
}

/**
 * findings で Excel を生成し、Sheet2 のデータ行（ヘッダー除く）を返す
 */
async function generateAndReadSheet2(findings) {
  const dir = tmpDir();
  const filePath = await generateMonthlyReport({
    companyId:   'test',
    companyName: 'テスト事業所',
    targetMonth: '2026-03',
    findings,
    monthlyData: {},
    outputDir:   dir,
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet2 = wb.getWorksheet('指摘一覧');
  assert.ok(sheet2, '指摘一覧シートが存在しない');

  const dataRows = [];
  sheet2.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // ヘッダー行スキップ
    dataRows.push(row);
  });

  return dataRows;
}

// ============================================================
// テスト本体
// ============================================================

async function runTests() {
  console.log('\n=== report-details テスト ===\n');

  // ── テスト1: details なし → 親行のみ ──
  await test('1. details なしの Finding → 親行のみ1行出力', async () => {
    const findings = [mkFinding({ details: undefined })];
    const rows = await generateAndReadSheet2(findings);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].getCell(1).value, '🟡');
  });

  // ── テスト2: details 1件 → 親+子 ──
  await test('2. details 1件の Finding → 親行1 + 子行1 = 2行', async () => {
    const findings = [mkFinding({ details: [mkDetail()] })];
    const rows = await generateAndReadSheet2(findings);
    assert.strictEqual(rows.length, 2);
    // 親行
    assert.strictEqual(rows[0].getCell(1).value, '🟡');
    // 子行の重要度列は空
    assert.strictEqual(rows[1].getCell(1).value, '');
    // 子行の description に摘要が含まれる
    const desc = String(rows[1].getCell(4).value || '');
    assert.ok(desc.includes('テスト取引'), `description="${desc}" に「テスト取引」が含まれない`);
    // 子行の金額列（E列=5）に金額が含まれる
    const amt = String(rows[1].getCell(5).value || '');
    assert.ok(amt.includes('50,000'), `amount="${amt}" に「50,000」が含まれない`);
    // 子行の相手科目列（F列=6）
    const counter = String(rows[1].getCell(6).value || '');
    assert.ok(counter.includes('普通預金'), `counterAccount="${counter}" に「普通預金」が含まれない`);
  });

  // ── テスト3: details 3件 → 4行 ──
  await test('3. details 3件の Finding → 親1 + 子3 = 4行', async () => {
    const findings = [mkFinding({
      details: [
        mkDetail({ dealId: 1 }),
        mkDetail({ dealId: 2 }),
        mkDetail({ dealId: 3 }),
      ],
    })];
    const rows = await generateAndReadSheet2(findings);
    assert.strictEqual(rows.length, 4);
    // 1行目が親行、2〜4行目が子行
    assert.strictEqual(rows[0].getCell(1).value, '🟡');
    assert.strictEqual(rows[1].getCell(1).value, '');
    assert.strictEqual(rows[2].getCell(1).value, '');
    assert.strictEqual(rows[3].getCell(1).value, '');
  });

  // ── テスト4: 子行の背景色 ──
  await test('4. 子行の背景色が FFF5F5F5 であること', async () => {
    const findings = [mkFinding({ details: [mkDetail()] })];
    const rows = await generateAndReadSheet2(findings);
    const detailRow = rows[1];
    const cell = detailRow.getCell(4); // D列
    const argb = cell.fill?.fgColor?.argb;
    assert.strictEqual(argb, 'FFF5F5F5',
      `fill.fgColor.argb="${argb}" !== "FFF5F5F5"`);
  });

  // ── テスト5: 子行の freeeLink がハイパーリンク ──
  await test('5. 子行の freeeLink がハイパーリンクになっていること', async () => {
    const findings = [mkFinding({
      details: [mkDetail({ freeeLink: 'https://secure.freee.co.jp/deals/9999' })],
    })];
    const rows = await generateAndReadSheet2(findings);
    const detailRow = rows[1];
    const linkCell = detailRow.getCell(7); // G列
    const val = linkCell.value;
    assert.ok(
      val && typeof val === 'object' && val.hyperlink,
      `linkCell.value がハイパーリンクオブジェクトでない: ${JSON.stringify(val)}`
    );
    assert.ok(val.hyperlink.includes('9999'),
      `hyperlink="${val.hyperlink}" に deal ID が含まれない`);
  });

  // ── テスト6: details が空配列 → 子行なし ──
  await test('6. details が空配列の Finding → 子行なし', async () => {
    const findings = [mkFinding({ details: [] })];
    const rows = await generateAndReadSheet2(findings);
    assert.strictEqual(rows.length, 1);
  });

  // ── テスト7: 混在テスト ──
  await test('7. 混在: details あり2件 + details なし3件 → 合計9行', async () => {
    // 各 details 2件の親: (1+2)×2 = 6行
    // details なし 3件: 3行
    // 合計: 9行
    const findings = [
      mkFinding({ details: [mkDetail({ dealId: 101 }), mkDetail({ dealId: 102 })] }),
      mkFinding({ details: [mkDetail({ dealId: 201 }), mkDetail({ dealId: 202 })] }),
      mkFinding({ details: undefined }),
      mkFinding({ details: [] }),
      mkFinding({ details: undefined }),
    ];
    const rows = await generateAndReadSheet2(findings);
    assert.strictEqual(rows.length, 9,
      `行数=${rows.length} !== 9 (親5行 + 子4行)`);
  });

  console.log(`\n--- report-details: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('予期しないエラー:', err.message);
  process.exit(1);
});
