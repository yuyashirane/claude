/**
 * CSV/TSV パーサーモジュール
 *
 * CSV/TSVファイルを読み込み、文字コード自動判定・区切り文字自動判定・
 * ヘッダー自動検出・空行/合計行スキップを行い、標準化された行データ配列を返す。
 *
 * 文字コード判定順序:
 *   1. UTF-8 BOM検出
 *   2. UTF-8マルチバイト厳密検証
 *   3. Shift_JIS判定
 *   4. EUC-JP判定
 *   5. フォールバック: UTF-8
 *
 * エクスポート:
 *   - parseCsv(filePath, options): CSV/TSVファイルをパースして行データ配列を返す
 *   - detectEncoding(buffer): 文字コード自動判定
 *
 * 使い方:
 *   const { parseCsv } = require("./csv-parser");
 *   const { rows, meta } = await parseCsv("data.csv");
 */

const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

// excel-parser.jsからヘッダーマッピングと合計行キーワードを共有
const { HEADER_MAP, TOTAL_KEYWORDS } = require("./excel-parser");

// --------------------------------------------------
// メイン処理
// --------------------------------------------------

/**
 * CSV/TSVファイルをパースして行データ配列を返す
 *
 * @param {string} filePath - CSV/TSVファイルのパス
 * @param {Object} [options]
 * @param {string} [options.encoding] - 文字コード指定（省略時は自動判定）
 * @param {string} [options.delimiter] - 区切り文字指定（省略時は自動判定）
 * @param {Object} [options.columns] - 列マッピング { "日付": "date", ... } or { "A": "date", ... }
 * @param {number} [options.headerRow=1] - ヘッダー行番号（1始まり）
 * @param {number} [options.startRow] - データ開始行（省略時はheaderRow+1）
 * @param {number} [options.endRow] - データ終了行（省略時は最終行）
 * @returns {Promise<{rows: Array, meta: Object}>}
 */
async function parseCsv(filePath, options = {}) {
  const {
    encoding: userEncoding,
    delimiter: userDelimiter,
    columns,
    headerRow = 1,
    startRow,
    endRow,
  } = options;

  const absPath = path.resolve(filePath);
  const rawBuffer = fs.readFileSync(absPath);

  // 文字コード判定・変換
  const encoding = userEncoding || detectEncoding(rawBuffer);
  let text;
  if (encoding === "utf-8") {
    // BOM除去
    text = rawBuffer.toString("utf-8");
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
  } else {
    text = iconv.decode(rawBuffer, encoding);
  }

  // 改行コード正規化
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 区切り文字判定
  const delimiter = userDelimiter || detectDelimiter(text);

  // RFC4180準拠パース
  const allLines = parseRfc4180(text, delimiter);

  if (allLines.length === 0) {
    return {
      rows: [],
      meta: { file: path.basename(absPath), encoding, delimiter: delimiterName(delimiter), total_rows: 0 },
    };
  }

  // 列マッピング構築
  const headerFields = allLines[headerRow - 1] || [];
  const colMap = buildColumnMap(headerFields, columns);

  // データ行の読み込み
  const dataStartRow = startRow || headerRow + 1;
  const dataEndRow = endRow || allLines.length;
  const rows = [];
  let skippedEmpty = 0;
  let skippedTotal = 0;

  for (let i = dataStartRow - 1; i < dataEndRow && i < allLines.length; i++) {
    const fields = allLines[i];

    // 空行スキップ
    if (isEmptyLine(fields, colMap)) {
      skippedEmpty++;
      continue;
    }

    // 合計行スキップ
    if (isTotalLine(fields, colMap)) {
      skippedTotal++;
      continue;
    }

    // 行データの抽出
    const rowData = extractRowData(fields, colMap);
    if (rowData) {
      rowData._row_number = i + 1;
      rows.push(rowData);
    }
  }

  const meta = {
    file: path.basename(absPath),
    file_path: absPath,
    encoding,
    delimiter: delimiterName(delimiter),
    header_row: headerRow,
    data_start_row: dataStartRow,
    total_lines: allLines.length,
    total_rows: rows.length,
    skipped_empty: skippedEmpty,
    skipped_total: skippedTotal,
    columns_detected: Object.fromEntries(
      Object.entries(colMap).map(([idx, field]) => [field, Number(idx)])
    ),
  };

  return { rows, meta };
}

// --------------------------------------------------
// 文字コード自動判定
// --------------------------------------------------

/**
 * バッファの文字コードを自動判定
 *
 * 判定順序:
 *   1. UTF-8 BOM (EF BB BF)
 *   2. UTF-8マルチバイト厳密検証
 *   3. Shift_JIS判定
 *   4. EUC-JP判定
 *   5. フォールバック: UTF-8
 *
 * @param {Buffer} buffer
 * @returns {string} エンコーディング名（utf-8, Shift_JIS, EUC-JP）
 */
function detectEncoding(buffer) {
  if (!buffer || buffer.length === 0) return "utf-8";

  // 1. UTF-8 BOM検出
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8";
  }

  // 2. UTF-8マルチバイト厳密検証
  if (isValidUtf8WithMultibyte(buffer)) {
    return "utf-8";
  }

  // 3. Shift_JIS判定
  if (looksLikeShiftJis(buffer)) {
    return "Shift_JIS";
  }

  // 4. EUC-JP判定
  if (looksLikeEucJp(buffer)) {
    return "EUC-JP";
  }

  // 5. フォールバック
  return "utf-8";
}

/**
 * UTF-8マルチバイトの厳密検証
 * マルチバイトシーケンスが1つ以上あり、全て正しいUTF-8であればtrue
 */
function isValidUtf8WithMultibyte(buffer) {
  let i = 0;
  let hasMultibyte = false;
  const len = buffer.length;

  while (i < len) {
    const b = buffer[i];

    if (b <= 0x7f) {
      // ASCII
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      // 2バイトシーケンス (110xxxxx 10xxxxxx)
      if (i + 1 >= len || (buffer[i + 1] & 0xc0) !== 0x80) return false;
      // オーバーロングチェック
      const cp = ((b & 0x1f) << 6) | (buffer[i + 1] & 0x3f);
      if (cp < 0x80) return false;
      hasMultibyte = true;
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      // 3バイトシーケンス (1110xxxx 10xxxxxx 10xxxxxx)
      if (i + 2 >= len) return false;
      if ((buffer[i + 1] & 0xc0) !== 0x80 || (buffer[i + 2] & 0xc0) !== 0x80) return false;
      const cp = ((b & 0x0f) << 12) | ((buffer[i + 1] & 0x3f) << 6) | (buffer[i + 2] & 0x3f);
      if (cp < 0x800) return false;
      hasMultibyte = true;
      i += 3;
    } else if ((b & 0xf8) === 0xf0) {
      // 4バイトシーケンス (11110xxx 10xxxxxx 10xxxxxx 10xxxxxx)
      if (i + 3 >= len) return false;
      if ((buffer[i + 1] & 0xc0) !== 0x80 || (buffer[i + 2] & 0xc0) !== 0x80 || (buffer[i + 3] & 0xc0) !== 0x80) return false;
      const cp = ((b & 0x07) << 18) | ((buffer[i + 1] & 0x3f) << 12) | ((buffer[i + 2] & 0x3f) << 6) | (buffer[i + 3] & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) return false;
      hasMultibyte = true;
      i += 4;
    } else {
      // 不正なUTF-8先頭バイト
      return false;
    }
  }

  return hasMultibyte;
}

/**
 * Shift_JIS判定
 * 全角文字のバイトパターンを検査
 */
function looksLikeShiftJis(buffer) {
  let sjisCount = 0;
  let invalidCount = 0;
  const len = buffer.length;

  for (let i = 0; i < len; i++) {
    const b = buffer[i];

    // Shift_JIS第1バイト: 0x81-0x9F, 0xE0-0xFC
    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) {
      if (i + 1 < len) {
        const b2 = buffer[i + 1];
        // Shift_JIS第2バイト: 0x40-0x7E, 0x80-0xFC
        if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
          sjisCount++;
          i++; // 2バイト消費
        } else {
          invalidCount++;
        }
      }
    } else if (b >= 0xa1 && b <= 0xdf) {
      // 半角カナ（Shift_JIS）
      sjisCount++;
    }
  }

  return sjisCount > 0 && invalidCount <= sjisCount * 0.1;
}

/**
 * EUC-JP判定
 * 全角文字のバイトパターンを検査
 */
function looksLikeEucJp(buffer) {
  let eucCount = 0;
  let invalidCount = 0;
  const len = buffer.length;

  for (let i = 0; i < len; i++) {
    const b = buffer[i];

    // EUC-JP第1バイト: 0xA1-0xFE
    if (b >= 0xa1 && b <= 0xfe) {
      if (i + 1 < len) {
        const b2 = buffer[i + 1];
        // EUC-JP第2バイト: 0xA1-0xFE
        if (b2 >= 0xa1 && b2 <= 0xfe) {
          eucCount++;
          i++;
        } else {
          invalidCount++;
        }
      }
    } else if (b === 0x8e) {
      // 半角カナ（EUC-JP SS2）
      if (i + 1 < len && buffer[i + 1] >= 0xa1 && buffer[i + 1] <= 0xdf) {
        eucCount++;
        i++;
      }
    }
  }

  return eucCount > 0 && invalidCount <= eucCount * 0.1;
}

// --------------------------------------------------
// 区切り文字自動判定
// --------------------------------------------------

/**
 * テキストから区切り文字を自動判定
 * タブ数 > カンマ数 ならTSV
 */
function detectDelimiter(text) {
  // 先頭10行で判定
  const sampleLines = text.split("\n").slice(0, 10).join("\n");

  const tabCount = (sampleLines.match(/\t/g) || []).length;
  const commaCount = (sampleLines.match(/,/g) || []).length;

  return tabCount > commaCount ? "\t" : ",";
}

/** 区切り文字の表示名 */
function delimiterName(delim) {
  return delim === "\t" ? "TAB" : "COMMA";
}

// --------------------------------------------------
// RFC4180準拠パーサー
// --------------------------------------------------

/**
 * RFC4180準拠のCSVパース
 * ダブルクォートで囲まれたフィールド内の改行・カンマ・ダブルクォートに対応
 */
function parseRfc4180(text, delimiter) {
  const lines = [];
  let currentFields = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // エスケープされたダブルクォート
          currentField += '"';
          i += 2;
        } else {
          // クォート終了
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"' && currentField === "") {
        // クォート開始
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        // フィールド区切り
        currentFields.push(currentField.trim());
        currentField = "";
        i++;
      } else if (ch === "\n") {
        // 行区切り
        currentFields.push(currentField.trim());
        if (currentFields.some((f) => f !== "")) {
          lines.push(currentFields);
        }
        currentFields = [];
        currentField = "";
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // 最終行の処理
  if (currentField !== "" || currentFields.length > 0) {
    currentFields.push(currentField.trim());
    if (currentFields.some((f) => f !== "")) {
      lines.push(currentFields);
    }
  }

  return lines;
}

// --------------------------------------------------
// 列マッピング構築
// --------------------------------------------------

/**
 * ヘッダーフィールド配列から列マッピングを構築
 * @param {string[]} headerFields - ヘッダー行のフィールド配列
 * @param {Object} [userColumns] - ユーザー指定の列マッピング
 * @returns {Object} { "0": "date", "1": "amount", ... } インデックス→フィールド名
 */
function buildColumnMap(headerFields, userColumns) {
  if (userColumns) {
    const normalized = {};
    for (const [key, field] of Object.entries(userColumns)) {
      // 列文字（A,B,C...）
      if (/^[A-Z]{1,3}$/i.test(key)) {
        const idx = letterToIndex(key.toUpperCase());
        normalized[String(idx)] = field;
      } else {
        // ヘッダー名で検索
        const idx = headerFields.findIndex(
          (h) => h === key || h.includes(key) || key.includes(h)
        );
        if (idx >= 0) {
          normalized[String(idx)] = field;
        }
      }
    }
    return normalized;
  }

  // 自動検出
  const colMap = {};
  for (let i = 0; i < headerFields.length; i++) {
    const headerText = headerFields[i].trim();
    if (!headerText) continue;

    const normalizedHeader = headerText.toLowerCase();

    // 完全一致
    const mapped = HEADER_MAP[headerText] || HEADER_MAP[normalizedHeader];
    if (mapped && !Object.values(colMap).includes(mapped)) {
      colMap[String(i)] = mapped;
      continue;
    }

    // 部分一致
    for (const [keyword, field] of Object.entries(HEADER_MAP)) {
      if (headerText.includes(keyword) && !Object.values(colMap).includes(field)) {
        colMap[String(i)] = field;
        break;
      }
    }
  }

  return colMap;
}

/** 列文字→0始まりインデックス（A→0, B→1, AA→26） */
function letterToIndex(letter) {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num - 1;
}

// --------------------------------------------------
// 行データ抽出
// --------------------------------------------------

/** フィールド配列からマッピングに基づいてデータを抽出 */
function extractRowData(fields, colMap) {
  const data = {};

  for (const [idxStr, field] of Object.entries(colMap)) {
    const idx = Number(idxStr);
    const val = idx < fields.length ? fields[idx] : undefined;
    if (val !== undefined && val !== "") {
      data[field] = val;
    }
  }

  // 借方/貸方→amount変換
  if (data.debit !== undefined || data.credit !== undefined) {
    const debit = parseNumeric(data.debit);
    const credit = parseNumeric(data.credit);
    if (debit && debit !== 0) {
      data.amount = -Math.abs(debit);
    } else if (credit && credit !== 0) {
      data.amount = Math.abs(credit);
    }
    delete data.debit;
    delete data.credit;
  }

  // amountの数値化
  if (data.amount !== undefined) {
    data.amount = parseNumeric(data.amount);
  }

  // date/amountのどちらもなければ無効行
  if (data.date === undefined && data.amount === undefined) {
    return null;
  }

  // dateのトリム
  if (data.date) {
    data.date = String(data.date).trim();
  }

  return data;
}

// --------------------------------------------------
// 判定ヘルパー
// --------------------------------------------------

/** 空行判定 */
function isEmptyLine(fields, colMap) {
  const indices = Object.keys(colMap).map(Number);
  for (const idx of indices) {
    if (idx < fields.length && fields[idx] && fields[idx].trim() !== "") {
      return false;
    }
  }
  return true;
}

/** 合計行判定 */
function isTotalLine(fields, colMap) {
  const indices = Object.keys(colMap).map(Number);
  for (const idx of indices) {
    if (idx >= fields.length) continue;
    const text = (fields[idx] || "").trim().toLowerCase();
    for (const keyword of TOTAL_KEYWORDS) {
      if (text === keyword || text.startsWith(keyword)) {
        return true;
      }
    }
  }
  return false;
}

/** 数値パース（カンマ・全角対応） */
function parseNumeric(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  let str = String(val)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ",")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();
  str = str.replace(/^[△▲−‐‑–—―ー]/, "-");
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  parseCsv,
  detectEncoding,
  detectDelimiter,
  parseRfc4180,
};
