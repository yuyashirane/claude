/**
 * ルールCSV生成テスト
 *
 * tax-label-mapper.js と rule-csv-generator.js の全機能を検証する。
 *
 * 使い方: node tests/test-rule-csv-generator.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const {
  toFreeeTaxLabel,
  toFreeeInvoiceLabel,
  toFreeeEntrySide,
} = require("../src/register/tax-label-mapper");

const {
  generateRuleCsv,
  toRuleCsvRow,
  escapeCsvField,
  CSV_HEADER,
} = require("../src/register/rule-csv-generator");

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

// テスト用一時ディレクトリ
const TMP_DIR = path.join(__dirname, "..", "tmp", "test-rule-csv");

function setupTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanupTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true });
  }
}

// ==================================================
// テスト1: 税区分マッピング
// ==================================================
console.log("\n━━━ テスト1: 税区分マッピング ━━━");

test("T01: 課対仕入10% → 課対仕入", () => {
  assert.strictEqual(toFreeeTaxLabel("課対仕入10%"), "課対仕入");
});

test("T02: 課対仕入8%（軽） → 課対仕入8%（軽）", () => {
  assert.strictEqual(toFreeeTaxLabel("課対仕入8%（軽）"), "課対仕入8%（軽）");
});

test("T03: 非課仕入 → 非課仕入", () => {
  assert.strictEqual(toFreeeTaxLabel("非課仕入"), "非課仕入");
});

test("T04: 対象外 → 対象外", () => {
  assert.strictEqual(toFreeeTaxLabel("対象外"), "対象外");
});

test("T05: 不課税 → 不課税", () => {
  assert.strictEqual(toFreeeTaxLabel("不課税"), "不課税");
});

test("T06: null → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel(null), "");
});

test("T07: undefined → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel(undefined), "");
});

test("T08: 不明な値 → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel("不明な値"), "");
});

// ==================================================
// テスト2: インボイスラベル変換
// ==================================================
console.log("\n━━━ テスト2: インボイスラベル変換 ━━━");

test("I01: 適格 → 取引先情報に準拠", () => {
  assert.strictEqual(toFreeeInvoiceLabel("適格"), "取引先情報に準拠");
});

test("I02: 非適格80% → 該当しない", () => {
  assert.strictEqual(toFreeeInvoiceLabel("非適格80%"), "該当しない");
});

test("I03: 不要 → 該当しない", () => {
  assert.strictEqual(toFreeeInvoiceLabel("不要"), "該当しない");
});

test("I04: 要確認 → 空文字", () => {
  assert.strictEqual(toFreeeInvoiceLabel("要確認"), "");
});

test("I05: null → 空文字", () => {
  assert.strictEqual(toFreeeInvoiceLabel(null), "");
});

// ==================================================
// テスト3: 収支区分変換
// ==================================================
console.log("\n━━━ テスト3: 収支区分変換 ━━━");

test("E01: income → 収入", () => {
  assert.strictEqual(toFreeeEntrySide("income"), "収入");
});

test("E02: expense → 支出", () => {
  assert.strictEqual(toFreeeEntrySide("expense"), "支出");
});

test("E03: undefined → 支出（デフォルト）", () => {
  assert.strictEqual(toFreeeEntrySide(undefined), "支出");
});

// ==================================================
// テスト4: CSV行変換（toRuleCsvRow）
// ==================================================
console.log("\n━━━ テスト4: CSV行変換 ━━━");

const AUTO_ITEM = {
  id: 1, description: "アマゾン ジャパン　文具", entrySide: "expense",
  accountName: "消耗品費", taxClassification: "課対仕入10%",
  invoiceType: "適格", confidenceScore: 85, routeDestination: "auto_register",
  walletableName: "三菱UFJ", partnerName: "Amazon.co.jp",
};

const STAFF_ITEM = {
  id: 2, description: "NTTドコモ 通信料", entrySide: "expense",
  accountName: "通信費", taxClassification: "課対仕入10%",
  invoiceType: "適格", confidenceScore: 55, routeDestination: "kintone_staff",
  walletableName: "三菱UFJ", partnerName: "NTTドコモ",
};

const SENIOR_ITEM = {
  id: 3, description: "不明な取引", entrySide: "expense",
  accountName: "", taxClassification: null,
  invoiceType: null, confidenceScore: 15, routeDestination: "kintone_senior",
};

const EXCLUDED_ITEM = {
  id: 4, description: "口座間振替", entrySide: "expense",
  accountName: "", taxClassification: null,
  invoiceType: null, confidenceScore: 0, routeDestination: "excluded",
};

test("R01: auto_register → 53要素の配列", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row.length, 53);
});

test("R02: auto_register → row[0]=支出", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[0], "支出");
});

test("R03: auto_register → row[3]=description原文", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[3], "アマゾン ジャパン　文具");
});

test("R04: auto_register → row[4]=部分一致", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[4], "部分一致");
});

test("R05: auto_register → row[8]=取引を登録する", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[8], "取引を登録する");
});

test("R06: auto_register → row[14]=勘定科目名", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[14], "消耗品費");
});

test("R07: auto_register → row[15]=税区分(課対仕入)", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[15], "課対仕入");
});

test("R08: kintone_staff → row[4]=完全一致", () => {
  const row = toRuleCsvRow(STAFF_ITEM);
  assert.strictEqual(row[4], "完全一致");
});

test("R09: kintone_staff → row[8]=取引を推測する", () => {
  const row = toRuleCsvRow(STAFF_ITEM);
  assert.strictEqual(row[8], "取引を推測する");
});

test("R10: kintone_senior → null", () => {
  assert.strictEqual(toRuleCsvRow(SENIOR_ITEM), null);
});

test("R11: excluded → null", () => {
  assert.strictEqual(toRuleCsvRow(EXCLUDED_ITEM), null);
});

// ==================================================
// テスト5: CSVファイル生成（generateRuleCsv）
// ==================================================
console.log("\n━━━ テスト5: CSVファイル生成 ━━━");

setupTmpDir();

const MOCK_RESULT = {
  all: [
    AUTO_ITEM,
    STAFF_ITEM,
    SENIOR_ITEM,
    EXCLUDED_ITEM,
    { ...AUTO_ITEM, id: 5, description: "タクシー代 新宿", accountName: "旅費交通費" },
  ],
};

const genResult = generateRuleCsv(MOCK_RESULT, {
  companyId: "474381",
  outputDir: TMP_DIR,
  encoding: "cp932",
});

test("G01: CSVファイルが生成される", () => {
  assert.ok(fs.existsSync(genResult.csvPath));
});

test("G02: Shift_JISエンコード（先頭バイトで判定）", () => {
  const buf = fs.readFileSync(genResult.csvPath);
  // Shift_JISの「収」= 0x8E 0xFB
  assert.strictEqual(buf[0], 0x8e);
  assert.strictEqual(buf[1], 0xfb);
});

test("G03: ヘッダー行が53カラム", () => {
  const buf = fs.readFileSync(genResult.csvPath);
  const text = iconv.decode(buf, "cp932");
  const headerLine = text.split("\r\n")[0];
  assert.strictEqual(headerLine.split(",").length, 53);
});

test("G04: stats合計の整合性", () => {
  const s = genResult.stats;
  assert.strictEqual(s.register + s.suggest + s.skipped + s.deduplicated, s.total);
});

test("G05: auto_register → register にカウント", () => {
  assert.strictEqual(genResult.stats.register, 2);
});

test("G06: kintone_staff → suggest にカウント", () => {
  assert.strictEqual(genResult.stats.suggest, 1);
});

test("G07: kintone_senior + excluded → skipped にカウント", () => {
  assert.strictEqual(genResult.stats.skipped, 2);
});

// ==================================================
// テスト6: 重複排除
// ==================================================
console.log("\n━━━ テスト6: 重複排除 ━━━");

// 既存ルールCSVを作成（AUTO_ITEMと同じキーを持つ行）
const existingCsvPath = path.join(TMP_DIR, "existing_rules.csv");
const existingRow = [
  "支出", "三菱UFJ", "", "アマゾン ジャパン　文具", "部分一致", "", "",
  ...new Array(46).fill(""),
];
const existingCsv = CSV_HEADER + "\r\n" + existingRow.join(",") + "\r\n";
fs.writeFileSync(existingCsvPath, iconv.encode(existingCsv, "cp932"));

const dedupeResult = generateRuleCsv(MOCK_RESULT, {
  companyId: "474381",
  outputDir: TMP_DIR,
  encoding: "cp932",
  existingRuleCsvPath: existingCsvPath,
});

test("D01: 同一キーの行が除外される", () => {
  // AUTO_ITEMが2件あるが、既存と同じキーなので2件とも除外
  assert.ok(dedupeResult.stats.deduplicated > 0);
});

test("D02: stats.deduplicated が正しいカウント", () => {
  // AUTO_ITEMのキーと一致する行は2件（id:1とid:5はdescriptionが違うので1件のみ重複）
  assert.strictEqual(dedupeResult.stats.deduplicated, 1);
});

test("D03: 異なるキーの行は残る", () => {
  // kintone_staff(1件) + auto_register残り(1件) = suggest(1) + register(1)
  assert.strictEqual(dedupeResult.stats.register, 1);
  assert.strictEqual(dedupeResult.stats.suggest, 1);
});

// クリーンアップ
cleanupTmpDir();

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
