'use strict';

/**
 * test-advance-tax-payment.js — AT-01〜AT-03 のユニットテスト
 *
 * 実行: node tests/test-advance-tax-payment.js
 */

const assert = require('assert');
const {
  advanceTaxPaymentCheck,
  calculateMidTermTiming,
  isInRange,
} = require('../src/verify/monthly-checks/advance-tax-payment');

// ============================================================
// テストヘルパー
// ============================================================

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

// 勘定科目ID定数
const ACCOUNT_IDS = {
  '法人税、住民税及び事業税': 3001,
  '仮払法人税等': 3002,
  '未払法人税等': 3003,
  '未払消費税等': 3004,
  '仮払消費税': 3005,
  '売上高': 3006,
  '外注費': 3007,
};

function mkTrialBsPl(overrides = {}) {
  const balances = Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
    account_item_id: id,
    account_item_name: name,
    account_category_name: 'テスト',
    closing_balance: overrides[name] || 0,
    opening_balance: 0,
  }));
  return {
    trialBs: { trial_bs: { balances: [...balances] } },
    trialPl: { trial_pl: { balances: [...balances] } },
  };
}

function mkDeal(overrides = {}) {
  return {
    id: overrides.id || Math.floor(Math.random() * 1000000),
    issue_date: overrides.issue_date || '2026-03-15',
    type: overrides.type || 'expense',
    amount: overrides.amount || 100000,
    details: overrides.details || [],
  };
}

function mkDetail(overrides = {}) {
  return {
    account_item_id: overrides.account_item_id || ACCOUNT_IDS['外注費'],
    amount: overrides.amount || 10000,
    entry_side: overrides.entry_side || 'debit',
  };
}

function mkData(deals = [], extraData = {}) {
  const { trialBs, trialPl } = mkTrialBsPl(extraData.bsBalances || {});
  return {
    deals,
    trialBs,
    trialPl,
    prevMonth: extraData.prevMonth || null,
    companyId: '474381',
    targetMonth: extraData.targetMonth || '2026-03',
    fiscalYear: 2025,
    startMonth: extraData.startMonth || 10,
    fiscalYearId: 10840688,
    ...extraData,
  };
}

// ============================================================
// テスト実行
// ============================================================

(async () => {
  console.log('\n=== test-advance-tax-payment.js ===\n');

  // --- ヘルパー関数テスト ---
  await test('H1. calculateMidTermTiming: 10月決算 → midMonth=3, deadline=5', () => {
    const t = calculateMidTermTiming(10);
    assert.strictEqual(t.midMonth, 3);
    assert.strictEqual(t.deadlineMonth, 5);
    assert.deepStrictEqual(t.checkRange, [3, 4, 5]);
    assert.deepStrictEqual(t.extendedRange, [2, 3, 4, 5, 6]);
  });

  await test('H2. calculateMidTermTiming: 4月決算 → midMonth=9, deadline=11', () => {
    const t = calculateMidTermTiming(4);
    assert.strictEqual(t.midMonth, 9);
    assert.strictEqual(t.deadlineMonth, 11);
    assert.deepStrictEqual(t.checkRange, [9, 10, 11]);
  });

  await test('H3. calculateMidTermTiming: 1月決算 → midMonth=6, deadline=8', () => {
    const t = calculateMidTermTiming(1);
    assert.strictEqual(t.midMonth, 6);
    assert.strictEqual(t.deadlineMonth, 8);
  });

  await test('H4. calculateMidTermTiming: 7月決算 → midMonth=12, deadline=2（年越し）', () => {
    const t = calculateMidTermTiming(7);
    assert.strictEqual(t.midMonth, 12);
    assert.strictEqual(t.deadlineMonth, 2);
    assert.deepStrictEqual(t.checkRange, [12, 1, 2]);
  });

  await test('H5. isInRange: 対象月がcheckRange内 → true', () => {
    assert.ok(isInRange('2026-03', [3, 4, 5]));
    assert.ok(isInRange('2026-05', [3, 4, 5]));
    assert.ok(!isInRange('2026-06', [3, 4, 5]));
    assert.ok(!isInRange('2026-02', [3, 4, 5]));
  });

  // --- AT-01: 法人税の中間納付確認 ---
  await test('AT-01-1. checkRange内 + 法人税仕訳なし → 🟡検出', () => {
    // startMonth=10 → checkRange=[3,4,5], targetMonth=2026-03 → 対象
    const data = mkData([], { targetMonth: '2026-03', startMonth: 10 });
    const findings = advanceTaxPaymentCheck(data);
    const at01 = findings.filter(f => f.checkCode === 'AT-01');
    assert.strictEqual(at01.length, 1);
    assert.strictEqual(at01[0].severity, '🟡');
    assert.ok(at01[0].description.includes('法人税'));
  });

  await test('AT-01-2. checkRange内 + 法人税仕訳あり → スキップ', () => {
    const data = mkData([
      mkDeal({
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS['法人税、住民税及び事業税'], amount: 500000 }),
        ],
      }),
    ], { targetMonth: '2026-03', startMonth: 10 });
    const findings = advanceTaxPaymentCheck(data);
    const at01 = findings.filter(f => f.checkCode === 'AT-01');
    assert.strictEqual(at01.length, 0);
  });

  await test('AT-01-3. checkRange外 → スキップ', () => {
    // startMonth=10 → checkRange=[3,4,5], targetMonth=2026-01 → 対象外
    const data = mkData([], { targetMonth: '2026-01', startMonth: 10 });
    const findings = advanceTaxPaymentCheck(data);
    const at01 = findings.filter(f => f.checkCode === 'AT-01');
    assert.strictEqual(at01.length, 0);
  });

  // --- AT-02: 消費税の中間納付確認 ---
  await test('AT-02-1. checkRange内 + 消費税仕訳なし → 🟡検出', () => {
    const data = mkData([], { targetMonth: '2026-04', startMonth: 10 });
    const findings = advanceTaxPaymentCheck(data);
    const at02 = findings.filter(f => f.checkCode === 'AT-02');
    assert.strictEqual(at02.length, 1);
    assert.strictEqual(at02[0].severity, '🟡');
    assert.ok(at02[0].description.includes('消費税'));
  });

  await test('AT-02-2. checkRange内 + 消費税仕訳あり → スキップ', () => {
    const data = mkData([
      mkDeal({
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS['未払消費税等'], amount: 300000 }),
        ],
      }),
    ], { targetMonth: '2026-04', startMonth: 10 });
    const findings = advanceTaxPaymentCheck(data);
    const at02 = findings.filter(f => f.checkCode === 'AT-02');
    assert.strictEqual(at02.length, 0);
  });

  // --- AT-03: 残高推移チェック ---
  await test('AT-03-1. extendedRange内 + 残高前月同額 → 🔵検出', () => {
    const prevBsBalances = Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
      account_item_id: id,
      account_item_name: name,
      account_category_name: 'テスト',
      closing_balance: name === '未払法人税等' ? 500000 : 0,
      opening_balance: 0,
    }));
    const data = mkData([], {
      targetMonth: '2026-03',
      startMonth: 10,
      bsBalances: { '未払法人税等': 500000 },
      prevMonth: { trialBs: { trial_bs: { balances: prevBsBalances } } },
    });
    const findings = advanceTaxPaymentCheck(data);
    const at03 = findings.filter(f => f.checkCode === 'AT-03');
    assert.strictEqual(at03.length, 1);
    assert.strictEqual(at03[0].severity, '🔵');
    assert.ok(at03[0].description.includes('未払法人税等'));
  });

  await test('AT-03-2. extendedRange内 + 残高変動あり → スキップ', () => {
    const prevBsBalances = Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
      account_item_id: id,
      account_item_name: name,
      account_category_name: 'テスト',
      closing_balance: name === '未払法人税等' ? 300000 : 0,
      opening_balance: 0,
    }));
    const data = mkData([], {
      targetMonth: '2026-03',
      startMonth: 10,
      bsBalances: { '未払法人税等': 500000 },
      prevMonth: { trialBs: { trial_bs: { balances: prevBsBalances } } },
    });
    const findings = advanceTaxPaymentCheck(data);
    const at03 = findings.filter(f => f.checkCode === 'AT-03');
    assert.strictEqual(at03.length, 0);
  });

  await test('AT-03-3. extendedRange外 → スキップ', () => {
    const prevBsBalances = Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
      account_item_id: id,
      account_item_name: name,
      account_category_name: 'テスト',
      closing_balance: name === '未払法人税等' ? 500000 : 0,
      opening_balance: 0,
    }));
    // startMonth=10 → extendedRange=[2,3,4,5,6], targetMonth=2026-01 → 対象外
    const data = mkData([], {
      targetMonth: '2026-01',
      startMonth: 10,
      bsBalances: { '未払法人税等': 500000 },
      prevMonth: { trialBs: { trial_bs: { balances: prevBsBalances } } },
    });
    const findings = advanceTaxPaymentCheck(data);
    const at03 = findings.filter(f => f.checkCode === 'AT-03');
    assert.strictEqual(at03.length, 0);
  });

  // --- accountItems マスタからの科目解決 ---
  await test('AI-1. accountItemsマスタから科目解決 → 正しく検出', () => {
    // accountItemsマスタがある場合、trialBs/Plになくても科目解決できる
    const accountItems = [
      { id: 9001, name: '法人税、住民税及び事業税' },
      { id: 9002, name: '未払消費税等' },
      { id: 9003, name: '外注費' },
    ];
    const data = mkData([
      mkDeal({
        details: [
          mkDetail({ account_item_id: 9001, amount: 500000 }),
        ],
      }),
    ], { targetMonth: '2026-03', startMonth: 10, accountItems });
    const findings = advanceTaxPaymentCheck(data);
    const at01 = findings.filter(f => f.checkCode === 'AT-01');
    // 法人税の仕訳があるのでAT-01はスキップ
    assert.strictEqual(at01.length, 0);
    // 消費税の仕訳はないのでAT-02は検出
    const at02 = findings.filter(f => f.checkCode === 'AT-02');
    assert.strictEqual(at02.length, 1);
  });

  await test('AI-2. accountItemsマスタなし → trialBs/Plフォールバック', () => {
    // accountItemsがnullでもtrialBs/Plから科目解決できる（従来動作）
    const data = mkData([], { targetMonth: '2026-03', startMonth: 10, accountItems: null });
    const findings = advanceTaxPaymentCheck(data);
    // trialBs/Plに法人税関連科目がマッピングされているのでAT-01検出
    const at01 = findings.filter(f => f.checkCode === 'AT-01');
    assert.strictEqual(at01.length, 1);
  });

  // --- 境界値テスト ---
  await test('EMPTY. startMonth未設定 → 指摘なし', () => {
    const data = mkData([]);
    data.startMonth = undefined;
    const findings = advanceTaxPaymentCheck(data);
    assert.strictEqual(findings.length, 0);
  });

  await test('NULL. deals が null → クラッシュしない', () => {
    const data = mkData([]);
    data.deals = null;
    const findings = advanceTaxPaymentCheck(data);
    assert.ok(Array.isArray(findings));
  });

  // --- 結果 ---
  console.log(`\n--- 結果 ---`);
  console.log(`✅ 通過: ${passed}件`);
  if (failed > 0) {
    console.log(`❌ 失敗: ${failed}件`);
    process.exit(1);
  }
  console.log('全テスト通過 🎉');
})();
