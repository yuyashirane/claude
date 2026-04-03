'use strict';

/**
 * revenue-receivable.js — HA-1, GC-1: 売上・売掛金チェック
 *
 * チェック一覧:
 *   RR-01 🟡 売上の月次推移異常（前月比50%超 or 前年同月比30%超の変動）
 *   RR-02 🟡 売掛金の滞留（取引先別で2ヶ月連続同額）
 *   RR-03 🔵 売上の取引先タグ漏れ（trialPlByPartner で「未選択」あり）
 *
 * データソース:
 *   RR-01: data.trialPl（YTD）, data.prevMonth.trialPl, data.prevYearMonth.trialPl
 *   RR-02: data.trialBsByPartner, data.prevMonth.trialBsByPartner
 *   RR-03: data.trialPlByPartner
 *
 * ※ trialPl はYTD累計。当月単月 = getMonthlyAmount() で算出
 */

const {
  findAccountBalance,
  getMonthlyAmount,
  getPartnerBalances,
  monthsFromFiscalStart,
} = require('./trial-helpers');

// ============================================================
// RR-01: 売上の月次推移チェック
// ============================================================

function checkRevenueTrend(trialPl, prevTrialPl, prevYearTrialPl, elapsed, targetMonth, findings) {
  const currYTD = findAccountBalance(trialPl, '売上高')?.balance ?? 0;

  // 前月比チェック
  if (prevTrialPl && elapsed > 1) {
    const prevYTD       = findAccountBalance(prevTrialPl, '売上高')?.balance ?? 0;
    const actualMonthly   = currYTD - prevYTD;
    const expectedMonthly = prevYTD / (elapsed - 1);

    if (expectedMonthly > 0) {
      const changeRate = Math.abs(actualMonthly - expectedMonthly) / expectedMonthly;
      if (changeRate > 0.50) {
        const direction = actualMonthly > expectedMonthly ? '増加' : '減少';
        findings.push({
          severity: '🟡',
          category: 'revenue_receivable',
          checkCode: 'RR-01',
          description: `売上高が前月平均比 ${(changeRate * 100).toFixed(0)}%${direction}しています（当月: ${actualMonthly.toLocaleString()}円、前月平均: ${Math.round(expectedMonthly).toLocaleString()}円）。`,
          currentValue: `当月: ${actualMonthly.toLocaleString()}円`,
          suggestedValue: '季節要因・受注ピーク等の理由がなければ、売上の計上漏れや二重計上を確認してください',
          confidence: 75,
          targetMonth,
        });
      }
    }
  }

  // 前年同月比チェック（prevYearMonth.trialPl が取れている場合）
  if (prevYearTrialPl) {
    const prevYearYTD = findAccountBalance(prevYearTrialPl, '売上高')?.balance ?? 0;
    // 前年同月の当月単月を推定: YTD / elapsed（前年の経過月数と対象月が同じ前提）
    const prevYearMonthly = elapsed > 0 ? prevYearYTD / elapsed : prevYearYTD;

    if (prevYearMonthly > 0) {
      const currMonthly   = elapsed > 1 && prevTrialPl
        ? currYTD - (findAccountBalance(prevTrialPl, '売上高')?.balance ?? 0)
        : currYTD;
      const yoyRate = Math.abs(currMonthly - prevYearMonthly) / prevYearMonthly;

      if (yoyRate > 0.30) {
        const direction = currMonthly > prevYearMonthly ? '増加' : '減少';
        findings.push({
          severity: '🟡',
          category: 'revenue_receivable',
          checkCode: 'RR-01',
          description: `売上高が前年同月比 ${(yoyRate * 100).toFixed(0)}%${direction}しています（当月: ${Math.round(currMonthly).toLocaleString()}円、前年同月推定: ${Math.round(prevYearMonthly).toLocaleString()}円）。`,
          currentValue: `当月: ${Math.round(currMonthly).toLocaleString()}円`,
          suggestedValue: '顧客増減・単価変更・業務構成の変化等の背景を確認してください',
          confidence: 65,
          targetMonth,
        });
      }
    }
  }
}

// ============================================================
// RR-02: 売掛金の滞留チェック
// ============================================================

function checkReceivableStagnation(trialBsByPartner, prevMonthBsByPartner, targetMonth, findings) {
  if (!trialBsByPartner || !prevMonthBsByPartner) return;

  const ACCOUNT_NAMES = ['売掛金'];
  const TOLERANCE     = 100; // 100円以内の差は同額とみなす

  for (const accountName of ACCOUNT_NAMES) {
    const currPartners = getPartnerBalances(trialBsByPartner, accountName);
    const prevPartners = getPartnerBalances(prevMonthBsByPartner, accountName);

    for (const cp of currPartners) {
      if (cp.id === 0 || cp.name === '未選択') continue;
      if (cp.closing_balance <= 0) continue;

      const pp = prevPartners.find((p) => p.id === cp.id);
      if (!pp || pp.closing_balance <= 0) continue;

      // 2ヶ月連続同額 → 未回収の疑い
      if (Math.abs(cp.closing_balance - pp.closing_balance) <= TOLERANCE) {
        findings.push({
          severity: '🟡',
          category: 'revenue_receivable',
          checkCode: 'RR-02',
          description: `「${accountName}」の「${cp.name}」残高が2ヶ月連続で同額（${cp.closing_balance.toLocaleString()}円）です。回収が滞留している可能性があります。`,
          currentValue: `${cp.closing_balance.toLocaleString()}円（前月比変動なし）`,
          suggestedValue: '回収期日を確認し、顧客に入金を依頼してください。回収不能の場合は貸倒引当金の計上を検討してください',
          confidence: 80,
          targetMonth,
        });
      }
    }
  }
}

// ============================================================
// RR-03: 売上の取引先タグ漏れ
// ============================================================

function checkRevenuePartnerTagMissing(trialPlByPartner, targetMonth, findings) {
  if (!trialPlByPartner) return;

  const partners = getPartnerBalances(trialPlByPartner, '売上高');
  const untagged = partners.filter(
    (p) => (p.id === 0 || p.name === '未選択') && p.closing_balance > 0
  );
  if (untagged.length === 0) return;

  const total = untagged.reduce((s, p) => s + p.closing_balance, 0);
  findings.push({
    severity: '🔵',
    category: 'revenue_receivable',
    checkCode: 'RR-03',
    description: `売上高に取引先タグなしの計上（${total.toLocaleString()}円）があります。どの顧客からの売上か不明です。`,
    currentValue: `未選択: ${total.toLocaleString()}円`,
    suggestedValue: '全ての売上取引に取引先タグを設定し、顧客別売上管理ができるようにしてください',
    confidence: 85,
    targetMonth,
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 売上・売掛金チェック（HA-1, GC-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function revenueReceivableCheck(data) {
  const findings = [];
  const {
    trialPl, trialPlByPartner, trialBsByPartner,
    prevMonth, prevYearMonth,
    targetMonth, startMonth,
  } = data;

  if (!trialPl) return findings;

  const prevTrialPl          = prevMonth?.trialPl         ?? null;
  const prevYearTrialPl      = prevYearMonth?.trialPl     ?? null;
  const prevMonthBsByPartner = prevMonth?.trialBsByPartner ?? null;
  const elapsed              = monthsFromFiscalStart(targetMonth, startMonth);

  checkRevenueTrend(trialPl, prevTrialPl, prevYearTrialPl, elapsed, targetMonth, findings);
  checkReceivableStagnation(trialBsByPartner, prevMonthBsByPartner, targetMonth, findings);
  checkRevenuePartnerTagMissing(trialPlByPartner, targetMonth, findings);

  return findings;
}

module.exports = { revenueReceivableCheck };
