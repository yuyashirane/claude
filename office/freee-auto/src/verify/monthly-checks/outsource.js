'use strict';

/**
 * outsource.js — HB2-1, JA-1: 士業・外注支払チェック
 *
 * チェック一覧:
 *   OS-01 🟡 士業取引先への支払に対する源泉徴収の確認
 *   OS-02 TODO: 外注源泉税の滞留（PY-03 で「源泉所得税（士業）」として検出済み）
 *
 * データソース:
 *   OS-01: data.trialPlByPartner（取引先別PL）, data.prevMonth.trialPlByPartner
 *          data.trialBsByItem（品目別BS）— 源泉所得税（士業）残高の確認に使用
 *
 * 源泉徴収税率（参考）:
 *   100万円以下の部分: 10.21%
 *   100万円超の部分:   20.42%
 */

const { getPartnerBalances, findAccountBalance } = require('./trial-helpers');

// ============================================================
// 士業キーワード
// ============================================================

const PROFESSIONAL_KEYWORDS = [
  '税理士', '弁護士', '司法書士', '社会保険労務士', '社労士',
  '公認会計士', '行政書士', '土地家屋調査士', '弁理士', '海事代理士',
  '会計事務所', '法律事務所', '法務事務所',
];

// チェック対象の科目（士業報酬が計上される科目）
const TARGET_ACCOUNTS = ['外注費', '支払手数料', '支払報酬料', '支払報酬'];

// ============================================================
// 源泉税の期待額を算出
// ============================================================

function calcExpectedSourceTax(amount) {
  if (amount <= 1_000_000) {
    return { tax: Math.floor(amount * 0.1021), rate: '10.21%' };
  }
  // 100万円超: 最初の100万円に10.21%、超過部分に20.42%
  const tax = Math.floor(1_000_000 * 0.1021 + (amount - 1_000_000) * 0.2042);
  return { tax, rate: '20.42%（100万円超)' };
}

// ============================================================
// OS-01: 士業報酬の源泉徴収確認
// ============================================================

function checkProfessionalSourceTax(
  trialPlByPartner, prevMonthPlByPartner, trialBsByItem, elapsed, targetMonth, findings
) {
  if (!trialPlByPartner) return;

  // 源泉所得税（士業）の残高確認 — ゼロの場合は未計上の可能性が高い
  const withholdingBalance = (() => {
    if (!trialBsByItem) return null;
    const bsi = trialBsByItem.trial_bs?.balances || [];
    const azukari = bsi.find((b) => b.account_item_name === '預り金');
    if (!azukari) return null;
    const item = (azukari.items || []).find((it) => it.name.includes('士業'));
    return item ? item.closing_balance : 0;
  })();

  for (const accountName of TARGET_ACCOUNTS) {
    const currPartners = getPartnerBalances(trialPlByPartner, accountName);
    if (currPartners.length === 0) continue;

    const prevPartners = prevMonthPlByPartner
      ? getPartnerBalances(prevMonthPlByPartner, accountName)
      : [];

    const professionalPartners = currPartners.filter(
      (p) =>
        p.id !== 0 &&
        p.name !== '未選択' &&
        PROFESSIONAL_KEYWORDS.some((kw) => p.name.includes(kw))
    );

    for (const partner of professionalPartners) {
      // 当月単月の支払額（YTD差分）
      const prev           = prevPartners.find((p) => p.id === partner.id);
      const monthlyAmount  = partner.closing_balance - (prev?.closing_balance ?? 0);
      if (monthlyAmount <= 0) continue;

      const { tax: expectedTax, rate } = calcExpectedSourceTax(monthlyAmount);

      // 源泉所得税（士業）がゼロなら🔴寄りの確認要請、そうでなければ通常の🟡
      const sourceNote = withholdingBalance === 0
        ? '「預り金（源泉所得税（士業））」残高がゼロのため、未計上の可能性があります。'
        : `「預り金（源泉所得税（士業））」に残高（${(withholdingBalance ?? 0).toLocaleString()}円）あり。`;

      findings.push({
        severity: '🟡',
        category: 'outsource',
        checkCode: 'OS-01',
        description: `「${accountName}」で士業取引先「${partner.name}」への支払 ${monthlyAmount.toLocaleString()}円があります。${sourceNote}源泉徴収（推定 ${expectedTax.toLocaleString()}円 / ${rate}）の計上・納付を確認してください。`,
        currentValue: `支払額: ${monthlyAmount.toLocaleString()}円`,
        suggestedValue: `源泉所得税 約${expectedTax.toLocaleString()}円 を「預り金（源泉所得税（士業））」として計上し、翌月10日までに納付してください`,
        confidence: 80,
        targetMonth,
      });
    }
  }
}

// ============================================================
// OS-02: 外注源泉税の滞留 — TODO
// ============================================================
// 士業以外の外注に対する源泉所得税は納期の特例なし（毎月翌月10日納付）。
// ただし 預り金 の品目構成が事業所によって異なり、
// 「源泉所得税（士業）」と「源泉所得税（給与）」以外の外注専用品目が
// 設定されていないケースが多い。
// → payroll.js の PY-03 が「源泉所得税（士業）」の滞留を包括的に検出するため、
//    OS-02は重複検出を避けてTODOとする。
//
// 実装時のポイント（将来対応）:
//   - trialBsByItem 預り金 の品目で「外注」「業務委託」キーワードを検索
//   - opening == closing > 0 なら滞留と判定
//   - PY-03 との重複チェック必須

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 士業・外注支払チェック（HB2-1, JA-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function outsourceCheck(data) {
  const findings = [];
  const {
    trialPlByPartner, trialBsByItem,
    prevMonth,
    targetMonth, startMonth,
  } = data;

  if (!trialPlByPartner) return findings;

  const prevMonthPlByPartner = prevMonth?.trialPlByPartner ?? null;
  const elapsed = (() => {
    const [, mn] = targetMonth.split('-').map(Number);
    return mn >= startMonth
      ? mn - startMonth + 1
      : 12 - startMonth + mn + 1;
  })();

  checkProfessionalSourceTax(
    trialPlByPartner, prevMonthPlByPartner, trialBsByItem, elapsed, targetMonth, findings
  );

  return findings;
}

module.exports = { outsourceCheck };
