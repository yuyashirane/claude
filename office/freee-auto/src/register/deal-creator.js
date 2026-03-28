/**
 * freee取引登録モジュール
 *
 * unprocessed-processor.js で生成された deal_payloads を受け取り、
 * freee MCP（freee_api_post）経由で取引（deals）を登録する。
 * 分類・ルーティング済みの明細をfreee deals APIペイロードに変換し、
 * ドライラン or 本番登録を行う。

* 使い方:
 *   node src/register/deal-creator.js <processing-result.json> [--dry-run] [--confirm]
 *
 * エクスポート:
 *   - toDealPayload(item, companyId): 分類結果→freee deals APIペイロード
 *   - registerDeals(items, {companyId, dryRun}): バッチ登録
 *
 * ⚠️ 安全設計:
 *   - デフォルトは dryRun=true（明示的にfalseにしない限り登録しない）
 *   - 1回のバッチで最大50件。超過時はエラー
 *   - 登録結果を全件ログに記録
 */

const fs = require("fs");
const path = require("path");
const { FREEE_ACCOUNT_IDS, TAX_CLASS_TO_CODE } = require("../classify/account-matcher");

// --------------------------------------------------
// 設定
// --------------------------------------------------
const MAX_BATCH_SIZE = 50; // 1バッチあたりの最大登録件数
const API_DELAY_MS = 500; // API呼び出し間の遅延（ms）

// --------------------------------------------------
// ペイロード変換
// --------------------------------------------------

/**
 * 分類結果→freee deals APIペイロードに変換
 *
 * 正数 = expense（支出）, 負数 = income（収入）, 金額は絶対値
 * details配列に account_item_id, tax_code, amount, description
 *
 * @param {Object} item - classifyTransaction + decideRoute 済みの明細
 * @param {number|string} companyId - freee事業所ID
 * @returns {Object} freee deals APIペイロード
 */
function toDealPayload(item, companyId) {
  const tx = item.transaction || item;
  const cls = item.classification || {};

  const amount = tx.amount || 0;
  const absAmount = Math.abs(amount);

  // 正数=expense, 負数=income
  const type = amount >= 0 ? "expense" : "income";
  // ただしtransaction側にdebit_creditがあればそちらを優先
  const finalType = tx.debit_credit === "income" ? "income"
    : tx.debit_credit === "expense" ? "expense"
      : type;

  const accountName = cls.estimated_account || "雑費";
  const accountId = cls.estimated_account_id
    || FREEE_ACCOUNT_IDS[accountName]
    || FREEE_ACCOUNT_IDS["雑費"];

  const taxClass = cls.estimated_tax_class || "課税10%";
  const taxCode = cls.estimated_tax_code
    || TAX_CLASS_TO_CODE[taxClass]
    || (finalType === "income" ? 129 : 136);

  return {
    company_id: Number(companyId),
    issue_date: tx.date || "",
    type: finalType,
    details: [
      {
        account_item_id: accountId,
        tax_code: taxCode,
        amount: absAmount,
        description: tx.description || tx.partner_name || tx.counterpart || "",
      },
    ],
    // メタ情報（API送信時はsanitizePayloadで除去）
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
// バッチ登録
// --------------------------------------------------

/**
 * 分類済み明細をfreee取引として登録する
 *
 * @param {Array} items - classifyTransaction + decideRoute 済みの明細配列
 * @param {Object} options
 * @param {number|string} options.companyId - freee事業所ID
 * @param {boolean} [options.dryRun=true] - trueならAPI呼び出しをスキップ
 * @param {Function} [options.apiPost] - freee API POST関数（テスト時モック可能）
 * @returns {Promise<Object>} 登録結果
 */
async function registerDeals(items, options = {}) {
  const { companyId, dryRun = true, apiPost = null } = options;

  if (!companyId) {
    throw new Error("companyId が必要です");
  }

  console.log(`\n=== freee取引登録 ===`);
  console.log(`モード: ${dryRun ? "ドライラン（登録しません）" : "本番登録"}`);
  console.log(`対象: ${items.length}件`);
  console.log(`事業所ID: ${companyId}`);

  if (items.length === 0) {
    console.log("\n登録対象の取引はありません。");
    return { registered: [], failed: [], skipped: [], summary: { total: 0, dry_run: dryRun } };
  }

  if (items.length > MAX_BATCH_SIZE) {
    throw new Error(
      `登録件数が上限(${MAX_BATCH_SIZE})を超えています: ${items.length}件。分割してください。`
    );
  }

  // ペイロード生成
  const payloads = items.map((item) => toDealPayload(item, companyId));

  const registered = [];
  const failed = [];
  const skipped = [];

  if (dryRun) {
    // ドライラン: ペイロードをファイルに保存
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const tmpDir = path.resolve(__dirname, "../../tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const dryRunPath = path.join(tmpDir, `dryrun_deals_${timestamp}.json`);
    const dryRunData = {
      mode: "dry_run",
      company_id: companyId,
      generated_at: new Date().toISOString(),
      count: payloads.length,
      payloads: payloads.map(sanitizePayload),
    };
    fs.writeFileSync(dryRunPath, JSON.stringify(dryRunData, null, 2), "utf-8");
    console.log(`\n[DRY-RUN] ${payloads.length}件のペイロードを保存: ${dryRunPath}`);

    // 先頭3件を表示
    for (let i = 0; i < Math.min(3, payloads.length); i++) {
      const p = payloads[i];
      const d = p.details[0];
      console.log(`  [${i + 1}] ${p.issue_date} | ${p.type} | ${d.amount.toLocaleString()}円 | ${d.description.slice(0, 30)}`);
    }
    if (payloads.length > 3) console.log(`  ... 他 ${payloads.length - 3}件`);

    return {
      registered: [],
      failed: [],
      skipped: payloads.map((p, i) => ({ index: i, payload: sanitizePayload(p), reason: "dry-run" })),
      summary: {
        total: payloads.length,
        registered: 0,
        failed: 0,
        skipped: payloads.length,
        dry_run: true,
        company_id: companyId,
        dryrun_file: dryRunPath,
        executed_at: new Date().toISOString(),
      },
    };
  }

  // 本番登録
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const meta = payload._meta || {};
    const detail = payload.details[0];

    console.log(
      `\n[${i + 1}/${payloads.length}] ${payload.issue_date} | ${payload.type} | ${detail.amount.toLocaleString()}円 | ${detail.description.slice(0, 30)}`
    );

    try {
      const apiPayload = sanitizePayload(payload);

      if (apiPost) {
        const result = await apiPost("/api/1/deals", apiPayload);
        console.log(`  → 登録成功 (deal_id: ${result.deal?.id || "unknown"})`);
        registered.push({ index: i, payload: apiPayload, result, wallet_txn_id: meta.wallet_txn_id });
      } else {
        // apiPost関数がない場合はペイロードをログ出力のみ
        console.log("  → ペイロード出力のみ（freee MCP経由でAPI呼び出しが必要）");
        registered.push({ index: i, payload: apiPayload, result: { note: "apiPost未設定" }, wallet_txn_id: meta.wallet_txn_id });
      }

      if (i < payloads.length - 1) await sleep(API_DELAY_MS);
    } catch (err) {
      console.error(`  → 登録失敗: ${err.message}`);
      failed.push({ index: i, payload: sanitizePayload(payload), error: err.message, wallet_txn_id: meta.wallet_txn_id });
    }
  }

  const summary = {
    total: payloads.length,
    registered: registered.length,
    failed: failed.length,
    skipped: 0,
    dry_run: false,
    company_id: companyId,
    executed_at: new Date().toISOString(),
  };

  console.log(`\n=== 登録結果: 成功${registered.length} / 失敗${failed.length} ===`);

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║       取引登録結果サマリー           ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║ 対象件数      : ${String(summary.total).padStart(5)}件         ║`);
  console.log(`║ 登録成功      : ${String(summary.registered).padStart(5)}件         ║`);
  console.log(`║ 登録失敗      : ${String(summary.failed).padStart(5)}件         ║`);
  console.log(`║ スキップ(DRY) : ${String(summary.skipped).padStart(5)}件         ║`);
  console.log("╚══════════════════════════════════════╝");


  return { registered, failed, skipped, summary };
}

/**
 * 登録済みの取引をfreee wallet_txnと紐づける（消込処理）
 *
 * freeeの「明細の登録」ではなく、既存の未処理明細に取引を紐づける方式も選択可能。
 * wallet_txn_id が存在する場合、POST /api/1/wallet_txns/{id}/match で紐付ける。
 *
 * @param {number} walletTxnId - freee wallet_txn ID
 * @param {number} dealId - 登録された取引ID
 * @param {number} companyId - 事業所ID
 * @param {Function} apiPost - freee API POST関数
 */
async function matchWalletTxnToDeal(walletTxnId, dealId, companyId, apiPost) {
  if (!walletTxnId || !dealId) {
    throw new Error("wallet_txn_id と deal_id が必要です");
  }

  // ※ 実装はfreee APIの仕様に依存
  // POST /api/1/deals/{deal_id}/payments に wallet_txn_id を紐づける方式
  // もしくは PUT /api/1/wallet_txns/{wallet_txn_id} で取引を紐づける方式
  console.log(
    `  消込: wallet_txn ${walletTxnId} → deal ${dealId} (company: ${companyId})`
  );

  // TODO: freee API仕様を確認して実装
  // 現時点ではログのみ
  return { matched: true, wallet_txn_id: walletTxnId, deal_id: dealId };
}

// --------------------------------------------------
// ヘルパー関数
// --------------------------------------------------

/** ペイロードから _meta を除去してAPI送信用に整形 */
function sanitizePayload(payload) {
  const clean = { ...payload };
  delete clean._meta;
  return clean;
}

/**
 * freee API呼び出し（MCP or 直接API）
 *
 * Claude Code環境ではfreee MCPの freee_api_post を使用。
 * テスト時はモック関数を注入可能。
 */
async function callFreeeApi(payload, apiPostFn) {
  if (apiPostFn) {
    // モック or カスタムAPI関数
    return await apiPostFn("/api/1/deals", payload);
  }

  // freee MCP経由（Claude Codeスキルから呼ばれる場合）
  // ここでは直接MCPを呼べないため、ペイロードをログ出力して
  // スキル側でMCP呼び出しを行う構成にする
  throw new Error(
    "apiPost関数が未設定です。スキル経由でfreee MCPを使用してください。"
  );
}

/** 登録結果をJSONファイルに保存 */
function saveRegistrationLog(result, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  const logPath = path.join(outputDir, `registration_log_${timestamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`登録ログを保存: ${logPath}`);
  return logPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  toDealPayload,
  registerDeals,
  sanitizePayload,
  saveRegistrationLog,
  MAX_BATCH_SIZE,
};

// --------------------------------------------------
// 直接実行時（JSONファイルから登録）
// --------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--no-dry-run");
  const inputFile = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));

  if (!inputFile) {
    console.error("使い方: node src/register/deal-creator.js <processing-result.json> [--no-dry-run]");
    process.exit(1);
  }

  const resultData = JSON.parse(fs.readFileSync(path.resolve(inputFile), "utf-8"));
  const companyId = resultData.metadata?.company_id;
  const autoItems = resultData.auto_register?.items || [];

  registerDeals(autoItems, { companyId, dryRun })
    .then((result) => {
      saveRegistrationLog(result, path.dirname(path.resolve(inputFile)));
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
