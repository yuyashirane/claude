/**
 * deal-creator.js のテスト
 *
 * ペイロード変換(expense/income), ドライラン, バッチ制限, 本番モード
 * 期待: 14テスト通過
 *
 * 使い方: node tests/test-deal-creator.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { toDealPayload, registerDeals, sanitizePayload, MAX_BATCH_SIZE } = require("../src/register/deal-creator");
const { FREEE_ACCOUNT_IDS, TAX_CLASS_TO_CODE } = require("../src/classify/account-matcher");

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
// テスト用分類済み明細
// --------------------------------------------------
const EXPENSE_ITEM = {
  transaction: { date: "2026-03-01", amount: -3500, description: "タクシー代 新宿→渋谷", partner_name: "", debit_credit: "expense" },
  classification: {
    estimated_account: "旅費交通費",
    estimated_account_id: FREEE_ACCOUNT_IDS["旅費交通費"],
    estimated_tax_class: "課税10%",
    estimated_tax_code: TAX_CLASS_TO_CODE["課税10%"],
    confidence_score: 85,
    confidence_rank: "High",
    invoice_class: "不要",
  },
  routing: { decision: "auto_register", reason: "高確度（85点）" },
  _freee: { wallet_txn_id: 12345 },
};

const INCOME_ITEM = {
  transaction: { date: "2026-03-20", amount: 500000, description: "顧問料 3月分 ㈱ABC", partner_name: "㈱ABC", debit_credit: "income" },
  classification: {
    estimated_account: "売上高",
    estimated_account_id: FREEE_ACCOUNT_IDS["売上高"],
    estimated_tax_class: "課税売上10%",
    estimated_tax_code: TAX_CLASS_TO_CODE["課税売上10%"],
    confidence_score: 90,
    confidence_rank: "High",
    invoice_class: "適格",
  },
  routing: { decision: "auto_register", reason: "高確度（90点）" },
  _freee: { wallet_txn_id: 12346 },
};

// ==================================================
// メイン実行（CommonJSでtop-level awaitが使えないためIIFE）
// ==================================================
(async () => {

// ==================================================
// ペイロード変換テスト
// ==================================================
console.log("\n━━━ ペイロード変換テスト ━━━");

test("D01: expense→type=expense, 金額は絶対値", () => {
  const payload = toDealPayload(EXPENSE_ITEM, 474381);
  assert.strictEqual(payload.type, "expense");
  assert.strictEqual(payload.details[0].amount, 3500);
  assert.ok(payload.details[0].amount > 0, "金額は正の値");
});

test("D02: income→type=income, 金額は絶対値", () => {
  const payload = toDealPayload(INCOME_ITEM, 474381);
  assert.strictEqual(payload.type, "income");
  assert.strictEqual(payload.details[0].amount, 500000);
});

test("D03: company_idが数値でセットされる", () => {
  const payload = toDealPayload(EXPENSE_ITEM, "474381");
  assert.strictEqual(payload.company_id, 474381);
  assert.strictEqual(typeof payload.company_id, "number");
});

test("D04: account_item_idが正しい勘定科目ID", () => {
  const payload = toDealPayload(EXPENSE_ITEM, 474381);
  assert.strictEqual(payload.details[0].account_item_id, FREEE_ACCOUNT_IDS["旅費交通費"]);
});

test("D05: tax_codeが正しい税区分コード", () => {
  const payload = toDealPayload(EXPENSE_ITEM, 474381);
  assert.strictEqual(payload.details[0].tax_code, TAX_CLASS_TO_CODE["課税10%"]);
});

test("D06: _metaにconfidence_score等が含まれる", () => {
  const payload = toDealPayload(EXPENSE_ITEM, 474381);
  assert.ok(payload._meta, "_metaが存在");
  assert.strictEqual(payload._meta.confidence_score, 85);
  assert.strictEqual(payload._meta.wallet_txn_id, 12345);
});

test("D07: sanitizePayloadで_metaが除去される", () => {
  const payload = toDealPayload(EXPENSE_ITEM, 474381);
  const clean = sanitizePayload(payload);
  assert.strictEqual(clean._meta, undefined, "_metaが除去されている");
  assert.strictEqual(clean.company_id, 474381, "他のフィールドは保持");
});

test("D08: MAX_BATCH_SIZE=50", () => {
  assert.strictEqual(MAX_BATCH_SIZE, 50);
});

// ==================================================
// ドライランテスト
// ==================================================
console.log("\n━━━ ドライランテスト ━━━");

await asyncTest("D09: ドライラン 登録0件、スキップ2件", async () => {
  const result = await registerDeals([EXPENSE_ITEM, INCOME_ITEM], {
    companyId: 474381,
    dryRun: true,
  });
  assert.strictEqual(result.registered.length, 0, "登録0件");
  assert.strictEqual(result.skipped.length, 2, "スキップ2件");
  assert.strictEqual(result.summary.dry_run, true);
});

await asyncTest("D10: ドライラン tmpファイル生成", async () => {
  const result = await registerDeals([EXPENSE_ITEM], {
    companyId: 474381,
    dryRun: true,
  });
  assert.ok(result.summary.dryrun_file, "dryrun_fileパスが存在");
  assert.ok(fs.existsSync(result.summary.dryrun_file), "ファイルが実在");
  // クリーンアップ
  fs.unlinkSync(result.summary.dryrun_file);
});

// ==================================================
// バッチ制限テスト
// ==================================================
console.log("\n━━━ バッチ制限テスト ━━━");

await asyncTest("D11: 0件→空結果", async () => {
  const result = await registerDeals([], { companyId: 474381, dryRun: true });
  assert.strictEqual(result.summary.total, 0);
});

await asyncTest("D12: 51件→エラー", async () => {
  const items = Array.from({ length: 51 }, (_, i) => ({
    ...EXPENSE_ITEM,
    _freee: { wallet_txn_id: 90000 + i },
  }));
  try {
    await registerDeals(items, { companyId: 474381, dryRun: false });
    assert.fail("エラーが発生するべき");
  } catch (err) {
    assert.ok(err.message.includes("上限"), `上限エラー: ${err.message}`);
  }
});

// ==================================================
// 本番モードテスト（モックAPI）
// ==================================================
console.log("\n━━━ 本番モードテスト ━━━");

await asyncTest("D13: モックAPI 2件登録成功", async () => {
  let callCount = 0;
  const mockApi = async (apiPath, body) => {
    callCount++;
    return { deal: { id: 99900 + callCount, company_id: body.company_id } };
  };
  const result = await registerDeals([EXPENSE_ITEM, INCOME_ITEM], {
    companyId: 474381,
    dryRun: false,
    apiPost: mockApi,
  });
  assert.strictEqual(result.registered.length, 2);
  assert.strictEqual(callCount, 2);
  assert.strictEqual(result.summary.dry_run, false);
});

await asyncTest("D14: モックAPI 失敗→failedに記録", async () => {
  const failApi = async () => { throw new Error("API Error 500"); };
  const result = await registerDeals([EXPENSE_ITEM], {
    companyId: 474381,
    dryRun: false,
    apiPost: failApi,
  });
  assert.strictEqual(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes("API Error"));
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
