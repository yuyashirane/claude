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
  // URL長を255文字以内に抑えるため、freeeデフォルト値のパラメータは省略
  // (page, per_page, order_by, direction, account_item_id)
  // name パラメータで科目フィルタが成立するため account_item_id は不要
  const params = new URLSearchParams({
    start_date: startDate,
    end_date:   endDate,
  });
  if (accountName) {
    params.set('name', accountName);
  } else {
    // accountName がない場合のみ account_item_id でフィルタ
    params.set('account_item_id', String(accountItemId));
  }
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
//   - 調整仕訳: adjustment パラメータは省略（freeeデフォルトで十分）
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

// ============================================================
// 税区分フィルタ付き総勘定元帳リンク
// ============================================================

/**
 * freee tax_code → freee Web画面 URLパラメータの対応マッピング
 *
 * freee APIのtax_codeと、freee Web画面の総勘定元帳URLで使うフィルタパラメータの対応。
 * 注意: このマッピングの正確性はfreee Web画面で実際に確認する必要がある。
 *       段階的に追加・修正していく想定。
 */
const TAX_CODE_TO_URL_PARAMS = {
  // === 対象外・非課税 ===
  0:   { taxGroupCode: 0 },                                          // 対象外
  2:   { taxGroupCode: 0 },                                          // 対象外（別コード）

  // === 課税仕入（標準税率10%）===
  34:  { taxGroupCode: 34, taxRate: 10, taxReduced: false },          // 課対仕入10%
  136: { taxGroupCode: 34, taxRate: 10, taxReduced: false },          // 課対仕入10%（別コード）

  // === 課税仕入（軽減税率8%）===
  163: { taxGroupCode: 34, taxRate: 8, taxReduced: true },            // 課対仕入8%軽減

  // === 課税仕入（控除率指定）===
  189: { taxGroupCode: 34, taxRate: 10, taxDeductionRate: 80, taxReduced: false },  // 課対仕入(控80)10%
  190: { taxGroupCode: 34, taxRate: 10, taxDeductionRate: 50, taxReduced: false },  // 課対仕入(控50)10%

  // === 非課税仕入 ===
  37:  { taxGroupCode: 37 },                                          // 非課仕入

  // === 売上系 ===
  23:  { taxGroupCode: 23 },                                          // 非課売上
  129: { taxGroupCode: 21, taxRate: 10, taxReduced: false },          // 課税売上10%
};

/**
 * 税区分フィルタ付き総勘定元帳リンクを生成
 *
 * @param {string|number} companyId - freee事業所ID
 * @param {string} accountName - 勘定科目名（日本語）
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate - 'YYYY-MM-DD'
 * @param {Object} [options] - generalLedgerLink のオプション（fiscalYearId, partnerId）
 * @param {Object} taxFilter - 税区分フィルタパラメータ
 * @param {number} [taxFilter.taxGroupCode] - 税区分グループコード（0=対象外, 34=課対仕入等）
 * @param {number} [taxFilter.taxRate] - 税率（10, 8）
 * @param {number} [taxFilter.taxDeductionRate] - 控除率（80, 50）
 * @param {boolean} [taxFilter.taxReduced] - 軽減税率フラグ
 * @returns {string} フィルタ付きfreee総勘定元帳URL
 */
function generalLedgerLinkWithTaxFilter(companyId, accountName, startDate, endDate, options, taxFilter) {
  const baseUrl = generalLedgerLink(companyId, accountName, startDate, endDate, options);

  if (!taxFilter) return baseUrl;

  const extra = new URLSearchParams();
  if (taxFilter.taxGroupCode != null) extra.set('tax_group_codes', String(taxFilter.taxGroupCode));
  if (taxFilter.taxRate != null) extra.set('tax_rate', String(taxFilter.taxRate));
  if (taxFilter.taxDeductionRate != null) extra.set('tax_deduction_rate', String(taxFilter.taxDeductionRate));
  if (taxFilter.taxReduced != null) extra.set('tax_reduced', String(taxFilter.taxReduced));

  const extraStr = extra.toString();
  if (!extraStr) return baseUrl;
  return `${baseUrl}&${extraStr}`;
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
  generalLedgerLinkWithTaxFilter,
  TAX_CODE_TO_URL_PARAMS,
  determineLinkStartDate,
  buildBalanceLink,
  formatFiscalStartDate,
};
