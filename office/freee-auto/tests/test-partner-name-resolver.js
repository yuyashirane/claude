/**
 * test-partner-name-resolver.js
 * 取引先名抽出・正規化モジュールのテスト
 */

const {
  resolvePartnerName,
  halfToFullKatakana,
  stripBankPrefix,
  stripAgencyPrefix,
  applyCorpAbbrev,
} = require('../src/classify/partner-name-resolver');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (e) {
    console.log('  ❌ ' + name + ': ' + e.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '') + ' expected "' + expected + '" but got "' + actual + '"');
  }
}

console.log('\n━━━ halfToFullKatakana テスト ━━━');

test('K01: 半角カタカナ変換（済音）', () => {
  // ｸﾛﾚﾗ = ｸﾛﾚﾗ -> クロレラ
  assertEqual(halfToFullKatakana('ｸﾛﾚﾗ'), 'クロレラ');
});

test('K02: 濁点付き', () => {
  // ﾊﾞﾊﾞ = ﾊﾞﾊﾞ -> ババ
  assertEqual(halfToFullKatakana('ﾊﾞﾊﾞ'), 'ババ');
});

test('K03: 半濁点付き', () => {
  // ﾎﾟ = ﾎﾟ -> ポ
  assertEqual(halfToFullKatakana('ｿﾝﾎﾟ'), 'ソンポ');
});

test('K04: 混合文字列', () => {
  // ﾄﾖﾀﾌｱｲﾅﾝｽ = ﾄﾖﾀﾌｱｲﾅﾝｽ -> トヨタフアイナンス
  // 注: ｱ=ｱ(big ア) ≠ ｧ(small ァ). 銀行明細は大文字アを使用
  assertEqual(halfToFullKatakana('ﾄﾖﾀﾌｱｲﾅﾝｽ'), 'トヨタフアイナンス');
});

test('K05: ASCIIはそのまま', () => {
  assertEqual(halfToFullKatakana('DF.test'), 'DF.test');
});

test('K06: 長音記号', () => {
  // ｰ = ｰ -> ー
  assertEqual(halfToFullKatakana('ﾊﾟｰｸ'), 'パーク');
});

console.log('\n━━━ stripBankPrefix テスト ━━━');

test('B01: IBフリコミ除去', () => {
  // IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ -> ﾊﾞﾊﾞ ﾉﾘﾌﾐ
  assertEqual(stripBankPrefix('IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ'), 'ﾊﾞﾊﾞ ﾉﾘﾌﾐ');
});

test('B02: コウザフリカエ除去', () => {
  // ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗ -> DF.ｸﾛﾚﾗ
  assertEqual(stripBankPrefix('ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗ'), 'DF.ｸﾛﾚﾗ');
});

test('B03: プレフィックスなし', () => {
  assertEqual(stripBankPrefix('ｸﾛﾚﾗ'), 'ｸﾛﾚﾗ');
});

console.log('\n━━━ stripAgencyPrefix テスト ━━━');

test('A01: DF.除去', () => {
  const r = stripAgencyPrefix('DF.ｸﾛﾚﾗｺｳｷﾞﾖ');
  assertEqual(r.text, 'ｸﾛﾚﾗｺｳｷﾞﾖ');
  assert(r.removed.length > 0, 'removed should track agent');
});

test('A02: MHF)除去', () => {
  const r = stripAgencyPrefix('MHF)ﾔﾂﾒｾｲﾔｸ');
  assertEqual(r.text, 'ﾔﾂﾒｾｲﾔｸ');
  assert(r.removed.length > 0, 'removed should track agent');
});

test('A03: SMBC(除去', () => {
  const r = stripAgencyPrefix('SMBC(ﾁﾝﾘﾖｳﾄｳ');
  assertEqual(r.text, 'ﾁﾝﾘﾖｳﾄｳ');
});

test('A04: (HFC)末尾除去', () => {
  const r = stripAgencyPrefix('ﾔｸｻﾞｲｼ ｺｸﾎ(HFC)');
  assertEqual(r.text, 'ﾔｸｻﾞｲｼ ｺｸﾎ');
});

test('A05: 代行なし', () => {
  const r = stripAgencyPrefix('ｸﾛﾚﾗ');
  assertEqual(r.text, 'ｸﾛﾚﾗ');
  assertEqual(r.removed.length, 0, 'no agents removed');
});

console.log('\n━━━ resolvePartnerName テスト ━━━');

test('R01: IBフリコミ + 法人', () => {
  // IBﾌﾘｺﾐ   ｶ)ｷﾒｲﾄﾞｳ -> ㌈キメイドウ
  const r = resolvePartnerName('IBﾌﾘｺﾐ   ｶ)ｷﾒｲﾄﾞｳ');
  assertEqual(r.normalizedName, '㌈キメイドウ');
  assert(!r.isPersonName, 'not person');
});

test('R02: 口座振替 + DF.代行', () => {
  // ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ
  //   -> クロレラコウギヨ (ｷﾞﾖ = ギヨ, not ギョウ)
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗｺｳｷﾞﾖ');
  assertEqual(r.partnerName, 'クロレラコウギヨ');
  assert(!r.isPersonName, 'not person');
});

test('R03: MHF)代行 + 製薬会社', () => {
  // ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾂﾒｾｲﾔｸ
  //   -> ヤツメセイヤク
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾂﾒｾｲﾔｸ');
  assertEqual(r.normalizedName, 'ヤツメセイヤク');
});

test('R04: 人名（IBフリコミ）', () => {
  // IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ
  //   -> ババ ノリフミ（スペース保持）
  const r = resolvePartnerName('IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ');
  assertEqual(r.partnerName, 'ババ ノリフミ');
  assert(r.isPersonName, 'is person');
});

test('R05: 人名（プレフィックスなし）', () => {
  // ﾓﾘﾑﾗ ﾒｲ -> モリムラ メイ
  const r = resolvePartnerName('ﾓﾘﾑﾗ ﾒｲ');
  assertEqual(r.partnerName, 'モリムラ メイ');
  assert(r.isPersonName, 'is person');
});

test('R06: SMBC代行', () => {
  // ｺｳｻﾞﾌﾘｶｴ SMBC(ﾁﾝﾘﾖｳﾄｳ
  //   -> チンリヨウトウ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ SMBC(ﾁﾝﾘﾖｳﾄｳ');
  assertEqual(r.normalizedName, 'チンリヨウトウ');
});

test('R07: 空文字列', () => {
  const r = resolvePartnerName('');
  assertEqual(r.normalizedName, '');
  assert(!r.isPersonName, 'not person');
});

test('R08: トヨタフアイナンス（クレジット行）', () => {
  // ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ
  //   -> トヨタフアイナンス (ｱ=big ア)
  const r = resolvePartnerName('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ');
  assertEqual(r.partnerName, 'トヨタフアイナンス');
});

test('R09: RL)代行 + 法人', () => {
  // ｺｳｻﾞﾌﾘｶｴ RL)ﾕ)ﾋﾛｺｰﾎﾟﾚｰｼﾖ
  //   -> ㊒ヒロコーポレーシヨ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ RL)ﾕ)ﾋﾛｺｰﾎﾟﾚｰｼﾖ');
  // ﾕ) = ﾕ) -> ㊒ = ㈲
  assert(r.normalizedName.includes('㊒'), 'should have ㊒');
  assert(r.normalizedName.includes('ヒロコーポレーシヨ'), 'company name');
});

test('R10: スクエア（法人サフィックス）', () => {
  // ｽｸｴｱ(ｶ -> スクエア㌈
  const r = resolvePartnerName('ｽｸｴｱ(ｶ');
  // (ｶ at end -> should become ㌈ or (カ -> keep as is since pattern doesn't match exactly
  // Actually (ｶ is not exactly matching [ｶ][)] pattern... let's see
  assert(r.normalizedName.includes('スクエア'), 'Square');
});

test('R11: ソウキン + 人名', () => {
  // ｿｳｷﾝ     ｵｲｶﾜ ｾﾝｼﾞ -> オイカワ センジ
  const r = resolvePartnerName('ｿｳｷﾝ     ｵｲｶﾜ ｾﾝｼﾞ');
  assertEqual(r.partnerName, 'オイカワ センジ');
  assert(r.isPersonName, 'is person');
});

test('R12: パーク24（決済サービス）', () => {
  // ﾊﾟｰｸ 24(ｶ)ﾀｲﾑｽﾞﾍﾟｲ
  const r = resolvePartnerName('ﾊﾟｰｸ 24(ｶ)ﾀｲﾑｽﾞﾍﾟｲ');
  assert(r.normalizedName.includes('パーク'), 'Park');
  assert(!r.isPersonName, 'not person');
});

console.log('\n━━━ 仕様書テストケース ━━━');

test('S01: アフラックAPS (partnerName/matchText)', () => {
  // ｺｳｻﾞﾌﾘｶｴ ｱﾌﾗﾂｸAPS
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ ｱﾌﾗﾂｸAPS');
  assertEqual(r.partnerName, 'アフラツクAPS');
  assertEqual(r.matchText, 'ｱﾌﾗﾂｸAPS');
});

test('S02: SMBC(カ)バルテック (matchTextは法人格除去)', () => {
  // ｺｳｻﾞﾌﾘｶｴ SMBC(ｶ)ﾊﾞﾙﾃﾂｸ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ SMBC(ｶ)ﾊﾞﾙﾃﾂｸ');
  assertEqual(r.partnerName, '㌈バルテツク');
  assertEqual(r.matchText, 'ﾊﾞﾙﾃﾂｸ');
  assert(r.removedAgents.length > 0, 'SMBC tracked');
});

test('S03: DF.ノグチソウケン', () => {
  // ｺｳｻﾞﾌﾘｶｴ DF.ﾉｸﾞﾁｿｳｹﾝ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ DF.ﾉｸﾞﾁｿｳｹﾝ');
  assertEqual(r.partnerName, 'ノグチソウケン');
  assertEqual(r.matchText, 'ﾉｸﾞﾁｿｳｹﾝ');
});

test('S04: MHF)ヤマトウンユ(カ (matchTextから法人格除去)', () => {
  // ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾏﾄｳﾝﾕ(ｶ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾏﾄｳﾝﾕ(ｶ');
  assert(r.partnerName.includes('ヤマトウンユ'), 'partnerName contains name');
  assertEqual(r.partnerName.charCodeAt(r.partnerName.length - 1).toString(16), '3308', 'ends with \u3308');
  // matchText should not have (ｶ (corp suffix)
  assertEqual(r.matchText, 'ﾔﾏﾄｳﾝﾕ');
});

test('S05: MHF)ヤツメセイヤク', () => {
  // ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾂﾒｾｲﾔｸ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ MHF)ﾔﾂﾒｾｲﾔｸ');
  assertEqual(r.partnerName, 'ヤツメセイヤク');
  assertEqual(r.matchText, 'ﾔﾂﾒｾｲﾔｸ');
});

test('S06: RL)ユ)ヒロコーポレーショ (matchTextから法人格除去)', () => {
  // ｺｳｻﾞﾌﾘｶｴ RL)ﾕ)ﾋﾛｺｰﾎﾟﾚｰｼﾖ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ RL)ﾕ)ﾋﾛｺｰﾎﾟﾚｰｼﾖ');
  assert(r.partnerName.includes('㊒'), 'has ㊒');
  assertEqual(r.matchText, 'ﾋﾛｺｰﾎﾟﾚｰｼﾖ');
});

test('S07: クレジット トヨタファイナンス', () => {
  // ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ
  const r = resolvePartnerName('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ');
  assertEqual(r.partnerName, 'トヨタフアイナンス');
  assertEqual(r.matchText, 'ﾄﾖﾀﾌｱｲﾅﾝｽ');
});

test('S08: 代行表現なし ヤツメセイヤク', () => {
  const r = resolvePartnerName('ﾔﾂﾒｾｲﾔｸ');
  assertEqual(r.partnerName, 'ヤツメセイヤク');
  assertEqual(r.matchText, 'ﾔﾂﾒｾｲﾔｸ');
  assertEqual(r.removedAgents.length, 0);
});

test('S09: 人名 イワモト トモアキ (スペース保持)', () => {
  // ｲﾜﾓﾄ ﾄﾓｱｷ
  const r = resolvePartnerName('ｲﾜﾓﾄ ﾄﾓｱｷ');
  assertEqual(r.partnerName, 'イワモト トモアキ');
  assertEqual(r.matchText, 'ｲﾜﾓﾄ ﾄﾓｱｷ');
  assert(r.isPersonName, 'is person');
});

test('S10: originalフィールド', () => {
  const desc = 'ｺｳｻﾞﾌﾘｶｴ DF.ﾉｸﾞﾁｿｳｹﾝ';
  const r = resolvePartnerName(desc);
  assertEqual(r.original, desc);
});

test('S11: removedAgentsトラッキング', () => {
  // ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗ
  const r = resolvePartnerName('ｺｳｻﾞﾌﾘｶｴ DF.ｸﾛﾚﾗ');
  assert(Array.isArray(r.removedAgents), 'is array');
  assert(r.removedAgents.some(a => a.includes('DF')), 'DF tracked');
});

// --- 結果 ---
console.log('\n--- 結果 ---');
console.log('✅ 通過: ' + passed + '件');
if (failed > 0) {
  console.log('❌ 失敗: ' + failed + '件');
  process.exit(1);
} else {
  console.log('全テスト通過 🎉');
}
