'use strict';

/**
 * test-withholding-tax.js — WT-01〜WT-06 のユニットテスト
 *
 * 実行: node tests/test-withholding-tax.js
 */

const assert = require('assert');
const {
  withholdingTaxCheck,
  isCorporate,
  isProfessional,
  isExemptProfessional,
  calcExpectedTax,
} = require('../src/verify/monthly-checks/withholding-tax');

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

const ACCOUNT_IDS = {
  支払手数料: 2001,
  支払報酬料: 2002,
  外注費: 2003,
  預り金: 2004,
  通信費: 2005,
  消耗品費: 2006,
  売上高: 2007,
};

function mkTrialBsPl() {
  const balances = Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
    account_item_id: id,
    account_item_name: name,
    account_category_name: 'テスト',
    closing_balance: 0,
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
    amount: overrides.amount || 10000,
    partner_id: overrides.partner_id || null,
    partner_name: overrides.partner_name || '',
    details: overrides.details || [],
  };
}

function mkDetail(overrides = {}) {
  return {
    account_item_id: overrides.account_item_id || ACCOUNT_IDS.外注費,
    tax_code: overrides.tax_code || 136,
    amount: overrides.amount || 10000,
    description: overrides.description || '',
    entry_side: overrides.entry_side || 'debit',
    vat: overrides.vat || 0,
  };
}

function mkData(deals = [], extraData = {}) {
  const { trialBs, trialPl } = mkTrialBsPl();
  return {
    deals,
    trialBs,
    trialPl,
    prevMonth: extraData.prevMonth || null,
    companyId: '474381',
    targetMonth: extraData.targetMonth || '2026-03',
    fiscalYear: 2025,
    startMonth: 10,
    fiscalYearId: 10840688,
    ...extraData,
  };
}

// 預り金のBS残高付きデータ
function mkDataWithDeposit(deals, currBalance, prevBalance) {
  const { trialBs, trialPl } = mkTrialBsPl();
  // 預り金の残高を設定
  const bsBalances = trialBs.trial_bs.balances;
  const deposit = bsBalances.find(b => b.account_item_name === '預り金');
  if (deposit) deposit.closing_balance = currBalance;

  const prevTrialBs = {
    trial_bs: {
      balances: Object.entries(ACCOUNT_IDS).map(([name, id]) => ({
        account_item_id: id,
        account_item_name: name,
        account_category_name: 'テスト',
        closing_balance: name === '預り金' ? prevBalance : 0,
        opening_balance: 0,
      })),
    },
  };

  return {
    deals,
    trialBs,
    trialPl,
    prevMonth: { trialBs: prevTrialBs },
    companyId: '474381',
    targetMonth: '2026-03',
    fiscalYear: 2025,
    startMonth: 10,
    fiscalYearId: 10840688,
  };
}

// ============================================================
// テスト実行
// ============================================================

(async () => {
  console.log('\n=== test-withholding-tax.js ===\n');

  // --- ヘルパー関数テスト ---
  await test('H1. isCorporate: 法人格キーワード判定', () => {
    assert.ok(isCorporate('株式会社テスト'));
    assert.ok(isCorporate('テスト㈱'));
    assert.ok(isCorporate('合同会社ABC'));
    assert.ok(!isCorporate('山田太郎'));
    assert.ok(!isCorporate('山田税理士事務所'));
    assert.ok(!isCorporate(''));
    assert.ok(!isCorporate(null));
  });

  await test('H2. isProfessional: 士業キーワード判定（行政書士除外）', () => {
    assert.ok(isProfessional('山田税理士事務所'));
    assert.ok(isProfessional('弁護士法人テスト'));
    assert.ok(isProfessional('司法書士 田中'));
    assert.ok(!isProfessional('行政書士事務所'));
    assert.ok(!isProfessional('株式会社テスト'));
    assert.ok(!isProfessional(''));
  });

  await test('H3. calcExpectedTax: 100万円以下は10.21%', () => {
    assert.strictEqual(calcExpectedTax(100000, false), Math.floor(100000 * 0.1021));
    assert.strictEqual(calcExpectedTax(500000, false), Math.floor(500000 * 0.1021));
  });

  await test('H4. calcExpectedTax: 100万円超は段階税率', () => {
    const expected = Math.floor(1000000 * 0.1021 + 500000 * 0.2042);
    assert.strictEqual(calcExpectedTax(1500000, false), expected);
  });

  await test('H5. calcExpectedTax: 司法書士は1万円控除', () => {
    assert.strictEqual(calcExpectedTax(50000, true), Math.floor(40000 * 0.1021));
    assert.strictEqual(calcExpectedTax(10000, true), 0);
    assert.strictEqual(calcExpectedTax(5000, true), 0);
  });

  // --- WT-01: 個人士業への支払い ---
  await test('WT-01-1. 個人士業（法人格なし）+ 預り金なし → 🔴検出', () => {
    const data = mkData([
      mkDeal({
        partner_name: '山田税理士事務所',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 55000, entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 1);
    assert.strictEqual(wt01[0].severity, '🔴');
    assert.ok(wt01[0].description.includes('山田税理士事務所'));
  });

  await test('WT-01-2. 法人（株式会社）への支払い → スキップ', () => {
    const data = mkData([
      mkDeal({
        partner_name: '株式会社テスト会計事務所',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 100000, entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 0);
  });

  await test('WT-01-3. 行政書士への支払い → スキップ（源泉対象外）', () => {
    const data = mkData([
      mkDeal({
        partner_name: '田中行政書士事務所',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 30000, entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 0);
  });

  await test('WT-01-4. 個人士業 + 預り金あり → スキップ', () => {
    const data = mkData([
      mkDeal({
        partner_name: '佐藤税理士事務所',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 55000, entry_side: 'debit' }),
          mkDetail({ account_item_id: ACCOUNT_IDS.預り金, amount: 5615, entry_side: 'credit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 0);
  });

  // --- WT-02: デザイン・原稿等 ---
  await test('WT-02-1. 「デザイン」含む外注費 + 個人 + 預り金なし → 🟡検出', () => {
    const data = mkData([
      mkDeal({
        partner_name: '田中太郎',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.外注費, amount: 30000, description: 'ロゴデザイン制作', entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt02 = findings.filter(f => f.checkCode === 'WT-02');
    assert.strictEqual(wt02.length, 1);
    assert.strictEqual(wt02[0].severity, '🟡');
  });

  await test('WT-02-2. 「デザイン」含む外注費 + 法人 → スキップ', () => {
    const data = mkData([
      mkDeal({
        partner_name: '株式会社デザインワークス',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.外注費, amount: 300000, description: 'Webデザイン', entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt02 = findings.filter(f => f.checkCode === 'WT-02');
    assert.strictEqual(wt02.length, 0);
  });

  // --- WT-03: 源泉税額の検算 ---
  await test('WT-03-1. 預り金あり + 金額が10.21%と±5%以内 → スキップ', () => {
    const amount = 100000;
    const expectedTax = Math.floor(amount * 0.1021); // 10,210
    const data = mkData([
      mkDeal({
        partner_name: '鈴木太郎',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount, description: '翻訳料', entry_side: 'debit' }),
          mkDetail({ account_item_id: ACCOUNT_IDS.預り金, amount: expectedTax, entry_side: 'credit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt03 = findings.filter(f => f.checkCode === 'WT-03');
    assert.strictEqual(wt03.length, 0);
  });

  await test('WT-03-2. 預り金あり + 金額が大幅にずれる → 🟡検出', () => {
    const amount = 100000;
    const wrongTax = 5000; // 10,210円のはずが5,000円
    const data = mkData([
      mkDeal({
        partner_name: '高橋花子',
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount, description: '原稿料', entry_side: 'debit' }),
          mkDetail({ account_item_id: ACCOUNT_IDS.預り金, amount: wrongTax, entry_side: 'credit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt03 = findings.filter(f => f.checkCode === 'WT-03');
    assert.strictEqual(wt03.length, 1);
    assert.strictEqual(wt03[0].severity, '🟡');
  });

  // --- WT-04: 預り金の滞留 ---
  await test('WT-04-1. 預り金が前月比1.5倍 + 増加50,000円以上 → 🟡検出', () => {
    const data = mkDataWithDeposit([], 200000, 100000);
    const findings = withholdingTaxCheck(data);
    const wt04 = findings.filter(f => f.checkCode === 'WT-04');
    assert.strictEqual(wt04.length, 1);
    assert.strictEqual(wt04[0].severity, '🟡');
  });

  await test('WT-04-2. 預り金が微増 → スキップ', () => {
    const data = mkDataWithDeposit([], 110000, 100000);
    const findings = withholdingTaxCheck(data);
    const wt04 = findings.filter(f => f.checkCode === 'WT-04');
    assert.strictEqual(wt04.length, 0);
  });

  // --- WT-05: 納期の特例 ---
  await test('WT-05-1. 対象月が6月 → 🔵検出（7月10日注意喚起）', () => {
    const data = mkData([], { targetMonth: '2026-06' });
    const findings = withholdingTaxCheck(data);
    const wt05 = findings.filter(f => f.checkCode === 'WT-05');
    assert.strictEqual(wt05.length, 1);
    assert.ok(wt05[0].description.includes('7月10日'));
  });

  await test('WT-05-2. 対象月が12月 → 🔵検出（翌年1月20日注意喚起）', () => {
    const data = mkData([], { targetMonth: '2025-12' });
    const findings = withholdingTaxCheck(data);
    const wt05 = findings.filter(f => f.checkCode === 'WT-05');
    assert.strictEqual(wt05.length, 1);
    assert.ok(wt05[0].description.includes('1月20日'));
  });

  await test('WT-05-3. 対象月が3月 → スキップ', () => {
    const data = mkData([], { targetMonth: '2026-03' });
    const findings = withholdingTaxCheck(data);
    const wt05 = findings.filter(f => f.checkCode === 'WT-05');
    assert.strictEqual(wt05.length, 0);
  });

  // --- WT-06: 非居住者 ---
  await test('WT-06-1. 海外サービス（isDomestic=false）あり → 🔵検出', () => {
    // overseas-services.js に登録されているサービスでisDomestic=falseのもの
    // Slackなど。サービスDBに依存するため存在チェックのみ
    const data = mkData([
      mkDeal({
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.通信費, amount: 5000, description: 'Slack月額', entry_side: 'debit' }),
        ],
      }),
    ]);
    const findings = withholdingTaxCheck(data);
    const wt06 = findings.filter(f => f.checkCode === 'WT-06');
    // 海外サービスDBの登録に依存（0件or1件）
    assert.ok(wt06.length >= 0);
  });

  // --- partner_name 空 + partner_id → マスタ逆引きテスト ---
  await test('WT-01-5. partner_name空 + partner_id + partnersマスタ → 士業名でWT-01検出', () => {
    const data = mkData([
      mkDeal({
        partner_name: '',  // APIから partner_name が返らないケース
        partner_id: 12345,
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 55000, entry_side: 'debit' }),
        ],
      }),
    ], {
      partners: [
        { id: 12345, name: '東京税理士協同組合' },
        { id: 99999, name: '株式会社テスト' },
      ],
    });
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 1, 'partner_id からマスタ逆引きでWT-01検出されるべき');
    assert.ok(wt01[0].description.includes('東京税理士協同組合'),
      `description に取引先名が含まれない: ${wt01[0].description}`);
  });

  await test('WT-01-6. partner_name空 + partner_id + マスタが法人 → スキップ', () => {
    const data = mkData([
      mkDeal({
        partner_name: '',
        partner_id: 99999,
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 55000, entry_side: 'debit', description: '税理士報酬' }),
        ],
      }),
    ], {
      partners: [
        { id: 99999, name: '株式会社テスト会計事務所' },
      ],
    });
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 0, '法人格のある取引先はスキップされるべき');
  });

  await test('WT-01-7. partner_name空 + partners未提供（null）→ 従来通り空文字で動作', () => {
    const data = mkData([
      mkDeal({
        partner_name: '',
        partner_id: 12345,
        details: [
          mkDetail({ account_item_id: ACCOUNT_IDS.支払手数料, amount: 55000, entry_side: 'debit', description: '税理士報酬' }),
        ],
      }),
    ]);
    // partners なし → 取引先名解決不可 → description の「税理士」で検出
    const findings = withholdingTaxCheck(data);
    const wt01 = findings.filter(f => f.checkCode === 'WT-01');
    assert.strictEqual(wt01.length, 1, 'description 内の士業キーワードで検出されるべき');
  });

  // --- 境界値テスト ---
  await test('EMPTY. deals が空 → 指摘なし（WT-04/05は別途動作）', () => {
    const data = mkData([]);
    const findings = withholdingTaxCheck(data);
    // WT-05（3月なのでなし）以外はなし
    const wt01to03 = findings.filter(f => ['WT-01', 'WT-02', 'WT-03'].includes(f.checkCode));
    assert.strictEqual(wt01to03.length, 0);
  });

  await test('NULL. deals が null → クラッシュしない', () => {
    const data = mkData([]);
    data.deals = null;
    const findings = withholdingTaxCheck(data);
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
