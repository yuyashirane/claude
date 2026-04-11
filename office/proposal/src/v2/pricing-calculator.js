// pricing-calculator.js v2.0
// 新しい pricing-table.json (v2.0) を使って料金を計算するモジュール

const path = require('path');
const fs = require('fs');

const PRICING_TABLE_PATH = path.join(__dirname, '..', '..', 'references', 'pricing', 'pricing-table.json');

let _cachedTable = null;

/**
 * pricing-table.json を読み込む（キャッシュあり）
 * @returns {Object} 料金テーブル
 */
function loadPricingTable() {
  if (!_cachedTable) {
    _cachedTable = JSON.parse(fs.readFileSync(PRICING_TABLE_PATH, 'utf8'));
  }
  return _cachedTable;
}

const VALID_SALES_CLASSES = ['A', 'B', 'C', 'D', 'OVER'];
const VALID_MODULES = ['bookkeeping', 'selfBookkeeping'];
const VALID_FREQUENCIES = ['monthly', 'every2months', 'every3months', 'every4months', 'every6months'];
const VALID_TAX_METHODS = ['simplified', 'principle', 'exempt'];

/**
 * 売上クラスのバリデーション
 * @param {string} salesClass
 */
function validateSalesClass(salesClass) {
  if (!VALID_SALES_CLASSES.includes(salesClass)) {
    throw new Error(`不正な売上クラス: "${salesClass}"（有効値: ${VALID_SALES_CLASSES.join(', ')}）`);
  }
}

/**
 * 年商から売上クラスを判定
 * @param {number} annualRevenue - 年商（円）
 * @returns {string} 'A' | 'B' | 'C' | 'D' | 'OVER'
 */
function determineSalesClass(annualRevenue) {
  if (typeof annualRevenue !== 'number' || annualRevenue < 0) {
    throw new Error(`不正な年商: ${annualRevenue}（0以上の数値を指定してください）`);
  }
  if (annualRevenue < 10000000) return 'A';
  if (annualRevenue < 30000000) return 'B';
  if (annualRevenue < 50000000) return 'C';
  if (annualRevenue < 100000000) return 'D';
  return 'OVER';
}

/**
 * 売上クラスが個別見積り対象か判定
 * @param {string} salesClass
 * @returns {boolean}
 */
function requiresManualPricing(salesClass) {
  validateSalesClass(salesClass);
  return salesClass === 'OVER';
}

/**
 * 仕訳数から区分を判定
 * @param {number} transactionCount - 月間仕訳数
 * @returns {string} '100' | '200' | 'over200'
 */
function determineTransactionTier(transactionCount) {
  if (typeof transactionCount !== 'number' || transactionCount < 0) {
    throw new Error(`不正な仕訳数: ${transactionCount}（0以上の数値を指定してください）`);
  }
  if (transactionCount <= 100) return '100';
  if (transactionCount <= 200) return '200';
  return 'over200';
}

/**
 * 月次料金の基本額を計算（記帳代行 or 自計化）
 * @param {Object} params
 * @param {string} params.module - 'bookkeeping' | 'selfBookkeeping'
 * @param {string} params.salesClass - 'A' | 'B' | 'C' | 'D'
 * @param {number} params.transactionCount - 月間仕訳数
 * @returns {Object} { base: number, overage: number, total: number, breakdown: string }
 */
function calculateModuleMonthlyFee({ module, salesClass, transactionCount }) {
  if (!VALID_MODULES.includes(module)) {
    throw new Error(`不正なモジュール: "${module}"（有効値: ${VALID_MODULES.join(', ')}）`);
  }
  validateSalesClass(salesClass);
  if (salesClass === 'OVER') {
    throw new Error('売上クラスOVERは個別見積り対象です。calculateModuleMonthlyFeeは使用できません。');
  }
  if (typeof transactionCount !== 'number' || transactionCount < 0) {
    throw new Error(`不正な仕訳数: ${transactionCount}`);
  }

  const table = loadPricingTable();
  const mod = table.modules[module];
  const tier = determineTransactionTier(transactionCount);

  let base;
  let overage = 0;
  let breakdown;

  if (tier === '100' || tier === '200') {
    base = mod.monthlyMatrix[tier][salesClass];
    breakdown = `${tier}仕訳まで(${salesClass}): ${base.toLocaleString()}円`;
  } else {
    // 200仕訳超: 200仕訳の料金 + 超過分
    base = mod.monthlyMatrix['200'][salesClass];
    const overCount = transactionCount - 200;
    const overUnits = Math.ceil(overCount / 100);
    overage = overUnits * mod.overage.per100;
    breakdown = `200仕訳まで(${salesClass}): ${base.toLocaleString()}円 + ${overUnits}×100仕訳超過分: ${overage.toLocaleString()}円`;
  }

  return {
    base,
    overage,
    total: base + overage,
    breakdown,
  };
}

/**
 * 相談サポートの月次料金
 * @param {string} salesClass - 'A' | 'B' | 'C' | 'D'
 * @param {number} extraMeetings - 追加定例会議の回数（デフォルト0）
 * @returns {number} 月次料金
 */
function calculateConsultationMonthlyFee(salesClass, extraMeetings = 0) {
  validateSalesClass(salesClass);
  if (salesClass === 'OVER') {
    throw new Error('売上クラスOVERは個別見積り対象です。');
  }
  if (typeof extraMeetings !== 'number' || extraMeetings < 0) {
    throw new Error(`不正な追加会議回数: ${extraMeetings}`);
  }

  const table = loadPricingTable();
  const consultation = table.modules.consultation;
  const baseFee = consultation.monthlyByClass[salesClass];
  const extraFee = consultation.extraMeeting.amount * extraMeetings;
  return baseFee + extraFee;
}

/**
 * 納品頻度値引きを取得（記帳代行のみ適用）
 * @param {string} frequency - 'monthly' | 'every2months' | 'every3months' | 'every4months' | 'every6months'
 * @returns {number} 値引き額（負の数、または0）
 */
function getDeliveryDiscount(frequency) {
  if (!VALID_FREQUENCIES.includes(frequency)) {
    throw new Error(`不正な納品頻度: "${frequency}"（有効値: ${VALID_FREQUENCIES.join(', ')}）`);
  }

  const table = loadPricingTable();
  return table.modules.bookkeeping.deliveryDiscount[frequency];
}

/**
 * 年次料金を計算
 * @param {Object} params
 * @param {string} params.salesClass - 'A' | 'B' | 'C' | 'D'
 * @param {string} params.entityType - 'corporate' | 'individual'（デフォルト: 'corporate'）
 * @param {string} params.consumptionTaxMethod - 'simplified' | 'principle' | 'exempt'
 * @param {Object} params.options
 * @param {Object} [params.options.yearEndAdjustment] - { enabled: boolean, people: number }
 * @param {Object} [params.options.statutoryReports] - { enabled: boolean, sheets: number }
 * @param {Object} [params.options.salaryReport] - { enabled: boolean, municipalities: number }
 * @param {Object} [params.options.fixedAssetReport] - { enabled: boolean }
 * @param {Object} [params.options.englishFS] - { enabled: boolean }
 * @param {Object} [params.options.auditSupport] - { enabled: boolean }
 * @returns {Object} { items: [{label: string, detail: string, amount: number}], total: number }
 */
function calculateAnnualFees({ salesClass, entityType = 'corporate', consumptionTaxMethod, options = {} }) {
  validateSalesClass(salesClass);
  if (salesClass === 'OVER') {
    throw new Error('売上クラスOVERは個別見積り対象です。calculateAnnualFeesは使用できません。');
  }
  if (!VALID_TAX_METHODS.includes(consumptionTaxMethod)) {
    throw new Error(`不正な消費税計算方法: "${consumptionTaxMethod}"（有効値: ${VALID_TAX_METHODS.join(', ')}）`);
  }

  const table = loadPricingTable();
  const annual = table.annualFees;
  const items = [];

  // 法人税 or 個人事業申告報酬
  if (entityType === 'corporate') {
    items.push({
      label: annual.corporateTax.label,
      detail: table.salesClasses[salesClass].label,
      amount: annual.corporateTax.byClass[salesClass],
    });
  } else {
    items.push({
      label: annual.individualTax.label,
      detail: table.salesClasses[salesClass].label,
      amount: annual.individualTax.byClass[salesClass],
    });
  }

  // 消費税等申告報酬
  if (consumptionTaxMethod === 'simplified') {
    const amount = annual.consumptionTax.simplified[salesClass];
    if (amount === null) {
      throw new Error(`簡易課税は売上クラス${salesClass}には適用できません（${annual.consumptionTax.note}）`);
    }
    items.push({
      label: annual.consumptionTax.label,
      detail: '簡易課税',
      amount,
    });
  } else if (consumptionTaxMethod === 'principle') {
    const entry = annual.consumptionTax.principle[salesClass];
    items.push({
      label: annual.consumptionTax.label,
      detail: `原則課税（${entry.label}）`,
      amount: entry.base,
    });
  }
  // exempt（免税）の場合は消費税申告報酬なし

  // 年末調整報酬
  const yea = options.yearEndAdjustment;
  if (yea && yea.enabled) {
    const people = yea.people || 0;
    const basePeople = annual.yearEndAdjustment.base.covers.match(/\d+/)[0] | 0;
    const baseAmount = annual.yearEndAdjustment.base.amount;
    const extra = Math.max(0, people - basePeople) * annual.yearEndAdjustment.additional.amount;
    items.push({
      label: annual.yearEndAdjustment.label,
      detail: people <= basePeople ? `基本（${basePeople}名まで）` : `${basePeople}名まで + 追加${people - basePeople}名`,
      amount: baseAmount + extra,
    });
  }

  // 法定調書報酬
  const sr = options.statutoryReports;
  if (sr && sr.enabled) {
    const sheets = sr.sheets || 0;
    const baseSheets = annual.statutoryReports.base.covers.match(/\d+/)[0] | 0;
    const baseAmount = annual.statutoryReports.base.amount;
    const extra = Math.max(0, sheets - baseSheets) * annual.statutoryReports.additional.amount;
    items.push({
      label: annual.statutoryReports.label,
      detail: sheets <= baseSheets ? `基本（${baseSheets}枚まで）` : `${baseSheets}枚まで + 追加${sheets - baseSheets}枚`,
      amount: baseAmount + extra,
    });
  }

  // 給与支払報告書
  const salRep = options.salaryReport;
  if (salRep && salRep.enabled && salRep.municipalities > 0) {
    items.push({
      label: annual.salaryReport.label,
      detail: `${salRep.municipalities}自治体`,
      amount: annual.salaryReport.amount * salRep.municipalities,
    });
  }

  // 償却資産申告報酬
  if (options.fixedAssetReport && options.fixedAssetReport.enabled) {
    items.push({
      label: annual.fixedAssetReport.label,
      detail: '',
      amount: annual.fixedAssetReport.amount,
    });
  }

  // 英文財務諸表作成報酬
  if (options.englishFS && options.englishFS.enabled) {
    items.push({
      label: annual.englishFS.label,
      detail: '',
      amount: annual.englishFS.amount,
    });
  }

  // 監査対応報酬
  if (options.auditSupport && options.auditSupport.enabled) {
    items.push({
      label: annual.auditSupport.label,
      detail: annual.auditSupport.note,
      amount: annual.auditSupport.amount,
    });
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, total };
}

module.exports = {
  loadPricingTable,
  determineSalesClass,
  requiresManualPricing,
  determineTransactionTier,
  calculateModuleMonthlyFee,
  calculateConsultationMonthlyFee,
  getDeliveryDiscount,
  calculateAnnualFees,
};
