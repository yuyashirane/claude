'use strict';

/**
 * company-resolver.js — 顧問先名からfreee company IDを解決する
 *
 * 解決順序（同期版 resolveCompanyId）:
 *   1. ローカルマッピングファイル（data/company-map.json）を検索
 *   2. 完全一致 → 部分一致（あいまい検索）
 *   3. 見つからない場合は null を返す
 *
 * 解決順序（非同期版 resolveCompanyIdAsync）:
 *   1. ローカルマッピングファイル（data/company-map.json）を検索
 *   2. Kintone顧客カルテ（App ID: 206）から検索
 *      → ヒットしたら company-map.json に自動追加
 *   3. freee-MCPは Claude Code が直接呼ぶため、ここでは未解決を返す
 *
 * Kintone顧客カルテ フィールドマッピング:
 *   - 顧客名（検索用）: フィールドコード「顧客名」
 *   - 顧客名（表示用）: フィールドコード「顧客名_重複可」
 *   - freee事業所ID:    フィールドコード「company_id」
 *   - レコード番号:      フィールドコード「レコード番号」
 *
 * @module company-resolver
 */

const path = require('path');
const fs = require('fs');

// ── 定数 ──

const MAP_PATH = path.join(__dirname, '../../data/company-map.json');

// Kintone顧客カルテ（App 206）のフィールドコード
const KINTONE_FIELD = {
  CUSTOMER_NAME_KEY: '顧客名',        // 検索キー
  CUSTOMER_NAME: '顧客名_重複可',     // 表示用顧客名
  COMPANY_ID: 'company_id',            // freee事業所ID
  RECORD_NUMBER: 'レコード番号',       // レコード番号
};

// ── 同期版（既存互換） ──

/**
 * 顧問先名からfreee company IDを解決する（同期・ローカルのみ）
 *
 * @param {string} companyName - 顧問先名（部分一致OK）
 * @returns {{ companyId: string, companyName: string } | null}
 */
function resolveCompanyId(companyName) {
  if (!companyName) return null;

  // 1. ローカルマッピングファイルを読み込み
  if (!fs.existsSync(MAP_PATH)) return null;

  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  // map の形式: { "474381": "あしたの会計事務所税理士法人", ... }

  // 2. 完全一致
  for (const [id, name] of Object.entries(map)) {
    if (name === companyName) return { companyId: id, companyName: name };
  }

  // 3. 部分一致（入力が名前に含まれる or 名前が入力に含まれる）
  const normalized = companyName.toLowerCase();
  for (const [id, name] of Object.entries(map)) {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes(normalized) || normalized.includes(normalizedName)) {
      return { companyId: id, companyName: name };
    }
  }

  return null;
}

/**
 * 登録済みの全顧問先一覧を返す
 * @returns {Array<{ companyId: string, companyName: string }>}
 */
function listCompanies() {
  if (!fs.existsSync(MAP_PATH)) return [];

  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  return Object.entries(map).map(([id, name]) => ({ companyId: id, companyName: name }));
}

// ── company-map.json 操作 ──

/**
 * company-map.json にエントリを追加する
 * 既に存在する場合はスキップ
 *
 * @param {string} companyId - freee事業所ID
 * @param {string} companyName - 顧問先名
 * @returns {boolean} 追加した場合 true、既存でスキップした場合 false
 */
function addToCompanyMap(companyId, companyName) {
  let map = {};
  if (fs.existsSync(MAP_PATH)) {
    map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  }

  // 既に存在する場合はスキップ
  if (map[String(companyId)]) return false;

  map[String(companyId)] = companyName;

  // ディレクトリが存在しない場合は作成
  const dir = path.dirname(MAP_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8');
  return true;
}

// ── Kintone 連携 ──

/**
 * Kintone REST APIクライアントを取得する
 * .envにKintone設定がない場合は null を返す（エラーにしない）
 *
 * @returns {{ client: KintoneRestAPIClient, appId: string } | null}
 */
function getKintoneClient() {
  // dotenvを安全に読み込み（既に読み込み済みでも問題なし）
  try {
    require('dotenv').config();
  } catch (_) {
    // dotenvがなくても続行
  }

  const baseUrl = (process.env.KINTONE_BASE_URL || '').trim();
  const apiToken = (process.env.KINTONE_API_TOKEN_CUSTOMERS || '').trim();
  const appId = (process.env.KINTONE_APP_ID_CUSTOMERS || '').trim();

  if (!baseUrl || !apiToken || !appId) return null;

  try {
    const { KintoneRestAPIClient } = require('@kintone/rest-api-client');
    const client = new KintoneRestAPIClient({
      baseUrl,
      auth: { apiToken },
    });
    return { client, appId };
  } catch (_) {
    return null;
  }
}

/**
 * Kintone顧客カルテから顧問先名で検索する
 *
 * @param {string} companyName - 検索する顧問先名
 * @returns {Promise<{ companyId: string, companyName: string, recordId: string } | null>}
 *   companyId が空文字の場合 = Kintoneにレコードはあるが freee ID 未登録
 *   → { companyId: '', companyName: '...', recordId: '...' } を返す
 */
async function searchKintoneCustomer(companyName) {
  const kintone = getKintoneClient();
  if (!kintone) return null;

  const { client, appId } = kintone;

  try {
    // 顧客名（検索キー）と顧客名（表示用）の両方で部分一致検索
    const query = `${KINTONE_FIELD.CUSTOMER_NAME_KEY} like "${companyName}" or ${KINTONE_FIELD.CUSTOMER_NAME} like "${companyName}" order by レコード番号 asc limit 10`;

    const resp = await client.record.getRecords({
      app: appId,
      query,
      fields: [
        KINTONE_FIELD.RECORD_NUMBER,
        KINTONE_FIELD.CUSTOMER_NAME_KEY,
        KINTONE_FIELD.CUSTOMER_NAME,
        KINTONE_FIELD.COMPANY_ID,
      ],
    });

    if (!resp.records || resp.records.length === 0) return null;

    // 最初のレコードを使用
    const record = resp.records[0];
    const recordId = record[KINTONE_FIELD.RECORD_NUMBER].value;
    const name = record[KINTONE_FIELD.CUSTOMER_NAME].value || record[KINTONE_FIELD.CUSTOMER_NAME_KEY].value;
    const freeeCompanyId = (record[KINTONE_FIELD.COMPANY_ID].value || '').trim();

    return {
      companyId: freeeCompanyId,
      companyName: name,
      recordId,
    };
  } catch (e) {
    // Kintone接続エラーはスキップ（メインフローを止めない）
    if (process.env.DEBUG) {
      console.error('[company-resolver] Kintone検索エラー:', e.message);
    }
    return null;
  }
}

/**
 * Kintone顧客カルテの freee事業所IDフィールドを更新する
 *
 * @param {string} recordId - Kintoneのレコード番号
 * @param {string} companyId - freee事業所ID
 * @returns {Promise<boolean>} 成功時 true
 */
async function writeCompanyIdToKintone(recordId, companyId) {
  const kintone = getKintoneClient();
  if (!kintone) {
    throw new Error('Kintone接続設定がありません（.envを確認してください）');
  }

  const { client, appId } = kintone;

  // まず現在の値を確認（既に値がある場合は上書きしない）
  const resp = await client.record.getRecord({
    app: appId,
    id: recordId,
  });

  const currentValue = (resp.record[KINTONE_FIELD.COMPANY_ID].value || '').trim();
  if (currentValue) {
    throw new Error(`レコード ${recordId} には既にfreee事業所ID（${currentValue}）が設定されています。上書きは行いません。`);
  }

  await client.record.updateRecord({
    app: appId,
    id: recordId,
    record: {
      [KINTONE_FIELD.COMPANY_ID]: { value: String(companyId) },
    },
  });

  return true;
}

// ── 非同期版（Kintone検索付き） ──

/**
 * 顧問先名からfreee company IDを解決する（非同期・Kintone検索付き）
 *
 * 解決フロー:
 *   1. company-map.json（ローカル）→ source: 'local'
 *   2. Kintone顧客カルテ → source: 'kintone'（company-map.jsonにも自動追加）
 *   3. Kintone顧客カルテにレコードはあるがfreee IDが未登録 → source: 'kintone-no-id'
 *   4. 見つからない → null
 *
 * @param {string} companyName - 顧問先名
 * @returns {Promise<{ companyId: string, companyName: string, source: string, recordId?: string } | null>}
 */
async function resolveCompanyIdAsync(companyName) {
  if (!companyName) return null;

  // Step 1: ローカルマッピング（同期版と同じ）
  const local = resolveCompanyId(companyName);
  if (local) return { ...local, source: 'local' };

  // Step 2: Kintone顧客カルテ検索
  const kintoneResult = await searchKintoneCustomer(companyName);
  if (kintoneResult) {
    if (kintoneResult.companyId) {
      // freee事業所IDが登録済み → company-map.json に自動追加
      addToCompanyMap(kintoneResult.companyId, kintoneResult.companyName);
      return {
        companyId: kintoneResult.companyId,
        companyName: kintoneResult.companyName,
        recordId: kintoneResult.recordId,
        source: 'kintone',
      };
    } else {
      // Kintoneにレコードはあるがfreee IDが未登録
      return {
        companyId: '',
        companyName: kintoneResult.companyName,
        recordId: kintoneResult.recordId,
        source: 'kintone-no-id',
      };
    }
  }

  // Step 3: freee-MCP は Claude Code が直接呼ぶため、ここでは null を返す
  return null;
}

// ── module.exports ──

module.exports = {
  // 同期版（既存互換）
  resolveCompanyId,
  listCompanies,
  // 非同期版（Kintone連携）
  resolveCompanyIdAsync,
  searchKintoneCustomer,
  writeCompanyIdToKintone,
  addToCompanyMap,
  // 定数
  KINTONE_FIELD,
};

// ── CLI ──

if (require.main === module) {
  const args = process.argv.slice(2);

  // --search "顧問先名"
  const searchIdx = args.indexOf('--search');
  if (searchIdx !== -1 && args[searchIdx + 1]) {
    const name = args[searchIdx + 1];
    resolveCompanyIdAsync(name)
      .then((result) => {
        if (!result) {
          console.error(`❌ 「${name}」に該当する顧客がKintone顧客カルテに見つかりません`);
          process.exit(1);
        }

        if (result.source === 'local') {
          console.log(`✅ ${result.companyName} → company ID: ${result.companyId}（ソース: company-map.json）`);
        } else if (result.source === 'kintone') {
          console.log(`✅ ${result.companyName} → company ID: ${result.companyId}（ソース: Kintone顧客カルテ）`);
          console.log(`   → data/company-map.json に追加しました`);
        } else if (result.source === 'kintone-no-id') {
          console.log(`⚠️ 「${result.companyName}」のfreee事業所IDがKintone顧客カルテに未登録です（レコードID: ${result.recordId}）`);
          console.log(`   → freee-MCPで事業所一覧を検索してください`);
          console.log(`   → 判明後: node src/shared/company-resolver.js --write-kintone ${result.recordId} {companyId}`);
          process.exit(1);
        }
      })
      .catch((e) => {
        console.error(`エラー: ${e.message}`);
        process.exit(1);
      });
    return;
  }

  // --write-kintone {recordId} {companyId}
  const writeIdx = args.indexOf('--write-kintone');
  if (writeIdx !== -1 && args[writeIdx + 1] && args[writeIdx + 2]) {
    const recordId = args[writeIdx + 1];
    const companyId = args[writeIdx + 2];

    writeCompanyIdToKintone(recordId, companyId)
      .then(() => {
        console.log(`✅ Kintone顧客カルテ（レコードID: ${recordId}）に freee_company_id: ${companyId} を書き込みました`);
      })
      .catch((e) => {
        console.error(`エラー: ${e.message}`);
        process.exit(1);
      });
    return;
  }

  // --list（既存機能）
  if (args.includes('--list')) {
    const companies = listCompanies();
    if (companies.length === 0) {
      console.log('登録済みの顧問先はありません');
    } else {
      console.log('登録済み顧問先一覧:');
      for (const c of companies) {
        console.log(`  ${c.companyId}: ${c.companyName}`);
      }
    }
    return;
  }

  // ヘルプ
  console.log(`使い方:
  node src/shared/company-resolver.js --search "顧問先名"
    → ローカル → Kintone の順で freee company ID を検索

  node src/shared/company-resolver.js --write-kintone {recordId} {companyId}
    → Kintone顧客カルテの freee事業所ID フィールドを更新

  node src/shared/company-resolver.js --list
    → 登録済み顧問先一覧を表示`);
}
