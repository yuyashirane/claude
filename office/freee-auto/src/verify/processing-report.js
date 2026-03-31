/**
 * 処理結果Excelレポート生成モジュール
 *
 * unprocessed-processor.js の処理結果を受け取り、
 * 全明細（自動登録・Kintone確認・除外・freeeルールマッチ）を
 * 4シート構成のExcelレポートを出力する。
 *
 * シート構成:
 *   1. サマリー: 処理件数・振り分け結果・自動登録率
 *   2. 自動登録詳細: 日付,金額,摘要,科目,税区分,スコア等 → 薄緑背景
 *   3. Kintone確認: 科目候補,税区分候補,担当レベル,振り分け理由,税指摘 → Medium=薄黄, Low=薄赤
 *   4. 除外一覧: 除外理由付き → 薄灰背景
 *
 * エクスポート:
 *   - generateReport(result, {outputPath, registerResult}): レポート生成
 *
 * CLI実行:
 *   node src/verify/processing-report.js <processing-result.json> [output-dir]
 */

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

// --------------------------------------------------
// スタイル定義
// --------------------------------------------------
const STYLES = {
  headerFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2C3E50" },
  },
  headerFont: {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 10,
    name: "Yu Gothic",
  },
  autoRegisterFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F5E9" }, // 薄緑
  },
  kintoneStaffFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF8E1" }, // 薄黄（Medium/スタッフ）
  },
  kintoneSeniorFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFEBEE" }, // 薄赤（Low/シニア）
  },
  excludeFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F5F5" }, // 薄灰
  },
  freeeRuleFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" }, // 薄青
  },
  bodyFont: {
    size: 10,
    name: "Yu Gothic",
  },
  numberFormat: "#,##0",
  dateFormat: "yyyy-mm-dd",
  borderThin: {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  },
};

// --------------------------------------------------
// メイン処理
// --------------------------------------------------

/**
 * 処理結果からExcelレポートを生成
 *
 * @param {Object|string} result - 処理結果オブジェクト、またはJSONファイルパス
 * @param {Object} [options]
 * @param {string} [options.outputPath] - 出力先ファイルパス（省略時は自動生成）
 * @param {string} [options.baseDir] - ベースディレクトリ（省略時は REPORT_OUTPUT_DIR or ../../reports）
 *                                    ※ {baseDir}/{company_id}/ にファイルを生成する
 * @param {Object} [options.registerResult] - deal-creator.js の登録結果（あれば反映）
 * @returns {Promise<string>} 出力ファイルパス
 */
async function generateReport(result, options = {}) {
  // 文字列ならJSONファイルパスとして読み込み（後方互換）
  let resultData;
  if (typeof result === "string") {
    resultData = JSON.parse(fs.readFileSync(path.resolve(result), "utf-8"));
  } else {
    resultData = result;
  }

  const { outputPath, baseDir, registerResult } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "freee-auto (Claude Code)";
  workbook.created = new Date();

  // Sheet 1: サマリー
  createSummarySheet(workbook, resultData, registerResult);

  // Sheet 2: 自動登録詳細
  createAutoRegisterSheet(workbook, resultData, registerResult);

  // Sheet 3: Kintone確認
  createKintoneReviewSheet(workbook, resultData);

  // Sheet 4: 除外一覧
  createExcludeSheet(workbook, resultData);

  // 出力先決定
  const companyId = resultData.metadata?.company_id || "unknown";
  let filePath;
  if (outputPath) {
    filePath = path.resolve(outputPath);
  } else {
    const resolvedBase = baseDir
      || (process.env.REPORT_OUTPUT_DIR ? path.resolve(process.env.REPORT_OUTPUT_DIR) : null)
      || path.resolve(__dirname, "../../reports");
    const outDir = path.join(resolvedBase, String(companyId));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    filePath = path.join(outDir, `processing_report_${companyId}_${timestamp}.xlsx`);
  }

  // 出力先ディレクトリの確認
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await workbook.xlsx.writeFile(filePath);
  console.log(`\n📊 Excelレポートを出力: ${filePath}`);

  return filePath;
}

// --------------------------------------------------
// Sheet 1: サマリー
// --------------------------------------------------
function createSummarySheet(workbook, data, registerResult) {
  const ws = workbook.addWorksheet("サマリー", {
    properties: { tabColor: { argb: "FF2C3E50" } },
  });

  const meta = data.metadata || {};
  const summary = data.summary || {};

  // タイトル
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "freee未処理明細 処理結果レポート";
  titleCell.font = { bold: true, size: 14, name: "Yu Gothic" };
  titleCell.alignment = { horizontal: "center" };

  // 処理日時
  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `生成日時: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  ws.getCell("A2").font = { ...STYLES.bodyFont, color: { argb: "FF888888" } };
  ws.getCell("A2").alignment = { horizontal: "center" };

  // 自動登録率の算出
  const autoCount = data.auto_register?.count || summary.auto_register || 0;
  const totalProcessed = summary.total || 0;
  const autoRate = totalProcessed > 0 ? ((autoCount / totalProcessed) * 100).toFixed(1) : "0.0";

  // メタ情報
  const metaRows = [
    ["", ""],
    ["=== 処理概要 ===", ""],
    ["処理日時", meta.processed_at || ""],
    ["事業所ID", meta.company_id || ""],
    ["", ""],
    ["=== 処理件数 ===", ""],
    ["全明細件数（入力）", meta.total_input || 0],
    ["freeeルールマッチ（委譲）", meta.rule_matched_skipped || 0],
    ["Claude Code処理対象", meta.processed_count || totalProcessed],
    ["", ""],
    ["=== 振り分け結果 ===", ""],
    ["自動登録候補", autoCount],
    ["Kintoneスタッフ確認", summary.kintone_staff || 0],
    ["Kintoneシニア確認", summary.kintone_senior || 0],
    ["除外", summary.exclude || 0],
    ["", ""],
    ["自動登録率", `${autoRate}%`],
    ["", ""],
    ["=== 信頼度分布 ===", ""],
    ["High（高確度 75点以上）", summary.by_rank?.High || 0],
    ["Medium（中確度 45〜74点）", summary.by_rank?.Medium || 0],
    ["Low（低確度 0〜44点）", summary.by_rank?.Low || 0],
    ["Excluded（除外）", summary.by_rank?.Excluded || 0],
    ["", ""],
    ["=== 金額・フラグ ===", ""],
    ["処理対象合計金額", summary.total_amount || 0],
    ["消費税指摘あり件数", summary.tax_flags_count || 0],
    ["特殊フラグあり件数", summary.special_flags_count || 0],
  ];

  // 登録結果がある場合
  if (registerResult) {
    metaRows.push(["", ""]);
    metaRows.push(["=== freee登録結果 ===", ""]);
    metaRows.push(["登録成功", registerResult.summary?.registered || 0]);
    metaRows.push(["登録失敗", registerResult.summary?.failed || 0]);
    metaRows.push(["スキップ（ドライラン）", registerResult.summary?.skipped || 0]);
    metaRows.push(["ドライランモード", registerResult.summary?.dry_run ? "はい" : "いいえ"]);
  }

  let row = 4;
  for (const [label, value] of metaRows) {
    const isSection = typeof label === "string" && label.startsWith("===");
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { ...STYLES.bodyFont, bold: isSection };
    ws.getCell(`B${row}`).value = value;
    ws.getCell(`B${row}`).font = STYLES.bodyFont;
    if (typeof value === "number" && value > 100) {
      ws.getCell(`B${row}`).numFmt = STYLES.numberFormat;
    }
    row++;
  }

  ws.getColumn("A").width = 30;
  ws.getColumn("B").width = 25;
}

// --------------------------------------------------
// Sheet 2: 自動登録詳細（薄緑背景）
// --------------------------------------------------
function createAutoRegisterSheet(workbook, data, registerResult) {
  const ws = workbook.addWorksheet("自動登録詳細", {
    properties: { tabColor: { argb: "FF27AE60" } },
  });

  // 自動登録アイテムを取得
  const autoItems = data.auto_register?.items
    || (data.items || []).filter((i) => i.routing?.decision === "auto_register");
  const payloads = data.auto_register?.deal_payloads || [];

  const headers = [
    { header: "No.", key: "no", width: 5 },
    { header: "日付", key: "date", width: 12 },
    { header: "金額", key: "amount", width: 14 },
    { header: "摘要", key: "description", width: 35 },
    { header: "取引先", key: "partner", width: 20 },
    { header: "推定科目", key: "account", width: 14 },
    { header: "消費税区分", key: "tax_class", width: 14 },
    { header: "税区分コード", key: "tax_code", width: 12 },
    { header: "インボイス", key: "invoice_class", width: 12 },
    { header: "スコア", key: "score", width: 8 },
    { header: "マッチキーワード", key: "matched_keyword", width: 16 },
    { header: "振り分け理由", key: "reason", width: 30 },
    { header: "登録結果", key: "register_status", width: 12 },
    { header: "wallet_txn_id", key: "txn_id", width: 14 },
  ];

  ws.columns = headers;
  applyHeaderStyle(ws);

  // 登録結果マップの作成
  const registerMap = {};
  if (registerResult) {
    for (const r of registerResult.registered || []) {
      if (r.wallet_txn_id) registerMap[r.wallet_txn_id] = "成功";
    }
    for (const f of registerResult.failed || []) {
      if (f.wallet_txn_id) registerMap[f.wallet_txn_id] = `失敗: ${f.error}`;
    }
    for (const s of registerResult.skipped || []) {
      registerMap[`skip_${s.index}`] = "ドライラン";
    }
  }

  for (let i = 0; i < autoItems.length; i++) {
    const item = autoItems[i];
    const tx = item.transaction || item;
    const cls = item.classification || {};
    const routing = item.routing || {};
    const walletTxnId = item._freee?.wallet_txn_id || "";
    const payload = payloads[i];

    // 登録結果の特定
    let registerStatus = "";
    if (registerResult) {
      if (registerMap[walletTxnId]) {
        registerStatus = registerMap[walletTxnId];
      } else if (registerMap[`skip_${i}`]) {
        registerStatus = registerMap[`skip_${i}`];
      } else if (registerResult.summary?.dry_run) {
        registerStatus = "ドライラン";
      }
    }

    const row = ws.addRow({
      no: i + 1,
      date: tx.date || "",
      amount: Math.abs(tx.amount || 0),
      description: tx.description || tx.raw_text || "",
      partner: tx.partner_name || "",
      account: cls.estimated_account || "",
      tax_class: cls.estimated_tax_class || "",
      tax_code: payload?.details?.[0]?.tax_code || cls.estimated_tax_code || "",
      invoice_class: cls.invoice_class || "",
      score: cls.confidence_score || 0,
      matched_keyword: cls.matched_keyword || "",
      reason: routing.reason || "",
      register_status: registerStatus,
      txn_id: walletTxnId,
    });

    // 薄緑背景
    row.eachCell((cell) => {
      cell.font = STYLES.bodyFont;
      cell.border = STYLES.borderThin;
      cell.fill = STYLES.autoRegisterFill;
    });

    row.getCell("amount").numFmt = STYLES.numberFormat;
    row.getCell("amount").alignment = { horizontal: "right" };
    row.getCell("score").alignment = { horizontal: "center" };
  }

  ws.autoFilter = { from: "A1", to: `N${autoItems.length + 1}` };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// --------------------------------------------------
// Sheet 3: Kintone確認（Medium=薄黄, Low=薄赤）
// --------------------------------------------------
function createKintoneReviewSheet(workbook, data) {
  const ws = workbook.addWorksheet("Kintone確認", {
    properties: { tabColor: { argb: "FFF39C12" } },
  });

  // kintone_staff + kintone_senior のアイテムを収集
  const kintoneItems = [];
  if (data.kintone_review) {
    // unprocessed-processor出力形式: { staff: [...], senior: [...] }
    for (const item of data.kintone_review.staff || []) {
      kintoneItems.push(item);
    }
    for (const item of data.kintone_review.senior || []) {
      kintoneItems.push(item);
    }
  }
  // items配列からの直接取得（フォールバック）
  if (kintoneItems.length === 0 && data.items) {
    for (const item of data.items) {
      const decision = item.routing?.decision;
      if (decision === "kintone_staff" || decision === "kintone_senior") {
        kintoneItems.push(item);
      }
    }
  }

  const headers = [
    { header: "No.", key: "no", width: 5 },
    { header: "日付", key: "date", width: 12 },
    { header: "金額", key: "amount", width: 14 },
    { header: "摘要", key: "description", width: 35 },
    { header: "取引先", key: "partner", width: 20 },
    { header: "科目候補", key: "account", width: 14 },
    { header: "税区分候補", key: "tax_class", width: 14 },
    { header: "インボイス", key: "invoice_class", width: 12 },
    { header: "信頼度", key: "rank", width: 10 },
    { header: "スコア", key: "score", width: 8 },
    { header: "担当レベル", key: "assignee", width: 12 },
    { header: "振り分け理由", key: "reason", width: 40 },
    { header: "消費税指摘", key: "tax_flags", width: 25 },
    { header: "特殊フラグ", key: "special_flags", width: 20 },
    { header: "wallet_txn_id", key: "txn_id", width: 14 },
  ];

  ws.columns = headers;
  applyHeaderStyle(ws);

  for (let i = 0; i < kintoneItems.length; i++) {
    const item = kintoneItems[i];
    const tx = item.transaction || item;
    const cls = item.classification || {};
    const routing = item.routing || {};

    const row = ws.addRow({
      no: i + 1,
      date: tx.date || "",
      amount: Math.abs(tx.amount || 0),
      description: tx.description || tx.raw_text || "",
      partner: tx.partner_name || "",
      account: cls.estimated_account || "",
      tax_class: cls.estimated_tax_class || "",
      invoice_class: cls.invoice_class || "",
      rank: cls.confidence_rank || "",
      score: cls.confidence_score || 0,
      assignee: routing.assignee || routingToAssignee(routing.decision),
      reason: routing.reason || "",
      tax_flags: (cls.tax_flags || []).join(", "),
      special_flags: (cls.special_flags || []).join(", "),
      txn_id: item._freee?.wallet_txn_id || "",
    });

    // Medium(kintone_staff) = 薄黄, Low(kintone_senior) = 薄赤
    const fill = routing.decision === "kintone_senior"
      ? STYLES.kintoneSeniorFill
      : STYLES.kintoneStaffFill;

    row.eachCell((cell) => {
      cell.font = STYLES.bodyFont;
      cell.border = STYLES.borderThin;
      cell.fill = fill;
    });

    row.getCell("amount").numFmt = STYLES.numberFormat;
    row.getCell("amount").alignment = { horizontal: "right" };
    row.getCell("score").alignment = { horizontal: "center" };
    row.getCell("rank").alignment = { horizontal: "center" };
  }

  ws.autoFilter = { from: "A1", to: `O${kintoneItems.length + 1}` };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// --------------------------------------------------
// Sheet 4: 除外一覧（薄灰背景）
// --------------------------------------------------
function createExcludeSheet(workbook, data) {
  const ws = workbook.addWorksheet("除外一覧", {
    properties: { tabColor: { argb: "FF95A5A6" } },
  });

  // 除外アイテムを収集
  const excludeItems = [];

  // ルーティングで除外された明細
  if (data.exclude?.routing_excluded) {
    for (const item of data.exclude.routing_excluded) {
      excludeItems.push({ ...item, _excludeSource: "ルーティング除外" });
    }
  }
  // freeeルールマッチでスキップされた明細
  if (data.exclude?.freee_skipped) {
    for (const item of data.exclude.freee_skipped) {
      excludeItems.push({ ...item, _excludeSource: "freeeルールマッチ" });
    }
  }
  // フォールバック: items配列から
  if (excludeItems.length === 0 && data.items) {
    for (const item of data.items) {
      if (item.routing?.decision === "exclude") {
        excludeItems.push({ ...item, _excludeSource: "ルーティング除外" });
      }
    }
  }

  const headers = [
    { header: "No.", key: "no", width: 5 },
    { header: "日付", key: "date", width: 12 },
    { header: "金額", key: "amount", width: 14 },
    { header: "摘要", key: "description", width: 35 },
    { header: "除外区分", key: "exclude_source", width: 16 },
    { header: "除外理由", key: "reason", width: 40 },
    { header: "推定科目", key: "account", width: 14 },
    { header: "wallet_txn_id", key: "txn_id", width: 14 },
  ];

  ws.columns = headers;
  applyHeaderStyle(ws);

  for (let i = 0; i < excludeItems.length; i++) {
    const item = excludeItems[i];
    const tx = item.transaction || item;
    const cls = item.classification || {};
    const routing = item.routing || {};

    // freeeスキップの場合、別フォーマットの可能性
    const date = tx.date || item.date || "";
    const amount = Math.abs(tx.amount || item.amount || 0);
    const desc = tx.description || item.description || tx.raw_text || "";

    const row = ws.addRow({
      no: i + 1,
      date,
      amount,
      description: desc,
      exclude_source: item._excludeSource || "",
      reason: routing.reason || cls.exclude_reason || item.skip_reason || "",
      account: cls.estimated_account || "",
      txn_id: item._freee?.wallet_txn_id || item.id || "",
    });

    // 薄灰背景
    row.eachCell((cell) => {
      cell.font = STYLES.bodyFont;
      cell.border = STYLES.borderThin;
      cell.fill = STYLES.excludeFill;
    });

    row.getCell("amount").numFmt = STYLES.numberFormat;
    row.getCell("amount").alignment = { horizontal: "right" };
  }

  ws.autoFilter = { from: "A1", to: `H${excludeItems.length + 1}` };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// --------------------------------------------------
// ヘルパー
// --------------------------------------------------

/** ヘッダー行にスタイルを適用 */
function applyHeaderStyle(ws) {
  ws.getRow(1).eachCell((cell) => {
    cell.fill = STYLES.headerFill;
    cell.font = STYLES.headerFont;
    cell.border = STYLES.borderThin;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(1).height = 22;
}

/** ルーティング判定→担当者ラベル */
function routingToAssignee(decision) {
  switch (decision) {
    case "kintone_staff":
      return "スタッフ";
    case "kintone_senior":
      return "シニア";
    default:
      return "";
  }
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  generateReport,
};

// --------------------------------------------------
// 直接実行時
// --------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputFile = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  const outputDir = args.find((a) => !a.startsWith("--") && !a.endsWith(".json"));

  if (!inputFile) {
    console.error(
      "使い方: node src/verify/processing-report.js <processing-result.json> [output-dir]"
    );
    process.exit(1);
  }

  // outputDir 指定時はベースディレクトリとして渡す（company_id サブフォルダは generateReport 内で付与）
  generateReport(inputFile, { baseDir: outputDir ? path.resolve(outputDir) : undefined })
    .then((filePath) => {
      console.log(`完了: ${filePath}`);
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
