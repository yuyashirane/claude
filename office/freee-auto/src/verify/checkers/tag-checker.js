'use strict';

const {
  normalizeRoute,
  normalizeAccount,
  normalizePartnerName,
  normalizeItemTag,
  normalizeWalletTxnId,
} = require('./normalize-helpers');

const PARTNER_REQUIRED_ACCOUNTS_CRITICAL = ['売上高', '売掛金'];
const PARTNER_REQUIRED_ACCOUNTS_WARNING = ['外注費', '支払手数料', '支払報酬料'];
const ITEM_TAG_REQUIRED_ACCOUNTS = ['預り金'];
const ITEM_TAG_REQUIRED_ACCOUNTS_WARNING = ['借入金', '長期借入金'];
const PARTNER_OPTIONAL_ACCOUNTS = ['地代家賃'];

function tagChecker(items, companyId) {
  const findings = [];
  const targets = items.filter(i => ['register', 'suggest'].includes(normalizeRoute(i)));

  for (const item of targets) {
    const account = normalizeAccount(item);
    const partnerName = normalizePartnerName(item);
    const itemTag = normalizeItemTag(item);
    const id = normalizeWalletTxnId(item);
    const hasPartner = partnerName && partnerName.trim() !== '';
    const hasItemTag = itemTag && itemTag.trim() !== '';

    // G-01: 売上高・売掛金 + 取引先なし
    if (PARTNER_REQUIRED_ACCOUNTS_CRITICAL.includes(account) && !hasPartner) {
      findings.push({
        severity: '🔴',
        category: 'tag',
        checkCode: 'G-01',
        walletTxnId: id,
        description: `「${account}」に取引先が設定されていません。取引先タグの付与が必要です。`,
        currentValue: '取引先: なし',
        suggestedValue: '取引先名を設定',
        confidence: 90,
      });
    }

    // G-02: 外注費・支払手数料・支払報酬料 + 取引先なし
    if (PARTNER_REQUIRED_ACCOUNTS_WARNING.includes(account) && !hasPartner) {
      findings.push({
        severity: '🔴',
        category: 'tag',
        checkCode: 'G-02',
        walletTxnId: id,
        description: `「${account}」に取引先が設定されていません。源泉徴収管理のため取引先タグの付与が必要です。`,
        currentValue: '取引先: なし',
        suggestedValue: '取引先名を設定',
        confidence: 90,
      });
    }

    // G-03: 預り金 + 品目なし
    if (ITEM_TAG_REQUIRED_ACCOUNTS.includes(account) && !hasItemTag) {
      findings.push({
        severity: '🟡',
        category: 'tag',
        checkCode: 'G-03',
        walletTxnId: id,
        description: `「${account}」に品目タグが設定されていません（例: 源泉所得税、社会保険料等）。`,
        currentValue: '品目: なし',
        suggestedValue: '品目タグを設定',
        confidence: 80,
      });
    }

    // G-04: 借入金・長期借入金 + 品目なし
    if (ITEM_TAG_REQUIRED_ACCOUNTS_WARNING.includes(account) && !hasItemTag) {
      findings.push({
        severity: '🟡',
        category: 'tag',
        checkCode: 'G-04',
        walletTxnId: id,
        description: `「${account}」に品目タグが設定されていません（融資名・借入先の識別に使用）。`,
        currentValue: '品目: なし',
        suggestedValue: '品目タグを設定（例: 〇〇銀行借入）',
        confidence: 80,
      });
    }

    // G-05: 地代家賃 + 取引先なし
    if (PARTNER_OPTIONAL_ACCOUNTS.includes(account) && !hasPartner) {
      findings.push({
        severity: '🔵',
        category: 'tag',
        checkCode: 'G-05',
        walletTxnId: id,
        description: `「${account}」に取引先が設定されていません。家賃の非課税判定のため取引先（物件情報）の付与を推奨します。`,
        currentValue: '取引先: なし',
        suggestedValue: '取引先名を設定',
        confidence: 65,
      });
    }
  }

  return findings;
}

module.exports = { tagChecker };
