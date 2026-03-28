/**
 * processing-report.js のテスト
 *
 * テスト用の処理結果データからExcelレポートを生成し、
 * ファイルが正しく作成されるか確認する。
 */

const path = require("path");
const fs = require("fs");
const { generateReport } = require("../src/verify/processing-report");

// テスト用の処理結果データ（実際のパイプライン出力を模擬）
const TEST_RESULT = {
  metadata: {
    processed_at: "2026-03-28T10:00:00.000Z",
    company_id: 474381,
    input_file: "test_wallet_txns.json",
    total_wallet_txns: 8,
    rule_matched_skipped: 2,
    processed_count: 6,
  },
  summary: {
    total: 6,
    auto_register: 1,
    kintone_review: 4,
    exclude: 1,
    by_view: { "若手レビュー": 2, "経験者レビュー": 2 },
    by_rank: { High: 1, Medium: 3, Low: 2 },
    total_amount: 587025,
  },
  auto_register: {
    count: 1,
    items: [
      {
        transaction: {
          date: "2026-03-15",
          amount: -5500,
          description: "タクシー代 渋谷→新宿",
          partner_name: "",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "旅費交通費",
          estimated_tax_class: "課税10%",
          confidence_rank: "High",
          confidence_score: 85,
          tax_flags: [],
          special_flags: [],
        },
        routing: {
          decision: "auto_register",
          reason: "高確度（85点）: 自動登録対象",
        },
        _freee: { wallet_txn_id: 12345 },
      },
    ],
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
    ],
  },
  kintone_review: {
    count: 4,
    items: [
      {
        transaction: {
          date: "2026-03-01",
          amount: -165000,
          description: "3月分 事務所家賃",
          partner_name: "東京不動産株式会社",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "地代家賃",
          estimated_tax_class: "課税10%",
          confidence_rank: "Medium",
          confidence_score: 67,
          tax_flags: [],
          special_flags: [],
        },
        routing: {
          decision: "kintone_review",
          reason: "中確度（67点）: 若手レビュー対象",
          kintone_view: "若手レビュー",
        },
      },
      {
        transaction: {
          date: "2026-03-15",
          amount: -2680,
          description: "Claude Pro月額利用料",
          partner_name: "Anthropic",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "雑費",
          estimated_tax_class: "要確認",
          confidence_rank: "Low",
          confidence_score: 18,
          tax_flags: ["R08"],
          special_flags: [],
        },
        routing: {
          decision: "kintone_review",
          reason: "低確度（18点）: 経験者レビュー対象",
          kintone_view: "経験者レビュー",
        },
      },
      {
        transaction: {
          date: "2026-03-20",
          amount: -25000,
          description: "事務所火災保険料 3月分",
          partner_name: "損害保険ジャパン",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "保険料",
          estimated_tax_class: "非課税",
          confidence_rank: "Medium",
          confidence_score: 50,
          tax_flags: [],
          special_flags: [],
        },
        routing: {
          decision: "kintone_review",
          reason: "中確度（50点）: 若手レビュー対象",
          kintone_view: "若手レビュー",
        },
      },
      {
        transaction: {
          date: "2026-03-20",
          amount: -8800,
          description: "カード払い",
          partner_name: "",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "雑費",
          estimated_tax_class: "課税10%",
          confidence_rank: "Low",
          confidence_score: 11,
          tax_flags: [],
          special_flags: [],
        },
        routing: {
          decision: "kintone_review",
          reason: "低確度（11点）: 経験者レビュー対象",
          kintone_view: "経験者レビュー",
        },
      },
    ],
  },
  exclude: {
    count: 1,
    items: [
      {
        transaction: {
          date: "2026-03-25",
          amount: -500000,
          description: "口座間振替 普通→定期",
          partner_name: "",
          debit_credit: "expense",
        },
        classification: {
          estimated_account: "雑費",
          estimated_tax_class: "課税10%",
          confidence_rank: "Low",
          confidence_score: 11,
          tax_flags: [],
          special_flags: [],
        },
        routing: {
          decision: "exclude",
          reason: "除外キーワード「振替」に該当",
        },
      },
    ],
  },
  freee_rule_matched: {
    count: 2,
    note: "freeeの自動登録ルールでマッチ済み。Claude Code処理対象外。",
  },
};

async function runTest() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  processing-report テスト                    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const tmpDir = path.resolve("tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const testFile = path.join(tmpDir, "test_processing_result_report.json");
  fs.writeFileSync(testFile, JSON.stringify(TEST_RESULT, null, 2), "utf-8");

  // テスト: Excelレポート生成
  console.log("━━━ テスト1: Excelレポート生成 ━━━");
  const reportPath = await generateReport(testFile, tmpDir);

  const check1 = fs.existsSync(reportPath);
  console.log(`  ${check1 ? "✅" : "❌"} Excelファイルが作成される`);

  const stats = fs.statSync(reportPath);
  const check2 = stats.size > 1000; // 最低1KB以上
  console.log(`  ${check2 ? "✅" : "❌"} ファイルサイズが妥当 (${(stats.size / 1024).toFixed(1)}KB)`);

  // ExcelJS で読み込み検証
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(reportPath);

  const check3 = wb.worksheets.length === 4;
  console.log(`  ${check3 ? "✅" : "❌"} 4シート構成 (実際: ${wb.worksheets.length}シート)`);

  const sheetNames = wb.worksheets.map((s) => s.name);
  const check4 =
    sheetNames.includes("サマリー") &&
    sheetNames.includes("処理結果一覧") &&
    sheetNames.includes("自動登録詳細") &&
    sheetNames.includes("Kintone確認");
  console.log(`  ${check4 ? "✅" : "❌"} シート名が正しい: ${sheetNames.join(", ")}`);

  // 処理結果一覧シートの行数チェック（ヘッダー1行 + データ6行 = 7行以上）
  const detailSheet = wb.getWorksheet("処理結果一覧");
  const check5 = detailSheet.rowCount >= 7;
  console.log(`  ${check5 ? "✅" : "❌"} 処理結果一覧に${detailSheet.rowCount - 1}件のデータ行`);

  // Kintone確認シートの行数チェック
  const kintoneSheet = wb.getWorksheet("Kintone確認");
  const check6 = kintoneSheet.rowCount >= 5; // ヘッダー1 + 4件
  console.log(`  ${check6 ? "✅" : "❌"} Kintone確認に${kintoneSheet.rowCount - 1}件のデータ行`);

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
  fs.unlinkSync(reportPath);
}

runTest().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
