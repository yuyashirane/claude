'use strict';

/**
 * withholding-tax.js — WT-01〜WT-06: 源泉所得税チェック（月次モードB）
 *
 * 既存の outsource.js（OS-01/OS-02）とは観点が異なる:
 *   OS-01/02: 取引先別PL残高ベースの士業報酬チェック
 *   WT系:     deals の個別取引レベルで源泉徴収の有無・金額を検証
 *
 * チェック一覧:
 *   WT-01 🔴 個人士業への支払いで源泉未処理の疑い
 *   WT-02 🟡 デザイン・原稿・翻訳等の源泉対象報酬チェック
 *   WT-03 🟡 源泉税額の検算（預り金あり取引の金額検証）
 *   WT-04 🟡 預り金の滞留チェック
 *   WT-05 🔵 納期の特例の期限チェック（6月/12月のみ）
 *   WT-06 🔵 非居住者への支払い確認
 *
 * データソース:
 *   data.deals          — 当月の取引一覧
 *   data.trialBs        — BS試算表
 *   data.trialPl        — PL試算表（account_item_id → name マップ構築用）
 *   data.prevMonth       — 前月データ
 *   data.companyId / targetMonth / fiscalYear / startMonth / fiscalYearId
 */

const { getBalances, findAccountBalance, resolvePartnerName } = require('./trial-helpers');
const { detectOverseasService } = require('../../shared/overseas-services');
const { dealLink, generalLedgerLink } = require('../../shared/freee-links');

// ============================================================
// 定数
// ============================================================

// 源泉徴収対象報酬が計上される科目
const TARGET_ACCOUNTS = ['支払手数料', '支払報酬料', '外注費', '支払報酬'];

// 法人格キーワード（これらを含む取引先は法人 → 源泉不要）
const CORPORATE_KEYWORDS = [
  '株式会社', '合同会社', '有限会社', '合名会社', '合資会社',
  '一般社団法人', '一般財団法人', '公益社団法人', '公益財団法人',
  '医療法人', '社会福祉法人', '学校法人', 'NPO法人',
  '（株）', '(株)', '㈱', '（有）', '(有)',
  '（合）', '(合)', '（同）', '(同)',
];

// 士業キーワード（個人士業の検出強化用）
const PROFESSIONAL_KEYWORDS = [
  '税理士', '弁護士', '司法書士', '社労士', '社会保険労務士',
  '公認会計士', '弁理士', '不動産鑑定士', '土地家屋調査士',
  '会計事務所', '法律事務所', '司法書士事務所', '特許事務所',
];

// 行政書士は源泉対象外（所得税法204条1項2号の対象外）
const EXEMPT_PROFESSIONAL_KEYWORDS = ['行政書士'];

// WT-02: デザイン・原稿等の源泉対象報酬キーワード（所得税法204条1項1号）
const DESIGN_KEYWORDS = [
  'デザイン', 'イラスト', '原稿', '翻訳', '講演', '講師',
  'ライティング', '写真撮影', 'カメラマン', 'モデル',
  'コピーライト', '作曲', '編曲', '脚本',
];

// WT-03: 源泉税額の許容誤差
const TAX_TOLERANCE_RATE = 0.05; // ±5%
const TAX_TOLERANCE_MIN = 100;   // 最低100円差

// WT-04: 預り金滞留の閾値
const DEPOSIT_INCREASE_RATE = 1.5;  // 前月比150%
const DEPOSIT_INCREASE_MIN = 50000; // 増加額5万円以上

// details 上限
const MAX_DETAILS = 10;

// ============================================================
// ヘルパー: account_item_id → name マップ構築
// ============================================================

function buildAccountIdNameMap(trialBs, trialPl) {
  const map = new Map();
  for (const trial of [trialBs, trialPl]) {
    const balances = getBalances(trial);
    for (const b of balances) {
      if (b.account_item_id && b.account_item_name) {
        map.set(b.account_item_id, b.account_item_name);
      }
    }
  }
  return map;
}

// ============================================================
// ヘルパー: 月範囲
// ============================================================

function getMonthRange(targetMonth) {
  const [year, month] = targetMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ============================================================
// ヘルパー: 法人判定
// ============================================================

function isCorporate(partnerName) {
  if (!partnerName) return false;
  return CORPORATE_KEYWORDS.some(kw => partnerName.includes(kw));
}

// ============================================================
// ヘルパー: 士業判定（行政書士除外）
// ============================================================

function isProfessional(text) {
  if (!text) return false;
  // 行政書士は源泉対象外
  if (EXEMPT_PROFESSIONAL_KEYWORDS.some(kw => text.includes(kw))) return false;
  return PROFESSIONAL_KEYWORDS.some(kw => text.includes(kw));
}

// ============================================================
// ヘルパー: 行政書士判定
// ============================================================

function isExemptProfessional(text) {
  if (!text) return false;
  return EXEMPT_PROFESSIONAL_KEYWORDS.some(kw => text.includes(kw));
}

// ============================================================
// ヘルパー: 源泉税の期待額を算出
// ============================================================

function calcExpectedTax(amount, isSolicitor) {
  if (isSolicitor) {
    // 司法書士: (支払金額 - 10,000円) × 10.21%
    return Math.floor(Math.max(0, amount - 10000) * 0.1021);
  }
  if (amount <= 1000000) {
    return Math.floor(amount * 0.1021);
  }
  // 100万円超
  return Math.floor(1000000 * 0.1021 + (amount - 1000000) * 0.2042);
}

// ============================================================
// ヘルパー: deal内に預り金科目があるか確認
// ============================================================

function findWithholdingDetail(deal, accountIdNameMap) {
  if (!deal.details) return null;
  for (const det of deal.details) {
    const name = accountIdNameMap.get(det.account_item_id);
    if (name && name.includes('預り金')) {
      return { amount: det.amount, name };
    }
  }
  return null;
}

// ============================================================
// ヘルパー: 対象科目の取引を判定
// ============================================================

function isTargetAccount(accountName) {
  if (!accountName) return false;
  return TARGET_ACCOUNTS.some(a => accountName.includes(a));
}

// ============================================================
// WT-01: 個人士業への支払いで源泉未処理の疑い
// ============================================================

function checkProfessionalWithholding(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYearId, partners } = data;
  if (!deals) return;

  // 取引先単位で集計
  const violations = new Map(); // partnerKey → { partnerName, count, totalAmount, details[] }

  for (const deal of deals) {
    if (!deal.details) continue;

    const partnerName = resolvePartnerName(deal, partners);
    // 法人は除外
    if (isCorporate(partnerName)) continue;

    // 行政書士は源泉対象外
    if (isExemptProfessional(partnerName)) continue;

    for (const det of deal.details) {
      if (det.entry_side !== 'debit') continue;
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!isTargetAccount(accountName)) continue;

      // 士業キーワードチェック（取引先名 + 摘要）
      const searchText = partnerName + ' ' + (det.description || '');
      if (!isProfessional(searchText)) continue;

      // 預り金があるかチェック
      const withholding = findWithholdingDetail(deal, accountIdNameMap);
      if (withholding) continue; // 預り金あり → OK

      const partnerKey = partnerName || `deal_${deal.id}`;
      if (!violations.has(partnerKey)) {
        violations.set(partnerKey, { partnerName, count: 0, totalAmount: 0, details: [] });
      }
      const v = violations.get(partnerKey);
      v.count++;
      v.totalAmount += det.amount;
      v.details.push({
        date: deal.issue_date,
        amount: det.amount,
        counterAccount: accountName,
        description: det.description || '',
        dealId: deal.id,
        freeeLink: dealLink(deal.id),
      });
    }
  }

  for (const [, v] of violations) {
    const expectedTax = calcExpectedTax(v.totalAmount, false);
    findings.push({
      severity: '🔴',
      category: 'withholding_tax',
      checkCode: 'WT-01',
      description: `「${v.partnerName}」への支払報酬（${v.totalAmount.toLocaleString()}円 × ${v.count}件）に預り金の計上がありません。源泉所得税（10.21%）の徴収漏れの可能性があります。`,
      currentValue: '預り金なし',
      suggestedValue: `源泉所得税 約${expectedTax.toLocaleString()}円を預り金計上`,
      confidence: 85,
      targetMonth: data.targetMonth,
      freeeLink: '',
      details: v.details.slice(0, MAX_DETAILS),
    });
  }
}

// ============================================================
// WT-02: デザイン・原稿・翻訳等の源泉対象報酬チェック
// ============================================================

function checkDesignWithholding(data, accountIdNameMap, findings) {
  const { deals, targetMonth, partners } = data;
  if (!deals) return;

  const issues = [];

  for (const deal of deals) {
    if (!deal.details) continue;

    const partnerName = resolvePartnerName(deal, partners);
    // 法人は除外
    if (isCorporate(partnerName)) continue;

    for (const det of deal.details) {
      if (det.entry_side !== 'debit') continue;
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!isTargetAccount(accountName)) continue;

      // WT-01で既にチェックされた士業は除外
      const searchText = partnerName + ' ' + (det.description || '');
      if (isProfessional(searchText)) continue;

      // デザイン・原稿等のキーワードチェック
      const desc = (det.description || '') + ' ' + partnerName;
      if (!DESIGN_KEYWORDS.some(kw => desc.includes(kw))) continue;

      // 預り金があるかチェック
      const withholding = findWithholdingDetail(deal, accountIdNameMap);
      if (withholding) continue;

      issues.push({
        date: deal.issue_date,
        amount: det.amount,
        counterAccount: accountName,
        description: det.description || partnerName,
        dealId: deal.id,
        freeeLink: dealLink(deal.id),
      });
    }
  }

  if (issues.length === 0) return;

  const totalAmount = issues.reduce((s, d) => s + d.amount, 0);
  findings.push({
    severity: '🟡',
    category: 'withholding_tax',
    checkCode: 'WT-02',
    description: `デザイン・原稿・翻訳等の源泉対象報酬が${issues.length}件（${totalAmount.toLocaleString()}円）あり、預り金の計上がありません。個人への支払いの場合、源泉徴収が必要です。`,
    currentValue: `預り金なし × ${issues.length}件`,
    suggestedValue: '個人への支払いなら源泉所得税（10.21%）を預り金計上',
    confidence: 70,
    targetMonth,
    freeeLink: '',
    details: issues.slice(0, MAX_DETAILS),
  });
}

// ============================================================
// WT-03: 源泉税額の検算
// ============================================================

function checkWithholdingAmount(data, accountIdNameMap, findings) {
  const { deals, targetMonth, partners } = data;
  if (!deals) return;

  const miscalculated = [];

  for (const deal of deals) {
    if (!deal.details) continue;

    const partnerName = resolvePartnerName(deal, partners);
    if (isCorporate(partnerName)) continue;

    // 対象科目のdebit明細を探す
    const targetDetails = deal.details.filter(det => {
      if (det.entry_side !== 'debit') return false;
      const accountName = accountIdNameMap.get(det.account_item_id);
      return isTargetAccount(accountName);
    });

    if (targetDetails.length === 0) continue;

    // 預り金を探す
    const withholding = findWithholdingDetail(deal, accountIdNameMap);
    if (!withholding) continue; // 預り金なし → WT-01/02の対象

    // 報酬金額（対象科目のdebit合計）
    const reportAmount = targetDetails.reduce((s, d) => s + d.amount, 0);
    if (reportAmount <= 0) continue;

    // 司法書士判定
    const searchText = partnerName + ' ' + (deal.details.map(d => d.description || '').join(' '));
    const isSolicitor = searchText.includes('司法書士');

    const expectedTax = calcExpectedTax(reportAmount, isSolicitor);
    const actualTax = Math.abs(withholding.amount);

    // 許容範囲チェック
    const diff = Math.abs(expectedTax - actualTax);
    if (diff < TAX_TOLERANCE_MIN) continue;
    if (expectedTax > 0 && diff / expectedTax < TAX_TOLERANCE_RATE) continue;

    miscalculated.push({
      date: deal.issue_date,
      amount: reportAmount,
      counterAccount: `預り金: ${actualTax.toLocaleString()}円（期待: ${expectedTax.toLocaleString()}円）`,
      description: partnerName || (deal.details[0]?.description || ''),
      dealId: deal.id,
      freeeLink: dealLink(deal.id),
    });
  }

  if (miscalculated.length === 0) return;

  findings.push({
    severity: '🟡',
    category: 'withholding_tax',
    checkCode: 'WT-03',
    description: `源泉税額が期待値と乖離している取引が${miscalculated.length}件あります。消費税の税込/税抜の違い、または計算誤りの可能性があります。`,
    currentValue: `乖離 × ${miscalculated.length}件`,
    suggestedValue: '源泉税額を再計算してください',
    confidence: 70,
    targetMonth,
    freeeLink: '',
    details: miscalculated.slice(0, MAX_DETAILS),
  });
}

// ============================================================
// WT-04: 預り金の滞留チェック
// ============================================================

function checkDepositStagnation(data, findings) {
  const { trialBs, prevMonth, companyId, targetMonth, fiscalYearId } = data;
  if (!trialBs || !prevMonth?.trialBs) return;

  const curr = findAccountBalance(trialBs, '預り金');
  if (!curr) return;

  const prev = findAccountBalance(prevMonth.trialBs, '預り金');
  if (!prev) return;

  const increase = curr.balance - prev.balance;
  if (increase < DEPOSIT_INCREASE_MIN) return;
  if (prev.balance > 0 && curr.balance / prev.balance < DEPOSIT_INCREASE_RATE) return;

  const { startDate, endDate } = getMonthRange(targetMonth);
  findings.push({
    severity: '🟡',
    category: 'withholding_tax',
    checkCode: 'WT-04',
    description: `預り金の残高が前月比で大幅に増加しています（${prev.balance.toLocaleString()}円 → ${curr.balance.toLocaleString()}円、増加${increase.toLocaleString()}円）。源泉税の納付漏れの可能性があります。`,
    currentValue: `${curr.balance.toLocaleString()}円（前月: ${prev.balance.toLocaleString()}円）`,
    suggestedValue: '源泉所得税の納付状況を確認してください',
    confidence: 70,
    targetMonth,
    freeeLink: generalLedgerLink(companyId, '預り金', startDate, endDate, { fiscalYearId }),
    details: [],
  });
}

// ============================================================
// WT-05: 納期の特例の期限チェック
// ============================================================

function checkSpecialDueDate(data, findings) {
  const { targetMonth } = data;
  const [, month] = targetMonth.split('-').map(Number);

  if (month === 6) {
    findings.push({
      severity: '🔵',
      category: 'withholding_tax',
      checkCode: 'WT-05',
      description: '源泉所得税の納期の特例: 1〜6月分の納付期限は7月10日です。対象の源泉税を忘れずに納付してください。',
      currentValue: '対象月: 6月（1〜6月分の納付時期）',
      suggestedValue: '7月10日までに納付',
      confidence: 100,
      targetMonth,
      freeeLink: '',
      details: [],
    });
  } else if (month === 12) {
    findings.push({
      severity: '🔵',
      category: 'withholding_tax',
      checkCode: 'WT-05',
      description: '源泉所得税の納期の特例: 7〜12月分の納付期限は翌年1月20日です。対象の源泉税を忘れずに納付してください。',
      currentValue: '対象月: 12月（7〜12月分の納付時期）',
      suggestedValue: '翌年1月20日までに納付',
      confidence: 100,
      targetMonth,
      freeeLink: '',
      details: [],
    });
  }
}

// ============================================================
// WT-06: 非居住者への支払い確認
// ============================================================

function checkNonResidentPayments(data, accountIdNameMap, findings) {
  const { deals, targetMonth, partners } = data;
  if (!deals) return;

  const nonResidentPayments = [];

  for (const deal of deals) {
    if (!deal.details) continue;
    const partnerName = resolvePartnerName(deal, partners);
    for (const det of deal.details) {
      if (det.entry_side !== 'debit') return;
      const desc = (det.description || '') + ' ' + partnerName;
      const detected = detectOverseasService(desc);
      if (!detected) continue;
      if (detected.service.isDomestic) continue;

      nonResidentPayments.push({
        date: deal.issue_date,
        amount: det.amount,
        counterAccount: accountIdNameMap.get(det.account_item_id) || '',
        description: detected.service.serviceName || desc,
        dealId: deal.id,
        freeeLink: dealLink(deal.id),
      });
    }
  }

  if (nonResidentPayments.length === 0) return;

  const totalAmount = nonResidentPayments.reduce((s, d) => s + d.amount, 0);
  findings.push({
    severity: '🔵',
    category: 'withholding_tax',
    checkCode: 'WT-06',
    description: `非居住者（海外事業者）への支払いが${nonResidentPayments.length}件（${totalAmount.toLocaleString()}円）あります。源泉徴収（20.42%）の要否を確認してください。`,
    currentValue: `${nonResidentPayments.length}件（${totalAmount.toLocaleString()}円）`,
    suggestedValue: '非居住者への報酬は原則20.42%の源泉徴収が必要（電子サービスは通常不要）',
    confidence: 50,
    targetMonth,
    freeeLink: '',
    details: nonResidentPayments.slice(0, MAX_DETAILS),
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 源泉所得税チェック（月次モードB）
 *
 * @param {Object} data - monthly-checker.js が渡す context オブジェクト
 * @returns {Array<Finding>}
 */
function withholdingTaxCheck(data) {
  const findings = [];
  const { trialBs, trialPl, deals } = data;

  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl);

  checkProfessionalWithholding(data, accountIdNameMap, findings);  // WT-01
  checkDesignWithholding(data, accountIdNameMap, findings);         // WT-02
  checkWithholdingAmount(data, accountIdNameMap, findings);         // WT-03
  checkDepositStagnation(data, findings);                           // WT-04
  checkSpecialDueDate(data, findings);                              // WT-05
  checkNonResidentPayments(data, accountIdNameMap, findings);       // WT-06

  return findings;
}

module.exports = {
  withholdingTaxCheck,
  // テスト用
  isCorporate,
  isProfessional,
  isExemptProfessional,
  calcExpectedTax,
};
