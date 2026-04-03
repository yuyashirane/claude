'use strict';

/**
 * test-monthly-checker.js — 月次帳簿チェック ユニットテスト
 *
 * 対象モジュール:
 *   trial-helpers, data-quality, loan-lease, officer-loan, fixed-asset,
 *   payroll, rent, revenue-receivable, purchase-payable, outsource,
 *   (smoke) cash-deposit, extraordinary-tax
 *
 * 使い方: node tests/test-monthly-checker.js
 */

const assert = require('assert');

// ============================================================
// テスト対象モジュール
// ============================================================
const {
  findAccountBalance,
  getAllBalances,
  isPLAllZero,
  getMonthlyAmount,
  getPartnerBalances,
  monthsFromFiscalStart,
} = require('../src/verify/monthly-checks/trial-helpers');

const { dataQualityCheck }       = require('../src/verify/monthly-checks/data-quality');
const { loanLeaseCheck }         = require('../src/verify/monthly-checks/loan-lease');
const { officerLoanCheck }       = require('../src/verify/monthly-checks/officer-loan');
const { fixedAssetCheck }        = require('../src/verify/monthly-checks/fixed-asset');
const { payrollCheck }           = require('../src/verify/monthly-checks/payroll');
const { rentCheck }              = require('../src/verify/monthly-checks/rent');
const { revenueReceivableCheck } = require('../src/verify/monthly-checks/revenue-receivable');
const { purchasePayableCheck }   = require('../src/verify/monthly-checks/purchase-payable');
const { outsourceCheck }         = require('../src/verify/monthly-checks/outsource');
const { cashDepositCheck }       = require('../src/verify/monthly-checks/cash-deposit');
const { extraordinaryTaxCheck }  = require('../src/verify/monthly-checks/extraordinary-tax');

// ============================================================
// テストランナー
// ============================================================
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

/** trialPl / trialBs の balances エントリを1件作成 */
function mkBalance(accountItemName, closingBalance, opts = {}) {
  return {
    account_item_id: opts.id ?? 1,
    account_item_name: accountItemName,
    account_category_name: opts.category ?? accountItemName,
    hierarchy_level: 3,
    opening_balance: opts.opening ?? 0,
    debit_amount: opts.debit ?? 0,
    credit_amount: opts.credit ?? 0,
    closing_balance: closingBalance,
    composition_ratio: 0,
    items: opts.items ?? undefined,
    partners: opts.partners ?? undefined,
  };
}

/** trialPl オブジェクト */
function mkPl(balances) {
  return { trial_pl: { balances } };
}

/** trialBs オブジェクト */
function mkBs(balances) {
  return { trial_bs: { balances } };
}

/** trialBsByItem オブジェクト（items 付き balances） */
function mkBsByItem(balances) {
  return { trial_bs: { balances } };
}

/** trialPlByPartner オブジェクト（partners 付き balances） */
function mkPlByPartner(accountName, partners) {
  return {
    trial_pl: {
      balances: [
        mkBalance(accountName, partners.reduce((s, p) => s + p.closing_balance, 0), { partners }),
      ],
    },
  };
}

/** trialBsByPartner オブジェクト（partners 付き balances） */
function mkBsByPartner(accountName, partners) {
  return {
    trial_bs: {
      balances: [
        mkBalance(accountName, partners.reduce((s, p) => s + p.closing_balance, 0), { partners }),
      ],
    },
  };
}

/** 基本の MonthlyData スケルトン */
function mkData(overrides = {}) {
  return {
    targetMonth: '2026-03',
    startMonth: 10,          // 10月決算
    fiscalYear: 2025,
    companyName: 'テスト事業所',
    trialBs: null,
    trialPl: null,
    trialBsByItem: null,
    trialBsByPartner: null,
    trialPlByPartner: null,
    deals: [],
    walletTxns: null,
    prevMonth: null,
    prevYearMonth: null,
    fetchErrors: [],
    ...overrides,
  };
}

// ============================================================
// Section 1: trial-helpers
// ============================================================

console.log('\n[trial-helpers]');

test('findAccountBalance: account_item_name 完全一致', () => {
  const trialPl = mkPl([mkBalance('売上高', 1_000_000)]);
  const result = findAccountBalance(trialPl, '売上高');
  assert.strictEqual(result?.balance, 1_000_000);
  assert.strictEqual(result?.name, '売上高');
});

test('findAccountBalance: account_category_name フォールバック', () => {
  const trialBs = mkBs([
    { account_item_name: undefined, account_category_name: '流動資産', closing_balance: 500_000, opening_balance: 0 },
  ]);
  const result = findAccountBalance(trialBs, '流動資産');
  assert.strictEqual(result?.balance, 500_000);
});

test('findAccountBalance: 存在しない科目は null', () => {
  const trialPl = mkPl([mkBalance('売上高', 100)]);
  assert.strictEqual(findAccountBalance(trialPl, '存在しない科目'), null);
});

test('findAccountBalance: null データは null', () => {
  assert.strictEqual(findAccountBalance(null, '売上高'), null);
});

test('getAllBalances: account_item_name がある行のみ返す', () => {
  const trialBs = mkBs([
    mkBalance('現金', 100_000),
    { account_item_name: undefined, account_category_name: '合計', closing_balance: 100_000, opening_balance: 0 },
    mkBalance('普通預金', 500_000),
  ]);
  const result = getAllBalances(trialBs);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result.map((r) => r.name), ['現金', '普通預金']);
});

test('isPLAllZero: 全ゼロ → true', () => {
  const trialPl = mkPl([mkBalance('売上高', 0), mkBalance('外注費', 0)]);
  assert.strictEqual(isPLAllZero(trialPl), true);
});

test('isPLAllZero: 非ゼロあり → false', () => {
  const trialPl = mkPl([mkBalance('売上高', 500_000)]);
  assert.strictEqual(isPLAllZero(trialPl), false);
});

test('getPartnerBalances: 指定科目のパートナー配列を返す', () => {
  const plByPartner = mkPlByPartner('売上高', [
    { id: 1, name: '株式会社A', closing_balance: 300_000, opening_balance: 0 },
    { id: 2, name: '株式会社B', closing_balance: 200_000, opening_balance: 0 },
  ]);
  const result = getPartnerBalances(plByPartner, '売上高');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].name, '株式会社A');
});

test('monthsFromFiscalStart: 期首10月、対象3月 → 6ヶ月目', () => {
  assert.strictEqual(monthsFromFiscalStart('2026-03', 10), 6);
});

test('monthsFromFiscalStart: 期首10月、対象10月 → 1ヶ月目', () => {
  assert.strictEqual(monthsFromFiscalStart('2025-10', 10), 1);
});

test('monthsFromFiscalStart: 期首4月、対象3月 → 12ヶ月目', () => {
  assert.strictEqual(monthsFromFiscalStart('2026-03', 4), 12);
});

test('getMonthlyAmount: YTD差分を正しく算出', () => {
  const curr = mkPl([mkBalance('外注費', 600_000)]);
  const prev = mkPl([mkBalance('外注費', 500_000)]);
  assert.strictEqual(getMonthlyAmount(curr, prev, '外注費'), 100_000);
});

// ============================================================
// Section 2: data-quality
// ============================================================

console.log('\n[data-quality]');

test('DQ-01: walletTxns ありで 🔴 を発行', () => {
  const data = mkData({ walletTxns: [{ id: 1, date: '2026-03-01', amount: -5000 }] });
  const findings = dataQualityCheck(data);
  const dq01 = findings.filter((f) => f.checkCode === 'DQ-01');
  assert.strictEqual(dq01.length, 1);
  assert.strictEqual(dq01[0].severity, '🔴');
});

test('DQ-01: walletTxns 空配列は指摘なし', () => {
  const data = mkData({ walletTxns: [] });
  const findings = dataQualityCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'DQ-01').length, 0);
});

test('DQ-02: 同日・同額・同科目が2件で 🟡 を発行', () => {
  const deal = (id) => ({
    id,
    issue_date: '2026-03-10',
    amount: -50_000,
    details: [{ account_item_id: 99, account_item_name: '消耗品費', amount: -50_000 }],
  });
  const data = mkData({ deals: [deal(1), deal(2)] });
  const findings = dataQualityCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'DQ-02'));
});

test('DQ-02: 金額が異なれば指摘なし', () => {
  const data = mkData({
    deals: [
      { id: 1, issue_date: '2026-03-10', amount: -50_000, details: [{ account_item_id: 99, amount: -50_000 }] },
      { id: 2, issue_date: '2026-03-10', amount: -60_000, details: [{ account_item_id: 99, amount: -60_000 }] },
    ],
  });
  const findings = dataQualityCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'DQ-02').length, 0);
});

test('DQ-03: PL全ゼロで 🟡 を発行', () => {
  const data = mkData({ trialPl: mkPl([mkBalance('売上高', 0)]) });
  const findings = dataQualityCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'DQ-03'));
});

test('DQ-03: PL非ゼロは指摘なし', () => {
  const data = mkData({ trialPl: mkPl([mkBalance('売上高', 500_000)]) });
  const findings = dataQualityCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'DQ-03').length, 0);
});

// ============================================================
// Section 3: loan-lease
// ============================================================

console.log('\n[loan-lease]');

test('LL-01: 借入金がマイナスで 🔴 を発行', () => {
  const data = mkData({
    trialBsByItem: mkBsByItem([
      mkBalance('長期借入金', -500_000, { items: [] }),
    ]),
  });
  const findings = loanLeaseCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'LL-01' && f.severity === '🔴'));
});

test('LL-01: 借入金が正値は指摘なし', () => {
  const data = mkData({
    trialBsByItem: mkBsByItem([
      mkBalance('長期借入金', 1_000_000, { items: [] }),
    ]),
  });
  const findings = loanLeaseCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'LL-01').length, 0);
});

test('LL-02: 品目タグ未選択に残高で 🟡 を発行', () => {
  const data = mkData({
    trialBsByItem: mkBsByItem([
      mkBalance('短期借入金', 500_000, {
        items: [{ id: 0, name: '未選択', opening_balance: 500_000, closing_balance: 500_000 }],
      }),
    ]),
  });
  const findings = loanLeaseCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'LL-02'));
});

test('LL-03: 品目残高 opening === closing > 0 で 🟡 を発行', () => {
  const data = mkData({
    trialBsByItem: mkBsByItem([
      mkBalance('長期借入金', 2_000_000, {
        items: [{ id: 5, name: 'A銀行', opening_balance: 2_000_000, closing_balance: 2_000_000 }],
      }),
    ]),
  });
  const findings = loanLeaseCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'LL-03'));
});

test('LL-03: 返済があれば指摘なし（closing < opening）', () => {
  const data = mkData({
    trialBsByItem: mkBsByItem([
      mkBalance('長期借入金', 1_950_000, {
        items: [{ id: 5, name: 'A銀行', opening_balance: 2_000_000, closing_balance: 1_950_000 }],
      }),
    ]),
  });
  const findings = loanLeaseCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'LL-03').length, 0);
});

// ============================================================
// Section 4: officer-loan
// ============================================================

console.log('\n[officer-loan]');

test('OL-01: 役員貸付金 > 0 で 🔴 を発行', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('役員貸付金', 1_000_000)]),
  });
  const findings = officerLoanCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'OL-01' && f.severity === '🔴'));
});

test('OL-01: 役員貸付金 = 0 は指摘なし', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('役員貸付金', 0)]),
  });
  const findings = officerLoanCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'OL-01').length, 0);
});

test('OL-02: 役員借入金が前月より増加で 🟡 を発行', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('役員借入金', 3_000_000)]),
    prevMonth: { trialBs: mkBs([mkBalance('役員借入金', 2_000_000)]) },
  });
  const findings = officerLoanCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'OL-02'));
});

test('OL-02: 役員借入金が減少は指摘なし', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('役員借入金', 1_500_000)]),
    prevMonth: { trialBs: mkBs([mkBalance('役員借入金', 2_000_000)]) },
  });
  const findings = officerLoanCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'OL-02').length, 0);
});

test('OL-03: 未払役員報酬 > 0 かつ期首+3ヶ月以上で 🟡 を発行', () => {
  // targetMonth=2026-03, startMonth=10 → elapsed=6 (>= 3)
  const data = mkData({
    trialBs: mkBs([mkBalance('未払役員報酬', 500_000)]),
  });
  const findings = officerLoanCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'OL-03'));
});

test('OL-04: 未払金がマイナスで 🔴 を発行', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('未払金', -100_000)]),
  });
  const findings = officerLoanCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'OL-04' && f.severity === '🔴'));
});

// ============================================================
// Section 5: fixed-asset
// ============================================================

console.log('\n[fixed-asset]');

test('FA-01: 消耗品費 >= 100,000 で 🔴 を発行', () => {
  const data = mkData({
    deals: [{
      id: 101, issue_date: '2026-03-15', amount: -150_000,
      details: [{ account_item_id: 5, account_item_name: '消耗品費', amount: -150_000 }],
    }],
  });
  const findings = fixedAssetCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'FA-01' && f.severity === '🔴'));
});

test('FA-01: 消耗品費 < 100,000 は指摘なし', () => {
  const data = mkData({
    deals: [{
      id: 102, issue_date: '2026-03-15', amount: -50_000,
      details: [{ account_item_id: 5, account_item_name: '消耗品費', amount: -50_000 }],
    }],
  });
  const findings = fixedAssetCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'FA-01').length, 0);
});

test('FA-02: 修繕費 >= 200,000 で 🟡 を発行', () => {
  const data = mkData({
    deals: [{
      id: 103, issue_date: '2026-03-20', amount: -300_000,
      details: [{ account_item_id: 6, account_item_name: '修繕費', amount: -300_000 }],
    }],
  });
  const findings = fixedAssetCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'FA-02' && f.severity === '🟡'));
});

test('FA-02: 修繕費 < 200,000 は指摘なし', () => {
  const data = mkData({
    deals: [{
      id: 104, issue_date: '2026-03-20', amount: -100_000,
      details: [{ account_item_id: 6, account_item_name: '修繕費', amount: -100_000 }],
    }],
  });
  const findings = fixedAssetCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'FA-02').length, 0);
});

// ============================================================
// Section 6: payroll
// ============================================================

console.log('\n[payroll]');

test('PY-01: 役員報酬が前月平均から変動で 🔴 を発行', () => {
  // elapsed=6: prevYTD=500,000/5月=100,000, currYTD=650,000→当月150,000→差50,000>100
  const data = mkData({
    trialPl: mkPl([mkBalance('役員報酬', 650_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('役員報酬', 500_000)]) },
  });
  const findings = payrollCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PY-01' && f.severity === '🔴'));
});

test('PY-01: elapsed=1 では指摘なし', () => {
  // startMonth=10, targetMonth=2025-10 → elapsed=1
  const data = mkData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialPl: mkPl([mkBalance('役員報酬', 100_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('役員報酬', 0)]) },
  });
  const findings = payrollCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'PY-01').length, 0);
});

test('PY-01: 差額 <= 100円は指摘なし', () => {
  // elapsed=6: prevYTD=500,000/5=100,000, currYTD=600,050→当月100,050→diff=50
  const data = mkData({
    trialPl: mkPl([mkBalance('役員報酬', 600_050)]),
    prevMonth: { trialPl: mkPl([mkBalance('役員報酬', 500_000)]) },
  });
  const findings = payrollCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'PY-01').length, 0);
});

test('PY-02: 法定福利費の比率が低すぎて 🟡 を発行', () => {
  // totalSalary=100万, 法定福利費=5万 (5%) < 9.8% → 指摘
  const data = mkData({
    trialPl: mkPl([
      mkBalance('役員報酬', 500_000),
      mkBalance('給料手当', 500_000),
      mkBalance('法定福利費', 50_000),
    ]),
    prevMonth: { trialPl: mkPl([
      mkBalance('役員報酬', 0),
      mkBalance('給料手当', 0),
      mkBalance('法定福利費', 0),
    ]) },
  });
  const findings = payrollCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PY-02'));
});

test('PY-03: 源泉所得税が opening = closing > 0 で 🟡 を発行', () => {
  const data = mkData({
    trialPl: mkPl([mkBalance('役員報酬', 100_000)]),
    trialBsByItem: mkBsByItem([
      mkBalance('預り金', 150_000, {
        items: [
          { id: 1, name: '源泉所得税（給与）', opening_balance: 50_000, closing_balance: 50_000 },
        ],
      }),
    ]),
  });
  const findings = payrollCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PY-03'));
});

test('PY-04: 給料手当が前月平均比 > 30% 変動で 🔵 を発行', () => {
  // elapsed=6, prevYTD=500,000/5=100,000, currYTD=700,000→当月=200,000 (100%超)
  const data = mkData({
    trialPl: mkPl([mkBalance('給料手当', 700_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('給料手当', 500_000)]) },
  });
  const findings = payrollCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PY-04' && f.severity === '🔵'));
});

// ============================================================
// Section 7: rent
// ============================================================

console.log('\n[rent]');

test('RT-01: 地代家賃が前月平均比 > 10% 変動で 🟡 を発行', () => {
  // elapsed=6, prevYTD=500,000/5=100,000, currYTD=700,000→当月=200,000 (100%超)
  const data = mkData({
    trialPl: mkPl([mkBalance('地代家賃', 700_000)]),
    prevMonth: {
      trialPl: mkPl([mkBalance('地代家賃', 500_000)]),
      trialPlByPartner: null,
    },
  });
  const findings = rentCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RT-01'));
});

test('RT-01: 変動 < 10% は指摘なし', () => {
  // prevYTD=500,000/5=100,000, curr=605,000→当月=105,000 (5%増 < 10%)
  const data = mkData({
    trialPl: mkPl([mkBalance('地代家賃', 605_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('地代家賃', 500_000)]) },
  });
  const findings = rentCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'RT-01').length, 0);
});

test('RT-02: 地代家賃 >= 200,000 の取引で 🟡 を発行', () => {
  const data = mkData({
    deals: [{
      id: 201, issue_date: '2026-03-01', amount: -250_000,
      details: [{ account_item_id: 7, account_item_name: '地代家賃', amount: -250_000 }],
    }],
    trialPl: mkPl([mkBalance('地代家賃', 250_000)]),
  });
  const findings = rentCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RT-02'));
});

test('RT-02: 地代家賃 < 200,000 は指摘なし', () => {
  const data = mkData({
    deals: [{
      id: 202, issue_date: '2026-03-01', amount: -100_000,
      details: [{ account_item_id: 7, account_item_name: '地代家賃', amount: -100_000 }],
    }],
    trialPl: mkPl([mkBalance('地代家賃', 100_000)]),
  });
  const findings = rentCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'RT-02').length, 0);
});

test('RT-03: 地代家賃の未選択タグで 🔵 を発行', () => {
  const data = mkData({
    trialPl: mkPl([mkBalance('地代家賃', 100_000)]),
    trialPlByPartner: mkPlByPartner('地代家賃', [
      { id: 0, name: '未選択', closing_balance: 100_000, opening_balance: 0 },
    ]),
  });
  const findings = rentCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RT-03' && f.severity === '🔵'));
});

// ============================================================
// Section 8: revenue-receivable
// ============================================================

console.log('\n[revenue-receivable]');

test('RR-01: 売上高が前月平均比 > 50% 減少で 🟡 を発行', () => {
  // elapsed=6, prevYTD=1,000,000/5=200,000, currYTD=1,050,000→当月=50,000 (75%減)
  const data = mkData({
    trialPl: mkPl([mkBalance('売上高', 1_050_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('売上高', 1_000_000)]) },
  });
  const findings = revenueReceivableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RR-01'));
});

test('RR-01: elapsed=1 は前月比指摘なし', () => {
  const data = mkData({
    targetMonth: '2025-10',
    startMonth: 10,
    trialPl: mkPl([mkBalance('売上高', 200_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('売上高', 0)]) },
  });
  const findings = revenueReceivableCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'RR-01').length, 0);
});

test('RR-02: 売掛金が2ヶ月連続同額で 🟡 を発行', () => {
  const partner = { id: 10, name: '株式会社X', closing_balance: 500_000, opening_balance: 500_000 };
  const data = mkData({
    trialPl: mkPl([mkBalance('売上高', 500_000)]),
    trialBsByPartner: mkBsByPartner('売掛金', [partner]),
    prevMonth: { trialBsByPartner: mkBsByPartner('売掛金', [partner]) },
  });
  const findings = revenueReceivableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RR-02'));
});

test('RR-02: 未選択パートナーは指摘なし', () => {
  const data = mkData({
    trialPl: mkPl([mkBalance('売上高', 500_000)]),
    trialBsByPartner: mkBsByPartner('売掛金', [
      { id: 0, name: '未選択', closing_balance: 500_000, opening_balance: 0 },
    ]),
    prevMonth: {
      trialBsByPartner: mkBsByPartner('売掛金', [
        { id: 0, name: '未選択', closing_balance: 500_000, opening_balance: 0 },
      ]),
    },
  });
  const findings = revenueReceivableCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'RR-02').length, 0);
});

test('RR-03: 売上高の未選択タグで 🔵 を発行', () => {
  const data = mkData({
    trialPl: mkPl([mkBalance('売上高', 300_000)]),
    trialPlByPartner: mkPlByPartner('売上高', [
      { id: 0, name: '未選択', closing_balance: 300_000, opening_balance: 0 },
    ]),
  });
  const findings = revenueReceivableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'RR-03' && f.severity === '🔵'));
});

// ============================================================
// Section 9: purchase-payable
// ============================================================

console.log('\n[purchase-payable]');

test('PP-01: 仕入高が前月平均比 > 50% 変動で 🟡 を発行', () => {
  // elapsed=6, prevYTD=500,000/5=100,000, currYTD=800,000→当月=300,000 (200%増)
  const data = mkData({
    trialPl: mkPl([mkBalance('仕入高', 800_000)]),
    prevMonth: { trialPl: mkPl([mkBalance('仕入高', 500_000)]) },
  });
  const findings = purchasePayableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PP-01'));
});

test('PP-02: 買掛金が2ヶ月連続同額で 🟡 を発行', () => {
  const partner = { id: 20, name: '株式会社Y', closing_balance: 300_000, opening_balance: 300_000 };
  const data = mkData({
    trialBsByPartner: mkBsByPartner('買掛金', [partner]),
    prevMonth: { trialBsByPartner: mkBsByPartner('買掛金', [partner]) },
  });
  const findings = purchasePayableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PP-02'));
});

test('PP-02: 未選択パートナーは指摘なし', () => {
  const data = mkData({
    trialBsByPartner: mkBsByPartner('買掛金', [
      { id: 0, name: '未選択', closing_balance: 300_000, opening_balance: 0 },
    ]),
    prevMonth: {
      trialBsByPartner: mkBsByPartner('買掛金', [
        { id: 0, name: '未選択', closing_balance: 300_000, opening_balance: 0 },
      ]),
    },
  });
  const findings = purchasePayableCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'PP-02').length, 0);
});

test('PP-03: クレジットカード未払金が前月比増加で 🟡 を発行', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('VISAカード未払金', 200_000)]),
    prevMonth: { trialBs: mkBs([mkBalance('VISAカード未払金', 150_000)]) },
  });
  const findings = purchasePayableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PP-03'));
});

test('PP-03: 残高が減少は指摘なし', () => {
  const data = mkData({
    trialBs: mkBs([mkBalance('VISAカード未払金', 100_000)]),
    prevMonth: { trialBs: mkBs([mkBalance('VISAカード未払金', 150_000)]) },
  });
  const findings = purchasePayableCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'PP-03').length, 0);
});

test('PP-04: 前月ゼロ・当月新規経費 >= 10,000 で 🔵 を発行', () => {
  const data = mkData({
    trialPl: mkPl([
      mkBalance('通信費', 50_000, { category: '販売管理費' }),
    ]),
    prevMonth: {
      trialPl: mkPl([
        mkBalance('通信費', 0, { category: '販売管理費' }),
      ]),
    },
  });
  const findings = purchasePayableCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'PP-04' && f.severity === '🔵'));
});

// ============================================================
// Section 10: outsource
// ============================================================

console.log('\n[outsource]');

test('OS-01: 税理士事務所への外注費で 🟡 を発行', () => {
  const data = mkData({
    trialPlByPartner: mkPlByPartner('外注費', [
      { id: 1, name: '山田税理士事務所', closing_balance: 300_000, opening_balance: 0 },
    ]),
    prevMonth: { trialPlByPartner: mkPlByPartner('外注費', []) },
  });
  const findings = outsourceCheck(data);
  assert.ok(findings.some((f) => f.checkCode === 'OS-01' && f.severity === '🟡'));
});

test('OS-01: 非士業取引先は指摘なし', () => {
  const data = mkData({
    trialPlByPartner: mkPlByPartner('外注費', [
      { id: 2, name: '株式会社デザイン', closing_balance: 200_000, opening_balance: 0 },
    ]),
    prevMonth: { trialPlByPartner: mkPlByPartner('外注費', []) },
  });
  const findings = outsourceCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'OS-01').length, 0);
});

test('OS-01: monthlyAmount <= 0 は指摘なし', () => {
  // 前月残高の方が大きい（当月変動なし or マイナス）
  const data = mkData({
    trialPlByPartner: mkPlByPartner('外注費', [
      { id: 1, name: '山田税理士事務所', closing_balance: 300_000, opening_balance: 0 },
    ]),
    prevMonth: {
      trialPlByPartner: mkPlByPartner('外注費', [
        { id: 1, name: '山田税理士事務所', closing_balance: 300_000, opening_balance: 0 },
      ]),
    },
  });
  const findings = outsourceCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'OS-01').length, 0);
});

test('OS-01: 源泉税額 100万以下 → 10.21%', () => {
  const data = mkData({
    trialPlByPartner: mkPlByPartner('支払手数料', [
      { id: 3, name: '鈴木弁護士事務所', closing_balance: 500_000, opening_balance: 0 },
    ]),
    prevMonth: { trialPlByPartner: mkPlByPartner('支払手数料', []) },
  });
  const findings = outsourceCheck(data);
  const f = findings.find((f) => f.checkCode === 'OS-01');
  assert.ok(f, 'OS-01 finding が存在する');
  // 500,000 × 10.21% = 51,050
  assert.ok(f.description.includes('51,050'), `期待する源泉税額が説明文に含まれる: ${f.description}`);
});

test('OS-01: 源泉税額 100万超 → 20.42% 超過部分', () => {
  const data = mkData({
    trialPlByPartner: mkPlByPartner('外注費', [
      { id: 4, name: '法律事務所ABC', closing_balance: 2_000_000, opening_balance: 0 },
    ]),
    prevMonth: { trialPlByPartner: mkPlByPartner('外注費', []) },
  });
  const findings = outsourceCheck(data);
  const f = findings.find((f) => f.checkCode === 'OS-01');
  assert.ok(f, 'OS-01 finding が存在する');
  // 1,000,000×0.1021 + 1,000,000×0.2042 = 102,100 + 204,200 = 306,300
  assert.ok(f.description.includes('306,300'), `100万超源泉税額が説明文に含まれる: ${f.description}`);
});

test('OS-01: 未選択パートナーは指摘なし', () => {
  const data = mkData({
    trialPlByPartner: mkPlByPartner('外注費', [
      { id: 0, name: '未選択', closing_balance: 300_000, opening_balance: 0 },
    ]),
    prevMonth: { trialPlByPartner: mkPlByPartner('外注費', []) },
  });
  const findings = outsourceCheck(data);
  assert.strictEqual(findings.filter((f) => f.checkCode === 'OS-01').length, 0);
});

// ============================================================
// Section 11: smoke tests（クラッシュしないことを確認）
// ============================================================

console.log('\n[smoke tests]');

test('cash-deposit: 空データでクラッシュしない', () => {
  const data = mkData();
  const findings = cashDepositCheck(data);
  assert.ok(Array.isArray(findings));
});

test('extraordinary-tax: 空データでクラッシュしない', () => {
  const data = mkData();
  const findings = extraordinaryTaxCheck(data);
  assert.ok(Array.isArray(findings));
});

test('全チェックモジュール: trialPl=null でクラッシュしない', () => {
  const data = mkData({ trialPl: null, trialBs: null, trialBsByItem: null });
  assert.ok(Array.isArray(dataQualityCheck(data)));
  assert.ok(Array.isArray(loanLeaseCheck(data)));
  assert.ok(Array.isArray(officerLoanCheck(data)));
  assert.ok(Array.isArray(fixedAssetCheck(data)));
  assert.ok(Array.isArray(payrollCheck(data)));
  assert.ok(Array.isArray(rentCheck(data)));
  assert.ok(Array.isArray(revenueReceivableCheck(data)));
  assert.ok(Array.isArray(purchasePayableCheck(data)));
  assert.ok(Array.isArray(outsourceCheck(data)));
});

test('finding 構造: checkCode/severity/description が必須フィールドとして存在する', () => {
  const data = mkData({
    walletTxns: [{ id: 1, date: '2026-03-01', amount: -1000 }],
  });
  const findings = dataQualityCheck(data);
  for (const f of findings) {
    assert.ok(f.checkCode, 'checkCode が存在する');
    assert.ok(f.severity, 'severity が存在する');
    assert.ok(f.description, 'description が存在する');
    assert.ok(f.targetMonth, 'targetMonth が存在する');
  }
});

// ============================================================
// 結果出力
// ============================================================

const total = passed + failed;
console.log(`\nテスト結果: ${passed} passed / ${failed} failed / ${total} total`);
if (failed > 0) {
  process.exit(1);
}
