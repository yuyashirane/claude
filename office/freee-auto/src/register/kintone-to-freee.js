'use strict';

/**
 * Kintone承認済み → freee取引登録 統合モジュール
 *
 * フロー:
 *   1. App①から「承認」ステータスのレコードを取得
 *   2. 修正後の値があれば優先してペイロード作成
 *   3. ドライラン/本番で登録
 *   4. 登録成功 → App①を「登録済み」に更新、deal_id書き戻し
 *
 * 実際のfreee API呼び出し（POST /api/1/deals）はClaude Codeが
 * freee MCPツールで行い、返ってきた deal_id を使って
 * updateKintoneAfterRegistration() で書き戻す。
 */

const { KintoneRestAPIClient } = require('@kintone/rest-api-client');
const path = require('path');
const fs = require('fs');
const { dealLink } = require('../shared/freee-links');
const { TAX_CLASS_TO_CODE } = require('../classify/account-matcher');

const APP_ID = 447;

/**
 * App①から「承認」ステータスのレコードを取得
 * Kintoneプロセス管理のステータスで絞り込み
 */
async function fetchApprovedRecords(client) {
  const records = await client.record.getRecords({
    app: APP_ID,
    query: 'ステータス in ("承認") order by レコード番号 asc',
  });
  return records.records;
}

/**
 * 科目・税区分の優先ルール適用
 * 修正後の値があればそちらを使う（部分修正OK）
 */
function resolveAccountAndTax(record) {
  const correctedAccount = record.corrected_account?.value;
  const correctedTax = record.corrected_tax?.value;
  const aiAccount = record.ai_guess_account?.value;
  const aiTax = record.ai_guess_tax?.value;

  return {
    account: correctedAccount || aiAccount,
    tax: correctedTax || aiTax,
    wasModified: !!(correctedAccount || correctedTax),
    correctionReason: record.correction_reason?.value || '',
  };
}

/**
 * 税区分表示名 → freee tax_code 変換
 *
 * 既存の TAX_CLASS_TO_CODE（account-matcher.js）を一次ソースとし、
 * Kintoneドロップダウンの表示名差分のみ追加マッピングする。
 */
function resolveTaxCode(taxDisplayName) {
  // 既存マッピングでまず検索
  const code = TAX_CLASS_TO_CODE[taxDisplayName];
  if (code !== undefined) return code;

  // Kintoneドロップダウン表示名 → 既存キーへの変換テーブル
  const KINTONE_DISPLAY_ALIASES = {
    '課税仕入10%': '課税10%',
    '課税仕入8%(軽減)': '課税8%（軽減）',
    '非課税仕入': '非課税',
    '課税売上8%(軽減)': '課税売上8%',
    '輸出免税': '免税',
  };

  const aliasKey = KINTONE_DISPLAY_ALIASES[taxDisplayName];
  if (aliasKey) {
    const aliasCode = TAX_CLASS_TO_CODE[aliasKey];
    if (aliasCode !== undefined) return aliasCode;
  }

  throw new Error(`税区分コード未解決: "${taxDisplayName}"`);
}

/**
 * Kintoneレコード → freee deals APIペイロードに変換
 *
 * @param {Object} record - Kintoneレコード
 * @param {Object} accountMap - { 科目名: freee_account_item_id } のマッピング
 * @param {number} companyId - freee事業所ID
 */
function buildDealPayload(record, accountMap, companyId) {
  const { account, tax } = resolveAccountAndTax(record);
  const absAmount = Math.abs(Number(record.amount.value));
  const isExpense = Number(record.amount.value) >= 0;

  const accountId = accountMap[account];
  if (!accountId) {
    throw new Error(`科目ID未解決: "${account}" — freee科目一覧に存在しない可能性`);
  }

  const taxCode = resolveTaxCode(tax);
  const dateValue = (record.target_date || record.date)?.value;
  const descriptionValue = record.description?.value || '';

  // 口座情報（payments 用）— 口座明細由来の取引は決済済みで登録する
  const walletableType = record.walletable_type?.value;
  const walletableId = record.walletable_id?.value;

  if (!walletableType || !walletableId) {
    throw new Error(
      `口座情報が不足: walletable_type=${walletableType}, ` +
      `walletable_id=${walletableId} (record: ${record.$id?.value})`
    );
  }

  return {
    company_id: Number(companyId),
    issue_date: dateValue,
    type: isExpense ? 'expense' : 'income',
    details: [{
      account_item_id: accountId,
      tax_code: taxCode,
      amount: absAmount,
      description: descriptionValue,
    }],
    payments: [{
      date: dateValue,
      from_walletable_type: walletableType,
      from_walletable_id: Number(walletableId),
      amount: absAmount,
    }],
  };
}

/**
 * 二重登録チェック
 * freee_deal_id が既に入っているレコードはスキップ
 */
function filterDuplicates(records) {
  const valid = [];
  const skipped = [];
  for (const r of records) {
    if (r.freee_deal_id?.value) {
      skipped.push({
        recordId: r.$id.value,
        reason: `freee_deal_id already set: ${r.freee_deal_id.value}`,
      });
    } else {
      valid.push(r);
    }
  }
  return { valid, skipped };
}

/**
 * メイン: 承認済みレコードをfreeeに登録
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - true=ドライラン（デフォルト）, false=本番登録
 * @param {number} options.companyId - freee事業所ID（デフォルト: 474381）
 * @param {Object} options.accountMap - 科目名→ID マッピング（必須）
 */
async function registerApproved(options = {}) {
  const { dryRun = true, companyId = 474381, accountMap } = options;

  // 1. Kintoneクライアント初期化
  const kintoneClient = new KintoneRestAPIClient({
    baseUrl: process.env.KINTONE_BASE_URL,
    auth: { apiToken: process.env.KINTONE_API_TOKEN_PENDING },
  });

  // 2. 承認済みレコード取得
  const allRecords = await fetchApprovedRecords(kintoneClient);
  console.log(`[REGISTER] 承認済みレコード取得: ${allRecords.length}件`);

  if (allRecords.length === 0) {
    console.log('[REGISTER] 承認済みレコードなし。処理終了。');
    return { mode: dryRun ? 'dry_run' : 'production', count: 0, results: [] };
  }

  // 3. 二重登録フィルタ
  const { valid, skipped } = filterDuplicates(allRecords);
  if (skipped.length > 0) {
    console.log(`[REGISTER] 二重登録スキップ: ${skipped.length}件`);
  }

  // 4. accountMap チェック
  if (!accountMap) {
    throw new Error(
      'accountMap が必要です。freee MCP get_account_items で科目一覧を取得し、' +
      '{ 科目名: account_item_id } 形式で渡してください。'
    );
  }

  // 5. ペイロード生成
  const results = [];
  for (const record of valid) {
    const recordId = record.$id.value;
    try {
      const payload = buildDealPayload(record, accountMap, companyId);
      const resolved = resolveAccountAndTax(record);
      results.push({
        kintoneRecordId: recordId,
        walletTxnId: record.wallet_txn_id?.value,
        payload,
        wasModified: resolved.wasModified,
        correctionReason: resolved.correctionReason,
        status: 'ready',
      });
    } catch (err) {
      results.push({
        kintoneRecordId: recordId,
        walletTxnId: record.wallet_txn_id?.value,
        status: 'error',
        error: err.message,
      });
    }
  }

  // 6. ログ出力
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(__dirname, '..', '..', 'tmp');
  fs.mkdirSync(logDir, { recursive: true });

  const mode = dryRun ? 'dry_run' : 'production';
  const logPath = path.join(logDir, `kintone_to_freee_${mode}_${timestamp}.json`);

  const logData = {
    mode,
    timestamp: new Date().toISOString(),
    companyId,
    approvedRecords: allRecords.length,
    validRecords: valid.length,
    skippedDuplicates: skipped.length,
    readyCount: results.filter(r => r.status === 'ready').length,
    errorCount: results.filter(r => r.status === 'error').length,
    results,
    skipped,
  };

  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), 'utf-8');
  console.log(`[REGISTER] ログ出力: ${logPath}`);

  if (dryRun) {
    console.log('[REGISTER] ドライラン完了。ペイロードをログに記録しました。');
    console.log(`[REGISTER] ready: ${logData.readyCount}件, error: ${logData.errorCount}件`);
    return logData;
  }

  // 7. 本番モード — ペイロード生成まで。
  //    実際のfreee API呼び出しはClaude Codeがfreee MCPツールで行い、
  //    返ってきた deal_id を使って updateKintoneAfterRegistration() を呼ぶ。
  console.log('[REGISTER] 本番モード: ペイロード生成完了。freee MCPで登録を実行してください。');
  return logData;
}

/**
 * freee登録成功後のKintone書き戻し
 *
 * @param {Array} registrationResults - [{kintoneRecordId, freeDealId, status: 'success'|'error'}, ...]
 * @param {Object} options - { dryRun }
 */
async function updateKintoneAfterRegistration(registrationResults, options = {}) {
  const { dryRun = true } = options;
  const mode = dryRun ? 'dry_run' : 'production';

  const kintoneClient = new KintoneRestAPIClient({
    baseUrl: process.env.KINTONE_BASE_URL,
    auth: { apiToken: process.env.KINTONE_API_TOKEN_PENDING },
  });

  const updateResults = [];

  for (const result of registrationResults) {
    if (result.status !== 'success') continue;

    const recordId = result.kintoneRecordId;
    const dealId = result.freeDealId;

    try {
      // フィールド更新
      await kintoneClient.record.updateRecord({
        app: APP_ID,
        id: recordId,
        record: {
          freee_deal_id: { value: String(dealId) },
          freee_deal_link: { value: dealLink(dealId) },
          registered_at: { value: new Date().toISOString() },
          register_mode: { value: mode },
        },
      });

      // プロセス管理ステータスを「登録済み」に進める
      await kintoneClient.record.updateRecordStatus({
        app: APP_ID,
        id: Number(recordId),
        action: '登録完了',
      });

      updateResults.push({
        kintoneRecordId: recordId,
        freeDealId: dealId,
        freeDealLink: dealLink(dealId),
        status: 'updated',
      });

      console.log(`[REGISTER] App①更新完了: record=${recordId}, deal=${dealId}`);
    } catch (err) {
      updateResults.push({
        kintoneRecordId: recordId,
        freeDealId: dealId,
        status: 'update_error',
        error: err.message,
      });
      console.error(`[REGISTER] App①更新エラー: record=${recordId}`, err.message);
    }
  }

  return updateResults;
}

module.exports = {
  fetchApprovedRecords,
  resolveAccountAndTax,
  buildDealPayload,
  resolveTaxCode,
  filterDuplicates,
  registerApproved,
  updateKintoneAfterRegistration,
  APP_ID,
};
