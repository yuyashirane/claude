/**
 * test-review-sheet-generator.js
 * レビュー用Excel生成モジュールのテスト
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  generateReviewSheet,
  COLUMNS,
  GROUPS,
  TYPE_LABELS,
  SOURCE_LABELS,
  CONFIDENCE_COLORS,
} = require('../src/register/review-sheet-generator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log('  ✅ ' + name);
    passed++;
  }).catch((e) => {
    console.log('  ❌ ' + name + ': ' + e.message);
    failed++;
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '') + ' expected "' + expected + '" but got "' + actual + '"');
  }
}

// テスト用結果データ
const TEST_RESULTS = [
  {
    transactionType: 'EXPENSE',
    transactionTypeConfidence: 50,
    transactionTypeNote: '通常経費',
    account: '通信費',
    accountSource: 'general_keywords',
    accountConfidence: 55,
    taxClass: '課税10%',
    taxClassSource: 'general_keywords',
    taxClassConfidence: 55,
    partner: 'トウキョウデンリョク',
    isPersonName: false,
    item: null,
    matchCondition: '完全一致',
    matchText: '電話料',
    action: '取引を推測する',
    overallConfidence: 55,
    note: '一般キーワード辞書',
    _original: {
      description: '電話料',
      walletable_name: '三菱UFJ銀行',
      amount: -85634,
      entry_side: 'expense',
    },
  },
  {
    transactionType: 'ATM',
    transactionTypeConfidence: 95,
    transactionTypeNote: 'ATM引出',
    account: null,
    accountSource: 'type_rule',
    accountConfidence: 90,
    taxClass: null,
    taxClassSource: 'type_rule',
    taxClassConfidence: 0,
    partner: '',
    isPersonName: false,
    item: null,
    matchCondition: '',
    matchText: '',
    action: null,
    overallConfidence: 90,
    note: 'ATM引出',
    _original: {
      description: 'ｼﾞﾄﾞｳｷ',
      walletable_name: '三菱UFJ銀行',
      amount: -111000,
      entry_side: 'expense',
    },
  },
  {
    transactionType: 'PERSONAL_PAYMENT',
    transactionTypeConfidence: 60,
    transactionTypeNote: '個人宛支払',
    account: null,
    accountSource: 'unmatched',
    accountConfidence: 0,
    taxClass: null,
    taxClassSource: 'unmatched',
    taxClassConfidence: 0,
    partner: 'ババノリフミ',
    isPersonName: true,
    item: null,
    matchCondition: '完全一致',
    matchText: 'IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ',
    action: null,
    overallConfidence: 0,
    note: '未判定',
    _original: {
      description: 'IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ',
      walletable_name: '三菱UFJ銀行',
      amount: -240000,
      entry_side: 'expense',
    },
  },
  {
    transactionType: 'EXPENSE',
    transactionTypeConfidence: 50,
    transactionTypeNote: '通常経費',
    account: '仕入高',
    accountSource: 'client_dict',
    accountConfidence: 85,
    taxClass: '課対仕入',
    taxClassSource: 'client_dict',
    taxClassConfidence: 85,
    partner: 'クロレラ工業㌈',
    isPersonName: false,
    item: null,
    matchCondition: '部分一致',
    matchText: 'ｸﾛﾚﾗｺｳｷﾞﾖ',
    action: '取引を推測する',
    overallConfidence: 85,
    note: '薬局向け製薬会社',
    _original: {
      description: 'ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ',
      walletable_name: '三菱UFJ銀行',
      amount: -1208006,
      entry_side: 'expense',
    },
  },
];

const TMP_DIR = path.join(__dirname, '..', 'tmp');

async function runTests() {
  console.log('\n━━━ generateReviewSheet テスト ━━━');

  await test('RS01: Excelファイルが生成される', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      companyName: 'テスト',
      outputDir: TMP_DIR,
    });
    assert(fs.existsSync(result.filePath), 'file should exist: ' + result.filePath);
    // クリーンアップ
    fs.unlinkSync(result.filePath);
  });

  await test('RS02: 統計情報が正しい', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      companyName: 'テスト',
      outputDir: TMP_DIR,
    });
    assertEqual(result.stats.total, 4, 'total');
    assertEqual(result.stats.suggest, 2, 'suggest'); // 通信費 + 仕入高
    assertEqual(result.stats.review, 1, 'review'); // 個人宛支払
    assertEqual(result.stats.excluded, 1, 'excluded'); // ATM
    fs.unlinkSync(result.filePath);
  });

  await test('RS03: Excelの構造が正しい（2シート・ヘッダー2行）', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      companyName: 'テスト',
      outputDir: TMP_DIR,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);

    // レビューシート
    const ws = wb.getWorksheet('レビュー');
    assert(ws !== undefined, 'should have レビュー sheet');

    // サマリーシート
    const summary = wb.getWorksheet('サマリー');
    assert(summary !== undefined, 'should have サマリー sheet');

    // 1行目: グループ名（マージセル）
    const groupCell = ws.getCell(1, 1);
    assertEqual(groupCell.value, '基本情報', 'row1 group name');

    // 2行目: 列名
    const colName = ws.getCell(2, 1);
    assertEqual(colName.value, '#', 'row2 col name');

    fs.unlinkSync(result.filePath);
  });

  await test('RS04: 26列（A-Z）', async () => {
    assertEqual(COLUMNS.length, 26, 'COLUMNS count');
    // 最初の列は # 、最後の列はルール化可否
    assertEqual(COLUMNS[0].header, '#');
    assertEqual(COLUMNS[25].header, 'ルール化可否');
  });

  await test('RS05: 修正用列（Q-X）が空', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      outputDir: TMP_DIR,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const ws = wb.getWorksheet('レビュー');
    // row 3 (first data row = header2行 + 1), col 17 (修正後科目 = Q)
    const cell = ws.getCell(3, 17);
    assert(cell.value === '' || cell.value === null, '修正用列 should be empty');
    fs.unlinkSync(result.filePath);
  });

  await test('RS06: 金額が絶対値で表示', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      outputDir: TMP_DIR,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const ws = wb.getWorksheet('レビュー');
    const amount = ws.getCell(3, 5).value; // 最初のデータ行, E列=金額
    assert(amount > 0, 'amount should be positive (absolute)');
    fs.unlinkSync(result.filePath);
  });

  await test('RS07: companyId必須チェック', async () => {
    try {
      await generateReviewSheet([], {});
      throw new Error('should have thrown');
    } catch (e) {
      assert(e.message.includes('companyId'), 'error about companyId');
    }
  });

  await test('RS08: 0件でもエラーにならない', async () => {
    const result = await generateReviewSheet([], {
      companyId: 'test_review',
      outputDir: TMP_DIR,
    });
    assertEqual(result.stats.total, 0, 'total');
    assert(fs.existsSync(result.filePath), 'file should exist');
    fs.unlinkSync(result.filePath);
  });

  await test('RS09: グループ定義が4つ', async () => {
    assertEqual(GROUPS.length, 4, 'GROUPS count');
    assertEqual(GROUPS[0].label, '基本情報');
    assertEqual(GROUPS[1].label, 'AI推測結果');
    assert(GROUPS[2].label.includes('修正用'), 'group C is edit');
    assertEqual(GROUPS[3].label, '判断');
  });

  await test('RS10: 信頼度色分け閾値（70/30）', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      outputDir: TMP_DIR,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const ws = wb.getWorksheet('レビュー');

    // row 3: 通信費 (confidence 55) → 薄黄 (30-69)
    const cell55 = ws.getCell(3, 1);
    const bg55 = cell55.fill && cell55.fill.fgColor && cell55.fill.fgColor.argb;
    // ARGBが含まれるかチェック（FFプレフィックスが付く場合あり）
    assert(bg55 && (bg55.includes('FFF8E1') || bg55 === 'FFFFF8E1'), 'conf 55 should be medium yellow, got ' + bg55);

    // row 4: ATM (confidence 90, excluded) → グレー
    const cell90 = ws.getCell(4, 1);
    const bg90 = cell90.fill && cell90.fill.fgColor && cell90.fill.fgColor.argb;
    assert(bg90 && (bg90.includes('E0E0E0') || bg90 === 'FFE0E0E0'), 'ATM should be grey, got ' + bg90);

    // row 5: PERSONAL_PAYMENT (confidence 0) → 薄赤 (0-29)
    const cell0 = ws.getCell(5, 1);
    const bg0 = cell0.fill && cell0.fill.fgColor && cell0.fill.fgColor.argb;
    assert(bg0 && (bg0.includes('FFEBEE') || bg0 === 'FFFFEBEE'), 'conf 0 should be low red, got ' + bg0);

    // row 6: 仕入高 (confidence 85) → 薄緑 (70+)
    const cell85 = ws.getCell(6, 1);
    const bg85 = cell85.fill && cell85.fill.fgColor && cell85.fill.fgColor.argb;
    assert(bg85 && (bg85.includes('E8F5E9') || bg85 === 'FFE8F5E9'), 'conf 85 should be high green, got ' + bg85);

    fs.unlinkSync(result.filePath);
  });

  await test('RS11: 判断列（Y-Z）が空', async () => {
    const result = await generateReviewSheet(TEST_RESULTS, {
      companyId: 'test_review',
      outputDir: TMP_DIR,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const ws = wb.getWorksheet('レビュー');
    // Y列(25) と Z列(26) が空
    const cellY = ws.getCell(3, 25);
    const cellZ = ws.getCell(3, 26);
    assert(cellY.value === '' || cellY.value === null, 'Y should be empty');
    assert(cellZ.value === '' || cellZ.value === null, 'Z should be empty');
    fs.unlinkSync(result.filePath);
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
}

runTests().catch(e => { console.error(e); process.exit(1); });
