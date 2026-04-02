/**
 * 明細データ標準化モジュール
 *
 * 多様な入力（Excel, CSV, 手入力等）を標準明細フォーマット（JSON）に変換する。
 * Claude Code のスキルから呼び出され、パース済みの行データを受け取って標準化する。
 *
 * 標準明細フォーマット:
 *   { source, transaction, client }
 *   → この後 account-matcher.js で classification が付与される
 */

const path = require("path");
const fs = require("fs");

// --------------------------------------------------
// 標準明細フォーマット生成
// --------------------------------------------------

/**
 * 1行分の明細データを標準フォーマットに変換
 *
 * @param {Object} raw - パース済みの行データ
 * @param {string} raw.date - 取引日（YYYY-MM-DD, YYYY/MM/DD, MM/DD 等）
 * @param {number|string} raw.amount - 金額
 * @param {string} [raw.description] - 摘要・内容
 * @param {string} [raw.partner_name] - 取引先名
 * @param {string} [raw.account_hint] - 勘定科目ヒント（元データに記載があれば）
 * @param {string} [raw.tax_hint] - 税区分ヒント
 * @param {string} [raw.debit_credit] - 借方/貸方（income/expense）
 * @param {Object} meta - メタ情報
 * @param {string} meta.source_type - 入力元種別（excel/csv/spreadsheet/manual/freee_unprocessed）
 * @param {string} [meta.file_name] - 元ファイル名
 * @param {number} [meta.row_number] - 元データの行番号
 * @param {Object} meta.client - 顧問先情報 { company_id, client_name }
 * @returns {Object} 標準明細フォーマット
 */
function standardizeRow(raw, meta) {
  const date = normalizeDate(raw.date);
  const amount = normalizeAmount(raw.amount);

  // バリデーション
  const errors = [];
  if (!date) errors.push("日付が不正です");
  if (amount === null || isNaN(amount)) errors.push("金額が不正です");
  if (!raw.description && !raw.partner_name) {
    errors.push("摘要または取引先名が必要です");
  }

  return {
    source: {
      type: meta.source_type || "unknown",
      file_name: meta.file_name || "",
      row_number: meta.row_number || 0,
      processed_at: new Date().toISOString(),
    },
    transaction: {
      date: date || "",
      amount: amount || 0,
      amount_type: raw.amount_type || "tax_included",
      description: normalizeDescription(raw.description || ""),
      partner_name: normalizePartnerName(raw.partner_name || ""),
      debit_credit: normalizeDebitCredit(raw.debit_credit),
      raw_text: raw.raw_text || raw.description || "",
      account_hint: raw.account_hint || "",
      tax_hint: raw.tax_hint || "",
    },
    client: {
      company_id: meta.client?.company_id || 0,
      client_name: meta.client?.client_name || "",
    },
    // classification は account-matcher.js で付与される
    classification: null,
    // バリデーションエラー
    validation_errors: errors,
    is_valid: errors.length === 0,
  };
}

/**
 * 複数行のデータを一括標準化
 *
 * @param {Array<Object>} rows - パース済みの行データ配列
 * @param {Object} meta - 共通メタ情報
 * @returns {{ valid: Array, invalid: Array, summary: Object }}
 */
function standardizeRows(rows, meta) {
  const results = rows.map((row, i) =>
    standardizeRow(row, { ...meta, row_number: row.row_number || i + 1 })
  );

  const valid = results.filter((r) => r.is_valid);
  const invalid = results.filter((r) => !r.is_valid);

  return {
    valid,
    invalid,
    summary: {
      total: results.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      total_amount: valid.reduce((s, r) => s + Math.abs(r.transaction.amount), 0),
      source_type: meta.source_type,
      file_name: meta.file_name,
      processed_at: new Date().toISOString(),
    },
  };
}

// --------------------------------------------------
// freee未処理明細 → StandardRow変換
// --------------------------------------------------

/**
 * freee未処理明細を標準行に変換
 * rule_matched=true（自動仕訳ルール適用済み）またはstatus=2（登録済み）はスキップ
 *
 * @param {Array} walletTxns - freee wallet_txnsのレスポンス配列
 * @returns {{ rows: Array, skipped: Array, summary: Object }}
 */
function standardizeFreeeWalletTxns(walletTxns) {
  if (!Array.isArray(walletTxns)) return { rows: [], skipped: [], summary: { total: 0, converted: 0, skipped: 0 } };

  const rows = [];
  const skipped = [];

  for (const txn of walletTxns) {
    // freeeファースト: 自動仕訳ルール適用済み or 登録済みはスキップ
    if (txn.rule_matched === true || txn.status === 2) {
      skipped.push({
        id: txn.id,
        reason: txn.rule_matched ? "rule_matched" : "already_registered",
        description: txn.description || "",
      });
      continue;
    }

    rows.push({
      id: txn.id,
      source: "freee_wallet_txn",
      date: txn.date || "",
      amount: txn.amount || 0,
      description: txn.description || "",
      counterpart: txn.walletable_name || txn.partner_name || "",
      walletName: txn.wallet_name || "",
      walletable_type: txn.walletable_type || "",
      walletable_id: txn.walletable_id || "",
      rawData: txn,
      rule_matched: txn.rule_matched || false,
    });
  }

  return {
    rows,
    skipped,
    summary: {
      total: walletTxns.length,
      converted: rows.length,
      skipped: skipped.length,
    },
  };
}

// --------------------------------------------------
// 文字列変換ヘルパー
// --------------------------------------------------

/**
 * 全角→半角変換（カタカナの長音「ー」は変換しない）
 * 全角英数字・記号を半角に変換する
 * @param {string} str
 * @returns {string}
 */
function toHalfWidth(str) {
  if (!str) return "";
  return String(str).replace(/[！-～]/g, (c) => {
    const code = c.charCodeAt(0) - 0xfee0;
    return String.fromCharCode(code);
  }).replace(/　/g, " "); // 全角スペース→半角
  // 注: カタカナ長音「ー」(U+30FC)は全角英数記号の範囲外なので変換されない
}

/**
 * 金額文字列を数値に変換（全角対応、△負数、括弧負数）
 * @param {string|number} val
 * @returns {number|null}
 */
function parseAmount(val) {
  return normalizeAmount(val);
}

// --------------------------------------------------
// 正規化ヘルパー
// --------------------------------------------------

/**
 * 日付を YYYY-MM-DD 形式に正規化
 */
function normalizeDate(input) {
  if (!input) return null;
  const str = String(input).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // YYYY/MM/DD
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM/DD（当年として扱う）
  if (/^\d{1,2}\/\d{1,2}$/.test(str)) {
    const [m, d] = str.split("/");
    const y = new Date().getFullYear();
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 令和/平成/昭和 対応
  const warekiMatch = str.match(/(?:令和|R)(\d+)[年/.-](\d+)[月/.-](\d+)/);
  if (warekiMatch) {
    const y = 2018 + parseInt(warekiMatch[1]);
    return `${y}-${warekiMatch[2].padStart(2, "0")}-${warekiMatch[3].padStart(2, "0")}`;
  }

  // Excel数値（シリアル値）
  if (/^\d{5}$/.test(str)) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + parseInt(str) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // Date オブジェクト
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * 金額を数値に正規化
 */
function normalizeAmount(input) {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return input;

  let str = String(input).trim();
  // 全角数字→半角
  str = str.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  // 円マーク・通貨記号を除去
  str = str.replace(/[¥￥$＄円]/g, "");
  // カンマ除去（半角・全角両方）
  str = str.replace(/[,，]/g, "");
  // △やマイナス表記
  str = str.replace(/^[△▲]/, "-");
  // 括弧で囲まれた数値はマイナス
  const parenMatch = str.match(/^\((.+)\)$/);
  if (parenMatch) str = "-" + parenMatch[1];

  const num = parseFloat(str);
  return isNaN(num) ? null : Math.round(num); // 整数に丸める
}

/**
 * 摘要テキストを正規化
 */
function normalizeDescription(input) {
  if (!input) return "";
  let str = String(input).trim();
  // 連続空白を1つに
  str = str.replace(/\s+/g, " ");
  // 全角スペースを半角に
  str = str.replace(/　/g, " ");
  return str;
}

/**
 * 取引先名を正規化
 */
function normalizePartnerName(input) {
  if (!input) return "";
  let str = String(input).trim();
  // 全角スペースを半角に
  str = str.replace(/　/g, " ");
  // 前後の空白除去
  str = str.trim();
  return str;
}

/**
 * 借方/貸方を正規化
 */
function normalizeDebitCredit(input) {
  if (!input) return "expense"; // デフォルトは支出
  const str = String(input).trim().toLowerCase();
  if (["income", "収入", "売上", "入金", "貸方", "credit"].includes(str))
    return "income";
  return "expense";
}

// --------------------------------------------------
// ファイル入出力
// --------------------------------------------------

/**
 * 標準化結果をJSONファイルに保存
 */
function saveStandardized(result, outputDir, prefix = "standardized") {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  const validPath = path.join(outputDir, `${prefix}_valid_${timestamp}.json`);
  const invalidPath = path.join(outputDir, `${prefix}_invalid_${timestamp}.json`);
  const summaryPath = path.join(outputDir, `${prefix}_summary_${timestamp}.json`);

  fs.writeFileSync(validPath, JSON.stringify(result.valid, null, 2), "utf-8");
  fs.writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2), "utf-8");

  if (result.invalid.length > 0) {
    fs.writeFileSync(invalidPath, JSON.stringify(result.invalid, null, 2), "utf-8");
  }

  console.log(`[標準化] 有効: ${result.valid.length}件 → ${validPath}`);
  if (result.invalid.length > 0) {
    console.log(`[標準化] 無効: ${result.invalid.length}件 → ${invalidPath}`);
  }

  return { validPath, invalidPath, summaryPath };
}

module.exports = {
  standardizeRow,
  standardizeRows,
  standardizeFreeeWalletTxns,
  saveStandardized,
  toHalfWidth,
  parseAmount,
  normalizeDate,
  normalizeAmount,
  normalizeDescription,
  normalizePartnerName,
  normalizeDebitCredit,
};
