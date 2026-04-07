#!/usr/bin/env node
/**
 * test-normalizer.js
 * 正規化エンジン normalizer.js のテスト
 */

const { normalize, normalizeUnicode, cleanWhitespace, unifySymbols,
  normalizeCorpType, correctSmallKana, removeNoise,
  applyTeikeiDict, applyKoyuuDict, formatDisplay } = require('../src/classify/normalizer');

let passed = 0;
let failed = 0;

function test(id, description, fn) {
  try {
    fn();
    console.log('  \u2705 ' + id + '. ' + description);
    passed++;
  } catch (e) {
    console.log('  \u274C ' + id + '. ' + description);
    console.log('    ' + e.message);
    failed++;
  }
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || '') + ' expected ' + e + ' but got ' + a);
}

console.log('=== normalizer.js テスト ===\n');

console.log('--- 仕様書テストケース（セクション6） ---');

test('N01', 'ﾄﾖﾀﾌｱｲﾅﾝｽ → トヨタファイナンス', () => {
  const r = normalize('ﾄﾖﾀﾌｱｲﾅﾝｽ');
  eq(r.display, 'トヨタファイナンス');
  eq(r.raw, 'ﾄﾖﾀﾌｱｲﾅﾝｽ');
  if (!r.rulesApplied.includes('半角→全角カナ')) throw new Error('半角→全角カナ rule missing');
  if (!r.rulesApplied.includes('固有名詞辞書')) throw new Error('固有名詞辞書 rule missing');
});

test('N02', 'ｼﾞﾄﾞｳｷ → 自動機', () => {
  const r = normalize('ｼﾞﾄﾞｳｷ');
  eq(r.display, '自動機');
  if (!r.rulesApplied.includes('定型語辞書')) throw new Error('定型語辞書 rule missing');
});

test('N03', 'ｺﾞﾍﾝｻｲ → ご返済', () => {
  const r = normalize('ｺﾞﾍﾝｻｲ');
  eq(r.display, 'ご返済');
});

test('N04', 'ｺｳｾｲﾎｹﾝﾘﾖｳ → 厚生保険料', () => {
  const r = normalize('ｺｳｾｲﾎｹﾝﾘﾖｳ');
  eq(r.display, '厚生保険料');
});

test('N05', 'パーク24(カ)タイムズペイ → タイムズペイ（パーク24㌈）', () => {
  const r = normalize('ﾊﾟｰｸ24(ｶ)ﾀｲﾑｽﾞﾍﾟｲ');
  eq(r.display, 'タイムズペイ（パーク24㌈）');
  if (!r.rulesApplied.includes('表示整形')) throw new Error('表示整形 rule missing');
});

test('N06', 'ジドウキ (618) → 自動機', () => {
  const r = normalize('ｼﾞﾄﾞｳｷ (618)');
  eq(r.display, '自動機');
  if (!r.rulesApplied.includes('ノイズ除去')) throw new Error('ノイズ除去 rule missing');
});

test('N07', 'カ)ファインズ → ㌈ファインズ', () => {
  const r = normalize('ｶ)ﾌｱｲﾝｽﾞ');
  eq(r.display, '㌈ファインズ');
});

test('N08', 'アフラツクAPS → アフラック生命保険㌈', () => {
  const r = normalize('ｱﾌﾗﾂｸAPS');
  eq(r.display, 'アフラック生命保険㌈');
});

test('N09', 'チンリヨウトウ → 賃料等', () => {
  const r = normalize('ﾁﾝﾘﾖｳﾄｳ');
  eq(r.display, '賃料等');
});

test('N10', 'ニホンヤクシヨク(カ → 日本薬食㌈', () => {
  const r = normalize('ﾆﾎﾝﾔｸｼﾖｸ(ｶ');
  eq(r.display, '日本薬食㌈');
});

console.log('');
console.log('--- 追加テストケース ---');

test('N11', 'IBフリコミ カ)キメイドウ → ㌈喜明堂', () => {
  const r = normalize('IBﾌﾘｺﾐ   ｶ)ｷﾒｲﾄﾞｳ');
  eq(r.display, '㌈喜明堂');
  if (!r.rulesApplied.includes('ノイズ除去')) throw new Error('ノイズ除去 missing');
});

test('N12', 'コウザフリカエ SMBC(チンリヨウトウ → 賃料等', () => {
  const r = normalize('ｺｳｻﾞﾌﾘｶｴ SMBC(ﾁﾝﾘﾖｳﾄｳ');
  eq(r.display, '賃料等');
});

test('N13', 'DF.ジャストリンク → ジャストリンク', () => {
  const r = normalize('DF.ｼﾞﾔｽﾄﾘﾝｸ');
  eq(r.display, 'ジャストリンク');
  if (!r.rulesApplied.includes('ノイズ除去')) throw new Error('ノイズ除去 missing');
});

test('N14', 'クレジット   トヨタファイナンス → トヨタファイナンス', () => {
  const r = normalize('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ');
  eq(r.display, 'トヨタファイナンス');
});

test('N15', '空文字 → 空結果', () => {
  const r = normalize('');
  eq(r.raw, '');
  eq(r.normalized, '');
  eq(r.display, '');
  eq(r.rulesApplied.length, 0);
});

test('N16', 'null → 空結果', () => {
  const r = normalize(null);
  eq(r.raw, '');
  eq(r.display, '');
});

test('N17', 'rawは元文字列を保持', () => {
  const raw = 'ﾄﾖﾀﾌｱｲﾅﾝｽ';
  const r = normalize(raw);
  eq(r.raw, raw);
});

test('N18', 'rulesApplied に適用ルールが記録される', () => {
  const r = normalize('ｼﾞﾄﾞｳｷ (618)');
  if (r.rulesApplied.length === 0) throw new Error('rulesApplied is empty');
  if (!Array.isArray(r.rulesApplied)) throw new Error('rulesApplied is not array');
});

test('N19', 'ソウキン プレフィックス除去', () => {
  const r = normalize('ｿｳｷﾝ     ﾊﾞﾊﾞ ﾉﾘﾌﾐ');
  // ソウキン ババ ノリフミ → ババ ノリフミ (display unchanged since not in dict)
  if (!r.rulesApplied.includes('ノイズ除去')) throw new Error('ノイズ除去 missing');
  // normalizedにソウキンが含まれないこと
  if (r.normalized.includes('ソウキン')) throw new Error('ソウキン still in normalized');
});

test('N20', 'NS ニコス → NICOS', () => {
  const r = normalize('NS ﾆｺｽ');
  eq(r.display, 'NICOS');
});

test('N21', 'ジフリ RKS(コタロウカンポウ → コタロウカンポウ', () => {
  const r = normalize('ｼﾞﾌﾘ     RKS(ｺﾀﾛｳｶﾝﾎﾟｳ');
  eq(r.display, 'コタロウカンポウ');
});

test('N22', 'AP(トチモト → トチモト', () => {
  const r = normalize('AP(ﾄﾁﾓﾄ');
  eq(r.display, 'トチモト');
});

test('N23', 'normalized(照合用)とdisplay(表示用)は異なる', () => {
  const r = normalize('ｼﾞﾄﾞｳｷ');
  // normalized = ジドウキ（全角カタカナ）, display = 自動機（漢字）
  eq(r.normalized, 'ジドウキ');
  eq(r.display, '自動機');
  if (r.normalized === r.display) throw new Error('normalized should differ from display');
});

test('N24', 'MHF)Eケンコウショツ → MHF代行除去', () => {
  const r = normalize('MHF)Eｹﾝｺｳｼﾖﾂ');
  if (!r.rulesApplied.includes('ノイズ除去')) throw new Error('ノイズ除去 missing');
  // MHFが除去されること
  if (r.normalized.startsWith('MHF')) throw new Error('MHF not removed');
});

test('N25', 'IBフリコミ クロレラコウギヨウ → ㌈クロレラ工業', () => {
  const r = normalize('IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ');
  eq(r.display, '㌈クロレラ工業');
});

test('N26', '全角スペースが半角スペースに統一される', () => {
  const r = normalize('ABC\u3000DEF');
  eq(r.normalized, 'ABC DEF');
  if (!r.rulesApplied.includes('空白整理')) throw new Error('空白整理 missing');
});

test('N27', 'ハイフン→長音変換（パーク等）', () => {
  const { normalizeUnicode } = require('../src/classify/normalizer');
  const result = normalizeUnicode('\u30D1\u002D\u30AF');  // パ-ク
  eq(result, '\u30D1\u30FC\u30AF');  // パーク
});


console.log('');
console.log('--- 結果 ---');
if (failed > 0) {
  console.log('\u274C 失敗: ' + failed + '件 / 通過: ' + passed + '件');
  process.exit(1);
} else {
  console.log('\u2705 通過: ' + passed + '件');
  console.log('全テスト通過 \uD83C\uDF89');
}
