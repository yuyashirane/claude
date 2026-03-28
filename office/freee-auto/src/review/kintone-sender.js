/**
 * Kintone 送信モジュール
 *
 * 2つの送信機能を提供:
 *   1. sendReviewItems: 仕訳レビュー案件をKintoneレコードに変換して送付
 *   2. sendCheckFindings: 帳簿チェック指摘をKintoneに送付（🔴🟡のみ）
 *   3. 🔴要対応・🟡要確認の指摘のみ抽出
 *   4. Kintone「帳簿チェック」アプリにレコード登録
 *   5. 既存のCLI（帳簿チェック結果送信）も維持。
 *
 * CLI実行:
 *   node src/review/kintone-sender.js <data-dir> [--dry-run] [--all]
 */

const fs = require("fs");
const path = require("path");
const {
  createKintoneClient,
  bulkAddRecords,
  addRecords,
  severityToKintone,
  APP_IDS,
} = require("../shared/kintone-client");

// --------------------------------------------------
// 仕訳レビュー案件の送信
// --------------------------------------------------

/**
 * 分類・ルーティング済み明細をKintoneレビューレコードに変換して送付
 *
 * kintone_staff / kintone_senior の明細を対象とし、
 * Kintone「仕訳レビュー」アプリに登録する。
 *
 * @param {Array} items - routing済み明細配列（kintone_staff + kintone_senior）
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=true] - trueならAPI呼び出しをスキップ
 * @returns {Promise<Object>} 送信結果
 */
async function sendReviewItems(items, options = {}) {
  const { dryRun = true } = options;

  // kintone_staff / kintone_senior のみ抽出
  const reviewItems = items.filter((item) => {
    const decision = item.routing?.decision;
    return decision === "kintone_staff" || decision === "kintone_senior";
  });

  console.log(`\n=== Kintone仕訳レビュー送信 ===`);
  console.log(`モード: ${dryRun ? "ドライラン" : "本番送信"}`);
  console.log(`対象: ${reviewItems.length}件（全${items.length}件中）`);

  if (reviewItems.length === 0) {
    console.log("送信対象のレビュー案件はありません。");
    return {
      sent: 0,
      records: [],
      errors: [],
      dry_run: dryRun,
    };
  }

  // Kintoneレコードに変換
  const records = reviewItems.map((item) => toReviewRecord(item));

  // サマリー表示
  const staffCount = reviewItems.filter((i) => i.routing?.decision === "kintone_staff").length;
  const seniorCount = reviewItems.filter((i) => i.routing?.decision === "kintone_senior").length;
  console.log(`  スタッフ確認: ${staffCount}件`);
  console.log(`  シニア確認: ${seniorCount}件`);

  if (dryRun) {
    // ドライラン: ファイルに保存
    const tmpDir = path.resolve(__dirname, "../../tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const dryRunPath = path.join(tmpDir, `kintone_review_dryrun_${timestamp}.json`);
    fs.writeFileSync(dryRunPath, JSON.stringify({
      mode: "dry_run",
      count: records.length,
      staff_count: staffCount,
      senior_count: seniorCount,
      generated_at: new Date().toISOString(),
      records,
    }, null, 2), "utf-8");

    console.log(`\n[DRY-RUN] ${records.length}件のレコードを保存: ${dryRunPath}`);

    // 先頭3件を表示
    for (let i = 0; i < Math.min(3, records.length); i++) {
      const rec = records[i];
      const level = rec.review_level.value;
      const desc = (rec.description.value || "").slice(0, 30);
      const amt = Number(rec.amount.value).toLocaleString();
      console.log(`  [${i + 1}] ${level} | ${amt}円 | ${desc}`);
    }
    if (records.length > 3) console.log(`  ... 他 ${records.length - 3}件`);

    return {
      sent: 0,
      records,
      errors: [],
      dry_run: true,
      dryrun_file: dryRunPath,
    };
  }

  // 本番送信
  try {
    const result = await addRecords(APP_IDS.TRANSACTION_REVIEW, records, { dryRun: false });
    console.log(`\n=== 送信結果: 成功${result.success}件 / エラー${result.errors.length}バッチ ===`);

    return {
      sent: result.success,
      records,
      errors: result.errors,
      dry_run: false,
    };
  } catch (err) {
    console.error(`Kintone送信エラー: ${err.message}`);
    return {
      sent: 0,
      records,
      errors: [{ error: err.message }],
      dry_run: false,
    };
  }
}

/**
 * 分類済み明細をKintoneレビューレコード形式に変換
 *
 * フィールドコード:
 *   txn_id, txn_date, amount, description, counterpart, wallet_name, source,
 *   account_name, tax_class, tax_code, invoice_class,
 *   confidence_score, score_breakdown, matched_keyword,
 *   route_reason, review_level, tax_flags, review_status
 */
function toReviewRecord(item) {
  const tx = item.transaction || item;
  const cls = item.classification || {};
  const routing = item.routing || {};

  // スコア内訳の文字列化
  const breakdown = cls.score_breakdown || {};
  const breakdownStr = Object.entries(breakdown)
    .map(([key, val]) => `${key}: ${val}`)
    .join(", ");

  // 消費税指摘の文字列化
  const taxFlagsStr = (cls.tax_flags || []).join("\n");

  // review_level: kintone_staff → "スタッフ", kintone_senior → "シニア"
  const reviewLevel = routing.decision === "kintone_senior" ? "シニア" : "スタッフ";

  return {
    txn_id: { value: item._freee?.wallet_txn_id || "" },
    txn_date: { value: tx.date || "" },
    amount: { value: Math.abs(tx.amount || 0) },
    description: { value: tx.description || tx.raw_text || "" },
    counterpart: { value: tx.partner_name || tx.counterpart || "" },
    wallet_name: { value: item._freee?.walletable_type || "" },
    source: { value: tx.source?.source_type || "freee_unprocessed" },
    account_name: { value: cls.estimated_account || "" },
    tax_class: { value: cls.estimated_tax_class || "" },
    tax_code: { value: cls.estimated_tax_code || "" },
    invoice_class: { value: cls.invoice_class || "" },
    confidence_score: { value: cls.confidence_score || 0 },
    score_breakdown: { value: breakdownStr },
    matched_keyword: { value: cls.matched_keyword || "" },
    route_reason: { value: routing.reason || "" },
    review_level: { value: reviewLevel },
    tax_flags: { value: taxFlagsStr },
    review_status: { value: "未レビュー" },
  };
}

// --------------------------------------------------
// 帳簿チェック指摘の送信
// --------------------------------------------------

/**
 * 帳簿チェック指摘をKintoneに送付（🔴🟡のみ）
 *
 * @param {Array} findings - 指摘事項配列
 *   各要素: { severity, category, item, amount, issue, explanation, ... }
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=true] - trueならAPI呼び出しをスキップ
 * @param {Object} [options.config] - 会社情報（company_name, periods等）
 * @returns {Promise<Object>} 送信結果
 */
async function sendCheckFindings(findings, options = {}) {
  const { dryRun = true, config = {} } = options;

  // 🔴と🟡のみ抽出
  const filtered = findings.filter(
    (f) => f.severity === "🔴" || f.severity === "🟡"
  );

  console.log(`\n=== Kintone帳簿チェック送信 ===`);
  console.log(`モード: ${dryRun ? "ドライラン" : "本番送信"}`);
  console.log(`対象: ${filtered.length}件（🔴🟡のみ / 全${findings.length}件中）`);

  if (filtered.length === 0) {
    console.log("送信対象の指摘事項はありません。");
    return {
      sent: 0,
      records: [],
      errors: [],
      dry_run: dryRun,
    };
  }

  // サマリー表示
  const critical = filtered.filter((f) => f.severity === "🔴").length;
  const warning = filtered.filter((f) => f.severity === "🟡").length;
  console.log(`  🔴要対応: ${critical}件`);
  console.log(`  🟡要確認: ${warning}件`);

  // Kintoneレコードに変換
  const today = new Date().toISOString().slice(0, 10);
  const records = filtered.map((f) => toCheckRecord(f, config, today));

  if (dryRun) {
    const tmpDir = path.resolve(__dirname, "../../tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const dryRunPath = path.join(tmpDir, `kintone_check_dryrun_${timestamp}.json`);
    fs.writeFileSync(dryRunPath, JSON.stringify({
      mode: "dry_run",
      count: records.length,
      critical_count: critical,
      warning_count: warning,
      generated_at: new Date().toISOString(),
      records,
    }, null, 2), "utf-8");

    console.log(`\n[DRY-RUN] ${records.length}件のレコードを保存: ${dryRunPath}`);

    // 先頭5件を表示
    for (const rec of records.slice(0, 5)) {
      printCheckRecord(rec);
    }
    if (records.length > 5) console.log(`  ... 他 ${records.length - 5}件`);

    return {
      sent: 0,
      records,
      errors: [],
      dry_run: true,
      dryrun_file: dryRunPath,
    };
  }

  // 本番送信
  try {
    const result = await addRecords(APP_IDS.VERIFY_CHECK, records, { dryRun: false });
    console.log(`\n=== 送信結果: 成功${result.success}件 / エラー${result.errors.length}バッチ ===`);

    return {
      sent: result.success,
      records,
      errors: result.errors,
      dry_run: false,
    };
  } catch (err) {
    console.error(`Kintone送信エラー: ${err.message}`);
    return {
      sent: 0,
      records,
      errors: [{ error: err.message }],
      dry_run: false,
    };
  }
}

/**
 * 帳簿チェック指摘をKintoneレコード形式に変換
 */
function toCheckRecord(finding, config, checkDate) {
  return {
    client_name: { value: config.company_name || "" },
    check_date: { value: checkDate },
    check_type: { value: "月次" },
    target_period: {
      value: config.periods?.current?.label || "",
    },
    severity: { value: severityToKintone(finding.severity) },
    check_category: { value: finding.category || "" },
    finding_detail: { value: finding.issue || "" },
    related_account: { value: finding.item || "" },
    related_amount: { value: finding.amount || 0 },
    action_status: { value: "未対応" },
    action_detail: { value: "" },
    notes: {
      value: [
        finding.explanation || "",
        finding.freeeLink ? `\nfreeeリンク: ${finding.freeeLink}` : "",
        finding.partnerName ? `\n取引先: ${finding.partnerName}` : "",
        finding.description ? `\n摘要: ${finding.description}` : "",
        finding.date ? `\n取引日: ${finding.date}` : "",
      ]
        .filter(Boolean)
        .join(""),
    },
  };
}

/** チェック指摘レコードをコンソールに表示（dry-run用） */
function printCheckRecord(rec) {
  const sev = rec.severity.value;
  const cat = rec.check_category.value;
  const acct = rec.related_account.value;
  const amt = Number(rec.related_amount.value).toLocaleString();
  const detail = rec.finding_detail.value;
  console.log(`  [${sev}] ${cat} | ${acct} | ${amt}円`);
  console.log(`    ${detail}`);
}

// --------------------------------------------------
// ヘルパー関数
// --------------------------------------------------

/** JSONファイルを読み込む（存在しない場合はnull） */
function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.warn(`JSON読み込みエラー: ${filePath}`, err.message);
    return null;
  }
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  sendReviewItems,
  sendCheckFindings,
  toReviewRecord,
  toCheckRecord,
};

// --------------------------------------------------
// CLI実行時（既存の帳簿チェック送信）
// --------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const includeAll = args.includes("--all");
  const severityFilter = args.find((a) => a.startsWith("--severity="));

  const dataDir = args.find((a) => !a.startsWith("--"));
  if (!dataDir) {
    console.error("使い方: node src/review/kintone-sender.js <data-dir> [--dry-run] [--all]");
    console.error("例: node src/review/kintone-sender.js data/474381/2026-03-20");
    process.exit(1);
  }

  const basePath = path.resolve(__dirname, "../..", dataDir);

  // 設定ファイル読み込み
  const config = loadJson(path.join(basePath, "config.json"));
  if (!config) {
    console.error(`config.json が見つかりません: ${basePath}`);
    process.exit(1);
  }

  console.log(`\n=== Kintone帳簿チェック送信 ===`);
  console.log(`会社: ${config.company_name} (ID: ${config.company_id})`);
  console.log(`期間: ${config.periods?.current?.label || "不明"}`);
  if (dryRun) console.log(`モード: DRY-RUN（実際には登録しません）\n`);

  // 分析結果の読み込みと統合
  const findings = [];

  // 1. 財務指摘
  const financial = loadJson(path.join(basePath, "analysis", "financial_findings.json"));
  if (financial) {
    for (const f of financial) {
      findings.push({
        source: "financial_findings",
        severity: f.severity,
        category: f.category,
        item: f.item,
        amount: f.amount,
        issue: f.issue,
        explanation: f.explanation,
        freeeLink: "",
      });
    }
    console.log(`financial_findings.json: ${financial.length}件読み込み`);
  }

  // 2. 取引レベル指摘
  const flagged = loadJson(path.join(basePath, "analysis", "flagged_transactions.json"));
  if (flagged) {
    for (const f of flagged) {
      findings.push({
        source: "flagged_transactions",
        severity: f.severity,
        category: f.category,
        item: f.accountName || f.item || "",
        amount: f.amount,
        issue: f.issue,
        explanation: f.explanation,
        date: f.date || "",
        partnerName: f.partnerName || "",
        description: f.description || "",
        freeeLink: f.freeeLink || "",
        dealId: f.dealId || "",
      });
    }
    console.log(`flagged_transactions.json: ${flagged.length}件読み込み`);
  }

  // 3. 海外サービスチェック結果
  const overseas = loadJson(path.join(basePath, "analysis", "overseas_service_tax_findings.json"));
  if (overseas) {
    for (const f of overseas) {
      findings.push({
        source: "overseas_service_tax",
        severity: f.severity || "🟡",
        category: "海外サービス消費税",
        item: f.serviceName || f.partnerName || "",
        amount: f.amount || 0,
        issue: f.issue || f.finding || "",
        explanation: f.explanation || f.recommendation || "",
        freeeLink: f.freeeLink || "",
      });
    }
    console.log(`overseas_service_tax_findings.json: ${overseas.length}件読み込み`);
  }

  // フィルタリング
  let filtered = findings;
  if (severityFilter) {
    const target = severityFilter.split("=")[1];
    filtered = findings.filter((f) => f.severity === target);
    console.log(`\nフィルター: ${target} のみ → ${filtered.length}件`);
  } else if (!includeAll) {
    filtered = findings.filter((f) => f.severity === "🔴" || f.severity === "🟡");
    console.log(`\nフィルター: 🔴要対応 + 🟡要確認 → ${filtered.length}件`);
  } else {
    console.log(`\n全件: ${filtered.length}件`);
  }

  // sendCheckFindings で送信（CLI経由）
  sendCheckFindings(filtered, { dryRun, config })
    .then((result) => {
      if (!dryRun && result.sent > 0) {
        const logPath = path.join(basePath, "analysis", "kintone_send_log.json");
        fs.writeFileSync(logPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          appId: APP_IDS.VERIFY_CHECK,
          ...result,
        }, null, 2), "utf-8");
        console.log(`ログ保存: ${logPath}`);
      }
    })
    .catch((err) => {
      console.error("エラー:", err.message);
      process.exit(1);
    });
}
