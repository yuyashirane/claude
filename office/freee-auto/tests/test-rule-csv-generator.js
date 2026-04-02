/**
 * ルールCSV生成テスト
 *
 * tax-label-mapper.js と rule-csv-generator.js の全機能を検証する。
 *
 * 使い方: node tests/test-rule-csv-generator.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const {
  toFreeeTaxLabel,
  toFreeeInvoiceLabel,
  toFreeeEntrySide,
} = require("../src/register/tax-label-mapper");

const {
  generateRuleCsv,
  toRuleCsvRow,
  routeForCsv,
  selectDescription,
  normalizeForPartialMatch,
  escapeCsvField,
  CSV_HEADER,
} = require("../src/register/rule-csv-generator");

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

// テスト用一時ディレクトリ
const TMP_DIR = path.join(__dirname, "..", "tmp", "test-rule-csv");

function setupTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanupTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true });
  }
}

// ==================================================
// テスト1: 税区分マッピング
// ==================================================
console.log("\n━━━ テスト1: 税区分マッピング ━━━");

test("T01: 課対仕入10% → 課対仕入", () => {
  assert.strictEqual(toFreeeTaxLabel("課対仕入10%"), "課対仕入");
});

test("T02: 課対仕入8%（軽） → 課対仕入8%（軽）", () => {
  assert.strictEqual(toFreeeTaxLabel("課対仕入8%（軽）"), "課対仕入8%（軽）");
});

test("T03: 非課仕入 → 非課仕入", () => {
  assert.strictEqual(toFreeeTaxLabel("非課仕入"), "非課仕入");
});

test("T04: 対象外 → 対象外", () => {
  assert.strictEqual(toFreeeTaxLabel("対象外"), "対象外");
});

test("T05: 不課税 → 不課税", () => {
  assert.strictEqual(toFreeeTaxLabel("不課税"), "不課税");
});

test("T06: null → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel(null), "");
});

test("T07: undefined → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel(undefined), "");
});

test("T08: 不明な値 → 空文字", () => {
  assert.strictEqual(toFreeeTaxLabel("不明な値"), "");
});

// ==================================================
// テスト2: インボイスラベル変換
// ==================================================
console.log("\n━━━ テスト2: インボイスラベル変換 ━━━");

test("I01: 適格 → 取引先情報に準拠", () => {
  assert.strictEqual(toFreeeInvoiceLabel("適格"), "取引先情報に準拠");
});

test("I02: 非適格80% → 該当しない", () => {
  assert.strictEqual(toFreeeInvoiceLabel("非適格80%"), "該当しない");
});

test("I03: 不要 → 該当しない", () => {
  assert.strictEqual(toFreeeInvoiceLabel("不要"), "該当しない");
});

test("I04: 要確認 → 空文字", () => {
  assert.strictEqual(toFreeeInvoiceLabel("要確認"), "");
});

test("I05: null → 空文字", () => {
  assert.strictEqual(toFreeeInvoiceLabel(null), "");
});

// ==================================================
// テスト3: 収支区分変換
// ==================================================
console.log("\n━━━ テスト3: 収支区分変換 ━━━");

test("E01: income → 収入", () => {
  assert.strictEqual(toFreeeEntrySide("income"), "収入");
});

test("E02: expense → 支出", () => {
  assert.strictEqual(toFreeeEntrySide("expense"), "支出");
});

test("E03: undefined → 支出（デフォルト）", () => {
  assert.strictEqual(toFreeeEntrySide(undefined), "支出");
});

// ==================================================
// テスト4: CSV行変換（toRuleCsvRow）
// ==================================================
console.log("\n━━━ テスト4: CSV行変換 ━━━");

const AUTO_ITEM = {
  id: 1, description: "アマゾン ジャパン　文具", entrySide: "expense",
  accountName: "消耗品費", taxClassification: "課対仕入10%",
  invoiceType: "適格", confidenceScore: 85, routeDestination: "auto_register",
  walletableName: "三菱UFJ", partnerName: "Amazon.co.jp",
};

const STAFF_ITEM = {
  id: 2, description: "NTTドコモ 通信料", entrySide: "expense",
  accountName: "通信費", taxClassification: "課対仕入10%",
  invoiceType: "適格", confidenceScore: 55, routeDestination: "kintone_staff",
  walletableName: "三菱UFJ", partnerName: "NTTドコモ",
};

const SENIOR_ITEM = {
  id: 3, description: "不明な取引", entrySide: "expense",
  accountName: "", taxClassification: null,
  invoiceType: null, confidenceScore: 15, routeDestination: "kintone_senior",
};

const EXCLUDED_ITEM = {
  id: 4, description: "口座間振替", entrySide: "expense",
  accountName: "", taxClassification: null,
  invoiceType: null, confidenceScore: 0, routeDestination: "excluded",
};

test("R01: auto_register → 53要素の配列", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row.length, 53);
});

test("R02: auto_register → row[0]=支出", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[0], "支出");
});

test("R03: auto_register + partnerName → row[3]=取引先名（部分一致用）", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  // 部分一致時はpartnerNameを優先（変動しない安定キーワード）
  assert.strictEqual(row[3], "Amazon.co.jp");
});

test("R04: auto_register → row[4]=部分一致", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[4], "部分一致");
});

test("R05: auto_register → row[8]=取引を登録する", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[8], "取引を登録する");
});

test("R06: auto_register → row[14]=勘定科目名", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[14], "消耗品費");
});

test("R07: auto_register → row[15]=税区分(課対仕入)", () => {
  const row = toRuleCsvRow(AUTO_ITEM);
  assert.strictEqual(row[15], "課対仕入");
});

test("R08: kintone_staff → row[4]=完全一致", () => {
  const row = toRuleCsvRow(STAFF_ITEM);
  assert.strictEqual(row[4], "完全一致");
});

test("R09: kintone_staff → row[8]=取引を推測する", () => {
  const row = toRuleCsvRow(STAFF_ITEM);
  assert.strictEqual(row[8], "取引を推測する");
});

test("R10: kintone_senior → null", () => {
  assert.strictEqual(toRuleCsvRow(SENIOR_ITEM), null);
});

test("R11: excluded → null", () => {
  assert.strictEqual(toRuleCsvRow(EXCLUDED_ITEM), null);
});

// ==================================================
// テスト5: CSVファイル生成（generateRuleCsv）
// ==================================================
console.log("\n━━━ テスト5: CSVファイル生成 ━━━");

setupTmpDir();

const MOCK_RESULT = {
  all: [
    AUTO_ITEM,
    STAFF_ITEM,
    SENIOR_ITEM,
    EXCLUDED_ITEM,
    // partnerNameを別に設定して重複排除テストで「異なるキー」として機能させる
    { ...AUTO_ITEM, id: 5, description: "タクシー代 新宿", accountName: "旅費交通費", partnerName: "タクシー会社" },
  ],
};

const genResult = generateRuleCsv(MOCK_RESULT, {
  companyId: "474381",
  outputDir: TMP_DIR,
  encoding: "cp932",
});

test("G01: CSVファイルが生成される", () => {
  assert.ok(fs.existsSync(genResult.csvPath));
});

test("G02: Shift_JISエンコード（先頭バイトで判定）", () => {
  const buf = fs.readFileSync(genResult.csvPath);
  // Shift_JISの「収」= 0x8E 0xFB
  assert.strictEqual(buf[0], 0x8e);
  assert.strictEqual(buf[1], 0xfb);
});

test("G03: ヘッダー行が53カラム", () => {
  const buf = fs.readFileSync(genResult.csvPath);
  const text = iconv.decode(buf, "cp932");
  const headerLine = text.split("\r\n")[0];
  assert.strictEqual(headerLine.split(",").length, 53);
});

test("G04: stats合計の整合性", () => {
  const s = genResult.stats;
  assert.strictEqual(s.register + s.suggest + s.excluded + s.deduplicated, s.total);
});

test("G05: auto_register → register にカウント", () => {
  assert.strictEqual(genResult.stats.register, 2);
});

test("G06: kintone_staff → suggest にカウント", () => {
  assert.strictEqual(genResult.stats.suggest, 1);
});

test("G07: kintone_senior + excluded → excluded にカウント", () => {
  assert.strictEqual(genResult.stats.excluded, 2);
});

// ==================================================
// テスト6: routeForCsv() — 新ルーティング方針
// ==================================================
console.log("\n━━━ テスト6: routeForCsv() 新ルーティング ━━━");

// パイプライン形式のアイテムを生成するヘルパー
function makePipelineItem({ walletableType, amount, description = 'テスト取引', pastPattern = 0, classificationExcluded = false }) {
  return {
    _freee: { walletable_type: walletableType },
    transaction: { amount, description, debit_credit: 'expense', partner_name: '' },
    classification: {
      excluded: classificationExcluded,
      exclude_reason: classificationExcluded ? '口座間振替' : undefined,
      score_breakdown: { past_pattern: pastPattern },
    },
    routing: { decision: 'kintone_staff' },
  };
}

test("RFC01: クレカ + 5万円 → register（部分一致）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'credit_card', amount: 50000 }));
  assert.strictEqual(r.action, 'register');
  assert.strictEqual(r.matchCondition, '部分一致');
});

test("RFC02: クレカ + 9.9万円 → register（10万円未満はOK）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'credit_card', amount: 99000 }));
  assert.strictEqual(r.action, 'register');
});

test("RFC03: クレカ + 10万円 → exclude（固定資産判定）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'credit_card', amount: 100000 }));
  assert.strictEqual(r.action, 'exclude');
  assert.ok(r.reason.includes('固定資産'));
});

test("RFC04: 預金 + 5千円 → register", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 5000 }));
  assert.strictEqual(r.action, 'register');
  assert.strictEqual(r.matchCondition, '部分一致');
});

test("RFC05: 預金 + 5万円 + 過去パターン25pt → register", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 50000, pastPattern: 25 }));
  assert.strictEqual(r.action, 'register');
  assert.strictEqual(r.matchCondition, '部分一致');
});

test("RFC06: 預金 + 5万円 + 過去パターン0pt → suggest（完全一致）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 50000, pastPattern: 0 }));
  assert.strictEqual(r.action, 'suggest');
  assert.strictEqual(r.matchCondition, '完全一致');
});

test("RFC07: 預金 + 10万円 → exclude（固定資産判定）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 100000 }));
  assert.strictEqual(r.action, 'exclude');
  assert.ok(r.reason.includes('固定資産'));
});

test("RFC08: 借入キーワード → exclude（複合仕訳）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 30000, description: '借入返済 A銀行' }));
  assert.strictEqual(r.action, 'exclude');
  assert.ok(r.reason.includes('複合仕訳'));
});

test("RFC09: 給与キーワード → exclude（複合仕訳）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 300000, description: '給与 3月分 山田太郎' }));
  // 給与は複合仕訳キーワードに該当（10万超より先にチェック）
  assert.strictEqual(r.action, 'exclude');
  assert.ok(r.reason.includes('複合仕訳'));
});

test("RFC10: ウォレット（wallet） + 3万円 → register（クレカ扱い）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'wallet', amount: 30000 }));
  assert.strictEqual(r.action, 'register');
  assert.ok(r.reason.includes('クレカ/ウォレット'));
});

test("RFC11: cls.excluded=true → exclude（classificationステージの除外）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: 'bank_account', amount: 5000, classificationExcluded: true }));
  assert.strictEqual(r.action, 'exclude');
});

test("RFC12: walletable_type不明 → suggest（フォールバック）", () => {
  const r = routeForCsv(makePipelineItem({ walletableType: '', amount: 5000 }));
  assert.strictEqual(r.action, 'suggest');
  assert.strictEqual(r.matchCondition, '完全一致');
});

// ==================================================
// テスト7: selectDescription() — 取引内容選定
// ==================================================
console.log("\n━━━ テスト7: selectDescription() 取引内容選定 ━━━");

test("SD01: 完全一致 → description原文", () => {
  const n = { matchCondition: '完全一致', description: 'NTTドコモ 通信料 2026/03', partnerName: 'NTTドコモ' };
  assert.strictEqual(selectDescription(n), 'NTTドコモ 通信料 2026/03');
});

test("SD02: 部分一致 + partnerName → partnerName", () => {
  const n = { matchCondition: '部分一致', description: 'アマゾン ジャパン　文具', partnerName: 'Amazon.co.jp' };
  assert.strictEqual(selectDescription(n), 'Amazon.co.jp');
});

test("SD03: 部分一致 + partnerNameなし → 摘要から数字除去", () => {
  const n = { matchCondition: '部分一致', description: 'ETC 12345678 関東支社', partnerName: '' };
  const result = selectDescription(n);
  assert.ok(!result.includes('12345678'), `数字が残っている: ${result}`);
  assert.ok(result.includes('ETC'), `ETCが消えている: ${result}`);
});

test("SD04: normalizeForPartialMatch — 長い数字・日付を除去", () => {
  const result = normalizeForPartialMatch('アマゾン 20260301 注文12345 03/01');
  assert.ok(!result.includes('20260301'), `4桁以上の数字が残っている: ${result}`);
  assert.ok(!result.includes('03/01'), `日付が残っている: ${result}`);
});

// ==================================================
// ==================================================
console.log("\n━━━ テスト8: 重複排除 ━━━");

// 既存ルールCSVを作成（AUTO_ITEMと同じキーを持つ行）
// AUTO_ITEMはpartnerName="Amazon.co.jp"を持つため、部分一致時row[3]="Amazon.co.jp"になる
const existingCsvPath = path.join(TMP_DIR, "existing_rules.csv");
const existingRow = [
  "支出", "三菱UFJ", "", "Amazon.co.jp", "部分一致", "", "",
  ...new Array(46).fill(""),
];
const existingCsv = CSV_HEADER + "\r\n" + existingRow.join(",") + "\r\n";
fs.writeFileSync(existingCsvPath, iconv.encode(existingCsv, "cp932"));

const dedupeResult = generateRuleCsv(MOCK_RESULT, {
  companyId: "474381",
  outputDir: TMP_DIR,
  encoding: "cp932",
  existingRuleCsvPath: existingCsvPath,
});

test("D01: 同一キーの行が除外される", () => {
  // AUTO_ITEMが2件あるが、既存と同じキーなので2件とも除外
  assert.ok(dedupeResult.stats.deduplicated > 0);
});

test("D02: stats.deduplicated が正しいカウント", () => {
  // AUTO_ITEM(id:1)のキー"Amazon.co.jp"が既存と一致 → 1件重複
  // id:5はpartnerName="タクシー会社" → キーが異なるので重複しない
  assert.strictEqual(dedupeResult.stats.deduplicated, 1);
});

test("D03: 異なるキーの行は残る", () => {
  // kintone_staff(1件→suggest) + auto_register残り(id:5→register) = suggest(1) + register(1)
  assert.strictEqual(dedupeResult.stats.register, 1);
  assert.strictEqual(dedupeResult.stats.suggest, 1);
});

// クリーンアップ
cleanupTmpDir();

// ==================================================
// 結果
// ==================================================
console.log("\n" + "=".repeat(50));
console.log(`テスト結果: ${passed} passed / ${failed} failed / ${passed + failed} total`);
if (failed > 0) {
  console.log("⚠️ 一部テストが失敗しました");
  process.exit(1);
} else {
  console.log("✅ 全テスト通過！");
}
