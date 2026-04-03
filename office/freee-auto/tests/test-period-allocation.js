'use strict';

/**
 * test-period-allocation.js — PA-01〜PA-08 のユニットテスト
 *
 * テストケース一覧:
 *   [PA-01/02 前払費用停滞]
 *   1.  PA-01: 前払費用の残高が前月と同額 → finding 発生（🟡）
 *   2.  PA-01: 前払費用の残高が変動している → finding なし
 *   3.  PA-01: 期首月はスキップ（前月比較不適切）
 *   4.  PA-01: 残高が 10,000 円未満はスキップ
 *   5.  PA-02: 長期前払費用の残高停滞 → finding 発生（checkCode=PA-02）
 *
 *   [PA-03 前払費用急減]
 *   6.  PA-03: 前払費用が 50% 以上減少 → finding 発生（🟡）
 *   7.  PA-03: 減少率が 50% 未満 → finding なし
 *   8.  PA-03: 前月残高 50,000 円未満 → スキップ
 *
 *   [PA-04 定期費用欠損]
 *   9.  PA-04: 前月あった取引先が当月ゼロ、avgMonthly ≥ 5,000 → finding 発生（🟡）
 *   10. PA-04: '未選択' 取引先は除外
 *   11. PA-04: avgMonthly < 5,000 → finding なし
 *   12. PA-04: trialPlByPartner が null → finding なし（クラッシュしない）
 *
 *   [PA-05 定期費用変動]
 *   13. PA-05: 前月平均比 50% 以上変動 → finding 発生（🔵）
 *   14. PA-05: 変動が 50% 未満 → finding なし
 *
 *   [PA-06/07 洗い替え確認]
 *   15. PA-06: 期首月・opening_balance > 0・deals に仕訳なし → finding 発生（🔴）
 *   16. PA-06: 期首 +3 ヶ月目（months=3）→ スキップ
 *   17. PA-06: deals に金額合致の仕訳あり → finding なし
 *   18. PA-07: 未払消費税等の洗い替え未確認 → finding 発生（checkCode=PA-07）
 *
 *   [PA-08 引当金期首残高]
 *   19. PA-08: 期首月・賞与引当金 opening_balance > 0 → finding 発生（🔵）
 *   20. PA-08: 期首月以外はスキップ
 *
 * 使い方: node tests/test-period-allocation.js
 */

const assert = require('assert');
const { periodAllocationCheck } = require('../src/verify/monthly-checks/period-allocation');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

// ============================================================
// モックデータファクトリ
// ============================================================

function makeBsBalance(overrides) {
  return {
    account_item_id: 200,
    account_item_name: 'テスト科目',
    account_category_name: '流動資産',
    hierarchy_level: 3,
    opening_balance: 0,
    debit_amount: 0,
    credit_amount: 0,
    closing_balance: 0,
    composition_ratio: 0,
    ...overrides,
  };
}

function makeTrialBs(balances) {
  return { trial_bs: { balances } };
}

function makeTrialPl(balances) {
  return { trial_pl: { balances } };
}

/**
 * trialPlByPartner モック
 * balances: [{ account_item_name, account_item_id, partners: [{id, name, closing_balance}] }]
 */
function makePlByPartner(balances) {
  return { trial_pl: { balances } };
}

function makeDeal(overrides) {
  return {
    id: 1,
    company_id: 474381,
    issue_date: '2025-10-15',
    type: 'expense',
    partner_id: null,
    details: [],
    payments: [],
    ...overrides,
  };
}

/** 最小限の data オブジェクト */
function makeData(overrides) {
  return {
    companyId: 474381,
    targetMonth: '2026-03',
    startMonth: 10,
    fiscalYear: 2025,
    trialBs: null,
    trialPl: null,
    trialBsByItem: null,
    trialBsByPartner: null,
    trialPlByPartner: null,
    deals: [],
    prevMonth: null,
    ...overrides,
  };
}

// ============================================================
// PA-01/PA-02: 前払費用・長期前払費用の残高停滞
// ============================================================

console.log('\n=== PA-01/02: 前払費用停滞 ===\n');

test('1. PA-01: 前払費用の残高が前月と同額 → finding 発生', () => {
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 50000,
  });
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    prevMonth: {
      trialBs: makeTrialBs([{ ...bsBal, closing_balance: 50000 }]),
    },
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-01');
  assert.strictEqual(f.length, 1, 'PA-01 finding が1件であること');
  assert.strictEqual(f[0].severity, '🟡');
  assert.ok(f[0].description.includes('前払費用'));
});

test('2. PA-01: 前払費用の残高が変動している → finding なし', () => {
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 48000,
  });
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    prevMonth: {
      trialBs: makeTrialBs([{ ...bsBal, closing_balance: 50000 }]),
    },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-01').length, 0);
});

test('3. PA-01: 期首月（monthsFromFiscalStart=1）はスキップ', () => {
  // startMonth=10, targetMonth='2025-10' → 1ヶ月目
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 50000,
  });
  const data = makeData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    prevMonth: {
      trialBs: makeTrialBs([{ ...bsBal, closing_balance: 50000 }]),
    },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-01').length, 0,
    '期首月は PA-01 をスキップすること');
});

test('4. PA-01: 残高が 10,000 円未満 → スキップ', () => {
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 5000,
  });
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    prevMonth: {
      trialBs: makeTrialBs([{ ...bsBal, closing_balance: 5000 }]),
    },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-01').length, 0,
    '残高 < 10,000 円は PA-01 をスキップすること');
});

test('5. PA-02: 長期前払費用の残高停滞 → checkCode=PA-02 で finding 発生', () => {
  const bsBal = makeBsBalance({
    account_item_name: '長期前払費用',
    account_item_id: 202,
    closing_balance: 200000,
  });
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    prevMonth: {
      trialBs: makeTrialBs([{ ...bsBal, closing_balance: 200000 }]),
    },
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-02');
  assert.strictEqual(f.length, 1, 'PA-02 finding が1件であること');
  assert.ok(f[0].description.includes('長期前払費用'));
});

// ============================================================
// PA-03: 前払費用の急減
// ============================================================

console.log('\n=== PA-03: 前払費用急減 ===\n');

test('6. PA-03: 前払費用が 50% 以上減少 → finding 発生（🟡）', () => {
  // 前月 100,000 → 当月 40,000（60%減）
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 40000,
  });
  const prevBsBal = { ...bsBal, closing_balance: 100000 };
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    prevMonth: {
      trialBs: makeTrialBs([prevBsBal]),
    },
    deals: [],
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-03');
  assert.strictEqual(f.length, 1, 'PA-03 finding が1件であること');
  assert.strictEqual(f[0].severity, '🟡');
  assert.ok(f[0].description.includes('60%'), `description="${f[0].description}" に「60%」が含まれない`);
});

test('7. PA-03: 減少率が 50% 未満（30%減）→ finding なし', () => {
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 70000,
  });
  const prevBsBal = { ...bsBal, closing_balance: 100000 };
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    prevMonth: { trialBs: makeTrialBs([prevBsBal]) },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-03').length, 0);
});

test('8. PA-03: 前月残高 50,000 円未満 → スキップ', () => {
  const bsBal = makeBsBalance({
    account_item_name: '前払費用',
    account_item_id: 201,
    closing_balance: 10000,
  });
  const prevBsBal = { ...bsBal, closing_balance: 30000 }; // 30,000円（< 50,000 の閾値）
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    prevMonth: { trialBs: makeTrialBs([prevBsBal]) },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-03').length, 0,
    '前月残高 < 50,000 は PA-03 をスキップすること');
});

// ============================================================
// PA-04: 定期費用の欠損検知
// ============================================================

console.log('\n=== PA-04: 定期費用欠損 ===\n');

/**
 * 取引先別PL モックを作成するヘルパー
 * accountName: '支払手数料'
 * currPartners: [{id, name, closing_balance}] — 当月YTD
 * prevPartners: [{id, name, closing_balance}] — 前月YTD
 */
function makePlByPartnerForAccount(accountName, accountItemId, currPartners, prevPartners) {
  return {
    curr: makePlByPartner([{
      account_item_name: accountName,
      account_item_id: accountItemId,
      partners: currPartners,
    }]),
    prev: {
      ...makePlByPartner([{
        account_item_name: accountName,
        account_item_id: accountItemId,
        partners: prevPartners,
      }]),
      targetMonth: '2026-02',
    },
  };
}

test('9. PA-04: 前月にあった取引先が当月ゼロ（avgMonthly ≥ 5,000）→ finding 発生', () => {
  // 前月YTD: ㈱ABC が 支払手数料 で 5ヶ月 × 50,000 = 250,000 累計
  // 当月: ㈱ABC が含まれない（当月計上なし）
  const { curr, prev } = makePlByPartnerForAccount(
    '支払手数料',
    301,
    // 当月: ㈱ABC が含まれない（currPartners は別の取引先のみ）
    [{ id: 9999, name: '㈱別会社', closing_balance: -10000 }],
    // 前月YTD: ㈱ABC が 250,000
    [{ id: 1001, name: '㈱ABC', closing_balance: -250000 }],
  );
  // prevMonth.targetMonth = '2026-02'、startMonth=10
  // prevMon=2 < startMonth=10 → 12-10+2+1 = 5ヶ月目
  // avgMonthly = 250,000 / 5 = 50,000 ≥ 5,000 → PA-04 発生
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: curr,
    prevMonth: {
      trialPlByPartner: prev,
      targetMonth: '2026-02',
    },
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-04');
  assert.ok(f.length >= 1, `PA-04 finding が1件以上であること（実際: ${f.length}件）`);
  assert.ok(f[0].description.includes('支払手数料'));
  assert.ok(f[0].description.includes('㈱ABC'));
});

test('10. PA-04: 未選択 取引先は除外（finding なし）', () => {
  const { curr, prev } = makePlByPartnerForAccount(
    '支払手数料',
    301,
    // 当月: 未選択 がない
    [],
    // 前月YTD: 未選択
    [{ id: 0, name: '未選択', closing_balance: -100000 }],
  );
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: curr,
    prevMonth: {
      trialPlByPartner: prev,
      targetMonth: '2026-02',
    },
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-04'
    && x.description.includes('未選択'));
  assert.strictEqual(f.length, 0, '未選択取引先は PA-04 finding に含まれないこと');
});

test('11. PA-04: avgMonthly < 5,000 → finding なし', () => {
  // 前月YTD: ㈱ミニ が 支払手数料 で 5ヶ月 × 800 = 4,000 累計
  // avgMonthly = 4,000 / 5 = 800 < 5,000 → finding なし
  const { curr, prev } = makePlByPartnerForAccount(
    '支払手数料',
    301,
    [],
    [{ id: 2001, name: '㈱ミニ', closing_balance: -4000 }],
  );
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: curr,
    prevMonth: {
      trialPlByPartner: prev,
      targetMonth: '2026-02',
    },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-04').length, 0,
    'avgMonthly < 5,000 の取引先は PA-04 finding なし');
});

test('12. PA-04: trialPlByPartner が null → クラッシュせず finding なし', () => {
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: null,
    prevMonth: { trialPlByPartner: null, targetMonth: '2026-02' },
  });
  let findings;
  assert.doesNotThrow(() => {
    findings = periodAllocationCheck(data);
  }, 'trialPlByPartner=null でもクラッシュしないこと');
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-04').length, 0);
});

// ============================================================
// PA-05: 定期費用の大幅変動
// ============================================================

console.log('\n=== PA-05: 定期費用変動 ===\n');

test('13. PA-05: 前月平均比 50% 以上変動（当月急増）→ finding 発生（🔵）', () => {
  // 前月YTD: ㈱XYZ が 地代家賃 で 5ヶ月 × 100,000 = 500,000
  // 当月YTD: 500,000 + 200,000 = 700,000（当月単月=200,000）
  // avgMonthly = 500,000 / 5 = 100,000
  // changeRate = |200,000 - 100,000| / 100,000 = 100% ≥ 50% → finding 発生
  const currPartners = [{ id: 3001, name: '㈱XYZ', closing_balance: -700000 }];
  const prevPartners = [{ id: 3001, name: '㈱XYZ', closing_balance: -500000 }];
  const { curr, prev } = makePlByPartnerForAccount('地代家賃', 302, currPartners, prevPartners);
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: curr,
    prevMonth: {
      trialPlByPartner: prev,
      targetMonth: '2026-02',
    },
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-05');
  assert.ok(f.length >= 1, `PA-05 finding が1件以上であること（実際: ${f.length}件）`);
  assert.strictEqual(f[0].severity, '🔵');
});

test('14. PA-05: 変動が 50% 未満（30%増）→ finding なし', () => {
  // 前月YTD: 500,000（5ヶ月: avg=100,000）
  // 当月YTD: 500,000 + 130,000 = 630,000（当月単月=130,000）
  // changeRate = |130,000 - 100,000| / 100,000 = 30% < 50% → finding なし
  const currPartners = [{ id: 3001, name: '㈱XYZ', closing_balance: -630000 }];
  const prevPartners = [{ id: 3001, name: '㈱XYZ', closing_balance: -500000 }];
  const { curr, prev } = makePlByPartnerForAccount('地代家賃', 302, currPartners, prevPartners);
  const data = makeData({
    targetMonth: '2026-03',
    startMonth: 10,
    trialPlByPartner: curr,
    prevMonth: {
      trialPlByPartner: prev,
      targetMonth: '2026-02',
    },
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-05').length, 0,
    '変動率 < 50% は PA-05 finding なし');
});

// ============================================================
// PA-06/PA-07: 洗い替え確認（期首月 or 期首+1ヶ月のみ）
// ============================================================

console.log('\n=== PA-06/07: 洗い替え確認 ===\n');

test('15. PA-06: 期首月・opening_balance > 0・deals なし → finding 発生（🔴）', () => {
  // startMonth=10, targetMonth='2025-10' → monthsFromFiscalStart=1 → 実行対象
  const bsBal = makeBsBalance({
    account_item_name: '未払法人税等',
    account_item_id: 401,
    opening_balance: 500000,
    closing_balance: 500000,
  });
  const data = makeData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    deals: [],
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-06');
  assert.strictEqual(f.length, 1, 'PA-06 finding が1件であること');
  assert.strictEqual(f[0].severity, '🔴');
  assert.ok(f[0].description.includes('未払法人税等'));
});

test('16. PA-06: 期首 +3 ヶ月目（months=3）→ スキップ', () => {
  // startMonth=10, targetMonth='2025-12' → months=3 > REVERSAL_MAX_MONTHS(2) → スキップ
  const bsBal = makeBsBalance({
    account_item_name: '未払法人税等',
    account_item_id: 401,
    opening_balance: 500000,
    closing_balance: 500000,
  });
  const data = makeData({
    targetMonth: '2025-12',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    deals: [],
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-06').length, 0,
    '期首 +3 ヶ月目以降は PA-06 をスキップすること');
});

test('17. PA-06: deals に金額合致の洗い替え仕訳あり → finding なし', () => {
  // 洗い替え仕訳: 未払法人税等（account_item_id=401）を 500,000 借方
  const bsBal = makeBsBalance({
    account_item_name: '未払法人税等',
    account_item_id: 401,
    opening_balance: 500000,
    closing_balance: 0,
  });
  // deals に account_item_id=401 の仕訳明細を含む
  const deal = makeDeal({
    id: 5001,
    issue_date: '2025-10-01',
    details: [{
      account_item_id: 401,
      account_item_name: '未払法人税等',
      tax_code: 0,
      amount: 500000,
      entry_side: 'debit',
    }],
  });
  const data = makeData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    deals: [deal],
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-06').length, 0,
    '洗い替え仕訳が金額合致する場合は PA-06 finding なし');
});

test('18. PA-07: 未払消費税等の洗い替え未確認 → checkCode=PA-07 で finding 発生', () => {
  // startMonth=10, targetMonth='2025-11' → months=2 ≤ 2 → 実行対象
  const bsBal = makeBsBalance({
    account_item_name: '未払消費税等',
    account_item_id: 402,
    opening_balance: 300000,
    closing_balance: 300000,
  });
  const data = makeData({
    targetMonth: '2025-11',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
    trialPl: makeTrialPl([]),
    deals: [],
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-07');
  assert.strictEqual(f.length, 1, 'PA-07 finding が1件であること');
  assert.strictEqual(f[0].severity, '🔴');
  assert.ok(f[0].description.includes('未払消費税等'));
});

// ============================================================
// PA-08: 引当金の期首残高確認
// ============================================================

console.log('\n=== PA-08: 引当金期首残高 ===\n');

test('19. PA-08: 期首月・賞与引当金 opening_balance > 0 → finding 発生（🔵）', () => {
  // startMonth=10, targetMonth='2025-10' → months=1 → PA-08 実行
  const bsBal = makeBsBalance({
    account_item_name: '賞与引当金',
    account_item_id: 501,
    opening_balance: 1500000,
    closing_balance: 1500000,
  });
  const data = makeData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
  });
  const findings = periodAllocationCheck(data);
  const f = findings.filter(x => x.checkCode === 'PA-08');
  assert.strictEqual(f.length, 1, 'PA-08 finding が1件であること');
  assert.strictEqual(f[0].severity, '🔵');
  assert.ok(f[0].description.includes('賞与引当金'));
  assert.ok(f[0].description.includes('1,500,000'));
});

test('20. PA-08: 期首月以外（2ヶ月目）はスキップ', () => {
  // startMonth=10, targetMonth='2025-11' → months=2 → PA-08 スキップ
  const bsBal = makeBsBalance({
    account_item_name: '賞与引当金',
    account_item_id: 501,
    opening_balance: 1500000,
    closing_balance: 1500000,
  });
  const data = makeData({
    targetMonth: '2025-11',
    startMonth: 10,
    trialBs: makeTrialBs([bsBal]),
  });
  const findings = periodAllocationCheck(data);
  assert.strictEqual(findings.filter(x => x.checkCode === 'PA-08').length, 0,
    '期首月以外は PA-08 をスキップすること');
});

// ============================================================
// 結果出力
// ============================================================

console.log(`\n--- period-allocation: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
if (failed > 0) process.exit(1);
