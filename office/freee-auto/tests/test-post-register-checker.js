'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// テストユーティリティ
// ============================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

// ============================================================
// モックアイテム生成ヘルパー
// ============================================================

/**
 * classifiedItems の標準形式でモックアイテムを生成する
 * @param {object} overrides - 上書きしたいフィールド
 */
function createMockItem(overrides = {}) {
  const defaults = {
    _freee: {
      id: `txn-${Math.random().toString(36).slice(2)}`,
      amount: 5000,
      entry_side: 'expense',
      description: 'テスト取引',
      date: '2026-01-15',
    },
    routing: {
      decision: 'register',
    },
    classification: {
      accountName: '消耗品費',
      entrySide: 'expense',
      taxLabel: '課対仕入',
      partnerName: 'テスト株式会社',
      itemTag: '',
      confidenceScore: {
        taxClarity: 50,
      },
    },
  };

  // ネストされた上書きをマージ
  const item = JSON.parse(JSON.stringify(defaults));
  if (overrides._freee) Object.assign(item._freee, overrides._freee);
  if (overrides.routing) Object.assign(item.routing, overrides.routing);
  if (overrides.classification) Object.assign(item.classification, overrides.classification);

  // トップレベルフィールドの上書き（フラット形式テスト用）
  const topLevelKeys = Object.keys(overrides).filter(k => !['_freee', 'routing', 'classification'].includes(k));
  for (const k of topLevelKeys) {
    item[k] = overrides[k];
  }

  return item;
}

/**
 * テスト用の一時ディレクトリにpast-deals.jsonを作成する
 * @param {string} companyId
 * @param {object} data
 * @returns {string} tmpDir - クリーンアップ用のベースディレクトリ
 */
function createTempPastDeals(companyId, data) {
  const tmpBase = path.join(os.tmpdir(), 'freee-auto-test', companyId, 'data', companyId);
  fs.mkdirSync(tmpBase, { recursive: true });
  fs.writeFileSync(path.join(tmpBase, 'past-deals.json'), JSON.stringify(data), 'utf-8');
  return tmpBase;
}

/**
 * テスト用の一時ディレクトリにpartners-master.jsonを作成する
 */
function createTempPartnersMaster(companyId, data) {
  const tmpBase = path.join(os.tmpdir(), 'freee-auto-test', companyId, 'data', companyId);
  fs.mkdirSync(tmpBase, { recursive: true });
  fs.writeFileSync(path.join(tmpBase, 'partners-master.json'), JSON.stringify(data), 'utf-8');
  return tmpBase;
}

/**
 * 一時ディレクトリをクリーンアップする
 */
function cleanupTempDir(companyId) {
  const tmpBase = path.join(os.tmpdir(), 'freee-auto-test', companyId);
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

// ============================================================
// checkerのパスを動的解決（テスト用tmpディレクトリに対応するため
// amount-checker / new-partner-checker はdata/companyIdを参照するが
// __dirnameは src/verify/checkers/ を向いているため、
// テスト時は実際のdataパスにシンボリックリンクを張る代わりに
// checkerを直接呼び出す前にdata/companyIdを準備する）
// ============================================================

const normalizeHelpers = require('../src/verify/checkers/normalize-helpers');
const { accountChecker }    = require('../src/verify/checkers/account-checker');
const { taxChecker }        = require('../src/verify/checkers/tax-checker');
const { tagChecker }        = require('../src/verify/checkers/tag-checker');
const { amountChecker }     = require('../src/verify/checkers/amount-checker');
const { newPartnerChecker } = require('../src/verify/checkers/new-partner-checker');
const { postRegisterCheck } = require('../src/verify/post-register-checker');

// amount-checker / new-partner-checker は __dirname 基準で
// path.join(__dirname, '..', '..', '..', 'data', companyId, 'past-deals.json') を参照する
// __dirname = src/verify/checkers → ../../.. = プロジェクトルート
const PROJECT_ROOT = path.join(__dirname, '..');

// ============================================================
// 1. normalize-helpers テスト (10件)
// ============================================================

console.log('\n--- normalize-helpers ---');

const {
  normalizeRoute,
  normalizeAccount,
  normalizeEntrySide,
  normalizeTaxLabel,
  normalizeDescription,
  normalizePartnerName,
  normalizeAmount,
  normalizeWalletTxnId,
  normalizeConfidenceScore,
  normalizeItemTag,
} = normalizeHelpers;

test('フラット構造: normalizeRoute が routeDestination を返す', () => {
  assert.strictEqual(normalizeRoute({ routeDestination: 'register' }), 'register');
});

test('フラット構造: normalizeAccount が accountName を返す', () => {
  assert.strictEqual(normalizeAccount({ accountName: '売上高' }), '売上高');
});

test('ネスト構造: normalizeRoute が routing.decision を返す', () => {
  assert.strictEqual(normalizeRoute({ routing: { decision: 'suggest' } }), 'suggest');
});

test('ネスト構造: normalizeAccount が classification.accountName を返す', () => {
  assert.strictEqual(normalizeAccount({ classification: { accountName: '消耗品費' } }), '消耗品費');
});

test('ネスト構造: normalizeEntrySide が _freee.entry_side を返す', () => {
  assert.strictEqual(normalizeEntrySide({ _freee: { entry_side: 'income' } }), 'income');
});

test('ネスト構造: normalizeDescription が _freee.description を返す', () => {
  assert.strictEqual(normalizeDescription({ _freee: { description: 'テスト' } }), 'テスト');
});

test('ネスト構造: normalizeAmount が _freee.amount を返す', () => {
  assert.strictEqual(normalizeAmount({ _freee: { amount: 12345 } }), 12345);
});

test('ネスト構造: normalizeWalletTxnId が _freee.id を返す', () => {
  assert.strictEqual(normalizeWalletTxnId({ _freee: { id: 'abc123' } }), 'abc123');
});

test('未定義フォールバック: normalizeRoute は "unknown" を返す', () => {
  assert.strictEqual(normalizeRoute({}), 'unknown');
});

test('未定義フォールバック: normalizeAmount は 0 を返す', () => {
  assert.strictEqual(normalizeAmount({}), 0);
});

// ============================================================
// 2. account-checker テスト (9件)
// ============================================================

console.log('\n--- account-checker ---');

test('A-01: 雑費が40%（2/5件）→ 🔴 finding', () => {
  const items = [
    createMockItem({ classification: { accountName: '雑費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '雑費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'B社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'C社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '通信費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'D社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'income', partnerName: 'E社', confidenceScore: {} } }),
  ];
  const findings = accountChecker(items, 'test');
  const a01 = findings.filter(f => f.checkCode === 'A-01');
  assert.strictEqual(a01.length, 1);
  assert.strictEqual(a01[0].severity, '🔴');
});

test('A-01: 雑費が0%（0/5件）→ A-01 finding なし', () => {
  const items = [
    createMockItem({ classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '通信費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'B社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '交通費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'C社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '接待交際費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'D社', confidenceScore: {} } }),
    createMockItem({ classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'income', partnerName: 'E社', confidenceScore: {} } }),
  ];
  const findings = accountChecker(items, 'test');
  assert.strictEqual(findings.filter(f => f.checkCode === 'A-01').length, 0);
});

test('A-02: 雑費 + 15,000円 → 🟡 finding', () => {
  const item = createMockItem({
    _freee: { amount: 15000, entry_side: 'expense', description: '雑費購入', date: '2026-01-01' },
    classification: { accountName: '雑費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = accountChecker([item], 'test');
  const a02 = findings.filter(f => f.checkCode === 'A-02');
  assert.strictEqual(a02.length, 1);
  assert.strictEqual(a02[0].severity, '🟡');
});

test('A-03: income + 支払利息 → 🔴; expense + 受取利息 → 🔴', () => {
  const item1 = createMockItem({
    _freee: { amount: 1000, entry_side: 'income', description: '利息入金', date: '2026-01-01' },
    classification: { accountName: '支払利息', taxLabel: '非課税', entrySide: 'income', partnerName: '', confidenceScore: {} },
  });
  const item2 = createMockItem({
    _freee: { amount: 1000, entry_side: 'expense', description: '利息出金', date: '2026-01-01' },
    classification: { accountName: '受取利息', taxLabel: '非課税', entrySide: 'expense', partnerName: '', confidenceScore: {} },
  });
  const f1 = accountChecker([item1], 'test').filter(f => f.checkCode === 'A-03');
  const f2 = accountChecker([item2], 'test').filter(f => f.checkCode === 'A-03');
  assert.strictEqual(f1.length, 1);
  assert.strictEqual(f1[0].severity, '🔴');
  assert.strictEqual(f2.length, 1);
  assert.strictEqual(f2[0].severity, '🔴');
});

test('A-04: expense + 売上高 → 🟡', () => {
  const item = createMockItem({
    _freee: { amount: 10000, entry_side: 'expense', description: '売上返金', date: '2026-01-01' },
    classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = accountChecker([item], 'test').filter(f => f.checkCode === 'A-04');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('A-05: income + 仕入高（返品なし）→ 🟡; income + 仕入高 + 返品 → finding なし', () => {
  const item1 = createMockItem({
    _freee: { amount: 5000, entry_side: 'income', description: '仕入振込', date: '2026-01-01' },
    classification: { accountName: '仕入高', taxLabel: '課対仕入', entrySide: 'income', partnerName: 'A社', confidenceScore: {} },
  });
  const item2 = createMockItem({
    _freee: { amount: 5000, entry_side: 'income', description: '仕入返品処理', date: '2026-01-01' },
    classification: { accountName: '仕入高', taxLabel: '課対仕入', entrySide: 'income', partnerName: 'A社', confidenceScore: {} },
  });
  const f1 = accountChecker([item1], 'test').filter(f => f.checkCode === 'A-05');
  const f2 = accountChecker([item2], 'test').filter(f => f.checkCode === 'A-05');
  assert.strictEqual(f1.length, 1);
  assert.strictEqual(f1[0].severity, '🟡');
  assert.strictEqual(f2.length, 0);
});

test('A-06: 消耗品費 + 150,000円 → 🔵', () => {
  const item = createMockItem({
    _freee: { amount: 150000, entry_side: 'expense', description: 'PC購入', date: '2026-01-01' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = accountChecker([item], 'test').filter(f => f.checkCode === 'A-06');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔵');
});

test('A-07: 修繕費 + 250,000円 → 🔵', () => {
  const item = createMockItem({
    _freee: { amount: 250000, entry_side: 'expense', description: '外壁修繕', date: '2026-01-01' },
    classification: { accountName: '修繕費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = accountChecker([item], 'test').filter(f => f.checkCode === 'A-07');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔵');
});

// ============================================================
// 3. tax-checker テスト (8件)
// ============================================================

console.log('\n--- tax-checker ---');

test('T-01: facebook広告 + 課対仕入 → 🔴', () => {
  const item = createMockItem({
    _freee: { amount: 30000, entry_side: 'expense', description: 'facebook広告費', date: '2026-01-01' },
    classification: { accountName: '広告宣伝費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'Meta', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-01');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔴');
});

test('T-01: facebook広告 + taxLabel=対象外 → T-01 finding なし', () => {
  const item = createMockItem({
    _freee: { amount: 30000, entry_side: 'expense', description: 'facebook広告費', date: '2026-01-01' },
    classification: { accountName: '広告宣伝費', taxLabel: '対象外', entrySide: 'expense', partnerName: 'Meta', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-01');
  assert.strictEqual(findings.length, 0);
});

test('T-02: taxLabel=軽減 + description=ソフトウェア購入 → 🔴', () => {
  const item = createMockItem({
    _freee: { amount: 5000, entry_side: 'expense', description: 'ソフトウェア購入', date: '2026-01-01' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入（軽減）', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-02');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔴');
});

test('T-02: taxLabel=課対仕入 + description=コンビニ購入食品 → 🔴（軽減漏れ）', () => {
  const item = createMockItem({
    _freee: { amount: 1500, entry_side: 'expense', description: 'コンビニ購入食品', date: '2026-01-01' },
    classification: { accountName: '会議費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'セブン', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-02');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔴');
});

test('T-02: taxLabel=軽減 + description=スーパー食料品 → T-02 finding なし', () => {
  const item = createMockItem({
    _freee: { amount: 2000, entry_side: 'expense', description: 'スーパー食料品購入', date: '2026-01-01' },
    classification: { accountName: '福利厚生費', taxLabel: '課対仕入（軽減）', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-02');
  assert.strictEqual(findings.length, 0);
});

test('T-03: account=支払保険料 + taxLabel=課対仕入 → 🟡', () => {
  const item = createMockItem({
    _freee: { amount: 20000, entry_side: 'expense', description: '保険料', date: '2026-01-01' },
    classification: { accountName: '支払保険料', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '保険会社', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-03');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('T-04: account=給料手当 + taxLabel=課対仕入 → 🟡', () => {
  const item = createMockItem({
    _freee: { amount: 300000, entry_side: 'expense', description: '給与支払', date: '2026-01-01' },
    classification: { accountName: '給料手当', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '', confidenceScore: {} },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-04');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('T-05: taxClarity=5 → 🔵', () => {
  const item = createMockItem({
    _freee: { amount: 5000, entry_side: 'expense', description: '不明な取引', date: '2026-01-01' },
    classification: { accountName: '雑費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '', confidenceBreakdown: { taxClarity: 5 } },
  });
  const findings = taxChecker([item], 'test').filter(f => f.checkCode === 'T-05');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔵');
});

// ============================================================
// 4. tag-checker テスト (6件)
// ============================================================

console.log('\n--- tag-checker ---');

test('G-01: account=売上高、取引先なし → 🔴', () => {
  const item = createMockItem({
    _freee: { amount: 100000, entry_side: 'income', description: '売上', date: '2026-01-01' },
    classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'income', partnerName: '', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-01');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔴');
});

test('G-01: account=売上高、取引先あり → finding なし', () => {
  const item = createMockItem({
    _freee: { amount: 100000, entry_side: 'income', description: '売上', date: '2026-01-01' },
    classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'income', partnerName: 'テスト株式会社', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-01');
  assert.strictEqual(findings.length, 0);
});

test('G-02: account=外注費、取引先なし → 🔴', () => {
  const item = createMockItem({
    _freee: { amount: 50000, entry_side: 'expense', description: '外注費', date: '2026-01-01' },
    classification: { accountName: '外注費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-02');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔴');
});

test('G-03: account=預り金、品目なし → 🟡', () => {
  const item = createMockItem({
    _freee: { amount: 10000, entry_side: 'expense', description: '源泉徴収', date: '2026-01-01' },
    classification: { accountName: '預り金', taxLabel: '不課税', entrySide: 'expense', partnerName: 'A社', itemTag: '', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-03');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('G-04: account=借入金、品目なし → 🟡', () => {
  const item = createMockItem({
    _freee: { amount: 1000000, entry_side: 'income', description: '銀行借入', date: '2026-01-01' },
    classification: { accountName: '借入金', taxLabel: '不課税', entrySide: 'income', partnerName: '〇〇銀行', itemTag: '', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-04');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('G-05: account=地代家賃、取引先なし → 🔵', () => {
  const item = createMockItem({
    _freee: { amount: 100000, entry_side: 'expense', description: '家賃支払', date: '2026-01-01' },
    classification: { accountName: '地代家賃', taxLabel: '非課税仕入', entrySide: 'expense', partnerName: '', confidenceScore: {} },
  });
  const findings = tagChecker([item], 'test').filter(f => f.checkCode === 'G-05');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔵');
});

// ============================================================
// 5. amount-checker テスト (5件)
// ============================================================

console.log('\n--- amount-checker ---');

test('M-01: past-deals あり、amount=35000（3.5倍）→ 🟡', () => {
  const companyId = `test-${Date.now()}-m01a`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const pastDeals = {
      patterns: {
        'テスト株式会社': {
          accountName: '消耗品費',
          partnerName: 'テスト株式会社',
          avgAmount: 10000,
          count: 5,
          lastDate: '2026-01-01',
        },
      },
    };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    const item = createMockItem({
      _freee: { id: 'txn-001', amount: 35000, entry_side: 'expense', description: '消耗品購入', date: '2026-01-15' },
      classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'テスト株式会社', confidenceScore: {} },
    });
    const findings = amountChecker([item], companyId).filter(f => f.checkCode === 'M-01');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, '🟡');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

test('M-01: past-deals.json なし → finding なし（スキップ）', () => {
  const companyId = `test-${Date.now()}-m01b`;
  const item = createMockItem({
    _freee: { amount: 35000, entry_side: 'expense', description: '消耗品購入', date: '2026-01-15' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'テスト株式会社', confidenceScore: {} },
  });
  const findings = amountChecker([item], companyId).filter(f => f.checkCode === 'M-01');
  assert.strictEqual(findings.length, 0);
});

test('M-02: amount=200000（端数なし大額）→ 🔵', () => {
  const item = createMockItem({
    _freee: { amount: 200000, entry_side: 'expense', description: '振込', date: '2026-01-15' },
    classification: { accountName: '普通預金', taxLabel: '不課税', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const findings = amountChecker([item], 'test-m02').filter(f => f.checkCode === 'M-02');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🔵');
});

test('M-03: 同日・同額・同取引先が2件 → 🟡', () => {
  const makeItem = () => createMockItem({
    _freee: { amount: 5000, entry_side: 'expense', description: '消耗品費', date: '2026-01-10' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '重複株式会社', confidenceScore: {} },
  });
  const item1 = makeItem();
  const item2 = makeItem();
  const findings = amountChecker([item1, item2], 'test-m03a').filter(f => f.checkCode === 'M-03');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, '🟡');
});

test('M-03: 同日・同額・異なる取引先 → finding なし', () => {
  const item1 = createMockItem({
    _freee: { amount: 5000, entry_side: 'expense', description: '消耗品費', date: '2026-01-10' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'A社', confidenceScore: {} },
  });
  const item2 = createMockItem({
    _freee: { amount: 5000, entry_side: 'expense', description: '消耗品費', date: '2026-01-10' },
    classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'B社', confidenceScore: {} },
  });
  const findings = amountChecker([item1, item2], 'test-m03b').filter(f => f.checkCode === 'M-03');
  assert.strictEqual(findings.length, 0);
});

// ============================================================
// 6. new-partner-checker テスト (4件) + overseas-services除外テスト (3件) = 7件
// ============================================================

console.log('\n--- new-partner-checker ---');

test('N-01: 取引先が past-deals にない → 🟡', () => {
  const companyId = `test-${Date.now()}-n01a`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const pastDeals = {
      patterns: {
        '既存株式会社': {
          accountName: '消耗品費',
          partnerName: '既存株式会社',
          count: 3,
          lastDate: '2026-01-01',
        },
      },
    };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    const item = createMockItem({
      _freee: { id: 'txn-001', amount: 10000, entry_side: 'expense', description: '新規取引', date: '2026-01-15' },
      classification: { accountName: '外注費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '新規株式会社', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, '🟡');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

test('N-01: 取引先が past-deals にある → finding なし', () => {
  const companyId = `test-${Date.now()}-n01b`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const pastDeals = {
      patterns: {
        '既存株式会社': {
          accountName: '消耗品費',
          partnerName: '既存株式会社',
          count: 3,
          lastDate: '2026-01-01',
        },
      },
    };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    const item = createMockItem({
      _freee: { id: 'txn-001', amount: 10000, entry_side: 'expense', description: '既存取引', date: '2026-01-15' },
      classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '既存株式会社', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
    assert.strictEqual(findings.length, 0);
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

test('N-01: past-deals.json なし → finding なし（スキップ）', () => {
  const companyId = `test-${Date.now()}-n01c`;
  const item = createMockItem({
    _freee: { amount: 10000, entry_side: 'expense', description: '新規取引', date: '2026-01-15' },
    classification: { accountName: '外注費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: '新規株式会社', confidenceScore: {} },
  });
  const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
  assert.strictEqual(findings.length, 0);
});

test('N-02: partners-master に取引先あり・インボイス番号なし → 🔵', () => {
  const companyId = `test-${Date.now()}-n02`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // N-02はpast-dealsなしでもpartnersMasterがあれば動作する
    const partnersMaster = [
      { name: 'インボイス未登録社', invoice_registration_number: null },
    ];
    fs.writeFileSync(path.join(dataDir, 'partners-master.json'), JSON.stringify(partnersMaster), 'utf-8');

    const item = createMockItem({
      _freee: { id: 'txn-001', amount: 10000, entry_side: 'expense', description: '取引', date: '2026-01-15' },
      classification: { accountName: '外注費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'インボイス未登録社', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-02');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, '🔵');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

// ============================================================
// 6b. new-partner-checker — overseas-services 除外テスト (3件)
// ============================================================

console.log('\n--- new-partner-checker (overseas-services除外) ---');

test('N-01: overseas-services登録済み取引先（Slack）→ 除外されfindingなし', () => {
  const companyId = `test-${Date.now()}-n01-os1`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // past-deals には該当なし（known扱いにしない）
    const pastDeals = { patterns: { '既存株式会社': { partnerName: '既存株式会社', accountName: '通信費', count: 1, lastDate: '2026-01-01' } } };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    // partnerName に 'slack' → overseas-services の partnerKeywords にマッチ
    const item = createMockItem({
      _freee: { id: 'txn-slack-01', amount: 2000, entry_side: 'expense', description: 'Slack 月額', date: '2026-01-15' },
      classification: { accountName: '通信費', taxLabel: '課対仕入10%', entrySide: 'expense', partnerName: 'Slack Technologies', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
    assert.strictEqual(findings.length, 0, 'overseas-services登録済みのSlackはN-01除外されるべき');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

test('N-01: overseas-services登録済みサービスが摘要にある（description:adobe）→ 除外されfindingなし', () => {
  const companyId = `test-${Date.now()}-n01-os2`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const pastDeals = { patterns: { '既存株式会社': { partnerName: '既存株式会社', accountName: '通信費', count: 1, lastDate: '2026-01-01' } } };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    // partnerName はマッチしないが description に 'adobe' を含む
    const item = createMockItem({
      _freee: { id: 'txn-adobe-01', amount: 6600, entry_side: 'expense', description: 'Adobe Creative Cloud 月額', date: '2026-01-15' },
      classification: { accountName: '通信費', taxLabel: '課対仕入10%', entrySide: 'expense', partnerName: '不明なクリエイティブ社', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
    assert.strictEqual(findings.length, 0, 'descriptionにadobeが含まれる場合もN-01除外されるべき');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

test('N-01: overseas-services非該当・past-dealsにもない → findingあり（従来動作）', () => {
  const companyId = `test-${Date.now()}-n01-os3`;
  const dataDir = path.join(PROJECT_ROOT, 'data', companyId);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const pastDeals = { patterns: { '既存株式会社': { partnerName: '既存株式会社', accountName: '外注費', count: 2, lastDate: '2026-01-01' } } };
    fs.writeFileSync(path.join(dataDir, 'past-deals.json'), JSON.stringify(pastDeals), 'utf-8');

    // overseas-services にも past-deals にも存在しない取引先
    const item = createMockItem({
      _freee: { id: 'txn-new-01', amount: 50000, entry_side: 'expense', description: '業務委託費', date: '2026-01-15' },
      classification: { accountName: '外注費', taxLabel: '課対仕入10%', entrySide: 'expense', partnerName: '完全新規フリーランス', confidenceScore: {} },
    });
    const findings = newPartnerChecker([item], companyId).filter(f => f.checkCode === 'N-01');
    assert.strictEqual(findings.length, 1, '非overseas・非known取引先はN-01が発生すべき');
    assert.strictEqual(findings[0].severity, '🟡');
  } finally {
    fs.rmSync(path.join(PROJECT_ROOT, 'data', companyId), { recursive: true, force: true });
  }
});

// ============================================================
// 7. integration テスト (5件)
// ============================================================

console.log('\n--- integration (post-register-checker) ---');

test('空配列 → findings=[], summary.totalItems=0', async () => {
  const { findings, summary } = await postRegisterCheck([], 'test-int-empty');
  assert.strictEqual(findings.length, 0);
  assert.strictEqual(summary.totalItems, 0);
});

test('対象外ルーティングのみ → totalItems=0', async () => {
  const items = [
    createMockItem({ routing: { decision: 'skip' } }),
    createMockItem({ routing: { decision: 'manual' } }),
    createMockItem({ routing: { decision: 'exclude' } }),
  ];
  const { summary } = await postRegisterCheck(items, 'test-int-excluded');
  assert.strictEqual(summary.totalItems, 0);
});

test('正常な register 取引（消耗品費・課対仕入・取引先あり）→ A/G/T 系の主要 finding なし', async () => {
  const item = createMockItem({
    _freee: { id: 'txn-ok', amount: 5000, entry_side: 'expense', description: '事務用品購入', date: '2026-01-15' },
    routing: { decision: 'register' },
    classification: {
      accountName: '消耗品費',
      taxLabel: '課対仕入',
      entrySide: 'expense',
      partnerName: 'オフィス用品株式会社',
      itemTag: '',
      confidenceScore: { taxClarity: 50 },
    },
  });
  const { findings } = await postRegisterCheck([item], 'test-int-normal');
  // G-01/G-02/A-03/A-04/A-05 などの重大エラーがないことを確認
  const criticalCodes = ['G-01', 'G-02', 'A-03', 'A-04', 'A-05', 'T-01', 'T-03', 'T-04'];
  const criticalFindings = findings.filter(f => criticalCodes.includes(f.checkCode));
  assert.strictEqual(criticalFindings.length, 0);
});

test('複数チェッカーが finding を生成 → summary が severity 別に正しくカウント', async () => {
  const items = [
    // A-03: income + 支払利息 → 🔴
    createMockItem({
      _freee: { amount: 1000, entry_side: 'income', description: '利息', date: '2026-01-01' },
      routing: { decision: 'register' },
      classification: { accountName: '支払利息', taxLabel: '非課税', entrySide: 'income', partnerName: 'A銀行', itemTag: '', confidenceScore: { taxClarity: 50 } },
    }),
    // A-02: 雑費 + 15000 → 🟡
    createMockItem({
      _freee: { amount: 15000, entry_side: 'expense', description: '雑費', date: '2026-01-02' },
      routing: { decision: 'register' },
      classification: { accountName: '雑費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'B社', itemTag: '', confidenceScore: { taxClarity: 50 } },
    }),
    // A-06: 消耗品費 150000 → 🔵
    createMockItem({
      _freee: { amount: 150000, entry_side: 'expense', description: 'PC購入', date: '2026-01-03' },
      routing: { decision: 'register' },
      classification: { accountName: '消耗品費', taxLabel: '課対仕入', entrySide: 'expense', partnerName: 'C社', itemTag: '', confidenceScore: { taxClarity: 50 } },
    }),
  ];
  const { summary } = await postRegisterCheck(items, 'test-int-multi');
  assert.ok(summary.critical >= 1, `critical expected >= 1, got ${summary.critical}`);
  assert.ok(summary.warning >= 1, `warning expected >= 1, got ${summary.warning}`);
  assert.ok(summary.info >= 1, `info expected >= 1, got ${summary.info}`);
});

test('byCategory カウントが正しい', async () => {
  const items = [
    // account finding: A-03
    createMockItem({
      _freee: { amount: 1000, entry_side: 'income', description: '利息', date: '2026-01-01' },
      routing: { decision: 'register' },
      classification: { accountName: '支払利息', taxLabel: '非課税', entrySide: 'income', partnerName: 'A銀行', itemTag: '', confidenceScore: { taxClarity: 50 } },
    }),
    // tag finding: G-01
    createMockItem({
      _freee: { amount: 100000, entry_side: 'income', description: '売上', date: '2026-01-01' },
      routing: { decision: 'register' },
      classification: { accountName: '売上高', taxLabel: '課対売上', entrySide: 'income', partnerName: '', itemTag: '', confidenceScore: { taxClarity: 50 } },
    }),
  ];
  const { summary } = await postRegisterCheck(items, 'test-int-category');
  assert.ok(summary.byCategory.account >= 1, `account expected >= 1, got ${summary.byCategory.account}`);
  assert.ok(summary.byCategory.tag >= 1, `tag expected >= 1, got ${summary.byCategory.tag}`);
  assert.strictEqual(summary.totalFindings, summary.critical + summary.warning + summary.info);
});

// ============================================================
// 結果出力
// ============================================================

const total = passed + failed;
console.log(`\n合計: ${passed}件通過 / ${total}件`);
process.exit(failed > 0 ? 1 : 0);
