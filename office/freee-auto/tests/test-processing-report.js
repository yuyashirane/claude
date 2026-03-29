/**
 * processing-report.js のテスト
 *
 * Excel生成, 4シート確認, サマリー内容, 除外データ
 * 期待: 9テスト通過
 *
 * 使い方: node tests/test-processing-report.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { generateReport } = require("../src/verify/processing-report");

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

// --------------------------------------------------
// テスト用処理結果データ（新フォーマット: kintone_staff/kintone_senior分離）
// --------------------------------------------------
const TEST_RESULT = {
  metadata: {
    processed_at: "2026-03-28T10:00:00.000Z",
    company_id: 474381,
    total_input: 10,
    rule_matched_skipped: 2,
    processed_count: 8,
  },
  summary: {
    total: 8,
    auto_register: 2,
    kintone_staff: 3,
    kintone_senior: 1,
    exclude: 2,
    by_rank: { High: 3, Medium: 3, Low: 1, Excluded: 1 },
    total_amount: 587500,
    tax_flags_count: 1,
    special_flags_count: 1,
  },
  auto_register: {
    count: 2,
    items: [
      {
        transaction: { date: "2026-03-01", amount: -3500, description: "タクシー代 渋谷→新宿", partner_name: "" },
        classification: { estimated_account: "旅費交通費", estimated_tax_class: "課税10%", confidence_rank: "High", confidence_score: 85, matched_keyword: "タクシー", invoice_class: "不要", tax_flags: [], special_flags: [] },
        routing: { decision: "auto_register", reason: "高確度（85点）" },
        _freee: { wallet_txn_id: 12345 },
      },
      {
        transaction: { date: "2026-03-02", amount: -8800, description: "Amazon 文具セット", partner_name: "Amazon" },
        classification: { estimated_account: "消耗品費", estimated_tax_class: "課税10%", confidence_rank: "High", confidence_score: 80, matched_keyword: "Amazon", invoice_class: "要確認", tax_flags: [], special_flags: [] },
        routing: { decision: "auto_register", reason: "高確度（80点）" },
        _freee: { wallet_txn_id: 12346 },
      },
    ],
    deal_payloads: [
      { issue_date: "2026-03-01", type: "expense", details: [{ account_item_id: 100, tax_code: 136, amount: 3500, description: "タクシー" }], _meta: { confidence_rank: "High", confidence_score: 85, wallet_txn_id: 12345 } },
      { issue_date: "2026-03-02", type: "expense", details: [{ account_item_id: 101, tax_code: 136, amount: 8800, description: "Amazon" }], _meta: { confidence_rank: "High", confidence_score: 80, wallet_txn_id: 12346 } },
    ],
  },
  kintone_review: {
    staff: [
      {
        transaction: { date: "2026-03-03", amount: -150000, description: "PC修理代金", partner_name: "PCショップ" },
        classification: { estimated_account: "修繕費", estimated_tax_class: "課税10%", confidence_rank: "High", confidence_score: 80, tax_flags: [], special_flags: ["資本的支出確認（20万円以上→要確認）"] },
        routing: { decision: "kintone_staff", reason: "高確度だが10万以上", assignee: "スタッフ" },
      },
      {
        transaction: { date: "2026-03-05", amount: -1080, description: "弁当代 打合せ用", partner_name: "セブン" },
        classification: { estimated_account: "会議費", estimated_tax_class: "課税8%（軽減）", confidence_rank: "Medium", confidence_score: 60, tax_flags: ["R04"], special_flags: [] },
        routing: { decision: "kintone_staff", reason: "R04 軽減税率", assignee: "スタッフ" },
      },
      {
        transaction: { date: "2026-03-10", amount: -25000, description: "保険料 3月分", partner_name: "損保" },
        classification: { estimated_account: "保険料", estimated_tax_class: "非課税", confidence_rank: "Medium", confidence_score: 65, tax_flags: [], special_flags: [] },
        routing: { decision: "kintone_staff", reason: "中確度", assignee: "スタッフ" },
      },
    ],
    senior: [
      {
        transaction: { date: "2026-03-15", amount: -30000, description: "不明な支払い", partner_name: "" },
        classification: { estimated_account: "雑費", estimated_tax_class: "課税10%", confidence_rank: "Low", confidence_score: 15, tax_flags: [], special_flags: [] },
        routing: { decision: "kintone_senior", reason: "低確度（15点）", assignee: "シニア" },
      },
    ],
  },
  exclude: {
    routing_excluded: [
      {
        transaction: { date: "2026-03-11", amount: -500000, description: "口座間振替" },
        classification: { excluded: true, exclude_reason: "除外キーワード「口座間」" },
        routing: { decision: "exclude", reason: "除外キーワード" },
      },
    ],
    freee_skipped: [
      { id: 9999, date: "2026-03-12", amount: -10000, description: "ルールマッチ済", skip_reason: "rule_matched=true" },
    ],
  },
};

const REGISTER_RESULT = {
  summary: { registered: 0, failed: 0, skipped: 2, dry_run: true },
  registered: [],
  failed: [],
  skipped: [{ index: 0 }, { index: 1 }],
};

// ==================================================
// テスト実行
// ==================================================
(async () => {

console.log("\n━━━ processing-report テスト ━━━");

let reportPath = null;
let workbook = null;

// Excelファイル生成
await asyncTest("P01: generateReportでExcelファイル生成", async () => {
  reportPath = await generateReport(TEST_RESULT, { registerResult: REGISTER_RESULT });
  assert.ok(reportPath, "パスが返される");
  assert.ok(fs.existsSync(reportPath), "ファイルが存在");
});

await asyncTest("P02: ファイルサイズが1KB以上", async () => {
  const stats = fs.statSync(reportPath);
  assert.ok(stats.size > 1000, `サイズ: ${stats.size} bytes`);
});

// Excelファイル読み込み
await asyncTest("P03: 4シート構成", async () => {
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(reportPath);
  assert.strictEqual(workbook.worksheets.length, 4, `シート数: ${workbook.worksheets.length}`);
});

await asyncTest("P04: シート名確認", async () => {
  const names = workbook.worksheets.map((s) => s.name);
  assert.ok(names.includes("サマリー"), "サマリーシート");
  assert.ok(names.includes("自動登録詳細"), "自動登録詳細シート");
  assert.ok(names.includes("Kintone確認"), "Kintone確認シート");
  assert.ok(names.includes("除外一覧"), "除外一覧シート");
});

// サマリーシートの内容検証
test("P05: サマリーにタイトルが含まれる", () => {
  const ws = workbook.getWorksheet("サマリー");
  const title = ws.getCell("A1").value;
  assert.ok(String(title).includes("処理結果レポート"), `タイトル: ${title}`);
});

// 自動登録詳細シート
test("P06: 自動登録詳細に2件のデータ行", () => {
  const ws = workbook.getWorksheet("自動登録詳細");
  // ヘッダー1行 + データ2行 = 3行以上
  assert.ok(ws.rowCount >= 3, `行数: ${ws.rowCount}`);
});

// Kintone確認シート
test("P07: Kintone確認にstaff+seniorの4件", () => {
  const ws = workbook.getWorksheet("Kintone確認");
  // ヘッダー1行 + 4件 = 5行以上
  assert.ok(ws.rowCount >= 5, `行数: ${ws.rowCount}`);
});

// 除外一覧シート
test("P08: 除外一覧にデータあり", () => {
  const ws = workbook.getWorksheet("除外一覧");
  // ヘッダー1行 + 少なくとも1行
  assert.ok(ws.rowCount >= 2, `行数: ${ws.rowCount}`);
});

// オブジェクト直接受け取り（後方互換: 文字列パスでも動作）
await asyncTest("P09: 文字列パスでも動作（後方互換）", async () => {
  const tmpDir = path.resolve(__dirname, "../tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const jsonPath = path.join(tmpDir, "test_report_input.json");
  fs.writeFileSync(jsonPath, JSON.stringify(TEST_RESULT, null, 2), "utf-8");
  const outPath = path.join(tmpDir, "test_report_compat.xlsx");
  const result = await generateReport(jsonPath, { outputPath: outPath });
  assert.ok(fs.existsSync(result), "文字列パスからも生成可能");
  // クリーンアップ
  fs.unlinkSync(jsonPath);
  fs.unlinkSync(result);
});

// クリーンアップ
if (reportPath && fs.existsSync(reportPath)) {
  fs.unlinkSync(reportPath);
}

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
