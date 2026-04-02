/**
 * freee未処理明細プロセッサー
 *
 * NORMALIZE → CLASSIFY → ROUTING の一気通貫処理を行う。
 *
 * エクスポート関数:
 *   - processWalletTxns(walletTxns, {companyId}): freee明細→一気通貫処理
 *   - processRows(rawRows, {companyId, source}): 汎用行→一気通貫処理
 *
 * CLI実行:
 *   node src/classify/unprocessed-processor.js <input.json> [output-dir] [--include-rule-matched]
 */

const fs = require("fs");
const path = require("path");
const {
  standardizeRows,
  standardizeFreeeWalletTxns,
} = require("../normalize/format-standardizer");
const { classifyTransaction, classifyTransactions, FREEE_ACCOUNT_IDS, TAX_CLASS_TO_CODE } = require("./account-matcher");
const { buildPatternStore } = require("./past-pattern-store");
const { routeAll, printRoutingSummary } = require("./routing-decider");

// --------------------------------------------------
// メインAPI: freee明細→一気通貫処理
// --------------------------------------------------

/**
 * freee未処理明細を一気通貫で処理する
 *
 * @param {Array} walletTxns - freee wallet_txns APIレスポンスの配列
 * @param {Object} options
 * @param {number|string} options.companyId - freee事業所ID
 * @param {string} [options.cacheDir]  - 過去パターンキャッシュ保存先
 * @param {Array}  [options.pastDeals] - テスト用: deals配列を直接渡す
 * @returns {Promise<{ items: Array, summary: Object, excluded: Array, metadata: Object }>}
 */
async function processWalletTxns(walletTxns, options = {}) {
  const companyId = options.companyId || 0;

  console.log(`\n=== processWalletTxns: ${walletTxns.length}件 ===`);

  // 【過去パターンストアの構築】
  let patternStore = null;
  try {
    patternStore = await buildPatternStore({
      companyId,
      cacheDir: options.cacheDir,
      deals: options.pastDeals,
      existingRuleCsvPath: options.existingRuleCsvPath,
      partners: options.partners,
    });
    console.log(`[CLASSIFY] 過去パターン: ${patternStore.size}件ロード / カタカナマップ: ${patternStore.kanaMapSize}件`);
  } catch (e) {
    console.warn(`[CLASSIFY] 過去パターンのロードに失敗（0ptで継続）: ${e.message}`);
  }

  // Step 1: NORMALIZE（standardizeFreeeWalletTxns でスキップ判定付き変換）
  console.log("\n━━━ Step 1: NORMALIZE ━━━");
  const normalized = standardizeFreeeWalletTxns(walletTxns);
  console.log(`変換: ${normalized.summary.converted}件 / スキップ: ${normalized.summary.skipped}件`);

  if (normalized.rows.length === 0) {
    console.log("処理対象の明細はありません。");
    return {
      items: [],
      summary: { total: 0, auto_register: 0, kintone_staff: 0, kintone_senior: 0, exclude: 0 },
      excluded: normalized.skipped,
      metadata: {
        processed_at: new Date().toISOString(),
        company_id: companyId,
        total_input: walletTxns.length,
        rule_matched_skipped: normalized.summary.skipped,
      },
    };
  }

  // StandardRow形式の明細を standardizeRows の入力形式に変換
  const rows = normalized.rows.map((row) => ({
    date: row.date,
    amount: row.amount,
    description: normalizeFreeeDescription(row.description),
    partner_name: extractPartnerFromDescription(row.description),
    debit_credit: row.rawData?.entry_side === "income" ? "income" : "expense",
    raw_text: row.description,
  }));

  const standardized = standardizeRows(rows, {
    source_type: "freee_unprocessed",
    file_name: "",
    client: { company_id: companyId, client_name: "" },
  });

  console.log(`有効: ${standardized.valid.length}件 / 無効: ${standardized.invalid.length}件`);

  // wallet_txn の元データを標準明細に紐づけ
  for (let i = 0; i < standardized.valid.length; i++) {
    const origIdx = standardized.valid[i].source.row_number - 1;
    if (origIdx >= 0 && origIdx < normalized.rows.length) {
      const origRow = normalized.rows[origIdx];
      standardized.valid[i]._freee = {
        wallet_txn_id: origRow.id,
        walletable_type: origRow.rawData?.walletable_type,
        walletable_id: origRow.rawData?.walletable_id,
        due_amount: origRow.rawData?.due_amount,
        status: origRow.rawData?.status,
        rule_matched: origRow.rule_matched,
      };
    }
  }

  // Step 2: CLASSIFY（仕訳判定 + スコア算出）
  console.log("\n━━━ Step 2: CLASSIFY ━━━");
  const classified = standardized.valid.map((item) => {
    let pastPatternScore = 0;
    let pastPatternMatch = null;
    if (patternStore) {
      const tx = item.transaction || item;
      pastPatternMatch = patternStore.matchPattern(tx.description || "");
      pastPatternScore = patternStore.calculatePastPatternScore(pastPatternMatch);
    }
    const result = classifyTransaction(item, { ...options, pastPatternScore, pastPatternMatch });
    // 過去パターンから取引先名を補完
    if (pastPatternMatch && pastPatternMatch.partnerName) {
      const tx = result.transaction || result;
      if (!tx.partner_name) tx.partner_name = pastPatternMatch.partnerName;
    }
    return result;
  });
  logClassified(classified);

  // Step 3: ROUTING
  console.log("\n━━━ Step 3: ROUTING ━━━");
  const routed = routeAll(classified);
  printRoutingSummary(routed.summary);

  return {
    items: routed.items,
    summary: routed.summary,
    excluded: normalized.skipped,
    metadata: {
      processed_at: new Date().toISOString(),
      company_id: companyId,
      total_input: walletTxns.length,
      rule_matched_skipped: normalized.summary.skipped,
      processed_count: normalized.summary.converted,
    },
  };
}

// --------------------------------------------------
// メインAPI: 汎用行→一気通貫処理
// --------------------------------------------------

/**
 * 汎用の行データ（Excel/CSV/手入力等）を一気通貫で処理する
 *
 * @param {Array} rawRows - パース済みの行データ配列
 *   各行: { date, amount, description, partner_name, debit_credit, ... }
 * @param {Object} options
 * @param {number|string} options.companyId - freee事業所ID
 * @param {string} options.source - 入力元（例: "excel", "csv", "manual"）
 * @param {string} [options.fileName] - 元ファイル名
 * @returns {{ items: Array, summary: Object, metadata: Object }}
 */
function processRows(rawRows, options = {}) {
  const companyId = options.companyId || 0;
  const source = options.source || "unknown";
  const fileName = options.fileName || "";

  console.log(`\n=== processRows: ${rawRows.length}件（source=${source}） ===`);

  // Step 1: NORMALIZE
  console.log("\n━━━ Step 1: NORMALIZE ━━━");
  const standardized = standardizeRows(rawRows, {
    source_type: source,
    file_name: fileName,
    client: { company_id: companyId, client_name: "" },
  });

  console.log(`有効: ${standardized.valid.length}件 / 無効: ${standardized.invalid.length}件`);

  if (standardized.valid.length === 0) {
    console.log("有効な明細がありません。");
    return {
      items: [],
      summary: { total: 0, auto_register: 0, kintone_staff: 0, kintone_senior: 0, exclude: 0 },
      invalid: standardized.invalid,
      metadata: {
        processed_at: new Date().toISOString(),
        company_id: companyId,
        source,
        total_input: rawRows.length,
        valid_count: 0,
        invalid_count: standardized.invalid.length,
      },
    };
  }

  // Step 2: CLASSIFY
  console.log("\n━━━ Step 2: CLASSIFY ━━━");
  const classified = classifyTransactions(standardized.valid);
  logClassified(classified);

  // Step 3: ROUTING
  console.log("\n━━━ Step 3: ROUTING ━━━");
  const routed = routeAll(classified);
  printRoutingSummary(routed.summary);

  return {
    items: routed.items,
    summary: routed.summary,
    invalid: standardized.invalid,
    metadata: {
      processed_at: new Date().toISOString(),
      company_id: companyId,
      source,
      file_name: fileName,
      total_input: rawRows.length,
      valid_count: standardized.valid.length,
      invalid_count: standardized.invalid.length,
    },
  };

  // サマリー表示
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║        処理完了サマリー               ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║ 全明細            : ${String(walletTxns.length).padStart(5)}件         ║`);
  console.log(`║ freeeルールマッチ  : ${String(walletTxns.length - targetTxns.length).padStart(5)}件 (委譲)  ║`);
  console.log(`║ Claude Code処理   : ${String(targetTxns.length).padStart(5)}件         ║`);
  console.log(`║   → 自動登録候補  : ${String(autoRegisterItems.length).padStart(5)}件         ║`);
  console.log(`║   → Kintone確認   : ${String(kintoneItems.length).padStart(5)}件         ║`);
  console.log(`║   → 除外          : ${String(excludeItems.length).padStart(5)}件         ║`);
  console.log("╚══════════════════════════════════════╝");

  return resultData;
}

// --------------------------------------------------
// ヘルパー関数
// --------------------------------------------------

/**
 * 分類結果のログ出力
 */
function logClassified(classified) {
  for (const item of classified) {
    const tx = item.transaction || item;
    const cls = item.classification;
    if (!cls) continue;
    const rank = (cls.confidence_rank || "???").padEnd(8);
    const score = String(cls.confidence_score || 0).padStart(3);
    const account = (cls.estimated_account || "?").padEnd(8);
    const tax = (cls.estimated_tax_class || "?").padEnd(12);
    const amt = Math.abs(tx.amount || 0).toLocaleString().padStart(12);
    const desc = (tx.description || tx.raw_text || "(摘要なし)").slice(0, 35);
    console.log(`  [${rank}] ${score}点 | ${account} | ${tax} | ${amt}円 | ${desc}`);
  }
}

/**
 * freee摘要テキストの正規化
 * 銀行口座の摘要は全角カタカナ・略称が多いため変換する
 */
function normalizeFreeeDescription(desc) {
  if (!desc) return "";
  let str = desc;
  // 「口座振替N・」「振込N・」等のプレフィクスを除去
  str = str.replace(/^(口座振替|振込|カード|デビット|自振)\d*[・．.]?/u, "");
  // 全角英数字→半角
  str = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  // 全角スペース→半角
  str = str.replace(/　/g, " ");
  return str.trim();
}

/**
 * 摘要テキストから取引先名を抽出（ヒューリスティック）
 */
function extractPartnerFromDescription(desc) {
  if (!desc) return "";
  const str = normalizeFreeeDescription(desc);
  // 「）」以降を取引先名として切り出す（銀行明細の「MHF）カンリヒトウ」パターン）
  const parenMatch = str.match(/[）\)]\s*(.+)/);
  if (parenMatch) return parenMatch[1].trim();
  // 「・」以降
  const dotMatch = str.match(/[・．.]\s*(.+)/);
  if (dotMatch) return dotMatch[1].trim();
  return str;
}

/**
 * 分類済み明細をfreee取引登録APIのペイロードに変換
 */
function toDealPayload(item, companyId) {
  const tx = item.transaction || item;
  const cls = item.classification;
  if (!cls) return null;

  const accountId =
    FREEE_ACCOUNT_IDS[cls.estimated_account] || FREEE_ACCOUNT_IDS["雑費"];

  const taxCode =
    (tx.debit_credit === "income")
      ? (TAX_CLASS_TO_CODE["課税売上10%"] || 129)
      : (TAX_CLASS_TO_CODE[cls.estimated_tax_class] || 136);

  return {
    company_id: companyId,
    issue_date: tx.date,
    type: tx.debit_credit === "income" ? "income" : "expense",
    details: [
      {
        account_item_id: accountId,
        tax_code: taxCode,
        amount: Math.abs(tx.amount),
        description: tx.description || tx.partner_name || "",
      },
    ],
    // メタ情報（API送信時は除去）
    _meta: {
      wallet_txn_id: item._freee?.wallet_txn_id,
      confidence_score: cls.confidence_score,
      confidence_rank: cls.confidence_rank,
      invoice_class: cls.invoice_class,
      routing_reason: item.routing?.reason,
    },
  };
}

// --------------------------------------------------
// CLI実行
// --------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const includeRuleMatched = args.includes("--include-rule-matched");

  const inputFile = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  const outputDir = args.find((a) => !a.startsWith("--") && !a.endsWith(".json"));

  if (!inputFile) {
    console.error("使い方: node src/classify/unprocessed-processor.js <input.json> [output-dir] [--include-rule-matched]");
    process.exit(1);
  }

  // 入力ファイル読み込み
  const rawData = JSON.parse(fs.readFileSync(path.resolve(inputFile), "utf-8"));
  let walletTxns = rawData.wallet_txns || rawData;

  // MCP tool result wrapper対応
  if (Array.isArray(walletTxns) && walletTxns[0]?.text) {
    walletTxns = JSON.parse(walletTxns[0].text).wallet_txns;
  }

  // rule_matched除外
  let targetTxns;
  if (includeRuleMatched) {
    targetTxns = walletTxns;
  } else {
    targetTxns = walletTxns.filter((t) => t.rule_matched !== true);
  }

  const companyId = targetTxns[0]?.company_id || 0;
  const result = await processWalletTxns(targetTxns, { companyId });

  // freee登録用ペイロードの生成
  const autoItems = result.items.filter((i) => i.routing?.decision === "auto_register");
  const dealPayloads = autoItems.map((item) => toDealPayload(item, companyId));

  // 結果出力
  const outDir = path.resolve(outputDir || "tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  const resultData = {
    metadata: result.metadata,
    summary: result.summary,
    auto_register: {
      count: autoItems.length,
      items: autoItems,
      deal_payloads: dealPayloads,
    },
    kintone_review: {
      staff: result.items.filter((i) => i.routing?.decision === "kintone_staff"),
      senior: result.items.filter((i) => i.routing?.decision === "kintone_senior"),
    },
    exclude: {
      routing_excluded: result.items.filter((i) => i.routing?.decision === "exclude"),
      freee_skipped: result.excluded,
    },
  };

  const resultPath = path.join(outDir, `processing_result_${timestamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2), "utf-8");
  console.log(`\n処理結果を保存: ${resultPath}`);

  // サマリー表示
  const staffCount = resultData.kintone_review.staff.length;
  const seniorCount = resultData.kintone_review.senior.length;
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║        処理完了サマリー               ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║ 全明細            : ${String(walletTxns.length).padStart(5)}件         ║`);
  console.log(`║ freeeルールマッチ  : ${String(walletTxns.length - targetTxns.length).padStart(5)}件 (委譲)  ║`);
  console.log(`║ Claude Code処理   : ${String(targetTxns.length).padStart(5)}件         ║`);
  console.log(`║   → 自動登録候補  : ${String(autoItems.length).padStart(5)}件         ║`);
  console.log(`║   → スタッフ確認  : ${String(staffCount).padStart(5)}件         ║`);
  console.log(`║   → シニア確認    : ${String(seniorCount).padStart(5)}件         ║`);
  console.log(`║   → 除外          : ${String(resultData.exclude.routing_excluded.length).padStart(5)}件         ║`);
  console.log("╚══════════════════════════════════════╝");

  return resultData;
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  processWalletTxns,
  processRows,
  walletTxnToRow: (txn) => ({
    date: txn.date,
    amount: txn.amount,
    description: normalizeFreeeDescription(txn.description || ""),
    partner_name: extractPartnerFromDescription(txn.description || ""),
    debit_credit: txn.entry_side === "income" ? "income" : "expense",
    raw_text: txn.description || "",
  }),
  normalizeFreeeDescription,
  extractPartnerFromDescription,
  toDealPayload,
};

// 直接実行時
if (require.main === module) {
  main().catch((err) => {
    console.error("エラー:", err.message);
    process.exit(1);
  });
}
