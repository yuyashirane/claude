/**
 * freee APIデータのローカル保存モジュール
 *
 * 保存先: data/{companyId}/{YYYY-MM-DD}/
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../../data");

/**
 * 保存先ディレクトリのパスを生成
 * @param {number|string} companyId
 * @param {string} [date] - YYYY-MM-DD（省略時は今日）
 * @returns {string}
 */
function getDataDir(companyId, date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return path.join(DATA_DIR, String(companyId), d);
}

/**
 * JSONデータをファイルに保存
 * @param {number|string} companyId
 * @param {string} fileName - ファイル名（例: wallet_txns.json）
 * @param {*} data - 保存するデータ
 * @param {string} [date] - 日付（省略時は今日）
 * @returns {string} 保存先パス
 */
function saveData(companyId, fileName, data, date) {
  const dir = getDataDir(companyId, date);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[保存] ${filePath} (${JSON.stringify(data).length} bytes)`);
  return filePath;
}

/**
 * 未処理明細（wallet_txns）をJSONで保存
 * @param {number|string} companyId
 * @param {*} data - freee APIから取得した明細データ
 * @param {string} [date]
 * @returns {string} 保存先パス
 */
function saveWalletTxns(companyId, data, date) {
  return saveData(companyId, "wallet_txns.json", data, date);
}

/**
 * 勘定科目一覧を保存
 * @param {number|string} companyId
 * @param {*} data - freee APIから取得した勘定科目データ
 * @param {string} [date]
 * @returns {string} 保存先パス
 */
function saveAccountItems(companyId, data, date) {
  return saveData(companyId, "account_items.json", data, date);
}

/**
 * ローカルJSONを読み込み
 * @param {number|string} companyId
 * @param {string} fileName - ファイル名
 * @param {string} [date] - 日付（省略時は今日）
 * @returns {*|null} パース済みデータ、ファイルなしの場合はnull
 */
function loadData(companyId, fileName, date) {
  const filePath = path.join(getDataDir(companyId, date), fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`[読込] ファイルが見つかりません: ${filePath}`);
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

module.exports = {
  saveData,
  saveWalletTxns,
  saveAccountItems,
  loadData,
  getDataDir,
};
