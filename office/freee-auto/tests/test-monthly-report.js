'use strict';

/**
 * test-monthly-report.js — monthly-report-generator.js のユニットテスト
 *
 * テストケース一覧:
 *   1. 基本生成テスト（findings 10件 / ファイル生成 / シート存在）
 *   2. シート1サマリーの件数検証（B11/B12/B13/B14）
 *   3. 空のfindings でエラーにならない
 *   4. シート2のソート検証（🔵→🟡→🔴 で渡しても🔴→🟡→🔵順で出力）
 *   5. シート2のヘッダーと行数
 *   6. BS残高シート生成（科目コード列なし）
 *   7. BS前月データあり → 前月列追加
 *   8. PL月次推移シート（フォールバック）
 *   9. 取引先別残高シート省略
 *  10. 取引先別残高シート生成
 *  11. 出力パス自動生成
 *  12. カテゴリ別集計テスト（行18〜）
 *  13. autoFilter設定テスト
 *  14. 不完全データでもクラッシュしない
 *  15. PL月次推移（plTrend付き）
 *  16. PL月次推移の元帳リンク
 *
 * 使い方: node tests/test-monthly-report.js
 */

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const ExcelJS = require('exceljs');

const { generateMonthlyReport } = require('../src/verify/monthly-report-generator');

// ============================================================
// テストランナー
// ============================================================
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
// モックデータファクトリ
// ============================================================

function mkBalance(accountItemName, closingBalance, opts = {}) {
  return {
    account_item_id:       opts.id         ?? 100,
    account_item_name:     accountItemName,
    account_category_name: opts.category   ?? '流動資産',
    hierarchy_level:       3,
    opening_balance:       opts.opening    ?? 0,
    debit_amount:          0,
    credit_amount:         0,
    closing_balance:       closingBalance,
    composition_ratio:     0,
    partners:              opts.partners   ?? undefined,
  };
}

function mkBs(balances) { return { trial_bs: { balances } }; }
function mkPl(balances) { return { trial_pl: { balances } }; }

function mkBsByPartner(accountName, partners) {
  return {
    trial_bs: {
      balances: [
        mkBalance(accountName, partners.reduce((s, p) => s + p.closing_balance, 0), { partners }),
      ],
    },
  };
}

function mkFinding(severity, checkCode, category = 'test_category') {
  return {
    severity,
    category,
    checkCode,
    description:    `テスト指摘 [${checkCode}]`,
    currentValue:   '現在値サンプル',
    suggestedValue: '推奨値サンプル',
    freeeLink:      '',
  };
}

function mkMonthlyData(overrides = {}) {
  return {
    companyId:        '474381',
    companyName:      'テスト事業所',
    targetMonth:      '2026-03',
    fiscalYear:       2025,
    startMonth:       10,
    trialBs:          mkBs([
      mkBalance('現金',     500_000, { category: '現金・預金' }),
      mkBalance('普通預金', 1_200_000, { category: '現金・預金' }),
      mkBalance('売掛金',   800_000, { category: '売上債権' }),
    ]),
    trialPl:          mkPl([
      mkBalance('売上高',   3_000_000, { category: '売上高' }),
      mkBalance('仕入高',   1_500_000, { category: '売上原価' }),
      mkBalance('給与手当',   600_000, { category: '販管費' }),
      mkBalance('地代家賃',   100_000, { category: '販管費' }),
    ]),
    trialBsByItem:     null,
    trialBsByPartner:  null,
    trialPlByPartner:  null,
    deals:             [],
    walletTxns:        null,
    accountItems:      null,
    partners:          null,
    prevMonth:         null,
    prevYearMonth:     null,
    fetchErrors:       [],
    fetchedAt:         new Date().toISOString(),
    ...overrides,
  };
}

function mkMonthlyDataWithPrev() {
  const base = mkMonthlyData();
  base.prevMonth = {
    targetMonth: '2026-02',
    trialBs: mkBs([
      mkBalance('現金',     600_000, { category: '現金・預金' }),
      mkBalance('普通預金', 1_100_000, { category: '現金・預金' }),
      mkBalance('売掛金',   700_000, { category: '売上債権' }),
    ]),
    trialPl: mkPl([
      mkBalance('売上高',   2_800_000, { category: '売上高' }),
      mkBalance('仕入高',   1_400_000, { category: '売上原価' }),
      mkBalance('給与手当',   600_000, { category: '販管費' }),
      mkBalance('地代家賃',   100_000, { category: '販管費' }),
    ]),
    trialBsByPartner: null,
    trialPlByPartner: null,
    errors: [],
  };
  return base;
}

function mkMonthlyDataWithPartner() {
  const base = mkMonthlyData();
  base.trialBsByPartner = mkBsByPartner('売掛金', [
    { id: 1, name: '株式会社A', closing_balance: 500_000, opening_balance: 500_000 },
    { id: 2, name: '株式会社B', closing_balance: 300_000, opening_balance: 200_000 },
  ]);
  return base;
}

/** plTrend モックデータ（6ヶ月: 2025-10〜2026-03） */
function mkPlTrend() {
  return {
    months: ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'],
    accounts: {
      '売上高': {
        id: 201, category: '売上高',
        monthlyAmounts: [500000, 520000, 480000, 510000, 490000, 500000],
        total: 3000000,
      },
      '仕入高': {
        id: 202, category: '売上原価',
        monthlyAmounts: [250000, 260000, 240000, 250000, 250000, 250000],
        total: 1500000,
      },
      '給与手当': {
        id: 203, category: '販管費',
        monthlyAmounts: [100000, 100000, 100000, 100000, 100000, 100000],
        total: 600000,
      },
    },
    accountList: [
      { id: 201, name: '売上高',   category: '売上高' },
      { id: 202, name: '仕入高',   category: '売上原価' },
      { id: 203, name: '給与手当', category: '販管費' },
    ],
    fetchedAt: new Date().toISOString(),
  };
}

function tmpDir() {
  const d = path.join(os.tmpdir(), `freee-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ============================================================
// テスト本体
// ============================================================

async function runTests() {
  console.log('\n=== test-monthly-report.js ===\n');

  // ─── テスト1: 基本生成 ───
  await test('1. 基本生成: ファイルが生成される', async () => {
    const findings = [
      mkFinding('🔴', 'CD-01', 'cash_deposit'),
      mkFinding('🔴', 'CD-02', 'cash_deposit'),
      mkFinding('🔴', 'DQ-01', 'data_quality'),
      mkFinding('🟡', 'LL-01', 'loan_lease'),
      mkFinding('🟡', 'LL-02', 'loan_lease'),
      mkFinding('🟡', 'RT-01', 'rent'),
      mkFinding('🟡', 'RT-02', 'rent'),
      mkFinding('🟡', 'PY-01', 'payroll'),
      mkFinding('🔵', 'FA-01', 'fixed_asset'),
      mkFinding('🔵', 'FA-02', 'fixed_asset'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト事業所', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    assert.ok(fs.existsSync(filePath), 'ファイルが生成されていない');
    assert.ok(filePath.endsWith('.xlsx'), '.xlsx 拡張子でない');
  });

  // ─── テスト2: シート1サマリーの件数（新レイアウト: B11/B12/B13/B14） ───
  await test('2. シート1「サマリー」の件数が正しい（行11-14）', async () => {
    const findings = [
      mkFinding('🔴', 'X-01'), mkFinding('🔴', 'X-02'), mkFinding('🔴', 'X-03'),
      mkFinding('🟡', 'Y-01'), mkFinding('🟡', 'Y-02'), mkFinding('🟡', 'Y-03'),
      mkFinding('🟡', 'Y-04'), mkFinding('🟡', 'Y-05'),
      mkFinding('🔵', 'Z-01'), mkFinding('🔵', 'Z-02'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('サマリー');
    assert.ok(ws, 'サマリーシートが存在しない');

    assert.strictEqual(ws.getCell('B11').value, 3, '🔴件数が違う');
    assert.strictEqual(ws.getCell('B12').value, 5, '🟡件数が違う');
    assert.strictEqual(ws.getCell('B13').value, 2, '🔵件数が違う');
    assert.strictEqual(ws.getCell('B14').value, 10, '合計件数が違う');
  });

  // ─── テスト3: 空のfindings ───
  await test('3. 空のfindings でエラーにならない', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), outputDir: dir,
    });
    assert.ok(fs.existsSync(filePath));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('サマリー');
    assert.strictEqual(ws.getCell('B11').value, 0, '🔴件数が0でない');
    assert.strictEqual(ws.getCell('B12').value, 0, '🟡件数が0でない');
    assert.strictEqual(ws.getCell('B13').value, 0, '🔵件数が0でない');
    assert.strictEqual(ws.getCell('B14').value, 0, '合計が0でない');
  });

  // ─── テスト4: 指摘一覧ヘッダーと行数 ───
  await test('4. シート2「指摘一覧」のヘッダーと行数が正しい', async () => {
    const findings = [
      mkFinding('🔴', 'A-01'), mkFinding('🟡', 'B-01'), mkFinding('🔵', 'C-01'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('指摘一覧');
    assert.ok(ws, '指摘一覧シートが存在しない');
    assert.strictEqual(ws.getCell('A1').value, '重要度', 'ヘッダーA1が違う');
    assert.strictEqual(ws.getCell('B1').value, 'コード', 'ヘッダーB1が違う');
    assert.strictEqual(ws.getCell('D1').value, '指摘内容', 'ヘッダーD1が違う');
    assert.strictEqual(ws.rowCount, 4, '行数が違う（ヘッダー+3件=4行のはず）');
  });

  // ─── テスト5: シート2のソート検証 ───
  await test('5. シート2のソート: 🔵→🟡→🔴で渡しても🔴→🟡→🔵順になる', async () => {
    const findings = [
      mkFinding('🔵', 'Z-01'), mkFinding('🟡', 'Y-01'), mkFinding('🔴', 'X-01'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('指摘一覧');
    assert.strictEqual(ws.getCell('A2').value, '🔴', '2行目が🔴でない');
    assert.strictEqual(ws.getCell('A3').value, '🟡', '3行目が🟡でない');
    assert.strictEqual(ws.getCell('A4').value, '🔵', '4行目が🔵でない');
  });

  // ─── テスト6: BS残高シート（科目コード列なし） ───
  await test('6. シート3「BS残高チェック」科目名が先頭列', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('BS残高チェック');
    assert.ok(ws, 'BS残高チェックシートが存在しない');
    assert.strictEqual(ws.getCell('A1').value, '科目名', 'BSヘッダーA1が科目名でない');
    assert.strictEqual(ws.getCell('B1').value, '当月残高', 'BSヘッダーB1が当月残高でない');
    // 前月データなしの場合: A=科目名, B=当月残高, C=元帳
    assert.strictEqual(ws.getCell('C1').value, '元帳', 'BSヘッダーC1が元帳でない');
    // 3科目
    assert.strictEqual(ws.rowCount, 4, 'BS行数が違う（ヘッダー+3行=4行）');
  });

  // ─── テスト7: BS前月データあり ───
  await test('7. BS残高: 前月データがある場合に前月列・変動率・元帳列が追加される', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyDataWithPrev(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('BS残高チェック');
    assert.strictEqual(ws.getCell('C1').value, '前月残高', 'C1が前月残高でない');
    assert.strictEqual(ws.getCell('D1').value, '前月差',   'D1が前月差でない');
    assert.strictEqual(ws.getCell('E1').value, '変動率',   'E1が変動率でない');
    assert.strictEqual(ws.getCell('F1').value, '判定',     'F1が判定でない');
    assert.strictEqual(ws.getCell('G1').value, '元帳',     'G1が元帳でない');
  });

  // ─── テスト8: PL月次推移シート（フォールバック: plTrendなし） ───
  await test('8. シート4「PL月次推移」フォールバック生成（plTrendなし）', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('PL月次推移');
    assert.ok(ws, 'PL月次推移シートが存在しない');
    assert.strictEqual(ws.getCell('A1').value, '科目名', 'PLヘッダーA1が違う');
    assert.strictEqual(ws.getCell('B1').value, '当月',   'PLヘッダーB1が違う');
    // 4科目
    assert.strictEqual(ws.rowCount, 5, 'PL行数が違う（ヘッダー+4行=5行）');
  });

  // ─── テスト9: 取引先別残高シートの省略 ───
  await test('9. trialBsByPartner なし → 取引先別残高シートが生成されない', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    assert.ok(!wb.getWorksheet('取引先別残高'), '取引先別残高シートが存在してしまっている');
  });

  // ─── テスト10: 取引先別残高シートの生成 ───
  await test('10. trialBsByPartner あり → 取引先別残高シートが生成される', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyDataWithPartner(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('取引先別残高');
    assert.ok(ws, '取引先別残高シートが存在しない');
    assert.strictEqual(ws.getCell('A1').value, '科目名',   '取引先シートA1が違う');
    assert.strictEqual(ws.getCell('B1').value, '取引先名', '取引先シートB1が違う');
    assert.strictEqual(ws.getCell('D1').value, '滞留判定', '取引先シートD1が違う');
  });

  // ─── テスト11: 出力パスとディレクトリ自動作成 ───
  await test('11. reports/{companyId}/ ディレクトリが自動作成される', async () => {
    const baseDir = path.join(os.tmpdir(), `freee-auto-dir-test-${Date.now()}`);
    const filePath = await generateMonthlyReport({
      companyId: '999999', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData({ companyId: '999999' }),
      outputDir: path.join(baseDir, '999999'),
    });
    assert.ok(fs.existsSync(filePath), 'ファイルが生成されていない');
    assert.ok(filePath.includes('monthly_check_2026-03'), 'ファイル名にmonthly_check_2026-03が含まれていない');
  });

  // ─── テスト12: カテゴリ別集計（新レイアウト: 行18〜） ───
  await test('12. シート1のカテゴリ別内訳テーブルが正しく集計される（行18〜）', async () => {
    const findings = [
      mkFinding('🔴', 'A-01', 'cash_deposit'),
      mkFinding('🟡', 'B-01', 'cash_deposit'),
      mkFinding('🔵', 'C-01', 'loan_lease'),
      mkFinding('🔵', 'C-02', 'loan_lease'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('サマリー');
    // カテゴリ別内訳: 行17ヘッダー、行18〜データ（アルファベット順: cash_deposit → loan_lease）
    const row18 = ws.getRow(18);
    const row19 = ws.getRow(19);
    assert.strictEqual(row18.getCell(1).value, 'cash_deposit', 'cash_depositが18行目でない');
    assert.strictEqual(row18.getCell(2).value, 1, 'cash_deposit の🔴が1でない');
    assert.strictEqual(row18.getCell(3).value, 1, 'cash_deposit の🟡が1でない');
    assert.strictEqual(row19.getCell(1).value, 'loan_lease',   'loan_leaseが19行目でない');
    assert.strictEqual(row19.getCell(4).value, 2, 'loan_lease の🔵が2でない');
  });

  // ─── テスト13: autoFilter 設定 ───
  await test('13. シート2にautoFilterが設定されている', async () => {
    const findings = [mkFinding('🔴', 'X-01')];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('指摘一覧');
    assert.ok(ws.autoFilter, 'autoFilterが設定されていない');
  });

  // ─── テスト14: エラーハンドリング（不完全データ） ───
  await test('14. monthlyData が不完全でもクラッシュしない', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [mkFinding('🔴', 'X-01')],
      monthlyData: {
        companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
        trialBs: null, trialPl: null, trialBsByPartner: null,
        prevMonth: null, prevYearMonth: null,
      },
      outputDir: dir,
    });
    assert.ok(fs.existsSync(filePath), '不完全データでもファイルが生成されるべき');
  });

  // ─── テスト15: PL月次推移（plTrend付き新レイアウト） ───
  await test('15. PL月次推移: plTrend付きで月別列が生成される', async () => {
    const dir = tmpDir();
    const plTrend = mkPlTrend();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), plTrend, outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('PL月次推移');
    assert.ok(ws, 'PL月次推移シートが存在しない');

    // 行1: タイトル
    assert.strictEqual(ws.getCell('A1').value, '損益計算書 月次推移', 'タイトルが違う');

    // 行3: ヘッダー（A=科目名, B=10月, C=11月, ..., G=3月, H=累計, I=元帳）
    assert.strictEqual(ws.getCell('A3').value, '科目名', 'A3が科目名でない');
    assert.strictEqual(ws.getCell('B3').value, '10月',   'B3が10月でない');
    assert.strictEqual(ws.getCell('G3').value, '3月',    'G3が3月でない');
    assert.strictEqual(ws.getCell('H3').value, '累計',   'H3が累計でない');
    assert.strictEqual(ws.getCell('I3').value, '元帳',   'I3が元帳でない');

    // 行4: 最初のデータ行（売上高）
    assert.strictEqual(ws.getCell('A4').value, '売上高', 'A4が売上高でない');

    // 3科目 + タイトル1行 + 空行1行 + ヘッダー1行 = データ開始行4、最終行6
  });

  // ─── テスト16: PL月次推移の元帳リンク ───
  await test('16. PL月次推移: 元帳リンクがI列に設定される', async () => {
    const dir = tmpDir();
    const plTrend = mkPlTrend();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), plTrend, outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('PL月次推移');

    // I4（売上高の元帳リンク）
    const linkCell = ws.getCell('I4');
    const linkVal = linkCell.value;
    // ExcelJSではハイパーリンクテキストはオブジェクト { text, hyperlink } で格納される
    if (typeof linkVal === 'object' && linkVal !== null) {
      assert.strictEqual(linkVal.text, '元帳', '元帳リンクのテキストが違う');
      assert.ok(linkVal.hyperlink.includes('account_item_id=201'), '元帳リンクに科目IDがない');
    } else {
      assert.strictEqual(linkVal, '元帳', '元帳テキストが違う');
    }
  });

  // ─── 結果集計 ───
  console.log(`\n--- 結果 ---`);
  console.log(`✅ 通過: ${passed}件`);
  if (failed > 0) {
    console.log(`❌ 失敗: ${failed}件`);
    process.exit(1);
  } else {
    console.log('全テスト通過 🎉');
  }
}

runTests().catch((err) => {
  console.error('テスト実行エラー:', err);
  process.exit(1);
});
