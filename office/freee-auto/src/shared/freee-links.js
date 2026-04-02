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

module.exports = {
  FREEE_BASE,
  walletTxnLink,
  receiptLink,
  dealLink,
  dealDetailLink,
};
