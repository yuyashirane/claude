'use strict';

/**
 * tax-classification.js — TC-01〜TC-08: 消費税区分チェック（月次モードB）
 *
 * モードA（post-register-checker の tax-checker.js）とは別物。
 * モードAは「パイプライン直後の個別取引チェック」、
 * こちらは「月次の deals ベースで科目×税区分の妥当性を検証」。
 *
 * チェック一覧:
 *   TC-01 🔴 不課税であるべき科目に課税仕入がある
 *   TC-02 🔴 非課税であるべき科目に課税仕入がある
 *   TC-03 🟡 地代家賃の住居系非課税チェック
 *   TC-04 🔴 海外サービスのリバースチャージ・適格請求書チェック
 *   TC-05 🟡 軽減税率の適用確認
 *   TC-06 🟡 同一科目内の税区分混在チェック
 *   TC-07 🔴 売上の税区分チェック
 *   TC-08 🔵 高額課税仕入の確認
 *
 * データソース:
 *   data.deals         — 当月の取引一覧
 *   data.trialBs       — BS試算表（account_item_id → name マップ構築用）
 *   data.trialPl       — PL試算表（同上）
 *   data.companyId      — 事業所ID（freeeリンク生成用）
 *   data.targetMonth    — 対象月 'YYYY-MM'
 *   data.fiscalYear     — 期首年
 *   data.startMonth     — 期首月
 *   data.fiscalYearId   — freee内部ID
 */

const { getBalances } = require('./trial-helpers');
const { detectOverseasService } = require('../../shared/overseas-services');
const { TAX_CODE_NAMES } = require('../../shared/rules');
const {
  dealLink,
  generalLedgerLink,
  generalLedgerLinkWithTaxFilter,
  TAX_CODE_TO_URL_PARAMS,
  formatFiscalStartDate,
} = require('../../shared/freee-links');

// ============================================================
// 定数: 税区分カテゴリ判定用のコードセット
// ============================================================

// 課税仕入系（標準・旧税率含む）
const TAXABLE_PURCHASE_CODES = new Set([
  34,               // 課対仕入
  108,              // 課対仕入8%
  136,              // 課対仕入10%
  183, 184,         // 課対仕入（控80/50）
  185, 186,         // 課対仕入（控80/50）8%
  187, 188,         // 課対仕入（控80/50）8%（軽）
  189, 190,         // 課対仕入（控80/50）10%
]);

// 軽減税率仕入系
const REDUCED_PURCHASE_CODES = new Set([
  163,              // 課対仕入8%（軽）
  187, 188,         // 課対仕入（控80/50）8%（軽）
]);

// 標準税率仕入（10%）
const STANDARD_PURCHASE_10_CODES = new Set([
  136,              // 課対仕入10%
  189, 190,         // 課対仕入（控80/50）10%
]);

// 課税売上系
const TAXABLE_SALES_CODES = new Set([
  21,               // 課税売上
  101,              // 課税売上8%
  129,              // 課税売上10%
  156,              // 課税売上8%（軽）
]);

// 非課税売上系
const NON_TAXABLE_SALES_CODES = new Set([
  23,               // 非課売上
]);

// 対象外（不課税）
const NON_SUBJECT_CODE = 2;

// ============================================================
// ヘルパー: 税区分カテゴリ判定
// ============================================================

function isTaxablePurchase(code) { return TAXABLE_PURCHASE_CODES.has(code); }
function isReducedPurchase(code) { return REDUCED_PURCHASE_CODES.has(code); }
function isStandardPurchase10(code) { return STANDARD_PURCHASE_10_CODES.has(code); }
function isTaxableSales(code) { return TAXABLE_SALES_CODES.has(code); }
function isNonSubject(code) { return code === NON_SUBJECT_CODE; }

function getTaxLabel(code) {
  return TAX_CODE_NAMES[code] || `税区分コード${code}`;
}

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
// ヘルパー: 月の範囲を返す
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
// ヘルパー: details 行を生成
// ============================================================

function makeDetailRow(deal, det, accountIdNameMap) {
  // 相手科目
  const counterDetails = deal.details.filter(d => d !== det);
  let counterAccount = '';
  if (counterDetails.length > 0) {
    counterAccount = accountIdNameMap.get(counterDetails[0].account_item_id)
      || `ID:${counterDetails[0].account_item_id}`;
  }
  return {
    date: deal.issue_date,
    amount: det.amount,
    counterAccount,
    description: det.description || deal.partner_name || '',
    dealId: deal.id,
    freeeLink: dealLink(deal.id),
  };
}

// ============================================================
// 定数: TC-01 不課税であるべき科目
// ============================================================

const NON_SUBJECT_ACCOUNTS = [
  '給料手当', '役員報酬', '法定福利費', '租税公課',
  '法人税、住民税及び事業税', '賞与', '退職金', '退職給付費用',
];

// TC-01 例外: 租税公課の印紙代は課税仕入で正しい
const STAMP_KEYWORDS = ['印紙', '収入印紙'];

// ============================================================
// 定数: TC-02 非課税であるべき科目
// ============================================================

const NON_TAXABLE_PURCHASE_ACCOUNTS = ['支払保険料', '支払利息'];
const NON_TAXABLE_SALES_ACCOUNTS = ['受取利息', '受取配当金'];

// ============================================================
// 定数: TC-03 地代家賃の住居系キーワード
// ============================================================

const RESIDENTIAL_KEYWORDS = [
  '住居', '居住', 'マンション', 'アパート', '住宅', '社宅', '寮',
  '借上', '借り上げ', '家賃補助', '住宅手当',
];

// ============================================================
// 定数: TC-05 軽減税率
// ============================================================

const FOOD_KEYWORDS = [
  '弁当', '食品', '飲料', 'お茶', 'ジュース', '水', '食料', 'テイクアウト',
  'チョコレート', 'チョコ', '食料品', '菓子', 'スーパー', 'コンビニ',
  'まいばすけっと', 'セブン', 'ローソン', 'ファミリーマート',
  'ウーバーイーツ', 'Uber Eats', '出前館', 'ケーキ', 'パン',
];
const FOOD_EXCEPTION_KEYWORDS = [
  '外食', 'レストラン', '居酒屋', '酒', 'ビール', 'ワイン', 'ケータリング', '出張料理',
];
const NON_FOOD_KEYWORDS = [
  '日用品', '雑貨', '衣料', 'LED', '看板', '文具', '電池',
];
const NEWSPAPER_KEYWORDS = ['新聞', '日経', '読売', '朝日', '毎日', '産経', '日刊'];
const SUBSCRIPTION_KEYWORDS = ['定期', '購読', '月極', '月ぎめ'];

// ============================================================
// 定数: TC-06 混在除外科目
// ============================================================

const MIXED_TAX_EXCLUDE_ACCOUNTS = [
  '福利厚生費', '旅費交通費', '租税公課', '消耗品費',
];

// ============================================================
// 定数: TC-07 売上科目
// ============================================================

const SALES_ACCOUNTS = ['売上高', '売上原価'];

// TC-07 例外: 非課税売上で正しいケース
const NON_TAXABLE_SALES_KEYWORDS = [
  '土地', '有価証券', '住宅', '社宅', '住居', '社会保険診療',
];

// ============================================================
// 定数: TC-08 高額課税仕入の閾値
// ============================================================

const HIGH_VALUE_THRESHOLD = 1000000; // 100万円

// details 上限
const MAX_DETAILS = 10;

// ============================================================
// TC-01: 不課税であるべき科目に課税仕入がある
// ============================================================

function checkNonSubjectAccounts(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId } = data;
  if (!deals) return;

  // 科目ごとに課税仕入の取引を集計
  const violations = new Map(); // accountName → { count, totalAmount, details[] }

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      if (!isTaxablePurchase(det.tax_code) && !isReducedPurchase(det.tax_code)) continue;

      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName) continue;
      if (!NON_SUBJECT_ACCOUNTS.some(a => accountName.includes(a))) continue;

      // 例外: 租税公課の印紙代
      if (accountName.includes('租税公課')) {
        const desc = (det.description || '') + ' ' + (deal.partner_name || '');
        if (STAMP_KEYWORDS.some(kw => desc.includes(kw))) continue;
      }

      if (!violations.has(accountName)) {
        violations.set(accountName, { count: 0, totalAmount: 0, details: [], accountItemId: det.account_item_id });
      }
      const v = violations.get(accountName);
      v.count++;
      v.totalAmount += det.amount;
      v.details.push(makeDetailRow(deal, det, accountIdNameMap));
    }
  }

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const [accountName, v] of violations) {
    const limited = v.details.slice(0, MAX_DETAILS);
    const overflow = v.details.length > MAX_DETAILS ? v.details.length - MAX_DETAILS : 0;

    // 税区分の内訳を集計
    const taxBreakdown = {};
    for (const d of v.details) {
      // detailsからtax_codeは取れないのでlabel不明→件数のみ
    }

    let desc = `「${accountName}」に課税仕入が${v.count}件（${v.totalAmount.toLocaleString()}円）含まれています。この科目は不課税（対象外）です。`;
    if (overflow > 0) desc += `（他${overflow}件）`;

    findings.push({
      severity: '🔴',
      category: 'tax_classification',
      checkCode: 'TC-01',
      description: desc,
      currentValue: `課税仕入 × ${v.count}件（${v.totalAmount.toLocaleString()}円）`,
      suggestedValue: '対象外に修正',
      confidence: 95,
      targetMonth,
      freeeLink: generalLedgerLinkWithTaxFilter(companyId, accountName, startDate, endDate, { fiscalYearId }, { taxGroupCode: 34 }),
      details: limited,
    });
  }
}

// ============================================================
// TC-02: 非課税であるべき科目に課税仕入がある
// ============================================================

function checkNonTaxableAccounts(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYear, startMonth, fiscalYearId } = data;
  if (!deals) return;

  const violations = new Map();

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName) continue;

      // 仕入側の非課税科目: 課税仕入がNG
      const isPurchaseAccount = NON_TAXABLE_PURCHASE_ACCOUNTS.some(a => accountName.includes(a));
      if (isPurchaseAccount && (isTaxablePurchase(det.tax_code) || isReducedPurchase(det.tax_code))) {
        if (!violations.has(accountName)) {
          violations.set(accountName, { count: 0, totalAmount: 0, details: [], suggestedTax: '非課仕入' });
        }
        const v = violations.get(accountName);
        v.count++;
        v.totalAmount += det.amount;
        v.details.push(makeDetailRow(deal, det, accountIdNameMap));
      }

      // 売上側の非課税科目: 課税売上がNG
      const isSalesAccount = NON_TAXABLE_SALES_ACCOUNTS.some(a => accountName.includes(a));
      if (isSalesAccount && isTaxableSales(det.tax_code)) {
        if (!violations.has(accountName)) {
          violations.set(accountName, { count: 0, totalAmount: 0, details: [], suggestedTax: '非課売上' });
        }
        const v = violations.get(accountName);
        v.count++;
        v.totalAmount += det.amount;
        v.details.push(makeDetailRow(deal, det, accountIdNameMap));
      }
    }
  }

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const [accountName, v] of violations) {
    const limited = v.details.slice(0, MAX_DETAILS);
    const overflow = v.details.length > MAX_DETAILS ? v.details.length - MAX_DETAILS : 0;

    let desc = `「${accountName}」に課税区分が${v.count}件（${v.totalAmount.toLocaleString()}円）含まれています。この科目は非課税（${v.suggestedTax}）です。`;
    if (overflow > 0) desc += `（他${overflow}件）`;

    findings.push({
      severity: '🔴',
      category: 'tax_classification',
      checkCode: 'TC-02',
      description: desc,
      currentValue: `課税区分 × ${v.count}件（${v.totalAmount.toLocaleString()}円）`,
      suggestedValue: `${v.suggestedTax}に修正`,
      confidence: 90,
      targetMonth,
      freeeLink: generalLedgerLinkWithTaxFilter(companyId, accountName, startDate, endDate, { fiscalYearId }, { taxGroupCode: 34 }),
      details: limited,
    });
  }
}

// ============================================================
// TC-03: 地代家賃の住居系非課税チェック
// ============================================================

function checkResidentialRent(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYearId } = data;
  if (!deals) return;

  const residentialDeals = [];

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName || !accountName.includes('地代家賃')) continue;
      if (!isTaxablePurchase(det.tax_code) && !isReducedPurchase(det.tax_code)) continue;

      // 摘要 + 取引先名で住居系キーワードチェック
      const searchText = (det.description || '') + ' ' + (deal.partner_name || '');
      if (!RESIDENTIAL_KEYWORDS.some(kw => searchText.includes(kw))) continue;

      residentialDeals.push(makeDetailRow(deal, det, accountIdNameMap));
    }
  }

  if (residentialDeals.length === 0) return;

  const { startDate, endDate } = getMonthRange(targetMonth);
  const totalAmount = residentialDeals.reduce((s, d) => s + d.amount, 0);

  findings.push({
    severity: '🟡',
    category: 'tax_classification',
    checkCode: 'TC-03',
    description: `地代家賃に住居系キーワードを含む課税仕入が${residentialDeals.length}件（${totalAmount.toLocaleString()}円）あります。住居用の場合は非課税です。`,
    currentValue: `課税仕入 × ${residentialDeals.length}件`,
    suggestedValue: '住居用なら非課仕入に修正',
    confidence: 75,
    targetMonth,
    freeeLink: generalLedgerLinkWithTaxFilter(companyId, '地代家賃', startDate, endDate, { fiscalYearId }, { taxGroupCode: 34 }),
    details: residentialDeals.slice(0, MAX_DETAILS),
  });
}

// ============================================================
// TC-04: 海外サービスのリバースチャージ・適格請求書チェック
// ============================================================

function checkOverseasServices(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYearId } = data;
  if (!deals) return;

  // 海外サービスを取引先単位で集計
  const serviceMap = new Map(); // serviceName → { service, details[], totalAmount }

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      if (det.entry_side !== 'debit') continue;
      const desc = (det.description || '') + ' ' + (deal.partner_name || '');
      const detected = detectOverseasService(desc);
      if (!detected) continue;

      const svc = detected.service;
      // isDomestic=true → 国内法人経由 → 課対仕入で正しい → スキップ
      if (svc.isDomestic) continue;

      const key = svc.serviceName || svc.provider;
      if (!serviceMap.has(key)) {
        serviceMap.set(key, { service: svc, details: [], totalAmount: 0 });
      }
      const entry = serviceMap.get(key);
      entry.totalAmount += det.amount;
      entry.details.push({
        ...makeDetailRow(deal, det, accountIdNameMap),
        taxCode: det.tax_code,
        taxLabel: getTaxLabel(det.tax_code),
      });
    }
  }

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const [serviceName, entry] of serviceMap) {
    const svc = entry.service;
    // invoiceRegistered=true → 適格請求書発行事業者 → 課対仕入で正しい
    // ただし対象外になっていたら指摘
    const wrongDetails = entry.details.filter(d => {
      if (svc.invoiceRegistered) {
        // 登録済み → 課対仕入系が正しい。対象外なら指摘
        return isNonSubject(d.taxCode);
      }
      // 未登録 → 対象外が正しい。課対仕入なら指摘
      return isTaxablePurchase(d.taxCode) || isReducedPurchase(d.taxCode);
    });

    if (wrongDetails.length === 0) continue;

    const suggestedValue = svc.invoiceRegistered
      ? '課対仕入（適格請求書発行事業者）'
      : '対象外（インボイス未登録の国外事業者）';

    const invoiceNote = svc.invoiceRegistered
      ? `（インボイス登録済: ${svc.invoiceNumber || '番号要確認'}）`
      : '（インボイス未登録）';

    findings.push({
      severity: '🔴',
      category: 'tax_classification',
      checkCode: 'TC-04',
      description: `海外サービス「${serviceName}」${invoiceNote}の税区分が不適切です。${wrongDetails.length}件（${entry.totalAmount.toLocaleString()}円）。`,
      currentValue: wrongDetails.map(d => d.taxLabel).filter((v, i, a) => a.indexOf(v) === i).join('、'),
      suggestedValue,
      confidence: 90,
      targetMonth,
      freeeLink: '',
      details: wrongDetails.slice(0, MAX_DETAILS),
    });
  }
}

// ============================================================
// TC-05: 軽減税率の適用確認
// ============================================================

function checkReducedTaxRate(data, accountIdNameMap, findings) {
  const { deals, targetMonth } = data;
  if (!deals) return;

  const issues = [];

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const desc = (det.description || '') + ' ' + (deal.partner_name || '');

      const hasFoodKw = FOOD_KEYWORDS.some(kw => desc.includes(kw));
      const hasFoodException = FOOD_EXCEPTION_KEYWORDS.some(kw => desc.includes(kw));
      const hasNonFoodKw = NON_FOOD_KEYWORDS.some(kw => desc.includes(kw));
      const hasNewspaper = NEWSPAPER_KEYWORDS.some(kw => desc.includes(kw));
      const hasSubscription = SUBSCRIPTION_KEYWORDS.some(kw => desc.includes(kw));

      // パターンA: 食品系キーワード + 標準10% → 軽減8%の可能性
      if (hasFoodKw && !hasFoodException && !hasNonFoodKw && isStandardPurchase10(det.tax_code)) {
        issues.push({
          type: 'food_should_be_reduced',
          detail: makeDetailRow(deal, det, accountIdNameMap),
          desc,
        });
      }

      // パターンB: 非食品キーワード + 軽減8% → 標準10%の可能性
      if (hasNonFoodKw && isReducedPurchase(det.tax_code)) {
        issues.push({
          type: 'nonfood_should_be_standard',
          detail: makeDetailRow(deal, det, accountIdNameMap),
          desc,
        });
      }

      // 新聞: 定期購読キーワードあり + 標準10% → 軽減8%が正しい
      if (hasNewspaper && hasSubscription && isStandardPurchase10(det.tax_code)) {
        issues.push({
          type: 'newspaper_should_be_reduced',
          detail: makeDetailRow(deal, det, accountIdNameMap),
          desc,
        });
      }
    }
  }

  if (issues.length === 0) return;

  // タイプ別にグルーピングして Finding 生成
  const byType = {};
  for (const issue of issues) {
    if (!byType[issue.type]) byType[issue.type] = [];
    byType[issue.type].push(issue.detail);
  }

  if (byType.food_should_be_reduced) {
    const details = byType.food_should_be_reduced;
    findings.push({
      severity: '🟡',
      category: 'tax_classification',
      checkCode: 'TC-05',
      description: `食品系キーワードを含む取引${details.length}件に標準税率10%が設定されています。軽減税率8%の可能性があります。`,
      currentValue: `課対仕入10% × ${details.length}件`,
      suggestedValue: '課対仕入8%（軽減）に修正',
      confidence: 75,
      targetMonth,
      freeeLink: '',
      details: details.slice(0, MAX_DETAILS),
    });
  }

  if (byType.nonfood_should_be_standard) {
    const details = byType.nonfood_should_be_standard;
    findings.push({
      severity: '🟡',
      category: 'tax_classification',
      checkCode: 'TC-05',
      description: `非食品キーワードを含む取引${details.length}件に軽減税率8%が設定されています。標準税率10%の可能性があります。`,
      currentValue: `課対仕入8%（軽減） × ${details.length}件`,
      suggestedValue: '課対仕入10%に修正',
      confidence: 75,
      targetMonth,
      freeeLink: '',
      details: details.slice(0, MAX_DETAILS),
    });
  }

  if (byType.newspaper_should_be_reduced) {
    const details = byType.newspaper_should_be_reduced;
    findings.push({
      severity: '🟡',
      category: 'tax_classification',
      checkCode: 'TC-05',
      description: `新聞の定期購読${details.length}件に標準税率10%が設定されています。定期購読は軽減税率8%が正しいです。`,
      currentValue: `課対仕入10% × ${details.length}件`,
      suggestedValue: '課対仕入8%（軽減）に修正',
      confidence: 85,
      targetMonth,
      freeeLink: '',
      details: details.slice(0, MAX_DETAILS),
    });
  }
}

// ============================================================
// TC-06: 同一科目内の税区分混在チェック
// ============================================================

function checkMixedTaxCodes(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYearId } = data;
  if (!deals) return;

  // 科目ごとに tax_code を集計（件数 + 金額合計）
  const accountTaxCodes = new Map(); // accountName → Map<tax_code, { count, totalAmount }>

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName) continue;

      if (!accountTaxCodes.has(accountName)) {
        accountTaxCodes.set(accountName, new Map());
      }
      const taxMap = accountTaxCodes.get(accountName);
      if (!taxMap.has(det.tax_code)) {
        taxMap.set(det.tax_code, { count: 0, totalAmount: 0 });
      }
      const entry = taxMap.get(det.tax_code);
      entry.count++;
      entry.totalAmount += Math.abs(det.amount || 0);
    }
  }

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const [accountName, taxMap] of accountTaxCodes) {
    if (taxMap.size < 2) continue;

    // 除外科目（正当に混在しうる）
    if (MIXED_TAX_EXCLUDE_ACCOUNTS.some(ex => accountName.includes(ex))) continue;

    // 税区分の内訳テキストを構築（件数降順）
    const sorted = [...taxMap.entries()].sort((a, b) => b[1].count - a[1].count);

    const breakdown = sorted
      .map(([code, { count }]) => `${getTaxLabel(code)}: ${count}件`)
      .join('、');

    // details 子行: 税区分ごとに1行、フィルタ付きfreeeリンク付き
    const details = sorted.map(([code, { count, totalAmount }]) => {
      const taxLabel = getTaxLabel(code);
      const urlParams = TAX_CODE_TO_URL_PARAMS[code];
      let freeeLink = null;
      if (urlParams && companyId && accountName) {
        freeeLink = generalLedgerLinkWithTaxFilter(
          companyId, accountName, startDate, endDate,
          { fiscalYearId },
          urlParams
        );
      }
      return {
        description: `${taxLabel}（${count}件・計${totalAmount.toLocaleString()}円）`,
        amount: totalAmount,
        freeeLink,
      };
    });

    findings.push({
      severity: '🟡',
      category: 'tax_classification',
      checkCode: 'TC-06',
      description: `「${accountName}」に${taxMap.size}種類の税区分が混在しています（${breakdown}）。`,
      currentValue: `${taxMap.size}種類混在`,
      suggestedValue: '税区分ごとの内訳を確認してください',
      confidence: 65,
      targetMonth,
      freeeLink: generalLedgerLink(companyId, accountName, startDate, endDate, { fiscalYearId }),
      details,
    });
  }
}

// ============================================================
// TC-07: 売上の税区分チェック
// ============================================================

function checkSalesTaxCode(data, accountIdNameMap, findings) {
  const { deals, companyId, targetMonth, fiscalYearId } = data;
  if (!deals) return;

  const violations = new Map();

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      const accountName = accountIdNameMap.get(det.account_item_id);
      if (!accountName) continue;
      if (!SALES_ACCOUNTS.some(a => accountName.includes(a))) continue;

      // 課税売上系なら正常
      if (isTaxableSales(det.tax_code)) continue;
      // 非課税売上 → 例外チェック
      if (NON_TAXABLE_SALES_CODES.has(det.tax_code)) continue;

      // 対象外 or その他の不適切な税区分
      // 例外: 摘要に非課税売上で正しいキーワードが含まれる
      const desc = (det.description || '') + ' ' + (deal.partner_name || '');
      if (NON_TAXABLE_SALES_KEYWORDS.some(kw => desc.includes(kw))) continue;

      if (!violations.has(accountName)) {
        violations.set(accountName, { count: 0, totalAmount: 0, details: [] });
      }
      const v = violations.get(accountName);
      v.count++;
      v.totalAmount += det.amount;
      v.details.push(makeDetailRow(deal, det, accountIdNameMap));
    }
  }

  const { startDate, endDate } = getMonthRange(targetMonth);

  for (const [accountName, v] of violations) {
    findings.push({
      severity: '🔴',
      category: 'tax_classification',
      checkCode: 'TC-07',
      description: `「${accountName}」に非課税・不課税の取引が${v.count}件（${v.totalAmount.toLocaleString()}円）あります。売上は原則課税売上です。`,
      currentValue: `非課税/不課税 × ${v.count}件`,
      suggestedValue: '課税売上10%に修正',
      confidence: 85,
      targetMonth,
      freeeLink: generalLedgerLinkWithTaxFilter(companyId, accountName, startDate, endDate, { fiscalYearId }, { taxGroupCode: 0 }),
      details: v.details.slice(0, MAX_DETAILS),
    });
  }
}

// ============================================================
// TC-08: 高額課税仕入の確認
// ============================================================

function checkHighValuePurchases(data, accountIdNameMap, findings) {
  const { deals, targetMonth } = data;
  if (!deals) return;

  const highValueDetails = [];

  for (const deal of deals) {
    if (!deal.details) continue;
    for (const det of deal.details) {
      if (!isTaxablePurchase(det.tax_code) && !isReducedPurchase(det.tax_code)) continue;
      if (det.amount < HIGH_VALUE_THRESHOLD) continue;

      highValueDetails.push({
        ...makeDetailRow(deal, det, accountIdNameMap),
        accountName: accountIdNameMap.get(det.account_item_id) || `ID:${det.account_item_id}`,
        taxLabel: getTaxLabel(det.tax_code),
      });
    }
  }

  if (highValueDetails.length === 0) return;

  const totalAmount = highValueDetails.reduce((s, d) => s + d.amount, 0);

  findings.push({
    severity: '🔵',
    category: 'tax_classification',
    checkCode: 'TC-08',
    description: `100万円以上の課税仕入取引が${highValueDetails.length}件（${totalAmount.toLocaleString()}円）あります。税区分の正確性を確認してください。`,
    currentValue: `${highValueDetails.length}件（${totalAmount.toLocaleString()}円）`,
    suggestedValue: '税区分の正確性を確認',
    confidence: 50,
    targetMonth,
    freeeLink: '',
    details: highValueDetails.slice(0, MAX_DETAILS),
  });
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 消費税区分チェック（月次モードB）
 *
 * @param {Object} data - monthly-checker.js が渡す context オブジェクト
 * @returns {Array<Finding>}
 */
function taxClassificationCheck(data) {
  const findings = [];
  const { trialBs, trialPl, deals } = data;

  if (!deals || deals.length === 0) return findings;

  const accountIdNameMap = buildAccountIdNameMap(trialBs, trialPl);

  checkNonSubjectAccounts(data, accountIdNameMap, findings);    // TC-01
  checkNonTaxableAccounts(data, accountIdNameMap, findings);    // TC-02
  checkResidentialRent(data, accountIdNameMap, findings);       // TC-03
  checkOverseasServices(data, accountIdNameMap, findings);      // TC-04
  checkReducedTaxRate(data, accountIdNameMap, findings);        // TC-05
  checkMixedTaxCodes(data, accountIdNameMap, findings);         // TC-06
  checkSalesTaxCode(data, accountIdNameMap, findings);          // TC-07
  checkHighValuePurchases(data, accountIdNameMap, findings);    // TC-08

  return findings;
}

module.exports = {
  taxClassificationCheck,
  // テスト用
  isTaxablePurchase,
  isReducedPurchase,
  isStandardPurchase10,
  isTaxableSales,
  getTaxLabel,
};
