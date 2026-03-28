/**
 * ルーティング判定モジュール
 *
 * 信頼度スコア付きの仕訳候補を、以下のいずれかに振り分ける:
 *   - auto_register: freeeに自動登録
 *   - kintone_staff: Kintoneスタッフレビュー一覧へ
 *   - kintone_senior: Kintoneシニアレビュー一覧へ
 *   - exclude: 登録せず除外ログに記録
 *
 * 振り分けルール:
 *   High(75+): 自動登録 ※ただし以下はKintone確認に回す
 *     - 消費税の重大指摘(🔴)あり → シニア確認
 *     - 消費税指摘(🟡)あり → スタッフ確認
 *     - 10万円以上 → スタッフ確認（固定資産確認）
 *     - 勘定科目が「雑費」 → スタッフ確認
 *   Medium(45-74): スタッフ担当で Kintone確認
 *   Low(0-44): シニア担当で Kintone確認
 */

// --------------------------------------------------
// メイン関数
// --------------------------------------------------

/**
 * 分類済み明細にルーティング判定を付与
 *
 * @param {Object} classified - account-matcher.js で classification 付与済みの標準明細
 * @returns {Object} routing が追加された標準明細
 */
function decideRoute(classified) {
  const cls = classified.classification;

  // 除外済み
  if (!cls || cls.excluded) {
    classified.routing = {
      decision: "exclude",
      reason: cls?.exclude_reason || "classification未付与",
      assignee: null,
    };
    return classified;
  }

  const tx = classified.transaction || classified;
  const score = cls.confidence_score;
  const amount = Math.abs(tx.amount || 0);

  // 消費税フラグの重大度チェック
  const hasCriticalTaxFlag = (cls.tax_flag_details || []).some(
    (f) => f.severity === "🔴"
  );
  const hasWarningTaxFlag = (cls.tax_flag_details || []).some(
    (f) => f.severity === "🟡"
  );

  // High（75点以上）
  if (score >= 75) {
    // 消費税の重大指摘(🔴)あり → シニア確認
    if (hasCriticalTaxFlag) {
      classified.routing = {
        decision: "kintone_senior",
        reason: `高確度（${score}点）だが消費税の重大指摘あり`,
        assignee: "シニア",
      };
      return classified;
    }
    // 消費税指摘(🟡)あり → スタッフ確認
    if (hasWarningTaxFlag) {
      classified.routing = {
        decision: "kintone_staff",
        reason: `高確度（${score}点）だが消費税指摘あり`,
        assignee: "スタッフ",
      };
      return classified;
    }
    // 10万円以上 → スタッフ確認（固定資産確認）
    if (amount >= 100000) {
      classified.routing = {
        decision: "kintone_staff",
        reason: `高確度（${score}点）だが10万円以上（固定資産確認）`,
        assignee: "スタッフ",
      };
      return classified;
    }
    // 勘定科目が「雑費」 → スタッフ確認
    if (cls.estimated_account === "雑費") {
      classified.routing = {
        decision: "kintone_staff",
        reason: `高確度（${score}点）だが科目が雑費`,
        assignee: "スタッフ",
      };
      return classified;
    }

    // 条件なし → 自動登録候補
    classified.routing = {
      decision: "auto_register",
      reason: `高確度（${score}点）: 自動登録対象`,
      assignee: null,
    };
    return classified;
  }

  // Medium（45〜74点） → スタッフ担当
  if (score >= 45) {
    classified.routing = {
      decision: "kintone_staff",
      reason: `中確度（${score}点）: スタッフレビュー対象`,
      assignee: "スタッフ",
    };
    return classified;
  }

  // Low（0〜44点） → シニア担当
  classified.routing = {
    decision: "kintone_senior",
    reason: `低確度（${score}点）: シニアレビュー対象`,
    assignee: "シニア",
  };
  return classified;
}

/**
 * 全件振り分け + サマリー集計
 *
 * @param {Array} classifiedItems - classifyTransactions() の結果配列
 * @returns {{ items: Array, summary: Object }}
 */
function routeAll(classifiedItems) {
  const items = classifiedItems.map((item) => decideRoute(item));

  const autoRegister = items.filter((i) => i.routing?.decision === "auto_register");
  const kintoneStaff = items.filter((i) => i.routing?.decision === "kintone_staff");
  const kintoneSenior = items.filter((i) => i.routing?.decision === "kintone_senior");
  const excluded = items.filter((i) => i.routing?.decision === "exclude");

  const summary = {
    total: items.length,
    auto_register: autoRegister.length,
    kintone_staff: kintoneStaff.length,
    kintone_senior: kintoneSenior.length,
    exclude: excluded.length,
    by_rank: {
      High: items.filter((i) => i.classification?.confidence_rank === "High").length,
      Medium: items.filter((i) => i.classification?.confidence_rank === "Medium").length,
      Low: items.filter((i) => i.classification?.confidence_rank === "Low").length,
      Excluded: items.filter((i) => i.classification?.confidence_rank === "Excluded").length,
    },
    total_amount: items
      .filter((i) => i.routing?.decision !== "exclude")
      .reduce((sum, i) => sum + Math.abs((i.transaction || i).amount || 0), 0),
    tax_flags_count: items.filter(
      (i) => (i.classification?.tax_flags || []).length > 0
    ).length,
    special_flags_count: items.filter(
      (i) => (i.classification?.special_flags || []).length > 0
    ).length,
  };

  return { items, summary };
}

/**
 * サマリーをコンソールに表示
 */
function printRoutingSummary(summary) {
  console.log("\n=== ルーティング結果 ===");
  console.log(`全件: ${summary.total}件`);
  console.log(`  自動登録: ${summary.auto_register}件`);
  console.log(`  Kintoneスタッフ: ${summary.kintone_staff}件`);
  console.log(`  Kintoneシニア: ${summary.kintone_senior}件`);
  console.log(`  除外: ${summary.exclude}件`);
  console.log(`\n信頼度分布:`);
  console.log(`  High: ${summary.by_rank.High} / Medium: ${summary.by_rank.Medium} / Low: ${summary.by_rank.Low} / Excluded: ${summary.by_rank.Excluded}`);
  if (summary.tax_flags_count > 0) {
    console.log(`消費税指摘あり: ${summary.tax_flags_count}件`);
  }
  if (summary.special_flags_count > 0) {
    console.log(`特殊フラグあり: ${summary.special_flags_count}件`);
  }
  console.log(`処理対象合計金額: ${summary.total_amount.toLocaleString()}円`);
}

module.exports = {
  decideRoute,
  routeAll,
  printRoutingSummary,
};
