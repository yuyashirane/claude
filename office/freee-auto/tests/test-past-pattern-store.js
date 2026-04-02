/**
 * past-pattern-store テスト
 *
 * buildPatternStore({ deals }) でテスト用データを直接渡し、
 * マッチング・スコアリング・キャッシュ読み書きを検証する。
 *
 * 使い方: node tests/test-past-pattern-store.js
 */

"use strict";

const assert = require("assert");
const fs     = require("fs");
const path   = require("path");
const os     = require("os");

const {
  buildPatternStore,
  normalizeDescription,
  extractPatternsFromDeals,
  extractKanaFromDescription,
  buildKanaMapFromRuleCsv,
  buildKanaMapFromPartners,
  PastPatternStore,
} = require("../src/classify/past-pattern-store");

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

// --------------------------------------------------
// モック deals データ
// --------------------------------------------------

const MOCK_DEALS = [
  // ANTHROPIC × 6回 → 完全一致 30pt 候補
  ...Array.from({ length: 6 }, (_, i) => ({
    issue_date: `2025-${String(10 + i).padStart(2, "0")}-01`,
    partner: { name: "ANTHROPIC" },
    details: [{ account_item_name: "通信費", tax_code_name: "課対仕入", description: "" }],
  })),
  // 東京電力 × 12回
  ...Array.from({ length: 12 }, (_, i) => ({
    issue_date: `2025-${String((i % 12) + 1).padStart(2, "0")}-20`,
    partner: { name: "東京電力エナジーパートナー" },
    details: [{ account_item_name: "水道光熱費", tax_code_name: "課対仕入", description: "" }],
  })),
  // Amazon × 2回 → 完全一致 20pt 候補
  {
    issue_date: "2025-11-05",
    partner: { name: "Amazon" },
    details: [{ account_item_name: "消耗品費", tax_code_name: "課対仕入", description: "" }],
  },
  {
    issue_date: "2025-12-05",
    partner: { name: "Amazon" },
    details: [{ account_item_name: "消耗品費", tax_code_name: "課対仕入", description: "" }],
  },
  // partner なし・description ベース × 1回 → 部分一致テスト用
  {
    issue_date: "2025-10-10",
    partner: null,
    details: [{ account_item_name: "旅費交通費", tax_code_name: "課対仕入", description: "新幹線チケット" }],
  },
  // partner.name が空文字
  {
    issue_date: "2025-09-01",
    partner: { name: "" },
    details: [{ account_item_name: "雑費", tax_code_name: "課対仕入", description: "その他費用" }],
  },
  // details なし → スキップされること
  {
    issue_date: "2025-08-01",
    partner: null,
    details: [],
  },
];

// --------------------------------------------------
// 1. normalizeDescription
// --------------------------------------------------

console.log("\n▶ normalizeDescription");

test("スペース除去", () => {
  assert.strictEqual(normalizeDescription("A B　C"), "ABC");
});
test("全角数字→半角（4桁以上は*に置換）", () => {
  // ２０２６ → 2026 → * （4桁以上なので1つの * に）
  assert.strictEqual(normalizeDescription("２０２６"), "*");
});
test("全角英字→半角大文字", () => {
  assert.strictEqual(normalizeDescription("Ａｍａｚｏｎ"), "AMAZON");
});
test("4桁以上の数字→*", () => {
  assert.strictEqual(normalizeDescription("注文12345"), "注文*");
});
test("4桁未満の数字はそのまま", () => {
  assert.strictEqual(normalizeDescription("ABC123"), "ABC123");
});
test("日付パターン(MM/DD)→*", () => {
  assert.strictEqual(normalizeDescription("03/15支払"), "*支払");
});
test("大文字化", () => {
  assert.strictEqual(normalizeDescription("amazon"), "AMAZON");
});
test("空文字は空文字を返す", () => {
  assert.strictEqual(normalizeDescription(""), "");
});
test("null/undefined は空文字を返す", () => {
  assert.strictEqual(normalizeDescription(null), "");
  assert.strictEqual(normalizeDescription(undefined), "");
});
test("AMAZON注文番号が同一キーになる", () => {
  const a = normalizeDescription("AMAZON.CO.JP 注文番号12345");
  const b = normalizeDescription("AMAZON.CO.JP 注文番号67890");
  assert.strictEqual(a, b);
});

// --------------------------------------------------
// 2. extractPatternsFromDeals
// --------------------------------------------------

console.log("\n▶ extractPatternsFromDeals");

const patterns = extractPatternsFromDeals(MOCK_DEALS);

test("ANTHROPICが6件カウントされる", () => {
  const key = normalizeDescription("ANTHROPIC");
  assert.ok(patterns[key], "ANTHROPICキーが存在しない");
  assert.strictEqual(patterns[key].count, 6);
});
test("ANTHROPICの勘定科目が通信費", () => {
  const key = normalizeDescription("ANTHROPIC");
  assert.strictEqual(patterns[key].accountName, "通信費");
});
test("東京電力が12件カウントされる", () => {
  const key = normalizeDescription("東京電力エナジーパートナー");
  assert.ok(patterns[key], "東京電力キーが存在しない");
  assert.strictEqual(patterns[key].count, 12);
});
test("Amazonが2件カウントされる", () => {
  const key = normalizeDescription("Amazon");
  assert.strictEqual(patterns[key].count, 2);
});
test("partner null のとき description をキーに使う", () => {
  const key = normalizeDescription("新幹線チケット");
  assert.ok(patterns[key], "新幹線チケットキーが存在しない");
});
test("partner.name が空のとき details[0].description をフォールバックに使う", () => {
  const key = normalizeDescription("その他費用");
  assert.ok(patterns[key], "その他費用キーが存在しない");
});
test("details が空の deal はスキップされる", () => {
  // partner も null, details も空 → キーが生成されないことを確認
  // 上記 deal はキーが null なのでカウントに含まれないはず
  // 単純に total パターン数が多すぎないことで間接確認
  assert.ok(Object.keys(patterns).length <= 5);
});

// --------------------------------------------------
// 3. PastPatternStore.matchPattern
// --------------------------------------------------

console.log("\n▶ PastPatternStore.matchPattern");

const store = new PastPatternStore(patterns);

test("完全一致: ANTHROPIC → matchType=exact", () => {
  const result = store.matchPattern("ANTHROPIC");
  assert.ok(result, "マッチなし");
  assert.strictEqual(result.matchType, "exact");
  assert.strictEqual(result.accountName, "通信費");
});
test("完全一致: Amazon → matchType=exact", () => {
  const result = store.matchPattern("Amazon");
  assert.ok(result);
  assert.strictEqual(result.matchType, "exact");
});
test("部分一致: 'AMAZON利用 3月分' にAMAZONが部分マッチ", () => {
  const result = store.matchPattern("AMAZON利用 3月分");
  assert.ok(result, "部分一致マッチなし");
  assert.strictEqual(result.matchType, "partial");
});
test("部分一致: '東京電力エナジーパートナー電気代' に東京電力が部分マッチ", () => {
  const result = store.matchPattern("東京電力エナジーパートナー電気代");
  assert.ok(result);
  assert.strictEqual(result.matchType, "partial");
});
test("マッチなし: 全く異なる摘要 → null", () => {
  const result = store.matchPattern("XYZ未知の摘要テキスト");
  assert.strictEqual(result, null);
});
test("短すぎる（2文字以下）摘要はマッチしない", () => {
  const result = store.matchPattern("AB");
  assert.strictEqual(result, null);
});

// --------------------------------------------------
// 4. PastPatternStore.calculatePastPatternScore
// --------------------------------------------------

console.log("\n▶ calculatePastPatternScore");

test("完全一致 + 6回出現 → 30pt", () => {
  const pattern = store.matchPattern("ANTHROPIC");
  assert.strictEqual(store.calculatePastPatternScore(pattern), 30);
});
test("完全一致 + 2回出現 → 20pt", () => {
  const pattern = store.matchPattern("Amazon");
  assert.strictEqual(store.calculatePastPatternScore(pattern), 20);
});
test("部分一致 + 12回出現 → 20pt", () => {
  const pattern = store.matchPattern("東京電力エナジーパートナー電気代 10月分");
  assert.ok(pattern);
  assert.strictEqual(store.calculatePastPatternScore(pattern), 20);
});
test("部分一致 + 1回出現 → 10pt", () => {
  // 新幹線チケットは1件のみ
  const pattern = store.matchPattern("新幹線チケット代");
  assert.ok(pattern, "新幹線チケットが部分マッチしない");
  assert.strictEqual(store.calculatePastPatternScore(pattern), 10);
});
test("マッチなし → 0pt", () => {
  assert.strictEqual(store.calculatePastPatternScore(null), 0);
});

// --------------------------------------------------
// 非同期テストは async IIFE でまとめて実行（CommonJS 対応）
// --------------------------------------------------

(async () => {
  // --------------------------------------------------
  // 5. buildPatternStore (deals オプション直接渡し)
  // --------------------------------------------------

  console.log("\n▶ buildPatternStore (テスト用 deals 直接渡し)");

  await testAsync("deals 直接渡し → PastPatternStore インスタンスを返す", async () => {
    const s = await buildPatternStore({ companyId: "test", deals: MOCK_DEALS });
    assert.ok(s instanceof PastPatternStore);
    assert.ok(s.size > 0);
  });

  await testAsync("deals 空配列 → size=0 の PastPatternStore", async () => {
    const s = await buildPatternStore({ companyId: "test", deals: [] });
    assert.strictEqual(s.size, 0);
  });

  // --------------------------------------------------
  // 6. buildPatternStore (ファイルキャッシュ)
  // --------------------------------------------------

  console.log("\n▶ buildPatternStore (ファイルキャッシュ)");

  await testAsync("キャッシュ書き込み・読み込みが動作する", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pps-test-"));
    try {
      // キャッシュファイルを手動で書いておいてから読み込みテスト
      const cacheFile = path.join(tmpDir, "past-deals.json");
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          cachedAt: new Date().toISOString(),
          patterns: extractPatternsFromDeals(MOCK_DEALS),
        }, null, 2),
        "utf-8"
      );

      const s = await buildPatternStore({
        companyId: "474381",
        cacheDir: tmpDir,
      });
      assert.ok(s instanceof PastPatternStore);
      assert.ok(s.size > 0);

      // ANTHROPIC が正しくマッチするか確認
      const p = s.matchPattern("ANTHROPIC");
      assert.ok(p);
      assert.strictEqual(p.matchType, "exact");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync("companyId 未指定 → 空ストアを返す", async () => {
    const s = await buildPatternStore({});
    assert.ok(s instanceof PastPatternStore);
    assert.strictEqual(s.size, 0);
  });

  await testAsync("FREEE_ACCESS_TOKEN 未設定・キャッシュなし → 空ストアを返す", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pps-test-empty-"));
    const origToken = process.env.FREEE_ACCESS_TOKEN;
    delete process.env.FREEE_ACCESS_TOKEN;
    try {
      const s = await buildPatternStore({ companyId: "474381", cacheDir: tmpDir });
      assert.ok(s instanceof PastPatternStore);
      assert.strictEqual(s.size, 0);
    } finally {
      if (origToken) process.env.FREEE_ACCESS_TOKEN = origToken;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------
  // 7. extractKanaFromDescription
  // --------------------------------------------------

  console.log("\n▶ extractKanaFromDescription");

  test("「振込 フジワラ ケイ」→「フジワラケイ」", () => {
    const result = extractKanaFromDescription(normalizeDescription("振込 フジワラ ケイ"));
    assert.strictEqual(result, "フジワラケイ");
  });
  test("「振込　㈱アックスコンサルティング」→「アックスコンサルティング」（全角スペース・㈱除去）", () => {
    const result = extractKanaFromDescription(normalizeDescription("振込　㈱アックスコンサルティング"));
    assert.strictEqual(result, "アックスコンサルティング");
  });
  test("「フリコミ テスト タロウ」→「テストタロウ」（フリコミプレフィックス除去）", () => {
    const result = extractKanaFromDescription(normalizeDescription("フリコミ テスト タロウ"));
    assert.strictEqual(result, "テストタロウ");
  });
  test("「AMAZON.CO.JP」→ null（カタカナなし）", () => {
    const result = extractKanaFromDescription(normalizeDescription("AMAZON.CO.JP"));
    assert.strictEqual(result, null);
  });
  test("「入金 ヤマダ」→「ヤマダ」（入金プレフィックス除去）", () => {
    const result = extractKanaFromDescription(normalizeDescription("入金 ヤマダ"));
    assert.strictEqual(result, "ヤマダ");
  });
  test("「ANTHROPIC」→ null（カタカナなし）", () => {
    const result = extractKanaFromDescription(normalizeDescription("ANTHROPIC"));
    assert.strictEqual(result, null);
  });
  test("空文字 → null", () => {
    assert.strictEqual(extractKanaFromDescription(""), null);
  });

  // --------------------------------------------------
  // 8. buildKanaMapFromRuleCsv
  // --------------------------------------------------

  console.log("\n▶ buildKanaMapFromRuleCsv");

  await testAsync("存在しないCSVパスは空マップを返す（エラーなし）", async () => {
    const map = buildKanaMapFromRuleCsv("/nonexistent/path/rules.csv");
    assert.deepStrictEqual(map, {});
  });

  await testAsync("カタカナ含む行を正しく抽出する", async () => {
    // 一時CSVファイルを作成
    const iconv = require("iconv-lite");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kana-csv-"));
    const tmpCsv = path.join(tmpDir, "test.csv");
    try {
      // cp932エンコードCSVを作成（ヘッダー + 2データ行）
      // [0]収支区分,[1]取引口座,[2]カードラベル,[3]取引内容,[4]マッチ条件,
      // [5]金額min,[6]金額max,[7]優先度,[8]アクション,[9]振替口座,[10]テンプレ,[11]原本準拠,
      // [12]取引先,[13]適格請求書等,[14]勘定科目,[15]税区分
      const header = "収支区分,取引口座,カードラベル,取引内容,マッチ条件,金額（最小値）,金額（最大値）,優先度,マッチ後のアクション,振替口座,取引テンプレート,購入データ原本に準拠,取引先,適格請求書等,勘定科目,税区分\r\n";
      const row1   = "収入,,,フジワラ ケイ,部分一致,,,0,取引を登録する,,,,藤原啓,取引先情報に準拠,売上高,課税売上\r\n";
      const row2   = "支出,,,アックスコンサルティング,部分一致,,,0,取引を登録する,,,,㈱アックス,取引先情報に準拠,支払手数料,課対仕入\r\n";
      const buf = iconv.encode(header + row1 + row2, "cp932");
      fs.writeFileSync(tmpCsv, buf);

      const map = buildKanaMapFromRuleCsv(tmpCsv);
      assert.ok(Object.keys(map).length >= 1, "マッピングが空");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------
  // 9. buildKanaMapFromPartners
  // --------------------------------------------------

  console.log("\n▶ buildKanaMapFromPartners");

  test("shortcut1 がカタカナの取引先をマップ登録する", () => {
    const partners = [
      { id: 1, name: "藤原啓", shortcut1: "フジワラ ケイ", shortcut2: "" },
      { id: 2, name: "東京電力エナジーパートナー", shortcut1: "トウキョウデンリョク", shortcut2: "" },
      { id: 3, name: "Amazon", shortcut1: "AMAZON", shortcut2: "" }, // カタカナなし
    ];
    const map = buildKanaMapFromPartners(partners);
    assert.ok(map["フジワラケイ"], "フジワラケイが登録されていない");
    assert.strictEqual(map["フジワラケイ"].partnerName, "藤原啓");
    assert.ok(map["トウキョウデンリョク"], "トウキョウデンリョクが登録されていない");
    assert.ok(!map["AMAZON"], "英字はマップ登録されるべきでない");
  });
  test("空配列は空マップを返す", () => {
    const map = buildKanaMapFromPartners([]);
    assert.deepStrictEqual(map, {});
  });

  // --------------------------------------------------
  // 10. kanaMap 経由のマッチング
  // --------------------------------------------------

  console.log("\n▶ kanaMap 経由のマッチング");

  await testAsync("カタカナ経由でパターンにマッチする（kana_mapped）", async () => {
    // dealsに「藤原啓」取引先を登録
    const deals = [
      ...Array.from({ length: 4 }, (_, i) => ({
        issue_date: `2025-${String(i + 1).padStart(2, "0")}-01`,
        partner:  { name: "藤原啓" },
        details:  [{ account_item_name: "売上高", tax_code_name: "課税売上", description: "" }],
      })),
    ];
    const kanaMap = { "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 4 } };
    const s = await buildPatternStore({ companyId: "test", deals, kanaMap: undefined });
    // kanaMapを直接渡してストア作成
    const storeWithKana = new PastPatternStore(s.patterns, kanaMap);

    const result = storeWithKana.matchPattern("振込 フジワラ ケイ");
    assert.ok(result, "マッチなし");
    assert.strictEqual(result.matchType, "kana_mapped");
    assert.strictEqual(result.accountName, "売上高");
  });

  await testAsync("kanaMap のみ（patternsになし）でも kana_mapped を返す", async () => {
    const kanaMap = { "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 5 } };
    const storeWithKana = new PastPatternStore({}, kanaMap);

    const result = storeWithKana.matchPattern("振込 フジワラ ケイ");
    assert.ok(result, "マッチなし");
    assert.strictEqual(result.matchType, "kana_mapped");
    assert.strictEqual(result.accountName, "売上高");
  });

  await testAsync("kana_mapped + 3回以上 → 25pt", async () => {
    const kanaMap = { "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 4 } };
    const storeWithKana = new PastPatternStore({}, kanaMap);
    const pattern = storeWithKana.matchPattern("振込 フジワラ ケイ");
    assert.strictEqual(storeWithKana.calculatePastPatternScore(pattern), 25);
  });

  await testAsync("kana_mapped + 1〜2回 → 15pt", async () => {
    const kanaMap = { "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 2 } };
    const storeWithKana = new PastPatternStore({}, kanaMap);
    const pattern = storeWithKana.matchPattern("振込 フジワラ ケイ");
    assert.strictEqual(storeWithKana.calculatePastPatternScore(pattern), 15);
  });

  await testAsync("kanaMapSize プロパティが件数を返す", async () => {
    const kanaMap = { "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 1 } };
    const storeWithKana = new PastPatternStore({}, kanaMap);
    assert.strictEqual(storeWithKana.kanaMapSize, 1);
  });

  await testAsync("buildPatternStore に existingRuleCsvPath を渡せる（存在しないパスは空マップ）", async () => {
    const s = await buildPatternStore({
      companyId: "test",
      deals: MOCK_DEALS,
      existingRuleCsvPath: "/nonexistent/rules.csv",
    });
    assert.ok(s instanceof PastPatternStore);
    assert.strictEqual(s.kanaMapSize, 0);
  });

  await testAsync("buildPatternStore に partners を渡すとカタカナマップが構築される", async () => {
    const partners = [
      { id: 1, name: "藤原啓", shortcut1: "フジワラケイ", shortcut2: "" },
    ];
    const s = await buildPatternStore({ companyId: "test", deals: MOCK_DEALS, partners });
    assert.ok(s instanceof PastPatternStore);
    assert.ok(s.kanaMapSize >= 1);
  });

  // --------------------------------------------------
  // 11. 統合テスト（kanaMap + patterns 両方参照）
  // --------------------------------------------------

  console.log("\n▶ 統合テスト（kanaMap + patterns 両方）");

  await testAsync("振込 フジワラ ケイ → kanaMap経由で patterns の partnerName も返す", async () => {
    // patterns に「藤原啓」を登録（deals から構築）
    const deals = Array.from({ length: 5 }, (_, i) => ({
      issue_date: `2025-${String(i + 1).padStart(2, "0")}-01`,
      partner:  { name: "藤原啓" },
      details:  [{ account_item_name: "売上高", tax_code_name: "課税売上", description: "" }],
    }));
    // kanaMap でカタカナ→漢字取引先名の対応を定義
    const kanaMap = {
      "フジワラケイ": { partnerName: "藤原啓", accountName: "売上高", taxClassification: "課税売上", count: 5 },
    };
    const s = await buildPatternStore({ companyId: "test", deals });
    const storeWithKana = new PastPatternStore(s.patterns, kanaMap);

    const result = storeWithKana.matchPattern("振込 フジワラ ケイ");

    // matchType・partnerName・accountName を全て確認
    assert.ok(result, "マッチなし");
    assert.strictEqual(result.matchType, "kana_mapped");
    assert.strictEqual(result.partnerName, "藤原啓");
    assert.strictEqual(result.accountName, "売上高");
  });

  await testAsync("振込 アックスコンサルティング → kanaMapのみでもマッチする", async () => {
    const kanaMap = {
      "アックスコンサルティング": {
        partnerName:      "㈱アックスコンサルティング",
        accountName:      "支払手数料",
        taxClassification: "課対仕入",
        count:            3,
      },
    };
    const storeWithKana = new PastPatternStore({}, kanaMap);

    const result = storeWithKana.matchPattern("振込　㈱アックスコンサルティング");

    assert.ok(result, "マッチなし");
    assert.strictEqual(result.matchType, "kana_mapped");
    assert.strictEqual(result.partnerName, "㈱アックスコンサルティング");
    assert.strictEqual(result.accountName, "支払手数料");
    // count=3 → 25pt
    assert.strictEqual(storeWithKana.calculatePastPatternScore(result), 25);
  });

  // --------------------------------------------------
  // 結果サマリー
  // --------------------------------------------------

  console.log(`\n=== 結果: ${passed + failed} 件 / 成功 ${passed} 件 / 失敗 ${failed} 件 ===`);
  if (failed > 0) process.exit(1);
})();
