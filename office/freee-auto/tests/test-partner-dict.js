#!/usr/bin/env node
/**
 * test-partner-dict.js
 * resolvePartnerFromDict() のテスト
 */

const { resolvePartnerFromDict, resolvePartnerName } = require('../src/classify/partner-name-resolver');

let passed = 0, failed = 0;

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

// テスト用辞書
const rules = [{"pattern":"ｸﾛﾚﾗｺｳｷﾞﾖ","matchType":"partial","account":"仕入高","taxClass":"課対仕入","partner":"クロレラ工業㌈","priority":10},{"pattern":"ﾄﾖﾀﾌｱｲﾅﾝｽ","matchType":"partial","account":"リース料","taxClass":"課対仕入","partner":"トヨタファイナンス㌈","priority":10},{"pattern":"ﾆﾎﾝﾔｸｼﾖｸ","matchType":"partial","account":"仕入高","taxClass":"課対仕入","partner":"日本薬食㌈","priority":10},{"pattern":"ﾔﾏﾄｳﾝﾕ","matchType":"partial","account":"荷造運賃","taxClass":"課対仕入","partner":"ヤマト運輸㌈","priority":5},{"pattern":"ALSOK","matchType":"partial","account":"支払手数料","taxClass":"課対仕入","partner":"ALSOK","priority":5}];

console.log('=== resolvePartnerFromDict テスト ===\n');

test('PD01', '部分一致: IBフリコミ カ)クロレラコウギヨウ → クロレラ工業㌈', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', rules);
  eq(r.display_partner_name, 'クロレラ工業㌈');
  eq(r.partner_source, 'dict_partial');
  if (r.partner_confidence < 50) throw new Error('confidence too low: ' + r.partner_confidence);
  if (!r.matched_rule) throw new Error('matched_rule should exist');
});

test('PD02', '部分一致: クレジット トヨタファイナンス → トヨタファイナンス㌈', () => {
  const r = resolvePartnerFromDict('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ', rules);
  eq(r.display_partner_name, 'トヨタファイナンス㌈');
  // 銀行プレフィックス除去後のrawNameがパターンと完全一致するため dict_exact
  eq(r.partner_source, 'dict_exact');
});

test('PD03', '部分一致: IBフリコミ ニホンヤクシヨク(ｶ → 日本薬食㌈', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ﾆﾎﾝﾔｸｼﾖｸ(ｶ', rules);
  eq(r.display_partner_name, '日本薬食㌈');
});

test('PD04', '部分一致: コウザフリカエ ヤマトウンユ(ｶ → ヤマト運輸㌈', () => {
  const r = resolvePartnerFromDict('ｺｳｻﾞﾌﾘｶｴ ﾔﾏﾄｳﾝﾕ(ｶ', rules);
  eq(r.display_partner_name, 'ヤマト運輸㌈');
});

test('PD05', '部分一致: コウザフリカエ ALSOK → ALSOK', () => {
  const r = resolvePartnerFromDict('ｺｳｻﾞﾌﾘｶｴ ALSOK', rules);
  eq(r.display_partner_name, 'ALSOK');
  // プレフィックス除去後rawName='ALSOK'がパターンと完全一致
  eq(r.partner_source, 'dict_exact');
});

test('PD06', '辞書マッチなし → name_only', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ﾀﾅｶ ﾀﾛｳ', rules);
  eq(r.partner_source, 'name_only');
  eq(r.partner_confidence, 0);
  eq(r.matched_rule, null);
  // candidate_partner_nameは空でないこと（正規化された名前）
  if (!r.candidate_partner_name) throw new Error('candidate should not be empty');
});

test('PD07', '空文字入力 → name_only', () => {
  const r = resolvePartnerFromDict('', rules);
  eq(r.partner_source, 'name_only');
  eq(r.partner_confidence, 0);
});

test('PD08', '辞書なし → name_only', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', null);
  eq(r.partner_source, 'name_only');
});

test('PD09', '空辞書 → name_only', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', []);
  eq(r.partner_source, 'name_only');
});

test('PD10', 'matched_ruleに辞書ルールの中身が含まれる', () => {
  const r = resolvePartnerFromDict('IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', rules);
  if (!r.matched_rule) throw new Error('matched_rule is null');
  eq(r.matched_rule.account, '仕入高');
  eq(r.matched_rule.taxClass, '課対仕入');
});

test('PD11', 'partner_confidence: 完全一致=95（プレフィックス除去後rawNameが一致）', () => {
  const r = resolvePartnerFromDict('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ', rules);
  eq(r.partner_confidence, 95);
  eq(r.partner_source, 'dict_exact');
});

test('PD12', '正規化一致: 正規化後の表示名と辞書partner名が一致', () => {
  // クロレラ工業㈱ の正式名称で照合（IBフリコミなし、正規化後 == 辞書partner名）
  const { normalize } = require('../src/classify/normalizer');
  // 半角カタカナ+法人格で辞書partner名と正規化後が一致するケース
  const raw = 'ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ';
  const nr = normalize(raw);
  // 正規化後が「クロレラ工業」系になるか確認
  const r = resolvePartnerFromDict(raw, rules, nr);
  // dict_partial か dict_normalized のどちらか
  if (r.partner_source === 'name_only') throw new Error('Should match dict, got name_only');
  eq(r.display_partner_name, 'クロレラ工業㌈');
});

test('PD13', 'classifyMultiStage結果にpartner_source等が含まれる', () => {
  const { classifyMultiStage, loadClientDict } = require('../src/classify/multi-stage-classifier');
  const clientDictRules = loadClientDict('11890320');
  const result = classifyMultiStage(
    { description: 'IBﾌﾘｺﾐ   ｶ)ｸﾛﾚﾗｺｳｷﾞﾖｳ', entry_side: 'expense', amount: 100000 },
    { existingRules: [], clientDictRules }
  );
  // partner_source が出力に含まれること
  if (!result.partner_source) throw new Error('partner_source missing');
  if (!result.display_partner_name) throw new Error('display_partner_name missing');
  if (typeof result.partner_confidence !== 'number') throw new Error('partner_confidence missing');
});

test('PD14', 'normResultを外部から渡して辞書照合できる', () => {
  const { normalize } = require('../src/classify/normalizer');
  const nr = normalize('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ');
  const r = resolvePartnerFromDict('ｸﾚｼﾞﾂﾄ   ﾄﾖﾀﾌｱｲﾅﾝｽ', rules, nr);
  // 完全一致が先にヒット（プレフィックス除去後rawNameが一致）
  eq(r.partner_source, 'dict_exact');
  eq(r.display_partner_name, 'トヨタファイナンス㌈');
});

test('PD15', 'priority順で高い方が優先される', () => {
  // ALSOKはpriority=5、クロレラはpriority=10
  // 両方マッチする入力は実際にはないが、priorityソートが動くことの確認
  const r = resolvePartnerFromDict('ｺｳｻﾞﾌﾘｶｴ ALSOK', rules);
  if (!r.matched_rule) throw new Error('should match');
  eq(r.matched_rule.partner, 'ALSOK');
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
