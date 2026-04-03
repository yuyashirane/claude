'use strict';

function normalizeRoute(item) {
  const raw = item.routeDestination
    || item.routing?.decision
    || item._routing?.decision
    || 'unknown';
  // パイプライン実出力形式のマッピング
  //   'auto_register'  → 'register' （High信頼度・自動登録）
  //   'kintone_staff'  → kintone系（VERIFYはスキップ）
  //   'kintone_senior' → kintone系（VERIFYはスキップ）
  if (raw === 'auto_register') return 'register';
  return raw;
}

function normalizeAccount(item) {
  return item.accountName
    || item.classification?.accountName
    || item._classification?.accountName
    || item.classification?.estimated_account   // パイプライン実出力形式
    || '';
}

function normalizeEntrySide(item) {
  return item.entrySide
    || item.classification?.entrySide
    || item._freee?.entry_side
    || item.transaction?.debit_credit            // パイプライン実出力形式
    || '';
}

function normalizeTaxLabel(item) {
  return item.taxLabel
    || item.classification?.taxLabel
    || item.classification?.estimated_tax_class  // パイプライン実出力形式
    || '';
}

function normalizeDescription(item) {
  return item.description
    || item._freee?.description
    || item.transaction?.description             // パイプライン実出力形式
    || '';
}

function normalizePartnerName(item) {
  return item.partnerName
    || item.classification?.partnerName
    || item.transaction?.partner_name            // パイプライン実出力形式
    || '';
}

function normalizeAmount(item) {
  const raw = item.amount ?? item._freee?.amount ?? item.transaction?.amount ?? 0;
  return Math.abs(raw);
}

function normalizeWalletTxnId(item) {
  return item.walletTxnId
    || item._freee?.id
    || item._freee?.wallet_txn_id               // パイプライン実出力形式
    || null;
}

function normalizeWalletableType(item) {
  return item.walletableType
    || item._freee?.walletable_type
    || '';
}

function normalizeConfidenceScore(item) {
  return item.confidenceScore
    ?? item.classification?.confidenceScore
    ?? item._classification?.confidenceScore
    ?? 0;
}

function normalizeConfidenceBreakdown(item) {
  const direct = item.confidenceBreakdown
    || item.classification?.confidenceBreakdown
    || item._classification?.confidenceBreakdown;
  if (direct) return direct;

  // パイプライン実出力形式: classification.score_breakdown (snake_case) をキャメルケースにマップ
  const sb = item.classification?.score_breakdown;
  if (sb) {
    return {
      taxClarity:          sb.tax_rule_clarity   ?? sb.taxClarity,
      keywordMatch:        sb.keyword_match       ?? sb.keywordMatch,
      pastPattern:         sb.past_pattern        ?? sb.pastPattern,
      amountValidity:      sb.amount_validity     ?? sb.amountValidity,
      descriptionQuality:  sb.description_quality ?? sb.descriptionQuality,
    };
  }
  return {};
}

function normalizeItemTag(item) {
  return item.itemTag
    || item.classification?.itemTag
    || '';
}

module.exports = {
  normalizeRoute,
  normalizeAccount,
  normalizeEntrySide,
  normalizeTaxLabel,
  normalizeDescription,
  normalizePartnerName,
  normalizeAmount,
  normalizeWalletTxnId,
  normalizeWalletableType,
  normalizeConfidenceScore,
  normalizeConfidenceBreakdown,
  normalizeItemTag,
};
