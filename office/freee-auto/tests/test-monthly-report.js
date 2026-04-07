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
 *  17. CHECK_GROUPS: 全6グループシート常時生成
 *  18. CHECK_GROUPS: シート構造（タイトル+ヘッダー+データ行）
 *  19. CHECK_GROUPS: findings 0件でも全6グループシート生成
 *  20. inferFreeeLink: CODE_TO_ACCOUNT マッピング（7コード）
 *  21. inferFreeeLink: description から科目名抽出
 *  22. inferFreeeLink: 既存リンクは上書きしない
 *  23. isValidFreeeLink: 有効/無効URL判定
 *  24. freeeLink推定がExcel出力に反映される
 *
 * 使い方: node tests/test-monthly-report.js
 */

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const ExcelJS = require('exceljs');

const { generateMonthlyReport, inferFreeeLink, isValidFreeeLink } = require('../src/verify/monthly-report-generator');

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
      // 明細科目
      '売上高': {
        id: 201, category: '売上高',
        monthlyAmounts: [500000, 520000, 480000, 510000, 490000, 500000],
        total: 3000000, isSummary: false,
      },
      '仕入高': {
        id: 202, category: '売上原価',
        monthlyAmounts: [250000, 260000, 240000, 250000, 250000, 250000],
        total: 1500000, isSummary: false,
      },
      '給与手当': {
        id: 203, category: '販売管理費',
        monthlyAmounts: [100000, 100000, 100000, 100000, 100000, 100000],
        total: 600000, isSummary: false,
      },
      // 集計行
      '__summary__売上高': {
        id: null, category: '売上高',
        monthlyAmounts: [500000, 520000, 480000, 510000, 490000, 500000],
        total: 3000000, isSummary: true,
      },
      '__summary__売上原価': {
        id: null, category: '売上原価',
        monthlyAmounts: [250000, 260000, 240000, 250000, 250000, 250000],
        total: 1500000, isSummary: true,
      },
      '__summary__売上総損益金額': {
        id: null, category: '売上総損益金額',
        monthlyAmounts: [250000, 260000, 240000, 260000, 240000, 250000],
        total: 1500000, isSummary: true,
      },
      '__summary__販売管理費': {
        id: null, category: '販売管理費',
        monthlyAmounts: [100000, 100000, 100000, 100000, 100000, 100000],
        total: 600000, isSummary: true,
      },
      '__summary__営業損益金額': {
        id: null, category: '営業損益金額',
        monthlyAmounts: [150000, 160000, 140000, 160000, 140000, 150000],
        total: 900000, isSummary: true,
      },
      '__summary__経常損益金額': {
        id: null, category: '経常損益金額',
        monthlyAmounts: [150000, 160000, 140000, 160000, 140000, 150000],
        total: 900000, isSummary: true,
      },
      '__summary__税引前当期純損益金額': {
        id: null, category: '税引前当期純損益金額',
        monthlyAmounts: [150000, 160000, 140000, 160000, 140000, 150000],
        total: 900000, isSummary: true,
      },
      '__summary__当期純損益金額': {
        id: null, category: '当期純損益金額',
        monthlyAmounts: [150000, 160000, 140000, 160000, 140000, 150000],
        total: 900000, isSummary: true,
      },
    },
    accountList: [
      { id: 201,  name: '売上高',   category: '売上高',   isSummary: false },
      { id: null,  name: '売上高',   category: '売上高',   isSummary: true },
      { id: 202,  name: '仕入高',   category: '売上原価', isSummary: false },
      { id: null,  name: '売上原価', category: '売上原価', isSummary: true },
      { id: null,  name: '売上総損益金額', category: '売上総損益金額', isSummary: true },
      { id: 203,  name: '給与手当', category: '販売管理費', isSummary: false },
      { id: null,  name: '販売管理費', category: '販売管理費', isSummary: true },
      { id: null,  name: '営業損益金額', category: '営業損益金額', isSummary: true },
      { id: null,  name: '経常損益金額', category: '経常損益金額', isSummary: true },
      { id: null,  name: '税引前当期純損益金額', category: '税引前当期純損益金額', isSummary: true },
      { id: null,  name: '当期純損益金額', category: '当期純損益金額', isSummary: true },
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

  // ─── テスト2: シート1サマリーの件数（横並びレイアウト: B9/C9/D9） ───
  await test('2. シート1「サマリー」の件数が正しい（行9: B/C/D）', async () => {
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

    // 行9: 横並びの指摘サマリー（B=🔴, C=🟡, D=🔵）
    assert.strictEqual(ws.getCell('B9').value, 3, '🔴件数が違う');
    assert.strictEqual(ws.getCell('C9').value, 5, '🟡件数が違う');
    assert.strictEqual(ws.getCell('D9').value, 2, '🔵件数が違う');
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
    // 行9: 横並びの指摘サマリー（全0）
    assert.strictEqual(ws.getCell('B9').value, 0, '🔴件数が0でない');
    assert.strictEqual(ws.getCell('C9').value, 0, '🟡件数が0でない');
    assert.strictEqual(ws.getCell('D9').value, 0, '🔵件数が0でない');
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
    assert.ok(filePath.includes('テスト_帳簿チェック_2026-03'), 'ファイル名に事業所名_帳簿チェック_2026-03が含まれていない');
  });

  // ─── テスト12: CHECK_GROUPS別集計（行13ヘッダー、行14〜データ） ───
  await test('12. シート1のチェック項目別内訳がCHECK_GROUPS単位で正しく集計される', async () => {
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

    // 行13: ヘッダー
    assert.strictEqual(ws.getCell('A13').value, 'チェック項目', 'ヘッダーA13が違う');

    // CHECK_GROUPS順: tax(14), withholding(15), advance_tax(16), bs_check(17), pl_check(18), data_tax_misc(19)
    // cash_deposit + loan_lease は bs_check グループ（行17）
    const bsRow = ws.getRow(17);
    assert.strictEqual(bsRow.getCell(1).value, 'BS残高指摘', 'BS残高指摘グループが行17でない');
    assert.strictEqual(bsRow.getCell(2).value, 1, 'BS残高チェック の🔴が1でない');
    assert.strictEqual(bsRow.getCell(3).value, 1, 'BS残高チェック の🟡が1でない');
    assert.strictEqual(bsRow.getCell(4).value, 2, 'BS残高チェック の🔵が2でない');
    assert.strictEqual(bsRow.getCell(5).value, 4, 'BS残高チェック の合計が4でない');

    // 合計行（行20）
    assert.strictEqual(ws.getCell('A20').value, '合計', '合計行が行20でない');
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

    // 行4: 最初のデータ行（売上高 = 集計行）
    assert.strictEqual(ws.getCell('A4').value, '売上高', 'A4が売上高でない');

    // 行5: 仕入高（明細科目、インデント付き）
    assert.strictEqual(ws.getCell('A5').value, '  仕入高', 'A5が仕入高でない');

    // 行8: 給与手当（販管費の明細科目、インデント付き）
    assert.strictEqual(ws.getCell('A8').value, '  給与手当', 'A8が給与手当でない');
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

    // I4（売上高 = 集計行）は元帳リンクなし
    const summaryLinkCell = ws.getCell('I4');
    const summaryLinkVal = summaryLinkCell.value;
    const hasSummaryLink = typeof summaryLinkVal === 'object' && summaryLinkVal !== null && summaryLinkVal.hyperlink;
    assert.ok(!hasSummaryLink, '集計行に元帳リンクが設定されている（不要）');

    // I5（仕入高 = 明細科目）は元帳リンクあり
    const linkCell = ws.getCell('I5');
    const linkVal = linkCell.value;
    // ExcelJSではハイパーリンクテキストはオブジェクト { text, hyperlink } で格納される
    if (typeof linkVal === 'object' && linkVal !== null) {
      assert.strictEqual(linkVal.text, '元帳', '元帳リンクのテキストが違う');
      assert.ok(linkVal.hyperlink.includes('/reports/general_ledgers/show?'), '総勘定元帳リンクでない');
      assert.ok(linkVal.hyperlink.includes('name='), '元帳リンクに科目名フィルタがない');
    } else {
      assert.strictEqual(linkVal, '元帳', '元帳テキストが違う');
    }
  });

  // ─── テスト17: 全グループシートが常に生成される（指摘あり/なし両方） ───
  await test('17. CHECK_GROUPS: 全6グループシートが常に生成される', async () => {
    const findings = [
      mkFinding('🔴', 'BA-01', 'balance_anomaly'),
      mkFinding('🟡', 'TC-06', 'tax_classification'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    // 指摘ありグループ: データ行がある
    assert.ok(wb.getWorksheet('BS残高指摘'), 'BS残高指摘シートが存在しない');
    assert.ok(wb.getWorksheet('消費税区分チェック'), '消費税区分チェックシートが存在しない');
    // 指摘なしグループも生成される（0件メッセージ付き）
    assert.ok(wb.getWorksheet('源泉所得税チェック'), '源泉所得税チェックシートが存在しない');
    assert.ok(wb.getWorksheet('予定納税チェック'), '予定納税チェックシートが存在しない');
    // 0件シートに「✅ 指摘事項はありません」が表示される
    const wtSheet = wb.getWorksheet('源泉所得税チェック');
    assert.strictEqual(wtSheet.getCell('A4').value, '✅ 指摘事項はありません',
      '0件シートに指摘なしメッセージがない');
  });

  // ─── テスト18: グループシートの構造（ヘッダー・行数） ───
  await test('18. CHECK_GROUPS: シートの構造が正しい（タイトル+ヘッダー+データ行）', async () => {
    const findings = [
      mkFinding('🔴', 'TC-01', 'tax_classification'),
      mkFinding('🟡', 'TC-06', 'tax_classification'),
    ];
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('消費税区分チェック');
    assert.ok(ws);

    // 行1: グループ名
    assert.strictEqual(ws.getCell('A1').value, '消費税区分チェック', 'A1がグループ名でない');
    // 行2: 説明文
    assert.ok(String(ws.getCell('A2').value).includes('妥当性'), 'A2に説明文がない');
    // 行4: ヘッダー（カテゴリ列なし: 重要度, コード, 指摘内容, ...）
    assert.strictEqual(ws.getCell('A4').value, '重要度', 'ヘッダーA4が重要度でない');
    assert.strictEqual(ws.getCell('B4').value, 'コード', 'ヘッダーB4がコードでない');
    assert.strictEqual(ws.getCell('C4').value, '指摘内容', 'ヘッダーC4が指摘内容でない');
    // データ行: 2件
    assert.strictEqual(ws.getCell('A5').value, '🔴', '5行目が🔴でない');
    assert.strictEqual(ws.getCell('A6').value, '🟡', '6行目が🟡でない');
  });

  // ─── テスト19: findings0件でも全グループシート生成（0件メッセージ付き） ───
  await test('19. CHECK_GROUPS: findings 0件でも全6グループシートが生成される', async () => {
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings: [], monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    // 全グループシートが存在する
    const groupNames = ['消費税区分チェック', '源泉所得税チェック', '予定納税チェック',
                        'BS残高指摘', 'PL・期間配分チェック', 'データ品質・その他'];
    for (const name of groupNames) {
      const ws = wb.getWorksheet(name);
      assert.ok(ws, `${name}シートが存在しない`);
      assert.strictEqual(ws.getCell('A4').value, '✅ 指摘事項はありません',
        `${name}シートに指摘なしメッセージがない`);
    }
  });

  // ─── テスト20: inferFreeeLink — CODE_TO_ACCOUNT マッピング ───
  await test('20. inferFreeeLink: CODE_TO_ACCOUNT の7コードで総勘定元帳リンクを生成', async () => {
    const data = { companyId: '474381', targetMonth: '2026-03' };
    const codes = [
      { code: 'WT-04', account: '預り金' },
      { code: 'AT-01', account: '法人税、住民税及び事業税' },
      { code: 'AT-02', account: '未払消費税等' },
      { code: 'PY-01', account: '役員報酬' },
      { code: 'PY-02', account: '法定福利費' },
      { code: 'OL-01', account: '役員貸付金' },
      { code: 'RT-01', account: '地代家賃' },
    ];
    for (const { code, account } of codes) {
      const link = inferFreeeLink({ checkCode: code, description: '' }, data);
      assert.ok(link, `${code} でリンクが生成されない`);
      assert.ok(link.includes('general_ledgers'), `${code}: 総勘定元帳リンクでない`);
      assert.ok(link.includes(encodeURIComponent(account)),
        `${code}: 科目名「${account}」がURLに含まれない`);
    }
  });

  // ─── テスト21: inferFreeeLink — description から科目名抽出 ───
  await test('21. inferFreeeLink: description「〇〇」から科目名を抽出してリンク生成', async () => {
    const data = { companyId: '474381', targetMonth: '2026-03' };
    // マッピングにないコードでも description から抽出
    const f = { checkCode: 'XX-99', description: '「売掛金」の残高が異常です' };
    const link = inferFreeeLink(f, data);
    assert.ok(link, 'description から科目名を抽出できなかった');
    assert.ok(link.includes(encodeURIComponent('売掛金')), 'URL に売掛金が含まれない');
  });

  // ─── テスト22: inferFreeeLink — 既存リンクは上書きしない ───
  await test('22. inferFreeeLink: 既存 freeeLink があれば上書きしない', async () => {
    const data = { companyId: '474381', targetMonth: '2026-03' };
    const existing = 'https://secure.freee.co.jp/deals/12345';
    const link = inferFreeeLink({ checkCode: 'PY-01', freeeLink: existing }, data);
    assert.strictEqual(link, existing, '既存リンクが上書きされた');
  });

  // ─── テスト23: isValidFreeeLink — 有効/無効URL判定 ───
  await test('23. isValidFreeeLink: 有効・無効URLの判定', async () => {
    assert.strictEqual(isValidFreeeLink('https://secure.freee.co.jp/deals/123'), true);
    assert.strictEqual(isValidFreeeLink('https://secure.freee.co.jp/reports/general_ledgers/show?name=売上高'), true);
    assert.strictEqual(isValidFreeeLink(null), false);
    assert.strictEqual(isValidFreeeLink(undefined), false);
    assert.strictEqual(isValidFreeeLink(''), false);
    assert.strictEqual(isValidFreeeLink('http://example.com'), false, 'freee.co.jp 以外は無効');
    assert.strictEqual(isValidFreeeLink('not a url'), false);
    assert.strictEqual(isValidFreeeLink(12345), false, '数値は無効');
  });

  // ─── テスト24: freeeLink推定がExcel出力に反映される ───
  await test('24. freeeLink推定がExcel出力のハイパーリンクに反映される', async () => {
    const findings = [
      mkFinding('🔴', 'PY-01', 'payroll'),  // CODE_TO_ACCOUNT に該当 → リンク生成
    ];
    // freeeLink を明示的に空にする
    findings[0].freeeLink = '';
    const dir = tmpDir();
    const filePath = await generateMonthlyReport({
      companyId: '474381', companyName: 'テスト', targetMonth: '2026-03',
      findings, monthlyData: mkMonthlyData(), outputDir: dir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('指摘一覧');
    // G2（最初のデータ行のfreeeリンク列）にハイパーリンクが設定されているか
    const linkCell = ws.getCell('G2');
    const val = linkCell.value;
    assert.ok(val && typeof val === 'object' && val.hyperlink,
      `PY-01 の freeeLink が推定・設定されていない: ${JSON.stringify(val)}`);
    assert.ok(val.hyperlink.includes('general_ledgers'),
      `推定リンクが総勘定元帳でない: ${val.hyperlink}`);
    assert.ok(val.hyperlink.includes(encodeURIComponent('役員報酬')),
      `推定リンクに役員報酬が含まれない: ${val.hyperlink}`);
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
