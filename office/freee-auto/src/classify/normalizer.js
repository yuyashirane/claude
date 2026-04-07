/**
 * normalizer.js
 * 正規化エンジン
 *
 * 銀行明細・カード明細の元文字列を、照合用と表示用に正規化する。
 * 原文は絶対に破壊しない。適用ルールの履歴を保持する。
 *
 * 処理順序:
 *   1. Unicode正規化（ハイフン・括弧類の統一）
 *   2. 余分な空白整理
 *   3. 半角カナ→全角カナ
 *   4. 記号統一
 *   5. 法人種別記号統一
 *   6. 小文字補正（辞書優先）
 *   7. ノイズ除去（プレフィックス・サフィックス）
 *   8. 定型語辞書変換
 *   9. 固有名詞辞書変換
 *   10. 表示整形
 */

const { halfToFullKatakana } = require('./partner-name-resolver');
const { KANA_CORRECTIONS } = require('./dictionaries/kana-corrections');
const { NOISE_PREFIXES, AGENCY_PREFIXES, NOISE_SUFFIXES } = require('./dictionaries/noise-patterns');
const { TYPE_KEYWORDS } = require('./dictionaries/type-keywords');
const { PROPER_NAMES, SPECIAL_SUFFIX_MAP } = require('./dictionaries/proper-names');

// ==================================================
// 1. Unicode正規化
// ==================================================

const UNICODE_NORMALIZE = [
  // ハイフン類 → 長音（カタカナ文脈）
  [/[\u002D\uFF0D\u2010\u2012\u2013\u2014\u2015\u2212\uFE63\uFF70]/g, 'ー'],
  // 全角チルダ・波ダッシュ
  [/[\uFF5E\u301C]/g, '〜'],
];

function normalizeUnicode(text) {
  let result = text;
  for (const [pattern, replacement] of UNICODE_NORMALIZE) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ==================================================
// 2. 空白整理
// ==================================================

function cleanWhitespace(text) {
  return text
    .replace(/[\t\r\n]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\u3000/g, ' ')
    .trim();
}

// ==================================================
// 4. 記号統一
// ==================================================

function unifySymbols(text) {
  let result = text;
  result = result.replace(/\(/g, '（').replace(/\)/g, '）');
  result = result.replace(/\uFF0E/g, '.');
  return result;
}

// ==================================================
// 5. 法人種別記号統一
// ==================================================

const CORP_NORMALIZE = [
  // ㌎ → ㌈
  { pattern: /\u330E/g, replacement: '㌈' },
  // （カ） → ㌈
  { pattern: /\uFF08カ\uFF09/g, replacement: '㌈' },
  // カ）先頭 → ㌈
  { pattern: /^カ\uFF09/, replacement: '㌈' },
  // （カ 末尾 → ㌈
  { pattern: /\uFF08カ$/, replacement: '㌈' },
  // （ユ） → ㊒
  { pattern: /\uFF08ユ\uFF09/g, replacement: '㊒' },
  // ユ）先頭 → ㊒
  { pattern: /^ユ\uFF09/, replacement: '㊒' },
  // （ユ 末尾 → ㊒
  { pattern: /\uFF08ユ$/, replacement: '㊒' },
  // ゴ）先頭 → 合同会社
  { pattern: /^ゴ\uFF09/, replacement: '合同会社' },
];

function normalizeCorpType(text) {
  let result = text;
  for (const rule of CORP_NORMALIZE) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

// ==================================================
// 6. 小文字補正（辞書優先: 一律変換しない）
// ==================================================

// 小文字補正辞書（外部ファイルから読み込み）
const KOMOJI_SAFE_PAIRS = KANA_CORRECTIONS;

function correctSmallKana(text) {
  let result = text;
  for (const [from, to] of KOMOJI_SAFE_PAIRS) {
    result = result.split(from).join(to);
  }
  return result;
}

// ==================================================
// 7. ノイズ除去
// ==================================================

// ノイズ除去パターン（外部ファイルから読み込み）
const FULL_NOISE_PREFIXES = NOISE_PREFIXES;
const FULL_AGENCY_PREFIXES = AGENCY_PREFIXES;
// NOISE_SUFFIXES は直接使用（上部で require 済み）

function removeNoise(text) {
  let result = text;
  const removedPrefixes = [];
  const removedSuffixes = [];

  for (const np of FULL_NOISE_PREFIXES) {
    if (np.pattern.test(result)) {
      removedPrefixes.push(np.label);
      result = result.replace(np.pattern, '');
    }
  }

  for (const ap of FULL_AGENCY_PREFIXES) {
    if (ap.pattern.test(result)) {
      removedPrefixes.push(ap.label);
      result = result.replace(ap.pattern, '');
    }
  }

  for (const sp of NOISE_SUFFIXES) {
    if (sp.test(result)) {
      removedSuffixes.push('末尾ノイズ');
      result = result.replace(sp, '');
    }
  }

  return { cleaned: result.trim(), removedPrefixes, removedSuffixes };
}

// ==================================================
// 8. 定型語辞書（一般語→漢字化）
// ==================================================

// 定型語辞書（外部ファイルから読み込み）
const TEIKEI_DICT = TYPE_KEYWORDS;

function applyTeikeiDict(text) {
  for (const [from, to] of TEIKEI_DICT) {
    if (text === from) return { result: to, matched: true, dictType: 'teikei' };
  }
  return { result: text, matched: false, dictType: null };
}

// ==================================================
// 9. 固有名詞辞書
// ==================================================

// 固有名詞辞書（外部ファイルから読み込み）
const KOYUU_DICT = PROPER_NAMES;
// SPECIAL_SUFFIX_MAP は直接使用（上部で require 済み）

// 法人格記号のパターン（前後に付く㈱, ㈲, 合同会社 等）
const CORP_SYMBOLS = [
  { pattern: /^\u3308/, pos: 'prefix', symbol: '\u3308' },   // ㈱（先頭）
  { pattern: /\u3308$/, pos: 'suffix', symbol: '\u3308' },   // ㈱（末尾）
  { pattern: /^\u3292/, pos: 'prefix', symbol: '\u3292' },   // ㈲（先頭）
  { pattern: /\u3292$/, pos: 'suffix', symbol: '\u3292' },   // ㈲（末尾）
  { pattern: /^合同会社/, pos: 'prefix', symbol: '合同会社' },
];

/**
 * 法人格を分離してコアネームを返す
 * @returns {{ core: string, prefix: string, suffix: string }}
 */
function splitCorpType(text) {
  let core = text;
  let prefix = '';
  let suffix = '';
  for (const cs of CORP_SYMBOLS) {
    if (cs.pos === 'prefix' && cs.pattern.test(core)) {
      prefix = cs.symbol;
      core = core.replace(cs.pattern, '');
      break;
    }
    if (cs.pos === 'suffix' && cs.pattern.test(core)) {
      suffix = cs.symbol;
      core = core.replace(cs.pattern, '');
      break;
    }
  }
  return { core, prefix, suffix };
}

function applyKoyuuDict(text) {
  // 完全一致
  for (const [key, display] of KOYUU_DICT) {
    if (text === key) {
      return { result: display, matched: true, dictType: 'koyuu' };
    }
  }

  // 法人格を分離してコアネームで再検索
  const { core, prefix, suffix } = splitCorpType(text);
  if (core !== text) {
    for (const [key, display] of KOYUU_DICT) {
      if (core === key) {
        // 辞書の表示名に法人格を付与して返す
        const result = prefix ? prefix + display : display + suffix;
        return { result, matched: true, dictType: 'koyuu' };
      }
    }
  }

  // APSサフィックス等
  for (const sp of SPECIAL_SUFFIX_MAP) {
    if (text.endsWith(sp.suffix)) {
      return { result: sp.display, matched: true, dictType: 'koyuu_suffix' };
    }
  }

  return { result: text, matched: false, dictType: null };
}

// ==================================================
// 10. 表示整形
// ==================================================

function formatDisplay(text) {
  // パーク24㈱xxx → xxx（パーク24㈱）
  const park24head = 'パーク24㌈';
  if (text.startsWith(park24head) && text.length > park24head.length) {
    const rest = text.slice(park24head.length);
    return rest + '（パーク24㌈）';
  }

  return text;
}

// ==================================================
// メイン: normalize()
// ==================================================

/**
 * 明細文字列を正規化する
 *
 * @param {string} rawText - 元の明細文字列
 * @returns {{
 *   raw: string,              // 元文字列（不変）
 *   normalized: string,       // 照合用文字列（ノイズ除去+正規化後）
 *   display: string,          // 表示用文字列（人が読む形）
 *   rulesApplied: string[],   // 適用ルール履歴
 * }}
 */
function normalize(rawText) {
  if (!rawText || !rawText.trim()) {
    return { raw: rawText || '', normalized: '', display: '', rulesApplied: [] };
  }

  const raw = rawText;
  const rulesApplied = [];
  let text = rawText;

  // Step 1: Unicode正規化
  const afterUnicode = normalizeUnicode(text);
  if (afterUnicode !== text) rulesApplied.push('Unicode正規化');
  text = afterUnicode;

  // Step 2: 空白整理
  const afterWs = cleanWhitespace(text);
  if (afterWs !== text) rulesApplied.push('空白整理');
  text = afterWs;

  // Step 3: 半角カナ→全角カナ
  const afterKana = halfToFullKatakana(text);
  if (afterKana !== text) rulesApplied.push('半角→全角カナ');
  text = afterKana;

  // Step 4: 記号統一
  const afterSymbol = unifySymbols(text);
  if (afterSymbol !== text) rulesApplied.push('記号統一');
  text = afterSymbol;

  // Step 5: 法人種別記号統一
  const afterCorp = normalizeCorpType(text);
  if (afterCorp !== text) rulesApplied.push('法人種別統一');
  text = afterCorp;

  // Step 6: 小文字補正（辞書優先）
  const afterKomoji = correctSmallKana(text);
  if (afterKomoji !== text) rulesApplied.push('小文字補正');
  text = afterKomoji;

  // Step 7: ノイズ除去
  const noiseResult = removeNoise(text);
  if (noiseResult.removedPrefixes.length > 0 || noiseResult.removedSuffixes.length > 0) {
    rulesApplied.push('ノイズ除去');
  }
  text = noiseResult.cleaned;

  // Step 7.5: ノイズ除去後に法人格統一を再適用
  // （プレフィックス除去で露出した先頭の「カ）」等を処理するため）
  const afterCorpRetry = normalizeCorpType(text);
  if (afterCorpRetry !== text && !rulesApplied.includes('法人種別統一')) {
    rulesApplied.push('法人種別統一');
  }
  text = afterCorpRetry;

  // normalizedはここまでの結果（照合用）
  const normalized = text;

  // Step 8: 定型語辞書
  let display = text;
  const teikei = applyTeikeiDict(display);
  if (teikei.matched) {
    rulesApplied.push('定型語辞書');
    display = teikei.result;
  }

  // Step 9: 固有名詞辞書（定型語でマッチしなかった場合）
  if (!teikei.matched) {
    const koyuu = applyKoyuuDict(display);
    if (koyuu.matched) {
      rulesApplied.push('固有名詞辞書');
      display = koyuu.result;
    }
  }

  // Step 10: 表示整形
  const afterFormat = formatDisplay(display);
  if (afterFormat !== display) {
    rulesApplied.push('表示整形');
  }
  display = afterFormat;

  return { raw, normalized, display, rulesApplied };
}

module.exports = {
  normalize,
  normalizeUnicode,
  cleanWhitespace,
  halfToFullKatakana,
  unifySymbols,
  normalizeCorpType,
  correctSmallKana,
  removeNoise,
  applyTeikeiDict,
  applyKoyuuDict,
  formatDisplay,
  TEIKEI_DICT,
  KOYUU_DICT,
};
