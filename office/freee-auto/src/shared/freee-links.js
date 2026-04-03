'use strict';

/**
 * freee Web画面リンク生成ヘルパー
 *
 * Kintone App①に書き戻すリンクURLや、レポート内のリンクに使用。
 * freeeのWeb画面URLパターンは変更される可能性があるため、一箇所で管理する。
 *
 * 参照: references/operations/freee-web-links.md
 */

const FREEE_BASE = 'https://secure.freee.co.jp';

// 口座明細画面（既存フローで使用中）
function walletTxnLink(walletableId, startDate) {
  return `${FREEE_BASE}/wallet_txns#walletable=${walletableId}&start_date=${startDate}`;
}

// 証憑（ファイルボックス）
function receiptLink(receiptId) {
  return `${FREEE_BASE}/receipts/${receiptId}`;
}

// 取引（仕訳帳）
function dealLink(dealId) {
  return `${FREEE_BASE}/reports/journals?deal_id=${dealId}`;
}

// 取引詳細画面
function dealDetailLink(dealId) {
  return `${FREEE_BASE}/deals/${dealId}`;
}

// 試算表BS科目明細（科目ドリルダウン画面）
// freee画面: レポート > 試算表 > 科目名クリック → 明細一覧
// companyId はセッションで自動判定されるためURLには含まないが、将来拡張用に引数で受け取る
function trialBsDetailLink(companyId, accountItemId) {
  return `${FREEE_BASE}/reports/trial_bs_details?account_item_id=${accountItemId}`;
}

// 仕訳帳の科目絞り込み（期間指定）
// freee画面: レポート > 仕訳帳 > 勘定科目でフィルタ
// BA-01〜BA-05のドリルダウンで特定科目の仕訳一覧を期間指定で表示するためのリンク
// accountName を渡すと name パラメータ付与（科目名フィルタ表示名に反映）
// options.partnerId を渡すと partner_id パラメータ付与（取引先フィルタ）
function journalsByAccountLink(companyId, accountItemId, startDate, endDate, accountName, options) {
  const params = new URLSearchParams({
    page:            '1',
    per_page:        '50',
    order_by:        'txn_date',
    direction:       'asc',
    account_item_id: String(accountItemId),
    end_date:        endDate,
    start_date:      startDate,
  });
  if (accountName) params.set('name', accountName);
  if (options?.partnerId) params.set('partner_id', String(options.partnerId));
  return `${FREEE_BASE}/reports/journals?${params.toString()}`;
}

// 総勘定元帳（科目×期間絞り込み）
// freee画面: レポート > 総勘定元帳 > 科目選択
//
// freeeの仕様:
//   - パス: /reports/general_ledgers/show
//   - 科目指定: name パラメータ（科目名をURLエンコード）
//   - 会計年度: fiscal_year_id（freee内部ID。fiscal_yearの数値とは別物）
//   - 調整仕訳: adjustment=all（全仕訳を含む）
//   - 取引先: partner_id（任意）
//
// @param {number|string} companyId - 事業所ID（将来の拡張用）
// @param {string} accountItemName - 勘定科目名（例: '未収還付法人税等'）
// @param {string} startDate - 'YYYY-MM-DD'
// @param {string} endDate - 'YYYY-MM-DD'
// @param {Object} [options]
// @param {number|string} [options.partnerId] - 取引先ID
// @param {number|string} [options.fiscalYearId] - freee fiscal_year_id
function generalLedgerLink(companyId, accountItemName, startDate, endDate, options) {
  const params = new URLSearchParams();
  params.set('adjustment', 'all');
  params.set('name', accountItemName);  // URLSearchParams が自動エンコード
  params.set('start_date', startDate);
  params.set('end_date', endDate);
  if (options?.fiscalYearId) params.set('fiscal_year_id', String(options.fiscalYearId));
  if (options?.partnerId) params.set('partner_id', String(options.partnerId));
  return `${FREEE_BASE}/reports/general_ledgers/show?${params.toString()}`;
}

// 残高の推移状況に基づいて、freeeリンクの検索開始日を動的に決定する
//
// 改善版: opening === closing の場合、過去期のBS(historicalBs)を遡って
// 「残高が最後に変動した期の期首」を特定する。
//
// @param {number} openingBalance - 当期の期首残高
// @param {number} closingBalance - 当期の期末残高（当月末）
// @param {number} fiscalYear - 当期の fiscal_year
// @param {number} startMonth - 期首月
// @param {Object} [options]
// @param {Object} [options.historicalBs] - 過去期のBS残高辞書（fetchHistoricalBs の戻り値）
// @param {string} [options.accountName] - 科目名（historicalBs から過去期残高を引くキー）
// @returns {{ startDate: string, reason: string, crossesFiscalYear: boolean }}
function determineLinkStartDate(openingBalance, closingBalance, fiscalYear, startMonth, options) {
  const currentFiscalStart = formatFiscalStartDate(fiscalYear, startMonth);

  // Case 1: 当期中に動きあり → 当期首
  if (openingBalance !== closingBalance) {
    return {
      startDate: currentFiscalStart,
      reason: '当期中に残高変動あり（当期首から検索）',
      crossesFiscalYear: false,
    };
  }

  // Case 2: 当期は不変 → 過去期を遡って変動した期を探す
  const historicalBs = options?.historicalBs;
  const accountName = options?.accountName;

  if (historicalBs && accountName) {
    for (let i = 1; i <= 5; i++) {
      const searchYear = fiscalYear - i;
      const yearKey = String(searchYear);
      const pastData = historicalBs[yearKey]?.[accountName];

      if (!pastData) {
        // 過去期のデータがない → これ以上遡れない → この期の期首を返す
        return {
          startDate: formatFiscalStartDate(searchYear, startMonth),
          reason: `${yearKey}期以前のデータなし（${yearKey}期首から検索）`,
          crossesFiscalYear: true,
        };
      }

      if (pastData.opening !== pastData.closing) {
        // この期で残高が動いた → この期の期首を start_date にする
        return {
          startDate: formatFiscalStartDate(searchYear, startMonth),
          reason: `${yearKey}期に残高変動あり（${yearKey}期首から検索）`,
          crossesFiscalYear: true,
        };
      }
      // この期も不変 → さらに前の期へ
    }

    // 5期遡っても変動なし
    return {
      startDate: formatFiscalStartDate(fiscalYear - 5, startMonth),
      reason: '5期前まで遡っても変動なし（5期前の期首から検索）',
      crossesFiscalYear: true,
    };
  }

  // フォールバック: historicalBs がない場合（後方互換）
  return {
    startDate: formatFiscalStartDate(fiscalYear - 5, startMonth),
    reason: '期首残高と同額（5期前から遡って検索）',
    crossesFiscalYear: true,
  };
}

// BS残高リンク生成（総勘定元帳 or 仕訳帳を自動選択）
//
// crossesFiscalYear が true の場合:
//   freeeの総勘定元帳画面は fiscal_year_id 単位で表示されるため、
//   過去期にまたがる場合は仕訳帳（journals）リンクを生成する。
// crossesFiscalYear が false の場合:
//   当期内なので総勘定元帳リンクを生成する。
//
// @param {number|string} companyId
// @param {string} accountItemName - 勘定科目名
// @param {number|string} accountItemId - 勘定科目ID（仕訳帳リンク用）
// @param {string} endDate - 'YYYY-MM-DD'
// @param {Object} params
// @param {number} params.openingBalance
// @param {number} params.closingBalance
// @param {number} params.fiscalYear
// @param {number} params.startMonth
// @param {number|string} [params.fiscalYearId]
// @param {number|string} [params.partnerId]
// @param {Object} [params.historicalBs]
// @returns {string} URL
function buildBalanceLink(companyId, accountItemName, accountItemId, endDate, params) {
  const {
    openingBalance, closingBalance, fiscalYear, startMonth,
    fiscalYearId, partnerId, historicalBs,
  } = params;

  const { startDate, crossesFiscalYear } = determineLinkStartDate(
    openingBalance, closingBalance, fiscalYear, startMonth,
    { historicalBs, accountName: accountItemName }
  );

  if (crossesFiscalYear || !fiscalYearId) {
    // 過去期にまたがる or fiscalYearId不明 → 仕訳帳（期間横断可能）
    return journalsByAccountLink(
      companyId, accountItemId, startDate, endDate, accountItemName,
      partnerId ? { partnerId } : undefined
    );
  }
  // 当期内 → 総勘定元帳
  return generalLedgerLink(companyId, accountItemName, startDate, endDate, {
    fiscalYearId,
    partnerId,
  });
}

// 期首日を 'YYYY-MM-DD' 形式で返す
function formatFiscalStartDate(fiscalYear, startMonth) {
  return `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;
}

module.exports = {
  FREEE_BASE,
  walletTxnLink,
  receiptLink,
  dealLink,
  dealDetailLink,
  trialBsDetailLink,
  journalsByAccountLink,
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
  formatFiscalStartDate,
};
