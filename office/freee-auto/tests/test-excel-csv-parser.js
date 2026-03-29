/**
 * Excel/CSVパーサーテスト
 *
 * Excel: ヘッダー自動検出, 列文字指定, 空行スキップ
 * CSV: UTF-8, Shift_JIS, TSV, ダブルクォート, 合計行スキップ
 * パイプライン統合: Excel/CSV→processRows
 * 期待: 21テスト通過
 *
 * 使い方: node tests/test-excel-csv-parser.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const iconv = require("iconv-lite");

const { parseExcel } = require("../src/normalize/excel-parser");
const { parseCsv, detectEncoding, detectDelimiter } = require("../src/normalize/csv-parser");
const { processRows } = require("../src/classify/unprocessed-processor");

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

async function asyncTest(name, fn) {
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

const TMP_DIR = path.resolve(__dirname, "../tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// CommonJSでtop-level awaitが使えないためIIFE
(async () => {

// --------------------------------------------------
// テスト用ファイル作成
// --------------------------------------------------

/** テスト用Excelファイル作成 */
async function createTestExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("明細");
  ws.addRow(["日付", "金額", "摘要", "取引先", "勘定科目"]);
  ws.addRow(["2026-03-01", 3500, "タクシー代 新宿→渋谷", "", "旅費交通費"]);
  ws.addRow(["2026-03-02", 8800, "Amazon 文具セット", "Amazon", "消耗品費"]);
  ws.addRow(["2026-03-03", 250000, "PC修理代金", "PCショップ", "修繕費"]);
  ws.addRow([]); // 空行
  ws.addRow(["合計", 262300, "", "", ""]);
  ws.addRow(["2026-03-05", 1080, "弁当代 打合せ用", "セブン", "会議費"]);

  // 2つ目のシート
  const ws2 = wb.addWorksheet("売上");
  ws2.addRow(["取引日", "入金額", "内容", "取引先名"]);
  ws2.addRow(["2026-03-20", 500000, "顧問料 3月分", "㈱ABC"]);

  const filePath = path.join(TMP_DIR, "test_parser.xlsx");
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

/** テスト用CSVファイル群作成 */
function createTestCsvFiles() {
  const files = {};

  // UTF-8 CSV
  files.utf8 = path.join(TMP_DIR, "test_utf8.csv");
  fs.writeFileSync(files.utf8,
    "日付,金額,摘要,取引先\n" +
    "2026-03-01,3500,タクシー代 新宿→渋谷,\n" +
    "2026-03-02,8800,Amazon 文具セット,Amazon\n" +
    "2026-03-03,250000,PC修理代金,PCショップ\n" +
    "\n" +
    "合計,262300,,\n" +
    "2026-03-05,1080,弁当代 打合せ用,セブン\n",
    "utf-8"
  );

  // UTF-8 BOM
  files.bom = path.join(TMP_DIR, "test_bom.csv");
  const bomBuf = Buffer.from([0xEF, 0xBB, 0xBF]);
  fs.writeFileSync(files.bom, Buffer.concat([
    bomBuf,
    Buffer.from("日付,金額,摘要\n2026-03-01,5500,テスト\n", "utf-8"),
  ]));

  // Shift_JIS
  files.sjis = path.join(TMP_DIR, "test_sjis.csv");
  const sjisContent = "日付,金額,摘要,取引先\n2026-03-01,3500,タクシー代,東京タクシー\n2026-03-02,8800,文具セット,Amazon\n";
  fs.writeFileSync(files.sjis, iconv.encode(sjisContent, "Shift_JIS"));

  // TSV
  files.tsv = path.join(TMP_DIR, "test.tsv");
  fs.writeFileSync(files.tsv,
    "日付\t金額\t摘要\t取引先\n" +
    "2026-03-01\t3500\tタクシー代\t東京タクシー\n" +
    "2026-03-02\t8800\t文具セット\tAmazon\n",
    "utf-8"
  );

  // RFC4180 ダブルクォート
  files.rfc4180 = path.join(TMP_DIR, "test_rfc4180.csv");
  fs.writeFileSync(files.rfc4180,
    '日付,金額,摘要,取引先\n' +
    '2026-03-01,5500,"AWS, Inc. 利用料","Amazon\nWeb Services"\n' +
    '2026-03-02,1100,ヤマト運輸 送料,ヤマト\n',
    "utf-8"
  );

  // 借方/貸方
  files.debitCredit = path.join(TMP_DIR, "test_debitcredit.csv");
  fs.writeFileSync(files.debitCredit,
    "日付,借方金額,貸方金額,摘要\n" +
    "2026-03-01,5500,,タクシー代\n" +
    "2026-03-02,,10000,売上入金\n",
    "utf-8"
  );

  return files;
}

// ==================================================
// Excel テスト（7件）
// ==================================================
console.log("\n━━━ Excel パーサーテスト ━━━");

let excelPath;
await asyncTest("E01: Excelファイル作成", async () => {
  excelPath = await createTestExcel();
  assert.ok(fs.existsSync(excelPath));
});

await asyncTest("E02: ヘッダー自動検出 (日付,金額,摘要,取引先,科目)", async () => {
  const { rows, meta } = await parseExcel(excelPath);
  assert.ok(meta.columns_detected.date, "date列検出");
  assert.ok(meta.columns_detected.amount, "amount列検出");
  assert.ok(meta.columns_detected.description, "description列検出");
  assert.ok(meta.columns_detected.partner_name, "partner_name列検出");
  assert.ok(meta.columns_detected.account_hint, "account_hint列検出");
});

await asyncTest("E03: 空行スキップ", async () => {
  const { meta } = await parseExcel(excelPath);
  assert.ok(meta.skipped_empty >= 1, `空行スキップ: ${meta.skipped_empty}`);
});

await asyncTest("E04: 合計行スキップ", async () => {
  const { meta } = await parseExcel(excelPath);
  assert.ok(meta.skipped_total >= 1, `合計行スキップ: ${meta.skipped_total}`);
});

await asyncTest("E05: データ行4件（空行+合計行除外）", async () => {
  const { rows } = await parseExcel(excelPath);
  assert.strictEqual(rows.length, 4, `データ行: ${rows.length}`);
});

await asyncTest("E06: 列文字指定 {A:'date', B:'amount', C:'description'}", async () => {
  const { rows } = await parseExcel(excelPath, { columns: { A: "date", B: "amount", C: "description" } });
  assert.strictEqual(rows.length, 4);
  assert.ok(rows[0].date, "date抽出");
  assert.ok(rows[0].amount !== undefined, "amount抽出");
  assert.ok(rows[0].description, "description抽出");
  assert.strictEqual(rows[0].partner_name, undefined, "partner_nameは未指定");
});

await asyncTest("E07: シート名指定 (売上シート)", async () => {
  const { rows, meta } = await parseExcel(excelPath, { sheetName: "売上" });
  assert.strictEqual(meta.sheet_name, "売上");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].amount, 500000);
});

// ==================================================
// CSV テスト（9件）
// ==================================================
console.log("\n━━━ CSV パーサーテスト ━━━");

const csvFiles = createTestCsvFiles();

await asyncTest("C01: UTF-8 CSV 基本パース", async () => {
  const { rows, meta } = await parseCsv(csvFiles.utf8);
  assert.strictEqual(meta.encoding, "utf-8");
  assert.strictEqual(meta.delimiter, "COMMA");
  assert.strictEqual(rows.length, 4, `行数: ${rows.length}`); // 空行+合計行除外
});

await asyncTest("C02: UTF-8 BOM除去", async () => {
  const { rows, meta } = await parseCsv(csvFiles.bom);
  assert.strictEqual(meta.encoding, "utf-8");
  assert.strictEqual(rows[0].date, "2026-03-01", "BOM除去後の日付");
});

await asyncTest("C03: Shift_JIS 自動判定", async () => {
  const { rows, meta } = await parseCsv(csvFiles.sjis);
  assert.strictEqual(meta.encoding, "Shift_JIS");
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].description.includes("タクシー"), `摘要: ${rows[0].description}`);
});

await asyncTest("C04: TSV 区切り文字自動判定", async () => {
  const { rows, meta } = await parseCsv(csvFiles.tsv);
  assert.strictEqual(meta.delimiter, "TAB");
  assert.strictEqual(rows.length, 2);
});

await asyncTest("C05: RFC4180 ダブルクォート内のカンマ", async () => {
  const { rows } = await parseCsv(csvFiles.rfc4180);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].description.includes("AWS, Inc."), `摘要: ${rows[0].description}`);
});

await asyncTest("C06: RFC4180 ダブルクォート内の改行", async () => {
  const { rows } = await parseCsv(csvFiles.rfc4180);
  assert.ok(rows[0].partner_name.includes("Amazon"), `取引先: ${rows[0].partner_name}`);
  assert.ok(rows[0].partner_name.includes("Web Services"), "改行後の文字列も含まれる");
});

await asyncTest("C07: 合計行スキップ", async () => {
  const { meta } = await parseCsv(csvFiles.utf8);
  assert.ok(meta.skipped_total >= 1, `合計行スキップ: ${meta.skipped_total}`);
});

await asyncTest("C08: 借方/貸方→amount変換（出金=マイナス）", async () => {
  const { rows } = await parseCsv(csvFiles.debitCredit);
  assert.strictEqual(rows[0].amount, -5500, "借方→マイナス");
});

await asyncTest("C09: 借方/貸方→amount変換（入金=プラス）", async () => {
  const { rows } = await parseCsv(csvFiles.debitCredit);
  assert.strictEqual(rows[1].amount, 10000, "貸方→プラス");
});

// ==================================================
// パイプライン統合: Excel/CSV→processRows
// ==================================================
console.log("\n━━━ パイプライン統合テスト ━━━");

// console出力を抑制
const origLog = console.log;
const origWarn = console.warn;

await asyncTest("P01: Excel→processRows 一気通貫", async () => {
  const { rows } = await parseExcel(excelPath);
  console.log = () => {};
  console.warn = () => {};
  const result = processRows(rows, { companyId: 474381, source: "excel", fileName: "test.xlsx" });
  console.log = origLog;
  console.warn = origWarn;
  assert.ok(result.items.length > 0, `処理結果: ${result.items.length}件`);
  assert.strictEqual(result.metadata.source, "excel");
});

await asyncTest("P02: CSV→processRows 一気通貫", async () => {
  const { rows } = await parseCsv(csvFiles.utf8);
  console.log = () => {};
  console.warn = () => {};
  const result = processRows(rows, { companyId: 474381, source: "csv", fileName: "test.csv" });
  console.log = origLog;
  console.warn = origWarn;
  assert.ok(result.items.length > 0, `処理結果: ${result.items.length}件`);
  assert.strictEqual(result.metadata.source, "csv");
});

await asyncTest("P03: Excel→processRows 分類結果あり", async () => {
  const { rows } = await parseExcel(excelPath);
  console.log = () => {};
  console.warn = () => {};
  const result = processRows(rows, { companyId: 474381, source: "excel" });
  console.log = origLog;
  console.warn = origWarn;
  // 分類済みアイテムにclassificationが付与されている
  const classified = result.items.filter((i) => i.classification);
  assert.ok(classified.length > 0, "classificationが付与されたアイテムあり");
});

await asyncTest("P04: CSV→processRows ルーティング結果あり", async () => {
  const { rows } = await parseCsv(csvFiles.utf8);
  console.log = () => {};
  console.warn = () => {};
  const result = processRows(rows, { companyId: 474381, source: "csv" });
  console.log = origLog;
  console.warn = origWarn;
  const routed = result.items.filter((i) => i.routing);
  assert.ok(routed.length > 0, "routingが付与されたアイテムあり");
});

await asyncTest("P05: TSV→processRows 一気通貫", async () => {
  const { rows } = await parseCsv(csvFiles.tsv);
  console.log = () => {};
  console.warn = () => {};
  const result = processRows(rows, { companyId: 474381, source: "tsv" });
  console.log = origLog;
  console.warn = origWarn;
  assert.ok(result.items.length > 0, "TSVからも処理可能");
  assert.ok(result.summary.total > 0);
});

// ==================================================
// クリーンアップ
// ==================================================
[excelPath, ...Object.values(csvFiles)].forEach((f) => {
  if (f && fs.existsSync(f)) fs.unlinkSync(f);
});

// ==================================================
// 結果
// ==================================================
console.log("\n" + "=".repeat(50));
console.log(`テスト結果: ${passed} passed / ${failed} failed / ${passed + failed} total`);
if (failed > 0) {
  console.log("⚠️ 一部テストが失敗しました");
  process.exit(1);
} else {
  console.log("✅ 全テスト通過！");
}

})().catch((err) => {
  console.error("テストエラー:", err);
  process.exit(1);
});
