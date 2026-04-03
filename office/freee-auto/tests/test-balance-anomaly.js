'use strict';

/**
 * test-balance-anomaly.js — BA-01〜BA-05 のユニットテスト
 *
 * 使い方: node tests/test-balance-anomaly.js
 */

const assert = require('assert');
const {
  balanceAnomalyCheck,
  extractDealDetailsForAccount,
  extractPartnerBreakdown,
  extractItemBreakdown,
  buildAccountIdNameMap,
  isCashDeposit,
  isContraAccount,
} = require('../src/verify/monthly-checks/balance-anomaly');

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

function makeTrialBs(balances) {
  return { trial_bs: { balances } };
}

function makeTrialPl(balances) {
  return { trial_pl: { balances } };
}

function makeBsBalance(overrides) {
  return {
    account_item_id: 100,
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

function makeDeal(overrides) {
  return {
    id: 99999,
    company_id: 474381,
    issue_date: '2026-03-15',
    type: 'expense',
    partner_id: null,
    details: [],
    payments: [],
    ...overrides,
  };
}

function makeData(overrides) {
  return {
    trialBs: null,
    trialPl: null,
    trialBsByPartner: null,
    trialBsByItem: null,
    deals: [],
    prevMonth: null,
    companyId: '474381',
    targetMonth: '2026-03',
    ...overrides,
  };
}

// ============================================================
// ヘルパーテスト
// ============================================================

console.log('\n=== balance-anomaly テスト ===\n');
console.log('--- ヘルパー関数 ---');

test('buildAccountIdNameMap: trialBs + trialPl からマップを構築', () => {
  const trialBs = makeTrialBs([
    makeBsBalance({ account_item_id: 101, account_item_name: '前払費用' }),
    makeBsBalance({ account_item_id: 102, account_item_name: '売掛金' }),
  ]);
  const trialPl = makeTrialPl([
    makeBsBalance({ account_item_id: 201, account_item_name: '売上高' }),
  ]);
  const map = buildAccountIdNameMap(trialBs, trialPl);
  assert.strictEqual(map.size, 3);
  assert.strictEqual(map.get(101), '前払費用');
  assert.strictEqual(map.get(201), '売上高');
});

test('isCashDeposit: 現預金パターンの判定', () => {
  assert.ok(isCashDeposit('普通預金'));
  assert.ok(isCashDeposit('【税】ＰａｙＰａｙ銀行'));
  assert.ok(!isCashDeposit('現金過不足'));
  assert.ok(!isCashDeposit('前払費用'));
});

test('extractDealDetailsForAccount: 科目IDで仕訳を抽出', () => {
  const map = new Map([[101, '前払費用'], [200, '普通預金']]);
  const deals = [
    makeDeal({
      id: 1001, issue_date: '2026-03-10',
      details: [
        { account_item_id: 101, amount: 50000, description: '保険料', entry_side: 'debit' },
        { account_item_id: 200, amount: 50000, description: '', entry_side: 'credit' },
      ],
    }),
    makeDeal({
      id: 1002, issue_date: '2026-03-20',
      details: [
        { account_item_id: 300, amount: 10000, description: '消耗品', entry_side: 'debit' },
      ],
    }),
  ];
  const result = extractDealDetailsForAccount(deals, 101, map);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].dealId, 1001);
  assert.strictEqual(result[0].amount, 50000);
  assert.strictEqual(result[0].counterAccount, '普通預金');
  assert.strictEqual(result[0].description, '保険料');
  assert.ok(result[0].freeeLink.includes('1001'));
});

test('extractPartnerBreakdown: 取引先別内訳を抽出', () => {
  const trialBsByPartner = {
    trial_bs: {
      balances: [
        {
          account_item_name: '売掛金',
          partners: [
            { id: 1, name: 'テスト社', opening_balance: 100000, closing_balance: 100000 },
            { id: 2, name: '未選択', opening_balance: 0, closing_balance: 0 },
          ],
        },
      ],
    },
  };
  const result = extractPartnerBreakdown(trialBsByPartner, '売掛金');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].partnerName, 'テスト社');
  assert.strictEqual(result[0].balance, 100000);
});

test('extractItemBreakdown: 品目別内訳を抽出', () => {
  const trialBsByItem = {
    trial_bs: {
      balances: [
        {
          account_item_name: '預り金',
          items: [
            { id: 1, name: '源泉所得税', opening_balance: 0, closing_balance: 50000 },
            { id: 2, name: '住民税', opening_balance: 0, closing_balance: 30000 },
            { id: 0, name: '未選択', opening_balance: 0, closing_balance: 0 },
          ],
        },
      ],
    },
  };
  const result = extractItemBreakdown(trialBsByItem, '預り金');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].itemName, '源泉所得税');
  assert.strictEqual(result[0].balance, 50000);
});

// ============================================================
// BA-01: マイナス残高
// ============================================================

console.log('\n--- BA-01: マイナス残高 ---');

test('BA-01: マイナス残高を検出する', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 101, account_item_name: '前払費用',
        account_category_name: '流動資産', closing_balance: -120000,
      }),
    ]),
    deals: [
      makeDeal({
        id: 2001, issue_date: '2026-03-15',
        details: [
          { account_item_id: 101, amount: 200000, description: '3月分保険料', entry_side: 'debit' },
          { account_item_id: 200, amount: 200000, description: '', entry_side: 'credit' },
        ],
      }),
    ],
    trialPl: makeTrialPl([
      makeBsBalance({ account_item_id: 200, account_item_name: '普通預金' }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 1);
  assert.strictEqual(ba01[0].severity, '🔴');
  assert.ok(ba01[0].description.includes('前払費用'));
  assert.ok(ba01[0].description.includes('-120,000'));
  // details が含まれる
  assert.ok(Array.isArray(ba01[0].details));
  assert.strictEqual(ba01[0].details.length, 1);
  assert.strictEqual(ba01[0].details[0].dealId, 2001);
});

test('BA-01: 現預金のマイナスは除外される', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 10, account_item_name: '普通預金',
        account_category_name: '現金・預金', closing_balance: -350000,
      }),
      makeBsBalance({
        account_item_id: 11, account_item_name: '【税】ＰａｙＰａｙ銀行',
        account_category_name: '現金・預金', closing_balance: -100000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 0);
});

test('BA-01: 純資産マイナスは🟡に格下げ', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 300, account_item_name: '繰越利益剰余金',
        account_category_name: '株主資本', closing_balance: -500000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 1);
  assert.strictEqual(ba01[0].severity, '🟡');
});

test('BA-01: 取引先別内訳が description に含まれる', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 101, account_item_name: '未払金',
        account_category_name: '流動負債', closing_balance: -50000,
      }),
    ]),
    trialBsByPartner: {
      trial_bs: {
        balances: [
          {
            account_item_name: '未払金',
            partners: [
              { id: 1, name: 'テスト取引先', opening_balance: 0, closing_balance: -50000 },
            ],
          },
        ],
      },
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 1);
  assert.ok(ba01[0].description.includes('テスト取引先'));
});

test('BA-01: dealsがない場合はdetailsが空で注記が付く', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 101, account_item_name: '前払費用',
        account_category_name: '流動資産', closing_balance: -120000,
      }),
    ]),
    deals: [],
  });

  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 1);
  assert.ok(ba01[0].description.includes('当月取引からは原因を特定できません'));
  assert.strictEqual(ba01[0].details.length, 0);
  // フォールバックリンクが設定される
  assert.ok(ba01[0].freeeLink.includes('journals'));
});

// ============================================================
// BA-01: 評価勘定（contra account）の除外テスト
// ============================================================

console.log('\n--- BA-01: 評価勘定の除外 ---');

test('isContraAccount: 貸倒引当金を評価勘定と判定する', () => {
  assert.ok(isContraAccount('貸倒引当金'));
  assert.ok(isContraAccount('貸倒引当金(売)'));   // 括弧付きも一致
  assert.ok(!isContraAccount('売掛金'));
  assert.ok(!isContraAccount('前払費用'));
});

test('isContraAccount: 減価償却累計額を評価勘定と判定する（部分一致）', () => {
  assert.ok(isContraAccount('減価償却累計額'));
  assert.ok(isContraAccount('建物減価償却累計額'));      // 補助科目も一致
  assert.ok(isContraAccount('器具備品減価償却累計額')); // 補助科目も一致
  assert.ok(!isContraAccount('固定資産'));
});

test('BA-01: 貸倒引当金のマイナスは検出しない', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 801, account_item_name: '貸倒引当金(売)',
        account_category_name: '売上債権', closing_balance: -50000,
      }),
    ]),
  });
  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 0, '貸倒引当金は BA-01 で検出されてはいけない');
});

test('BA-01: 減価償却累計額のマイナスは検出しない（部分一致）', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 802, account_item_name: '建物減価償却累計額',
        account_category_name: '有形固定資産', closing_balance: -3000000,
      }),
      makeBsBalance({
        account_item_id: 803, account_item_name: '減価償却累計額',
        account_category_name: '有形固定資産', closing_balance: -472984,
      }),
    ]),
  });
  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 0, '減価償却累計額系は BA-01 で検出されてはいけない');
});

test('BA-01: 評価勘定でないマイナスは引き続き検出される', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      // 除外 → 検出しない
      makeBsBalance({
        account_item_id: 801, account_item_name: '貸倒引当金(売)',
        account_category_name: '売上債権', closing_balance: -50000,
      }),
      // 除外しない → 検出する
      makeBsBalance({
        account_item_id: 101, account_item_name: '前払費用',
        account_category_name: '流動資産', closing_balance: -120000,
      }),
    ]),
  });
  const findings = balanceAnomalyCheck(data);
  const ba01 = findings.filter(f => f.checkCode === 'BA-01');
  assert.strictEqual(ba01.length, 1);
  assert.ok(ba01[0].description.includes('前払費用'));
});

// ============================================================
// BA-02: 滞留残高
// ============================================================

console.log('\n--- BA-02: 滞留残高 ---');

test('BA-02: 2ヶ月同額残高を検出する', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 102, account_item_name: '売掛金',
        closing_balance: 500000, opening_balance: 500000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 102, account_item_name: '売掛金',
          closing_balance: 500000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 1);
  assert.strictEqual(ba02[0].severity, '🟡');
  assert.ok(ba02[0].description.includes('売掛金'));
  assert.ok(ba02[0].description.includes('500,000'));
});

test('BA-02: 資本金は除外される', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 400, account_item_name: '資本金',
        closing_balance: 1000000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 400, account_item_name: '資本金',
          closing_balance: 1000000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 0);
});

test('BA-02: prevMonth が null の場合はスキップ', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 102, account_item_name: '売掛金',
        closing_balance: 500000,
      }),
    ]),
    prevMonth: null,
  });

  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 0);
});

test('BA-02: 繰越利益剰余金は除外される（期中変動なしが正常）', () => {
  const mkPrevBs = (name, bal) => makeTrialBs([
    makeBsBalance({ account_item_id: 900, account_item_name: name, closing_balance: bal }),
  ]);
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 900, account_item_name: '繰越利益',
        closing_balance: 25000000,
      }),
    ]),
    prevMonth: { trialBs: mkPrevBs('繰越利益', 25000000) },
  });
  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 0, '繰越利益は BA-02 で検出されてはいけない');
});

test('BA-02: 貸倒引当金は除外される（評価勘定）', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 801, account_item_name: '貸倒引当金(売)',
        closing_balance: -50000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 801, account_item_name: '貸倒引当金(売)',
          closing_balance: -50000,
        }),
      ]),
    },
  });
  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 0, '貸倒引当金は BA-02 で検出されてはいけない');
});

test('BA-02: 小額残高（< 10,000）は除外', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 102, account_item_name: '売掛金',
        closing_balance: 5000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 102, account_item_name: '売掛金',
          closing_balance: 5000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba02 = findings.filter(f => f.checkCode === 'BA-02');
  assert.strictEqual(ba02.length, 0);
});

// ============================================================
// BA-03: 仮勘定の未解消
// ============================================================

console.log('\n--- BA-03: 仮勘定 ---');

test('BA-03: 仮払金に残高 → 検出', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 500, account_item_name: '仮払金',
        closing_balance: 150000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba03 = findings.filter(f => f.checkCode === 'BA-03');
  assert.strictEqual(ba03.length, 1);
  assert.ok(ba03[0].description.includes('仮払金'));
});

test('BA-03: 仮払消費税は除外', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 501, account_item_name: '仮払消費税',
        closing_balance: 800000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba03 = findings.filter(f => f.checkCode === 'BA-03');
  assert.strictEqual(ba03.length, 0);
});

test('BA-03: 品目別内訳がdetailsに含まれる', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 600, account_item_name: '預り金',
        closing_balance: 80000,
      }),
    ]),
    // 預り金はTEMPORARY_ACCOUNTSに入っていないが、
    // 仮受金でテスト
  });
  // 預り金ではなく仮受金でテスト
  const data2 = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 600, account_item_name: '仮受金',
        closing_balance: 80000,
      }),
    ]),
    trialBsByItem: {
      trial_bs: {
        balances: [
          {
            account_item_name: '仮受金',
            items: [
              { id: 1, name: '源泉所得税', opening_balance: 0, closing_balance: 50000 },
              { id: 2, name: '住民税', opening_balance: 0, closing_balance: 30000 },
            ],
          },
        ],
      },
    },
  });

  const findings2 = balanceAnomalyCheck(data2);
  const ba03 = findings2.filter(f => f.checkCode === 'BA-03');
  assert.strictEqual(ba03.length, 1);
  assert.ok(ba03[0].description.includes('源泉所得税'));
  // details に品目内訳が含まれる
  assert.ok(ba03[0].details.some(d => d.description.includes('源泉所得税')));
});

// ============================================================
// BA-04: 前月比50%超変動
// ============================================================

console.log('\n--- BA-04: 前月比変動 ---');

test('BA-04: 前月比60%変動 → 検出', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 102, account_item_name: '売掛金',
        account_category_name: '流動資産', closing_balance: 800000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 102, account_item_name: '売掛金',
          closing_balance: 500000,
        }),
      ]),
    },
    deals: [
      makeDeal({
        id: 3001, issue_date: '2026-03-20',
        details: [
          { account_item_id: 102, amount: 300000, description: '売上', entry_side: 'debit' },
          { account_item_id: 201, amount: 300000, description: '', entry_side: 'credit' },
        ],
      }),
    ],
    trialPl: makeTrialPl([
      makeBsBalance({ account_item_id: 201, account_item_name: '売上高' }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba04 = findings.filter(f => f.checkCode === 'BA-04');
  assert.strictEqual(ba04.length, 1);
  assert.ok(ba04[0].description.includes('60%'));
  assert.ok(ba04[0].details.length > 0);
});

test('BA-04: 前月残高が小さい科目（< 100,000）は除外', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 102, account_item_name: '売掛金',
        closing_balance: 150000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 102, account_item_name: '売掛金',
          closing_balance: 50000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba04 = findings.filter(f => f.checkCode === 'BA-04');
  assert.strictEqual(ba04.length, 0);
});

test('BA-04: 現預金は除外される', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 10, account_item_name: '普通預金',
        closing_balance: 3000000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 10, account_item_name: '普通預金',
          closing_balance: 1000000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  const ba04 = findings.filter(f => f.checkCode === 'BA-04');
  assert.strictEqual(ba04.length, 0);
});

// ============================================================
// BA-05: 本来ゼロであるべき科目
// ============================================================

console.log('\n--- BA-05: ゼロ逸脱 ---');

test('BA-05: 資金諸口に残高 → 検出', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 700, account_item_name: '資金諸口',
        closing_balance: 50000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  const ba05 = findings.filter(f => f.checkCode === 'BA-05');
  assert.strictEqual(ba05.length, 1);
  assert.strictEqual(ba05[0].severity, '🔵');
  assert.ok(ba05[0].description.includes('資金諸口'));
});

test('BA-05: details に原因仕訳が含まれる', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 700, account_item_name: '現金過不足',
        closing_balance: 3000,
      }),
    ]),
    trialPl: makeTrialPl([
      makeBsBalance({ account_item_id: 200, account_item_name: '普通預金' }),
    ]),
    deals: [
      makeDeal({
        id: 4001, issue_date: '2026-03-25',
        details: [
          { account_item_id: 700, amount: 3000, description: '差額調整', entry_side: 'debit' },
          { account_item_id: 200, amount: 3000, description: '', entry_side: 'credit' },
        ],
      }),
    ],
  });

  const findings = balanceAnomalyCheck(data);
  const ba05 = findings.filter(f => f.checkCode === 'BA-05');
  assert.strictEqual(ba05.length, 1);
  assert.strictEqual(ba05[0].details.length, 1);
  assert.strictEqual(ba05[0].details[0].dealId, 4001);
  assert.strictEqual(ba05[0].details[0].counterAccount, '普通預金');
});

// ============================================================
// 統合テスト
// ============================================================

console.log('\n--- 統合テスト ---');

test('trialBs が null → 空配列を返す', () => {
  const findings = balanceAnomalyCheck(makeData({ trialBs: null }));
  assert.strictEqual(findings.length, 0);
});

test('正常データ → findings が空', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 101, account_item_name: '売掛金',
        closing_balance: 500000,
      }),
      makeBsBalance({
        account_item_id: 102, account_item_name: '買掛金',
        closing_balance: 300000,
      }),
    ]),
    prevMonth: {
      trialBs: makeTrialBs([
        makeBsBalance({
          account_item_id: 101, account_item_name: '売掛金',
          closing_balance: 450000,
        }),
        makeBsBalance({
          account_item_id: 102, account_item_name: '買掛金',
          closing_balance: 280000,
        }),
      ]),
    },
  });

  const findings = balanceAnomalyCheck(data);
  assert.strictEqual(findings.length, 0);
});

test('全Finding に category="balance_anomaly" が設定される', () => {
  const data = makeData({
    trialBs: makeTrialBs([
      makeBsBalance({
        account_item_id: 101, account_item_name: '前払費用',
        account_category_name: '流動資産', closing_balance: -120000,
      }),
      makeBsBalance({
        account_item_id: 700, account_item_name: '資金諸口',
        closing_balance: 50000,
      }),
    ]),
  });

  const findings = balanceAnomalyCheck(data);
  assert.ok(findings.length > 0);
  assert.ok(findings.every(f => f.category === 'balance_anomaly'));
});

// ============================================================
// 結果
// ============================================================

console.log(`\n--- balance-anomaly: ${passed} passed / ${failed} failed / ${passed + failed} total ---\n`);
if (failed > 0) process.exit(1);
