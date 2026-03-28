/**
 * 明細→取引登録パイプラインの統合テスト
 *
 * テストデータ（模擬的な明細）を使って
 * NORMALIZE → CLASSIFY → ROUTING の一気通貫テストを実行する。
 *
 * 使い方:
 *   node tests/test-pipeline.js
 */

const { standardizeRows } = require("../src/normalize/format-standardizer");
const { classifyTransactions } = require("../src/classify/account-matcher");
const {
  decideRoutingBatch,
  printRoutingSummary,
} = require("../src/classify/routing-decider");

// --------------------------------------------------
// テストデータ: 多様な明細を模擬
// --------------------------------------------------
const TEST_ROWS = [
  // 高確度になるはず: 明確なキーワード + 常識的金額
  {
    date: "2026/03/15",
    amount: "5,500",
    description: "タクシー代 渋谷→新宿",
    partner_name: "",
    debit_credit: "expense",
  },
  // 高確度: 家賃（定型）
  {
    date: "2026-03-01",
    amount: 165000,
    description: "3月分 事務所家賃",
    partner_name: "東京不動産株式会社",
    debit_credit: "expense",
  },
  // 中確度: 複数科目にマッチしそう
  {
    date: "2026/3/10",
    amount: "￥33,000",
    description: "Amazon ビジネス用品購入",
    partner_name: "Amazon",
    debit_credit: "expense",
  },
  // 低確度: 情報が少ない
  {
    date: "2026/03/20",
    amount: "8800",
    description: "カード払い",
    partner_name: "",
    debit_credit: "expense",
  },
  // 除外されるはず: 口座振替
  {
    date: "2026/03/25",
    amount: "500000",
    description: "口座間振替 普通→定期",
    partner_name: "",
    debit_credit: "expense",
  },
  // 消費税指摘: 海外サービス
  {
    date: "2026/03/15",
    amount: "2,680",
    description: "Claude Pro月額利用料",
    partner_name: "Anthropic",
    debit_credit: "expense",
  },
  // 非課税: 保険料
  {
    date: "2026/03/20",
    amount: "25,000",
    description: "事務所火災保険料 3月分",
    partner_name: "損害保険ジャパン",
    debit_credit: "expense",
  },
  // 対象外: 給与
  {
    date: "2026-03-25",
    amount: 350000,
    description: "3月分 給料",
    partner_name: "従業員A",
    debit_credit: "expense",
  },
  // 軽減税率: 弁当
  {
    date: "2026/3/12",
    amount: "1080",
    description: "会議用 弁当代 5個",
    partner_name: "セブンイレブン",
    debit_credit: "expense",
  },
  // 高額: 10万円超 → 固定資産確認フラグ
  {
    date: "2026/03/05",
    amount: "△165,000",
    description: "ノートPC購入 ThinkPad",
    partner_name: "ヨドバシカメラ",
    debit_credit: "expense",
  },
  // 売上
  {
    date: "2026/03/31",
    amount: "550,000",
    description: "3月分 税務顧問料",
    partner_name: "株式会社テスト",
    debit_credit: "income",
  },
  // 全角数字・令和表記
  {
    date: "令和8年3月15日",
    amount: "１２，３４５",
    description: "切手購入 84円×50枚 + レターパック370×10",
    partner_name: "日本郵便",
    debit_credit: "expense",
  },
  // バリデーションエラー: 日付なし
  {
    date: "",
    amount: "5000",
    description: "不明な取引",
    partner_name: "",
    debit_credit: "expense",
  },
];

// --------------------------------------------------
// テスト実行
// --------------------------------------------------
function runTest() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  明細→取引登録パイプライン 統合テスト        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: NORMALIZE（標準化）
  console.log("━━━ Step 1: NORMALIZE（標準化） ━━━");
  const meta = {
    source_type: "test",
    file_name: "test-pipeline.js",
    client: { company_id: 474381, client_name: "テスト会社" },
  };

  const normalized = standardizeRows(TEST_ROWS, meta);
  console.log(`入力: ${normalized.summary.total}件`);
  console.log(`有効: ${normalized.summary.valid_count}件`);
  console.log(`無効: ${normalized.summary.invalid_count}件`);

  if (normalized.invalid.length > 0) {
    console.log("\n無効な明細:");
    for (const inv of normalized.invalid) {
      console.log(`  行${inv.source.row_number}: ${inv.validation_errors.join(", ")}`);
    }
  }

  // Step 2: CLASSIFY（仕訳判定）
  console.log("\n━━━ Step 2: CLASSIFY（仕訳判定） ━━━");
  const classified = classifyTransactions(normalized.valid);

  for (const item of classified) {
    const tx = item.transaction;
    const cls = item.classification;
    const amt = Math.abs(tx.amount).toLocaleString();
    const desc = tx.description || tx.partner_name || "(摘要なし)";
    console.log(
      `  [${cls.confidence_rank.padEnd(6)}] ${cls.confidence_score}点 | ${cls.estimated_account.padEnd(8)} | ${cls.estimated_tax_class.padEnd(12)} | ${amt.padStart(10)}円 | ${desc.slice(0, 30)}`
    );
    if (cls.tax_flags.length > 0) {
      console.log(`           消費税指摘: ${cls.tax_flags.join(", ")}`);
    }
    if (cls.special_flags.length > 0) {
      console.log(`           特殊フラグ: ${cls.special_flags.join(", ")}`);
    }
  }

  // Step 3: ROUTING（振り分け）
  console.log("\n━━━ Step 3: ROUTING（振り分け） ━━━");
  const routed = decideRoutingBatch(classified, {
    allowAutoRegister: false, // Phase 1: 全てKintone経由
  });

  for (const item of routed.items) {
    const tx = item.transaction;
    const r = item.routing;
    const icon =
      r.decision === "auto_register"
        ? "🟢"
        : r.decision === "kintone_review"
          ? "🟡"
          : "⛔";
    const desc = tx.description || tx.partner_name || "(摘要なし)";
    console.log(`  ${icon} ${r.decision.padEnd(15)} | ${desc.slice(0, 25).padEnd(25)} | ${r.reason.slice(0, 50)}`);
  }

  printRoutingSummary(routed.summary);

  // 結果の検証
  console.log("\n━━━ 検証結果 ━━━");
  const checks = [
    {
      name: "タクシーは旅費交通費に分類",
      pass: classified[0].classification.estimated_account === "旅費交通費",
    },
    {
      name: "家賃は地代家賃に分類",
      pass: classified[1].classification.estimated_account === "地代家賃",
    },
    {
      name: "口座振替は除外",
      pass: routed.items[4].routing.decision === "exclude",
    },
    {
      name: "Claude/Anthropicに消費税指摘R08",
      pass: classified[5].classification.tax_flags.includes("R08"),
    },
    {
      name: "保険料は非課税",
      pass: classified[6].classification.estimated_tax_class === "非課税",
    },
    {
      name: "給与は対象外",
      pass: classified[7].classification.estimated_tax_class === "対象外",
    },
    {
      name: "弁当は軽減8%",
      pass: classified[8].classification.estimated_tax_class === "課税8%（軽減）",
    },
    {
      name: "PC購入に固定資産確認フラグ",
      pass: classified[9].classification.special_flags.includes("固定資産確認"),
    },
    {
      name: "全角数字が正しく変換",
      pass: classified[11].transaction.amount === 12345,
    },
    {
      name: "令和表記の日付が変換",
      pass: classified[11].transaction.date === "2026-03-15",
    },
    {
      name: "日付なしはバリデーションエラー",
      pass: normalized.invalid.length >= 1,
    },
  ];

  let passCount = 0;
  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    console.log(`  ${icon} ${check.name}`);
    if (check.pass) passCount++;
  }

  console.log(`\n結果: ${passCount}/${checks.length} テスト通過`);

  if (passCount === checks.length) {
    console.log("\n🎉 全テスト通過！パイプラインは正常に動作しています。");
  } else {
    console.log("\n⚠️ 一部テストが失敗しています。確認してください。");
    process.exit(1);
  }
}

runTest();
