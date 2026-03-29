/**
 * Excel (.xlsx) パーサーモジュール
 *
 * ExcelJSで.xlsxファイルを読み込み、ヘッダー自動検出・列マッピング・
 * 空行/合計行スキップを行い、標準化された行データ配列を返す。
 *
 * エクスポート:
 *   - parseExcel(filePath, options): Excelファイルをパースして行データ配列を返す
 *
 * 使い方:
 *   const { parseExcel } = require("./excel-parser");
 *   const { rows, meta } = await parseExcel("data.xlsx");
 *   // rows: [{ date, amount, description, ... }, ...]
 */

const path = require("path");
const ExcelJS = require("exceljs");

// --------------------------------------------------
// ヘッダー自動検出マッピング
// --------------------------------------------------

/** ヘッダー名→標準フィールド名のマッピング */
const HEADER_MAP = {
  // 日付系
  日付: "date",
  取引日: "date",
  年月日: "date",
  発生日: "date",
  計上日: "date",
  date: "date",

  // 金額系
  金額: "amount",
  支払金額: "amount",
  入金額: "amount",
  出金額: "amount",
  税込金額: "amount",
  取引金額: "amount",
  amount: "amount",

  // 摘要系
  摘要: "description",
  内容: "description",
  備考: "description",
  明細: "description",
  取引内容: "description",
  品名: "description",
  description: "description",

  // 取引先系
  取引先: "partner_name",
  取引先名: "partner_name",
  相手先: "partner_name",
  支払先: "partner_name",
  partner: "partner_name",

  // 勘定科目系
  勘定科目: "account_hint",
  科目: "account_hint",
  科目名: "account_hint",
  account: "account_hint",

  // 税区分系
  税区分: "tax_hint",
  消費税区分: "tax_hint",
  消費税: "tax_hint",
  tax: "tax_hint",

  // 借方/貸方
  借方: "debit",
  貸方: "credit",
  借方金額: "debit",
  貸方金額: "credit",
  入金: "credit",
  出金: "debit",
};

/** 合計行を示すキーワード */
const TOTAL_KEYWORDS = [
  "合計", "小計", "総計", "total", "subtotal", "sum",
  "計", "差引", "残高",
];

// --------------------------------------------------
// メイン処理
// --------------------------------------------------

/**
 * Excelファイルをパースして行データ配列を返す
 *
 * @param {string} filePath - .xlsxファイルのパス
 * @param {Object} [options]
 * @param {Object} [options.columns] - 列マッピング { A: "date", B: "amount", ... } or { "日付": "date", ... }
 * @param {number} [options.headerRow=1] - ヘッダー行番号（1始まり）
 * @param {string} [options.sheetName] - シート名指定
 * @param {number} [options.sheetIndex] - シートインデックス（0始まり、sheetNameより優先度低）
 * @param {number} [options.startRow] - データ開始行（省略時はheaderRow+1）
 * @param {number} [options.endRow] - データ終了行（省略時は最終行）
 * @returns {Promise<{rows: Array, meta: Object}>}
 */
async function parseExcel(filePath, options = {}) {
  const {
    columns,
    headerRow = 1,
    sheetName,
    sheetIndex,
    startRow,
    endRow,
  } = options;

  const absPath = path.resolve(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absPath);

  // シート選択
  let worksheet;
  if (sheetName) {
    worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`シート「${sheetName}」が見つかりません。利用可能: ${workbook.worksheets.map((s) => s.name).join(", ")}`);
    }
  } else if (sheetIndex !== undefined) {
    worksheet = workbook.worksheets[sheetIndex];
    if (!worksheet) {
      throw new Error(`シートインデックス ${sheetIndex} が範囲外です。シート数: ${workbook.worksheets.length}`);
    }
  } else {
    worksheet = workbook.worksheets[0];
  }

  if (!worksheet) {
    throw new Error("ワークシートが見つかりません");
  }

  // 列マッピングの構築
  const colMap = buildColumnMap(worksheet, headerRow, columns);

  // データ行の読み込み
  const dataStartRow = startRow || headerRow + 1;
  const dataEndRow = endRow || worksheet.rowCount;
  const rows = [];
  let skippedEmpty = 0;
  let skippedTotal = 0;

  for (let rowNum = dataStartRow; rowNum <= dataEndRow; rowNum++) {
    const row = worksheet.getRow(rowNum);

    // 空行スキップ
    if (isEmptyRow(row, colMap)) {
      skippedEmpty++;
      continue;
    }

    // 合計行スキップ
    if (isTotalRow(row, colMap)) {
      skippedTotal++;
      continue;
    }

    // 行データの抽出
    const rowData = extractRowData(row, colMap);
    if (rowData) {
      rowData._row_number = rowNum;
      rows.push(rowData);
    }
  }

  const meta = {
    file: path.basename(absPath),
    file_path: absPath,
    sheet_name: worksheet.name,
    header_row: headerRow,
    data_start_row: dataStartRow,
    total_rows: rows.length,
    skipped_empty: skippedEmpty,
    skipped_total: skippedTotal,
    columns_detected: Object.fromEntries(
      Object.entries(colMap).map(([col, field]) => [field, col])
    ),
  };

  return { rows, meta };
}

// --------------------------------------------------
// 列マッピング構築
// --------------------------------------------------

/**
 * ヘッダー行を解析して列マッピングを構築
 * @returns {Object} { "A": "date", "B": "amount", ... } の形式
 */
function buildColumnMap(worksheet, headerRow, userColumns) {
  // ユーザー指定の列マッピングがある場合
  if (userColumns) {
    const normalized = {};
    for (const [key, field] of Object.entries(userColumns)) {
      // 列文字（A,B,C...）かヘッダー名かを判定
      if (/^[A-Z]{1,3}$/i.test(key)) {
        normalized[key.toUpperCase()] = field;
      } else {
        // ヘッダー名→列文字に変換
        const colLetter = findColumnByHeader(worksheet, headerRow, key);
        if (colLetter) {
          normalized[colLetter] = field;
        }
      }
    }
    return normalized;
  }

  // 自動検出: ヘッダー行の各セルを HEADER_MAP で照合
  const colMap = {};
  const row = worksheet.getRow(headerRow);

  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const headerText = String(cell.value || "").trim();
    if (!headerText) return;

    // 完全一致
    const normalizedHeader = headerText.toLowerCase();
    const mapped = HEADER_MAP[headerText] || HEADER_MAP[normalizedHeader];
    if (mapped) {
      const colLetter = columnNumberToLetter(colNumber);
      // 同じフィールドが既にマッピングされていなければ追加
      if (!Object.values(colMap).includes(mapped)) {
        colMap[colLetter] = mapped;
      }
      return;
    }

    // 部分一致（ヘッダーにキーワードが含まれる場合）
    for (const [keyword, field] of Object.entries(HEADER_MAP)) {
      if (headerText.includes(keyword) && !Object.values(colMap).includes(field)) {
        const colLetter = columnNumberToLetter(colNumber);
        colMap[colLetter] = field;
        break;
      }
    }
  });

  return colMap;
}

/** ヘッダー名で列文字を検索 */
function findColumnByHeader(worksheet, headerRow, headerName) {
  const row = worksheet.getRow(headerRow);
  let found = null;
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value || "").trim();
    if (text === headerName || text.includes(headerName)) {
      found = columnNumberToLetter(colNumber);
    }
  });
  return found;
}

/** 列番号→列文字変換（1→A, 2→B, ... 27→AA） */
function columnNumberToLetter(colNumber) {
  let letter = "";
  let num = colNumber;
  while (num > 0) {
    const mod = (num - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

/** 列文字→列番号変換（A→1, B→2, AA→27） */
function letterToColumnNumber(letter) {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}

// --------------------------------------------------
// 行データ抽出
// --------------------------------------------------

/** 行からマッピングに基づいてデータを抽出 */
function extractRowData(row, colMap) {
  const data = {};

  for (const [colLetter, field] of Object.entries(colMap)) {
    const colNum = letterToColumnNumber(colLetter);
    const cell = row.getCell(colNum);
    let value = getCellValue(cell);
    data[field] = value;
  }

  // 借方/貸方→amount変換
  if (data.debit !== undefined || data.credit !== undefined) {
    const debit = parseNumeric(data.debit);
    const credit = parseNumeric(data.credit);
    if (debit && debit !== 0) {
      data.amount = -Math.abs(debit); // 出金=マイナス
    } else if (credit && credit !== 0) {
      data.amount = Math.abs(credit); // 入金=プラス
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

  // dateの文字列化
  if (data.date instanceof Date) {
    data.date = formatDate(data.date);
  } else if (typeof data.date === "number") {
    // Excelシリアル値の場合
    data.date = formatDate(excelSerialToDate(data.date));
  } else if (data.date) {
    data.date = String(data.date).trim();
  }

  return data;
}

/** ExcelJSセルの値を取得 */
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return undefined;

  const val = cell.value;

  // ExcelJSのリッチテキスト
  if (val && typeof val === "object" && val.richText) {
    return val.richText.map((r) => r.text).join("");
  }

  // ExcelJSの数式結果
  if (val && typeof val === "object" && val.result !== undefined) {
    return val.result;
  }

  // ExcelJSのハイパーリンク
  if (val && typeof val === "object" && val.text !== undefined) {
    return val.text;
  }

  // ExcelJSのエラー
  if (val && typeof val === "object" && val.error) {
    return undefined;
  }

  return val;
}

// --------------------------------------------------
// 空行・合計行判定
// --------------------------------------------------

/** 空行かどうかを判定 */
function isEmptyRow(row, colMap) {
  const colNumbers = Object.keys(colMap).map(letterToColumnNumber);
  for (const colNum of colNumbers) {
    const val = getCellValue(row.getCell(colNum));
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return false;
    }
  }
  return true;
}

/** 合計行かどうかを判定 */
function isTotalRow(row, colMap) {
  const colNumbers = Object.keys(colMap).map(letterToColumnNumber);
  for (const colNum of colNumbers) {
    const val = getCellValue(row.getCell(colNum));
    if (val === undefined || val === null) continue;
    const text = String(val).trim().toLowerCase();
    for (const keyword of TOTAL_KEYWORDS) {
      if (text === keyword || text.startsWith(keyword)) {
        return true;
      }
    }
  }
  return false;
}

// --------------------------------------------------
// ユーティリティ
// --------------------------------------------------

/** 数値パース（カンマ・全角対応） */
function parseNumeric(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  // 全角→半角
  let str = String(val)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ",")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();
  // マイナス記号の正規化
  str = str.replace(/^[△▲−‐‑–—―ー]/, "-");
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

/** Excelシリアル値→Dateオブジェクト変換 */
function excelSerialToDate(serial) {
  // Excelの基準日: 1900-01-01 = 1（1900年うるう年バグ補正）
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

/** Date→YYYY-MM-DD文字列 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------
module.exports = {
  parseExcel,
  HEADER_MAP,
  TOTAL_KEYWORDS,
};
