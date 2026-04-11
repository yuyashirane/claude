// test-config-samples.js
// サンプル config.json v2.0 の料金を pricing-calculator.js で検算する
// manualPricing=false の3社のみ計算検証、manualPricing=true の3社は config 値を表示

const path = require('path');
const fs = require('fs');
const calc = require('./pricing-calculator');

const SAMPLES_DIR = path.join(__dirname, '..', '..', '.claude', 'skills', 'proposal-generator-v2', 'samples');

// PDFサンプルからの期待値（設計書セクション9.1 補正済み）
const expectations = {
  'config-v2-megasolar.json': { monthly: 25000, annual: 245000 },
  'config-v2-kigyou-keiei-miyazaki.json': { monthly: 20000, annual: 205000 },
  'config-v2-nihon-ample.json': { monthly: 12000, annual: 175000 },
};

let passed = 0;
let failed = 0;
let skipped = 0;

const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.startsWith('config-v2-')).sort();

for (const file of files) {
  const config = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8'));
  const clientName = config.client.name;
  const isManual = config.client.requiresManualPricing;

  console.log(`\n--- ${clientName} (${file}) ---`);
  console.log(`  salesClass: ${config.client.salesClass}, manualPricing: ${isManual}`);

  if (isManual) {
    // manualPricing: config に書かれた値を表示するのみ
    if (config.meta.outputMode === 'proposal_multi') {
      // multi の場合は各プランの月次を表示
      for (const plan of config.pricing.plans) {
        const base = config.pricing.manualPricing.monthly.base;
        const disc = plan.manualDiscounts?.introduction?.monthly || 0;
        console.log(`  ${plan.id}: 月次base=${base.toLocaleString()}, 値引き=${disc.toLocaleString()}`);
      }
      const ca = config.pricing.commonAnnual;
      const corpTax = ca.corporateTax.amount;
      const consTax = ca.consumptionTax.amount;
      const annDisc = ca.manualDiscounts?.introduction?.annual || 0;
      console.log(`  共通年次: 法人税=${corpTax.toLocaleString()}, 消費税=${consTax.toLocaleString()}, 値引き=${annDisc.toLocaleString()}`);
    } else {
      // single の場合
      const mp = config.pricing.manualPricing;
      const monthlyBase = mp.monthly.base;
      const volM = config.pricing.manualDiscounts?.volume?.monthly || 0;
      const introM = config.pricing.manualDiscounts?.introduction?.monthly || 0;
      const monthlyTotal = monthlyBase + volM + introM;
      console.log(`  月次: base=${monthlyBase.toLocaleString()}, 出精=${volM.toLocaleString()}, 紹介=${introM.toLocaleString()} → 合計=${monthlyTotal.toLocaleString()}`);

      const annCorpTax = mp.annual.corporateTax;
      const annConsTax = mp.annual.consumptionTax;
      const volA = config.pricing.manualDiscounts?.volume?.annual || 0;
      const introA = config.pricing.manualDiscounts?.introduction?.annual || 0;
      console.log(`  年次: 法人税=${annCorpTax.toLocaleString()}, 消費税=${annConsTax.toLocaleString()}, 出精=${volA.toLocaleString()}, 紹介=${introA.toLocaleString()}`);
    }
    console.log(`  → manualPricing: スキップ（config値準拠）`);
    skipped++;
    continue;
  }

  // --- 自動計算による検算 ---
  const pricing = config.pricing;
  const salesClass = config.client.salesClass;
  const txCount = config.client.monthlyTransactions;

  // 月次料金の計算
  let moduleName;
  if (pricing.selectedModules.bookkeeping) moduleName = 'bookkeeping';
  else if (pricing.selectedModules.selfBookkeeping) moduleName = 'selfBookkeeping';

  const moduleFee = calc.calculateModuleMonthlyFee({
    module: moduleName,
    salesClass,
    transactionCount: txCount,
  });

  let monthlyTotal = moduleFee.total;

  // 相談サポート
  if (pricing.selectedModules.consultation) {
    monthlyTotal += calc.calculateConsultationMonthlyFee(salesClass);
  }

  // 納品頻度値引き（記帳代行のみ）
  if (moduleName === 'bookkeeping') {
    monthlyTotal += calc.getDeliveryDiscount(pricing.deliveryFrequency);
  }

  // 手動値引き
  const volM = pricing.manualDiscounts?.volume?.monthly || 0;
  const introM = pricing.manualDiscounts?.introduction?.monthly || 0;
  monthlyTotal += volM + introM;

  // 年次料金の計算
  const annualResult = calc.calculateAnnualFees({
    salesClass,
    entityType: 'corporate',
    consumptionTaxMethod: pricing.consumptionTaxMethod,
    options: pricing.annualOptions,
  });
  let annualTotal = annualResult.total;

  // 年次手動値引き
  const volA = pricing.manualDiscounts?.volume?.annual || 0;
  const introA = pricing.manualDiscounts?.introduction?.annual || 0;
  annualTotal += volA + introA;

  // 検証
  const expected = expectations[file];
  const monthlyMatch = monthlyTotal === expected.monthly;
  const annualMatch = annualTotal === expected.annual;

  console.log(`  月次: 計算=${monthlyTotal.toLocaleString()} / 期待=${expected.monthly.toLocaleString()} ${monthlyMatch ? '✓' : '✗'}`);
  console.log(`  年次: 計算=${annualTotal.toLocaleString()} / 期待=${expected.annual.toLocaleString()} ${annualMatch ? '✓' : '✗'}`);

  if (!monthlyMatch) {
    console.log(`    内訳: module=${moduleFee.total}, delivery=${moduleName === 'bookkeeping' ? calc.getDeliveryDiscount(pricing.deliveryFrequency) : 0}, 出精月=${volM}, 紹介月=${introM}`);
  }
  if (!annualMatch) {
    console.log(`    内訳: ${annualResult.items.map(i => `${i.label}=${i.amount}`).join(', ')}, 出精年=${volA}, 紹介年=${introA}`);
  }

  if (monthlyMatch && annualMatch) {
    console.log(`  → PASS`);
    passed++;
  } else {
    console.log(`  → FAIL`);
    failed++;
  }
}

console.log(`\n========================================`);
console.log(`結果: ${passed} PASS / ${failed} FAIL / ${skipped} SKIP (manualPricing)`);
console.log(`========================================`);

if (failed > 0) process.exit(1);
