/**
 * deal-creator.js のテスト
 *
 * ドライランモードで処理結果JSONを読み込み、
 * ペイロード生成とサニタイズが正しく動作するか確認する。
 */

const path = require("path");
const fs = require("fs");
const { registerDeals, sanitizePayload, saveRegistrationLog } = require("../src/register/deal-creator");

// テスト用の処理結果データ
const TEST_RESULT = {
  metadata: {
    processed_at: "2026-03-28T10:00:00.000Z",
    company_id: 474381,
    input_file: "test_wallet_txns.json",
    total_wallet_txns: 10,
    rule_matched_skipped: 3,
    processed_count: 7,
  },
  summary: { total: 7, auto_register: 2, kintone_review: 4, exclude: 1 },
  auto_register: {
    count: 2,
    items: [],
    deal_payloads: [
      {
        company_id: 474381,
        issue_date: "2026-03-15",
        type: "expense",
        details: [
          {
            account_item_id: 738954738,
            tax_code: 136,
            amount: 5500,
            description: "タクシー代 渋谷→新宿",
          },
        ],
        _meta: {
          wallet_txn_id: 12345,
          confidence_score: 85,
          confidence_rank: "High",
          routing_reason: "高確度（85点）: 自動登録対象",
        },
      },
      {
        company_id: 474381,
        issue_date: "2026-03-01",
        type: "expense",
        details: [
          {
            account_item_id: 738954750,
            tax_code: 136,
            amount: 165000,
            description: "3月分 事務所家賃",
          },
        ],
        _meta: {
          wallet_txn_id: 12346,
          confidence_score: 90,
          confidence_rank: "High",
          routing_reason: "高確度（90点）: 自動登録対象",
        },
      },
    ],
  },
  kintone_review: { count: 0, items: [] },
  exclude: { count: 0, items: [] },
};

async function runTest() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  deal-creator テスト                         ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // テスト用JSONファイルを一時保存
  const tmpDir = path.resolve("tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const testFile = path.join(tmpDir, "test_processing_result.json");
  fs.writeFileSync(testFile, JSON.stringify(TEST_RESULT, null, 2), "utf-8");

  // テスト1: sanitizePayload
  console.log("━━━ テスト1: sanitizePayload ━━━");
  const payload = TEST_RESULT.auto_register.deal_payloads[0];
  const sanitized = sanitizePayload(payload);
  const check1 = !sanitized._meta && sanitized.company_id === 474381;
  console.log(`  ${check1 ? "✅" : "❌"} _meta が除去され、company_id が保持される`);

  // テスト2: ドライラン
  console.log("\n━━━ テスト2: ドライラン実行 ━━━");
  const result = await registerDeals(testFile, { dryRun: true });
  const check2 = result.skipped.length === 2 && result.registered.length === 0;
  console.log(`  ${check2 ? "✅" : "❌"} 2件がスキップ、0件が登録`);

  const check3 = result.summary.dry_run === true;
  console.log(`  ${check3 ? "✅" : "❌"} サマリーに dry_run=true`);

  // テスト3: モックAPI登録
  console.log("\n━━━ テスト3: モックAPI登録 ━━━");
  let apiCallCount = 0;
  const mockApiPost = async (path, body) => {
    apiCallCount++;
    return { deal: { id: 99900 + apiCallCount, company_id: body.company_id } };
  };

  const result2 = await registerDeals(testFile, {
    dryRun: false,
    apiPost: mockApiPost,
  });
  const check4 = result2.registered.length === 2 && apiCallCount === 2;
  console.log(`  ${check4 ? "✅" : "❌"} 2件が登録成功、API2回呼び出し`);

  const check5 = result2.registered[0].result.deal.id === 99901;
  console.log(`  ${check5 ? "✅" : "❌"} deal_id が返却される`);

  // テスト4: ログ保存
  console.log("\n━━━ テスト4: ログ保存 ━━━");
  const logPath = saveRegistrationLog(result2, tmpDir);
  const check6 = fs.existsSync(logPath);
  console.log(`  ${check6 ? "✅" : "❌"} ログファイルが作成される`);

  // 集計
  const checks = [check1, check2, check3, check4, check5, check6];
  const passed = checks.filter(Boolean).length;
  console.log(`\n結果: ${passed}/${checks.length} テスト通過`);

  if (passed === checks.length) {
    console.log("\n🎉 全テスト通過！");
  } else {
    console.log("\n⚠️ 一部テストが失敗しています。");
    process.exit(1);
  }

  // クリーンアップ
  fs.unlinkSync(testFile);
  fs.unlinkSync(logPath);
}

runTest().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
