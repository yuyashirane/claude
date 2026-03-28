/**
 * Kintone REST API クライアント
 *
 * 環境変数:
 *   KINTONE_BASE_URL  - https://{subdomain}.cybozu.com
 *   KINTONE_API_TOKEN - アプリ共通のAPIトークン（複数アプリの場合はカンマ区切り）
 *
 * 使い方:
 *   const { createKintoneClient, APP_IDS } = require("./kintone-client");
 *   const client = createKintoneClient();
 *   await client.record.addRecord({ app: APP_IDS.VERIFY_CHECK, record: { ... } });
 */

const { KintoneRestAPIClient } = require("@kintone/rest-api-client");
const path = require("path");

// dotenvで.envを読み込む
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// --------------------------------------------------
// Kintone アプリID（アプリ作成後に記入する）
// --------------------------------------------------
const APP_IDS = {
  /** 帳簿チェック結果アプリ */
  VERIFY_CHECK: Number(process.env.KINTONE_APP_VERIFY_CHECK) || 0,
  /** 仕訳レビューアプリ */
  TRANSACTION_REVIEW: Number(process.env.KINTONE_APP_TRANSACTION_REVIEW) || 0,
  /** 学習フィードバックアプリ */
  LEARNING_FEEDBACK: Number(process.env.KINTONE_APP_LEARNING_FEEDBACK) || 0,
};

/**
 * Kintone REST API クライアントを生成
 * @returns {KintoneRestAPIClient}
 */
function createKintoneClient() {
  const baseUrl = process.env.KINTONE_BASE_URL;
  const apiToken = process.env.KINTONE_API_TOKEN;

  if (!baseUrl) {
    throw new Error(
      "KINTONE_BASE_URL が未設定です。.env に KINTONE_BASE_URL=https://{subdomain}.cybozu.com を設定してください。"
    );
  }
  if (!apiToken) {
    throw new Error(
      "KINTONE_API_TOKEN が未設定です。.env に KINTONE_API_TOKEN を設定してください。"
    );
  }

  // 複数アプリのトークンをカンマ区切りで指定可能
  const tokens = apiToken.split(",").map((t) => t.trim());

  return new KintoneRestAPIClient({
    baseUrl,
    auth: tokens.length > 1 ? { apiToken: tokens } : { apiToken: tokens[0] },
  });
}

// --------------------------------------------------
// ヘルパー関数
// --------------------------------------------------

/**
 * 重要度の絵文字を Kintone ドロップダウン値に変換
 */
function severityToKintone(emoji) {
  const map = {
    "🔴": "要対応",
    "🟡": "要確認",
    "🔵": "参考",
    "🟢": "OK",
  };
  return map[emoji] || "要確認";
}

/**
 * レコードを一括登録（100件ずつ自動分割）
 * @param {KintoneRestAPIClient} client
 * @param {number} appId
 * @param {Array} records
 * @param {boolean} dryRun - trueの場合、登録せずログ出力のみ
 * @returns {Promise<{success: number, errors: Array}>}
 */
async function bulkAddRecords(client, appId, records, dryRun = false) {
  if (!appId || appId === 0) {
    throw new Error(
      "アプリIDが未設定です。.env に KINTONE_APP_VERIFY_CHECK 等を設定してください。"
    );
  }

  if (dryRun) {
    console.log(`[DRY-RUN] ${records.length}件のレコードを登録予定（アプリID: ${appId}）`);
    console.log("[DRY-RUN] 先頭レコード:", JSON.stringify(records[0], null, 2));
    return { success: records.length, errors: [] };
  }

  const errors = [];
  let successCount = 0;

  // 100件ずつバッチ処理
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    try {
      await client.record.addRecords({ app: appId, records: batch });
      successCount += batch.length;
      console.log(
        `[Kintone] バッチ ${Math.floor(i / 100) + 1}: ${batch.length}件登録成功`
      );
    } catch (err) {
      console.error(
        `[Kintone] バッチ ${Math.floor(i / 100) + 1}: エラー`,
        err.message
      );
      errors.push({
        batch: Math.floor(i / 100) + 1,
        startIndex: i,
        count: batch.length,
        error: err.message,
      });
    }
  }

  return { success: successCount, errors };
}

/**
 * レコードを一括登録（100件自動分割）— シンプルAPI
 * @param {number} appId - アプリID
 * @param {Array} records - 登録レコード配列
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - trueの場合、登録せずログ出力のみ
 * @returns {Promise<{success: number, errors: Array}>}
 */
async function addRecords(appId, records, options = {}) {
  const client = createKintoneClient();
  return bulkAddRecords(client, appId, records, options.dryRun || false);
}

/**
 * レコードを取得
 * @param {number} appId - アプリID
 * @param {string} [query] - Kintoneクエリ文字列
 * @returns {Promise<Array>}
 */
async function getRecords(appId, query) {
  const client = createKintoneClient();
  const params = { app: appId };
  if (query) params.condition = query;
  const result = await client.record.getAllRecords(params);
  return result;
}

/**
 * 接続テスト: 指定アプリの情報を取得して接続を確認
 * @param {KintoneRestAPIClient} client
 * @param {number} appId
 * @returns {Promise<boolean>}
 */
async function testConnection(client, appId) {
  try {
    const app = await client.app.getApp({ id: appId });
    console.log(`[Kintone] 接続成功: アプリ「${app.name}」(ID: ${appId})`);
    return true;
  } catch (err) {
    console.error(`[Kintone] 接続失敗 (ID: ${appId}):`, err.message);
    return false;
  }
}

module.exports = {
  createKintoneClient,
  bulkAddRecords,
  addRecords,
  getRecords,
  testConnection,
  severityToKintone,
  APP_IDS,
};
