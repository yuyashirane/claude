'use strict';

/**
 * rent.js — HD-1, HD-2: 家賃支払チェック
 *
 * チェック一覧:
 *   RT-01 🟡 地代家賃の金額変動（前月平均と乖離）
 *   RT-02 🟡 地代家賃に20万円以上の取引（更新料・礼金の疑い）
 *   RT-03 🔵 地代家賃の取引先タグ漏れ（trialPlByPartner で「未選択」あり）
 *
 * データソース:
 *   RT-01: data.trialPl（YTD）, data.prevMonth.trialPl（YTD）
 *          data.trialPlByPartner, data.prevMonth.trialPlByPartner（取引先別内訳）
 *   RT-02: data.deals（対象月の取引一覧）
 *   RT-03: data.trialPlByPartner
 *
 * ※ trialPl はYTD累計。当月単月 = getMonthlyAmount() で算出
 */

const {
  findAccountBalance,
  getMonthlyAmount,
  getPartnerBalances,
  monthsFromFiscalStart,
} = require('./trial-helpers');

const ACCOUNT_NAME = '地代家賃';

// ============================================================
// RT-01: 地代家賃の金額変動チェック
// ============================================================

function checkRentFluctuation(trialPl, prevTrialPl, trialPlByPartner, prevMonthPlByPartner, elapsed, targetMonth, findings) {
  if (elapsed <= 1 || !prevTrialPl) return;

  const currYTD = findAccountBalance(trialPl, ACCOUNT_NAME)?.balance ?? 0;
  const prevYTD = findAccountBalance(prevTrialPl, ACCOUNT_NAME)?.balance ?? 0;

  if (prevYTD === 0) return;

  const actualMonthly   = currYTD - prevYTD;
  const expectedMonthly = prevYTD / (elapsed - 1);

  if (expectedMonthly === 0) return;

  const changeAbs  = Math.abs(actualMonthly - expectedMonthly);
  const changeRate = changeAbs / Math.abs(expectedMonthly);

  // 変動額 5,000円以上 かつ 比率 10%以上 で指摘
  if (changeAbs < 5_000 || changeRate < 0.10) return;

  const direction = actualMonthly > expectedMonthly ? '増加' : '減少';

  // 取引先別内訳を構築（あれば詳細表示）
  let partnerDetail = '';
  if (trialPlByPartner && prevMonthPlByPartner) {
    const currPartners = getPartnerBalances(trialPlByPartner, ACCOUNT_NAME)
      .filter((p) => p.id !== 0 && p.name !== '未選択');
    const prevPartners = getPartnerBalances(prevMonthPlByPartner, ACCOUNT_NAME);
    const changed = currPartners.filter((cp) => {
      const pp = prevPartners.find((p) => p.id === cp.id);
      const ppMonthly = pp ? pp.closing_balance / (elapsed - 1) : 0;
      const cpMonthly = cp.closing_balance - (pp?.closing_balance ?? 0);
      return Math.abs(cpMonthly - ppMonthly) > 500;
    });
    if (changed.length > 0) {
      partnerDetail = '（変動あり取引先: ' + changed.map((p) => p.name).join('、') + '）';
    }
  }

  findings.push({
    severity: '🟡',
    category: 'rent',
    checkCode: 'RT-01',
    description: `地代家賃が前月平均比 ${(changeRate * 100).toFixed(0)}%${direction}しています（当月: ${actualMonthly.toLocaleString()}円、前月平均: ${Math.round(expectedMonthly).toLocaleString()}円）。${partnerDetail}`,
    currentValue: `当月: ${actualMonthly.toLocaleString()}円`,
    suggestedValue: '新規契約・解約・更新料等の理由がなければ、仕訳内容を確認してください',
    confidence: 75,
    targetMonth,
  });
}

// ============================================================
// RT-02: 地代家賃の高額取引チェック（更新料・礼金）
// ============================================================

function checkHighRentTransaction(deals, targetMonth, findings) {
  if (!deals || deals.length === 0) return;

  const THRESHOLD = 200_000;

  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      const name   = detail.account_item_name || '';
      if (!name.includes(ACCOUNT_NAME)) continue;

      const amount = Math.abs(detail.amount || 0);
      if (amount < THRESHOLD) continue;

      findings.push({
        severity: '🟡',
        category: 'rent',
        checkCode: 'RT-02',
        description: `${deal.issue_date} の地代家賃 ${amount.toLocaleString()}円は通常の月額を超えています（20万円以上）。更新料・礼金の場合は「長期前払費用」として資産計上が必要です。`,
        currentValue: `${amount.toLocaleString()}円（deal_id: ${deal.id}）`,
        suggestedValue: '税込20万円以上の更新料・礼金 → 長期前払費用（繰延資産）として均等償却してください',
        confidence: 80,
        targetMonth,
      });
    }
  }
}

// ============================================================
// RT-03: 地代家賃の取引先タグ漏れ
// ============================================================

function checkRentPartnerTagMissing(trialPlByPartner, targetMonth, findings) {
  if (!trialPlByPartner) return;

  const partners = getPartnerBalances(trialPlByPartner, ACCOUNT_NAME);
  const untagged = partners.filter(
    (p) => (p.id === 0 || p.name === '未選択') && p.closing_balance > 0
  );
  if (untagged.length === 0) return;

  const total = untagged.reduce((s, p) => s + p.closing_balance, 0);
  findings.push({
    severity: '🔵',
    category: 'rent',
    checkCode: 'RT-03',
    description: `地代家賃に取引先タグなしの計上（${total.toLocaleString()}円）があります。どの物件・契約先の家賃か不明です。`,
    currentValue: `未選択: ${total.toLocaleString()}円`,
    suggestedValue: '各家賃支払に取引先タグ（家主・管理会社）を設定し、物件別に管理してください',
    confidence: 85,
    targetMonth,
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 家賃支払チェック（HD-1, HD-2）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function rentCheck(data) {
  const findings = [];
  const {
    trialPl, trialPlByPartner,
    prevMonth,
    deals,
    targetMonth, startMonth,
  } = data;

  if (!trialPl) return findings;

  const prevTrialPl         = prevMonth?.trialPl         ?? null;
  const prevMonthPlByPartner = prevMonth?.trialPlByPartner ?? null;
  const elapsed             = monthsFromFiscalStart(targetMonth, startMonth);

  checkRentFluctuation(trialPl, prevTrialPl, trialPlByPartner, prevMonthPlByPartner, elapsed, targetMonth, findings);
  checkHighRentTransaction(deals, targetMonth, findings);
  checkRentPartnerTagMissing(trialPlByPartner, targetMonth, findings);

  return findings;
}

module.exports = { rentCheck };
