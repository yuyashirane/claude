// pricing-calculator.js 動作確認スクリプト
const calc = require('./pricing-calculator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectError(fn, expectedMsg) {
  try {
    fn();
    throw new Error('エラーが発生しませんでした');
  } catch (e) {
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      throw new Error(`期待したエラーメッセージと異なります: "${e.message}"`);
    }
  }
}

// ─── loadPricingTable ───
console.log('\n[loadPricingTable]');
test('料金テーブルを読み込める', () => {
  const table = calc.loadPricingTable();
  assertEqual(table.version, '2.0', 'version');
});

// ─── determineSalesClass ───
console.log('\n[determineSalesClass]');
test('500万 → A', () => assertEqual(calc.determineSalesClass(5000000), 'A'));
test('1,000万 → B', () => assertEqual(calc.determineSalesClass(10000000), 'B'));
test('2,900万 → B', () => assertEqual(calc.determineSalesClass(29000000), 'B'));
test('3,000万 → C', () => assertEqual(calc.determineSalesClass(30000000), 'C'));
test('5,000万 → D', () => assertEqual(calc.determineSalesClass(50000000), 'D'));
test('9,999万 → D', () => assertEqual(calc.determineSalesClass(99990000), 'D'));
test('1億 → OVER', () => assertEqual(calc.determineSalesClass(100000000), 'OVER'));
test('2億 → OVER', () => assertEqual(calc.determineSalesClass(200000000), 'OVER'));
test('0円 → A', () => assertEqual(calc.determineSalesClass(0), 'A'));
test('負の年商でエラー', () => expectError(() => calc.determineSalesClass(-1), '不正な年商'));
test('文字列でエラー', () => expectError(() => calc.determineSalesClass('abc'), '不正な年商'));

// ─── requiresManualPricing ───
console.log('\n[requiresManualPricing]');
test('A → false', () => assertEqual(calc.requiresManualPricing('A'), false));
test('D → false', () => assertEqual(calc.requiresManualPricing('D'), false));
test('OVER → true', () => assertEqual(calc.requiresManualPricing('OVER'), true));
test('不正クラスでエラー', () => expectError(() => calc.requiresManualPricing('X'), '不正な売上クラス'));

// ─── determineTransactionTier ───
console.log('\n[determineTransactionTier]');
test('50仕訳 → 100', () => assertEqual(calc.determineTransactionTier(50), '100'));
test('100仕訳 → 100', () => assertEqual(calc.determineTransactionTier(100), '100'));
test('101仕訳 → 200', () => assertEqual(calc.determineTransactionTier(101), '200'));
test('200仕訳 → 200', () => assertEqual(calc.determineTransactionTier(200), '200'));
test('201仕訳 → over200', () => assertEqual(calc.determineTransactionTier(201), 'over200'));
test('0仕訳 → 100', () => assertEqual(calc.determineTransactionTier(0), '100'));
test('負の仕訳数でエラー', () => expectError(() => calc.determineTransactionTier(-5), '不正な仕訳数'));

// ─── calculateModuleMonthlyFee ───
console.log('\n[calculateModuleMonthlyFee]');
test('記帳代行 A 100仕訳 → 25,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'bookkeeping', salesClass: 'A', transactionCount: 50 });
  assertEqual(r.total, 25000, 'total');
  assertEqual(r.base, 25000, 'base');
  assertEqual(r.overage, 0, 'overage');
});
test('記帳代行 B 150仕訳 → 35,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'bookkeeping', salesClass: 'B', transactionCount: 150 });
  assertEqual(r.total, 35000, 'total');
});
test('記帳代行 D 300仕訳 → 40,000 + 5,000 = 45,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'bookkeeping', salesClass: 'D', transactionCount: 300 });
  assertEqual(r.base, 40000, 'base');
  assertEqual(r.overage, 5000, 'overage');
  assertEqual(r.total, 45000, 'total');
});
test('記帳代行 B 500仕訳 → 35,000 + 15,000 = 50,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'bookkeeping', salesClass: 'B', transactionCount: 500 });
  assertEqual(r.base, 35000, 'base');
  assertEqual(r.overage, 15000, 'overage');  // 300仕訳超過 = ceil(300/100)=3 × 5000
  assertEqual(r.total, 50000, 'total');
});
test('自計化 B 100仕訳 → 11,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'selfBookkeeping', salesClass: 'B', transactionCount: 30 });
  assertEqual(r.total, 11000, 'total');
});
test('自計化 D 250仕訳 → 20,000 + 3,000 = 23,000', () => {
  const r = calc.calculateModuleMonthlyFee({ module: 'selfBookkeeping', salesClass: 'D', transactionCount: 250 });
  assertEqual(r.base, 20000, 'base');
  assertEqual(r.overage, 3000, 'overage');
  assertEqual(r.total, 23000, 'total');
});
test('OVERクラスでエラー', () => {
  expectError(() => calc.calculateModuleMonthlyFee({ module: 'bookkeeping', salesClass: 'OVER', transactionCount: 100 }), '個別見積り');
});
test('不正モジュールでエラー', () => {
  expectError(() => calc.calculateModuleMonthlyFee({ module: 'invalid', salesClass: 'A', transactionCount: 100 }), '不正なモジュール');
});

// ─── calculateConsultationMonthlyFee ───
console.log('\n[calculateConsultationMonthlyFee]');
test('A 追加なし → 7,000', () => assertEqual(calc.calculateConsultationMonthlyFee('A'), 7000));
test('B 追加なし → 8,000', () => assertEqual(calc.calculateConsultationMonthlyFee('B'), 8000));
test('C 追加1回 → 9,000 + 2,000 = 11,000', () => assertEqual(calc.calculateConsultationMonthlyFee('C', 1), 11000));
test('D 追加2回 → 10,000 + 4,000 = 14,000', () => assertEqual(calc.calculateConsultationMonthlyFee('D', 2), 14000));
test('OVERでエラー', () => expectError(() => calc.calculateConsultationMonthlyFee('OVER'), '個別見積り'));

// ─── getDeliveryDiscount ───
console.log('\n[getDeliveryDiscount]');
test('月次 → 0', () => assertEqual(calc.getDeliveryDiscount('monthly'), 0));
test('2ヶ月 → -4,000', () => assertEqual(calc.getDeliveryDiscount('every2months'), -4000));
test('3ヶ月 → -5,000', () => assertEqual(calc.getDeliveryDiscount('every3months'), -5000));
test('4ヶ月 → -6,000', () => assertEqual(calc.getDeliveryDiscount('every4months'), -6000));
test('6ヶ月 → -8,000', () => assertEqual(calc.getDeliveryDiscount('every6months'), -8000));
test('不正頻度でエラー', () => expectError(() => calc.getDeliveryDiscount('weekly'), '不正な納品頻度'));

// ─── calculateAnnualFees ───
console.log('\n[calculateAnnualFees]');
test('法人 B 原則課税 年末調整5名 法定調書5枚', () => {
  const r = calc.calculateAnnualFees({
    salesClass: 'B',
    entityType: 'corporate',
    consumptionTaxMethod: 'principle',
    options: {
      yearEndAdjustment: { enabled: true, people: 5 },
      statutoryReports: { enabled: true, sheets: 5 },
    },
  });
  // 法人税140,000 + 消費税50,000 + 年末調整20,000 + 法定調書10,000
  assertEqual(r.total, 220000, 'total');
  assertEqual(r.items.length, 4, 'items count');
});
test('法人 A 簡易課税 年末調整8名', () => {
  const r = calc.calculateAnnualFees({
    salesClass: 'A',
    consumptionTaxMethod: 'simplified',
    options: {
      yearEndAdjustment: { enabled: true, people: 8 },
      statutoryReports: { enabled: true, sheets: 3 },
    },
  });
  // 法人税120,000 + 消費税30,000 + 年末調整20,000+3,000 + 法定調書10,000
  assertEqual(r.total, 183000, 'total');
});
test('個人 B 原則課税', () => {
  const r = calc.calculateAnnualFees({
    salesClass: 'B',
    entityType: 'individual',
    consumptionTaxMethod: 'principle',
    options: {},
  });
  // 個人100,000 + 消費税50,000
  assertEqual(r.total, 150000, 'total');
});
test('法人 D 免税 全オプション', () => {
  const r = calc.calculateAnnualFees({
    salesClass: 'D',
    consumptionTaxMethod: 'exempt',
    options: {
      yearEndAdjustment: { enabled: true, people: 10 },
      statutoryReports: { enabled: true, sheets: 10 },
      salaryReport: { enabled: true, municipalities: 3 },
      fixedAssetReport: { enabled: true },
      englishFS: { enabled: true },
      auditSupport: { enabled: true },
    },
  });
  // 法人税180,000 + 消費税0（免税）+ 年末調整25,000 + 法定調書15,000
  // + 給与支払報告6,000 + 償却資産15,000 + 英文FS 20,000 + 監査80,000
  assertEqual(r.total, 341000, 'total');
});
test('簡易課税Dクラスでエラー', () => {
  expectError(() => calc.calculateAnnualFees({
    salesClass: 'D',
    consumptionTaxMethod: 'simplified',
    options: {},
  }), '適用できません');
});
test('OVERクラスでエラー', () => {
  expectError(() => calc.calculateAnnualFees({
    salesClass: 'OVER',
    consumptionTaxMethod: 'principle',
    options: {},
  }), '個別見積り');
});

// ─── 結果サマリー ───
console.log(`\n${'='.repeat(40)}`);
console.log(`結果: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
