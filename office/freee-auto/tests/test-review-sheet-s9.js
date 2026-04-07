#!/usr/bin/env node
/**
 * test-review-sheet-s9.js
 * review-sheet-generator S9テスト（列構成、信頼度内訳、要レビュー理由）
 */

const {
  generateReviewSheet,
  formatSubScores,
  generateReviewReason,
  COLUMNS,
  GROUPS,
  TYPE_LABELS,
} = require('../src/register/review-sheet-generator');

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;

function test(id, description, fn) {
  try {
    fn();
    console.log('  \u2705 ' + id + '. ' + description);
    passed++;
  } catch (e) {
    console.log('  \u274C ' + id + '. ' + description);
    console.log('    ' + e.message);
    failed++;
  }
}

async function testAsync(id, description, fn) {
  try {
    await fn();
    console.log('  \u2705 ' + id + '. ' + description);
    passed++;
  } catch (e) {
    console.log('  \u274C ' + id + '. ' + description);
    console.log('    ' + e.message);
    failed++;
  }
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || '') + ' expected ' + e + ' but got ' + a);
}

console.log('=== review-sheet-generator S9テスト ===\n');

test('RS01', 'COLUMNS: 32列', () => {
  eq(COLUMNS.length, 32);
});

test('RS02', 'グループA: 基本情報 = 7列（from:1, to:7）', () => {
  const g = GROUPS.find(g => g.label === '基本情報');
  eq(g.from, 1);
  eq(g.to, 7);
  eq(g.color, 'EEEEEE');
});

test('RS03', 'グループB: AI推測結果 = 13列（from:8, to:20）', () => {
  const g = GROUPS.find(g => g.label === 'AI推測結果');
  eq(g.from, 8);
  eq(g.to, 20);
  eq(g.color, 'E3F2FD');
});

test('RS04', 'グループC: 修正用 = 8列（from:21, to:28）', () => {
  const g = GROUPS.find(g => g.label.includes('修正用'));
  eq(g.from, 21);
  eq(g.to, 28);
});

test('RS05', 'グループD: 判断 = 4列（from:29, to:32）', () => {
  const g = GROUPS.find(g => g.label === '判断');
  eq(g.from, 29);
  eq(g.to, 32);
});

test('RS06', 'グループ範囲が隙間なく全32列をカバー', () => {
  let covered = 0;
  for (const g of GROUPS) {
    covered += (g.to - g.from + 1);
  }
  eq(covered, 32);
  eq(GROUPS[0].from, 1, 'starts at 1');
  for (let i = 1; i < GROUPS.length; i++) {
    eq(GROUPS[i].from, GROUPS[i-1].to + 1, 'group ' + i + ' should be contiguous');
  }
});

test('RS07', '新列: 正規化後明細が存在', () => {
  if (!COLUMNS.find(c => c.key === 'normalizedDesc')) throw new Error('normalizedDesc column missing');
});

test('RS08', '新列: ノイズ除去後明細が存在', () => {
  if (!COLUMNS.find(c => c.key === 'displayDesc')) throw new Error('displayDesc column missing');
});

test('RS09', '新列: 取引先候補 + 正式取引先名候補が存在', () => {
  if (!COLUMNS.find(c => c.key === 'candidatePartner')) throw new Error('candidatePartner missing');
  if (!COLUMNS.find(c => c.key === 'displayPartner')) throw new Error('displayPartner missing');
});

test('RS10', '新列: 信頼度総合 + 信頼度内訳が存在', () => {
  if (!COLUMNS.find(c => c.key === 'totalConfidence')) throw new Error('totalConfidence missing');
  if (!COLUMNS.find(c => c.key === 'subScoreText')) throw new Error('subScoreText missing');
});

test('RS11', '新列: 自動確定可否 + 要レビュー理由が存在', () => {
  if (!COLUMNS.find(c => c.key === 'autoConfirmable')) throw new Error('autoConfirmable missing');
  if (!COLUMNS.find(c => c.key === 'reviewReason')) throw new Error('reviewReason missing');
});

test('RS12', 'formatSubScores: 正しいフォーマット', () => {
  const s = formatSubScores({
    type_match: 15, partner_match: 25, history_match: 0,
    amount_pattern: 8, account_match: 10, stability: 10, auxiliary: 3,
  }, 71);
  eq(s, '類15/取25/履0/金8/口10/安10/補3=71');
});

test('RS13', 'formatSubScores: null → 空文字', () => {
  eq(formatSubScores(null, 0), '');
});

test('RS14', 'generateReviewReason: ATM', () => {
  const r = generateReviewReason({ transactionType: 'ATM', partner_source: 'name_only' });
  if (!r.includes('ATM')) throw new Error('should mention ATM: ' + r);
});

test('RS15', 'generateReviewReason: SOCIAL_INSURANCE', () => {
  const r = generateReviewReason({ transactionType: 'SOCIAL_INSURANCE', partner_source: 'name_only' });
  if (!r.includes('社会保険料')) throw new Error('should mention 社会保険料: ' + r);
});

test('RS16', 'generateReviewReason: PERSONAL_PAYMENT + 源泉', () => {
  const r = generateReviewReason({
    transactionType: 'PERSONAL_PAYMENT',
    partner_source: 'name_only',
    withholdingPossible: true,
  });
  if (!r.includes('個人宛支払')) throw new Error('should mention 個人宛: ' + r);
  if (!r.includes('源泉')) throw new Error('should mention 源泉: ' + r);
});

test('RS17', 'generateReviewReason: 信頼度不足', () => {
  const r = generateReviewReason({
    transactionType: 'EXPENSE',
    partner_source: 'dict_exact',
    account: '通信費',
    totalConfidence: 20,
  });
  if (!r.includes('信頼度不足')) throw new Error('should mention 信頼度不足: ' + r);
});

test('RS18', 'generateReviewReason: 取引先未確定', () => {
  const r = generateReviewReason({
    transactionType: 'EXPENSE',
    partner_source: 'name_only',
    account: '通信費',
    totalConfidence: 60,
  });
  if (!r.includes('取引先未確定')) throw new Error('should mention 取引先未確定: ' + r);
});

test('RS19', 'generateReviewReason: 科目未判定', () => {
  const r = generateReviewReason({
    transactionType: 'EXPENSE',
    partner_source: 'dict_exact',
    account: null,
    totalConfidence: 60,
  });
  if (!r.includes('科目未判定')) throw new Error('should mention 科目未判定: ' + r);
});

test('RS20', 'TYPE_LABELS: SOCIAL_INSURANCE → 社会保険料', () => {
  eq(TYPE_LABELS.SOCIAL_INSURANCE, '社会保険料');
});

async function runAsyncTests() {

  await testAsync('RS21', 'generateReviewSheet: 32列のExcel生成', async () => {
    const { classifyMultiStage, loadClientDict } = require('../src/classify/multi-stage-classifier');
    const clientDictRules = loadClientDict('11890320');
    const items = [
      { description: 'IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', entry_side: 'expense', amount: 100000, walletable_name: '横浜銀行' },
      { description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000, walletable_name: '横浜銀行' },
      { description: 'ｼﾞﾄﾞｳｷ', entry_side: 'expense', amount: 50000, walletable_name: '横浜銀行' },
      { description: 'NTT', entry_side: 'expense', amount: 5000, walletable_name: '横浜銀行' },
      { description: 'IBﾌﾘｺﾐ   ﾀﾅｶ ﾀﾛｳ', entry_side: 'expense', amount: 300000, walletable_name: '横浜銀行' },
    ];
    const results = items.map(item => ({
      ...classifyMultiStage(item, { clientDictRules }),
      _original: item,
    }));
    const outDir = path.join(__dirname, '..', 'tmp');
    const { filePath, stats } = await generateReviewSheet(results, {
      companyId: 'test-s9',
      companyName: 'テスト',
      targetMonth: '2026-04',
      outputDir: outDir,
    });
    if (!fs.existsSync(filePath)) throw new Error('file not created: ' + filePath);
    eq(stats.total, 5);

    // Excelを読み込んで列数確認
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('レビュー');
    const headerRow = ws.getRow(2);
    // 32列目にヘッダーがあることを確認
    const col32 = headerRow.getCell(32).value;
    if (!col32) throw new Error('column 32 should have header, got: ' + col32);
    eq(col32, '要レビュー理由');
    // 33列目は空
    const col33 = headerRow.getCell(33).value;
    eq(col33, null, 'column 33 should be null');

    // クリーンアップ
    fs.unlinkSync(filePath);
    try { fs.rmdirSync(path.dirname(filePath)); } catch {}
  });

  await testAsync('RS22', '正規化後明細・ノイズ除去後明細がデータ行に出力', async () => {
    const { classifyMultiStage, loadClientDict } = require('../src/classify/multi-stage-classifier');
    const clientDictRules = loadClientDict('11890320');
    const item = { description: 'IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', entry_side: 'expense', amount: 100000, walletable_name: '横浜銀行' };
    const result = { ...classifyMultiStage(item, { clientDictRules }), _original: item };
    const outDir = path.join(__dirname, '..', 'tmp');
    const { filePath } = await generateReviewSheet([result], {
      companyId: 'test-s9-norm',
      companyName: 'テスト正規化',
      outputDir: outDir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('レビュー');
    const dataRow = ws.getRow(3);
    // C列(3) = 正規化後明細、D列(4) = ノイズ除去後明細
    const normCell = dataRow.getCell(3).value;
    const dispCell = dataRow.getCell(4).value;
    if (!normCell) throw new Error('normalized desc should not be empty');
    if (!dispCell) throw new Error('display desc should not be empty');
    // クリーンアップ
    fs.unlinkSync(filePath);
    try { fs.rmdirSync(path.dirname(filePath)); } catch {}
  });

  await testAsync('RS23', '信頼度内訳がデータ行に「類X/取X/...」形式で出力', async () => {
    const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
    const item = { description: 'NTT', entry_side: 'expense', amount: 5000, walletable_name: '横浜銀行' };
    const result = { ...classifyMultiStage(item), _original: item };
    const outDir = path.join(__dirname, '..', 'tmp');
    const { filePath } = await generateReviewSheet([result], {
      companyId: 'test-s9-sub',
      companyName: 'テスト内訳',
      outputDir: outDir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('レビュー');
    const dataRow = ws.getRow(3);
    // T列(20) = 信頼度内訳
    const subText = dataRow.getCell(20).value;
    if (!subText || !String(subText).includes('類')) throw new Error('subScore text missing or wrong format: ' + subText);
    if (!String(subText).includes('=')) throw new Error('subScore text should contain =: ' + subText);
    // クリーンアップ
    fs.unlinkSync(filePath);
    try { fs.rmdirSync(path.dirname(filePath)); } catch {}
  });

  await testAsync('RS24', '自動確定可否が「可」or「不可」で出力', async () => {
    const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
    const items = [
      { description: 'NTT', entry_side: 'expense', amount: 5000, walletable_name: '横浜銀行' },
      { description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000, walletable_name: '横浜銀行' },
    ];
    const results = items.map(item => ({ ...classifyMultiStage(item), _original: item }));
    const outDir = path.join(__dirname, '..', 'tmp');
    const { filePath } = await generateReviewSheet(results, {
      companyId: 'test-s9-auto',
      companyName: 'テスト自動確定',
      outputDir: outDir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('レビュー');
    // AE列(31) = 自動確定可否
    const row1 = ws.getRow(3).getCell(31).value;  // NTT → 可
    const row2 = ws.getRow(4).getCell(31).value;  // 社保 → 不可
    eq(row1, '可', 'NTT should be 可');
    eq(row2, '不可', 'SOCIAL_INSURANCE should be 不可');
    // クリーンアップ
    fs.unlinkSync(filePath);
    try { fs.rmdirSync(path.dirname(filePath)); } catch {}
  });

  await testAsync('RS25', '要レビュー理由が出力される', async () => {
    const { classifyMultiStage } = require('../src/classify/multi-stage-classifier');
    const item = { description: 'ｺｳｾｲﾎｹﾝﾘﾖｳ', entry_side: 'expense', amount: 200000, walletable_name: '横浜銀行' };
    const result = { ...classifyMultiStage(item), _original: item };
    const outDir = path.join(__dirname, '..', 'tmp');
    const { filePath } = await generateReviewSheet([result], {
      companyId: 'test-s9-reason',
      companyName: 'テスト理由',
      outputDir: outDir,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('レビュー');
    // AF列(32) = 要レビュー理由
    const reason = ws.getRow(3).getCell(32).value;
    if (!reason || !String(reason).includes('社会保険料')) throw new Error('reason should mention 社会保険料: ' + reason);
    // クリーンアップ
    fs.unlinkSync(filePath);
    try { fs.rmdirSync(path.dirname(filePath)); } catch {}
  });

}

runAsyncTests().then(() => {
  console.log('');
  console.log('--- 結果 ---');
  if (failed > 0) {
    console.log('\u274C 失敗: ' + failed + '件 / 通過: ' + passed + '件');
    process.exit(1);
  } else {
    console.log('\u2705 通過: ' + passed + '件');
    console.log('全テスト通過 \uD83C\uDF89');
  }
}).catch(e => {
  console.error('テスト実行エラー:', e);
  process.exit(1);
});
