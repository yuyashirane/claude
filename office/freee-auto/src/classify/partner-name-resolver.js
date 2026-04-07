/**
 * partner-name-resolver.js
 * 取引先名抽出・正規化モジュール
 *
 * 銀行明細の摘要テキストから取引先名を抽出し、
 * freee取引先タグのルール（partner-tag-rules.md, input-general-rules.md）に
 * 準拠した正規化名を生成する。
 *
 * 主な処理:
 *   1. 引落代行表現（SMBC, DF, MHF, RL, AP, CSS, NSS等）の除去
 *   2. 銀行摘要プレフィックス（IBﾌﾘｺﾐ, ｺｳｻﾞﾌﾘｶｴ等）の除去
 *   3. 半角カタカナ → 全角カタカナ変換
 *   4. 法人格略称の適用（ｶ) → ㈱、ﾕ) → ㈲ 等）
 */

// --------------------------------------------------
// 引落代行プレフィックス
// 銀行の口座振替（ｺｳｻﾞﾌﾘｶｴ）で付与される代行会社コード
// --------------------------------------------------
const AGENCY_PREFIXES = [
  // 「プレフィックス.」または「プレフィックス)」形式
  { pattern: /^DF[.．]/, label: 'DF(ダイレクト)' },
  { pattern: /^MHF\)/, label: 'MHF(みずほファクター)' },
  { pattern: /^SMBC\(/, label: 'SMBC(三井住友)' },
  { pattern: /^SMCC\(/, label: 'SMCC(三井住友カード)' },
  { pattern: /^RL\)/, label: 'RL(りそな)' },
  { pattern: /^AP\(/, label: 'AP(アプラス)' },
  { pattern: /^CSS\(/, label: 'CSS' },
  { pattern: /^NSS[.．]/, label: 'NSS' },
  { pattern: /^NS\s+/, label: 'NS' },
  { pattern: /^RKS\(/, label: 'RKS' },
  { pattern: /^\(HFC\)$/, label: 'HFC(末尾)' },  // 末尾パターンは別処理
];

// 末尾の代行コード
const AGENCY_SUFFIXES = [
  /\(HFC\)$/,
  /\(SMCC$/,
  /\(SMBC$/,
];

// --------------------------------------------------
// 半角カタカナ → 全角カタカナ変換テーブル
// --------------------------------------------------
const HW_TO_FW = {
  '\uff66': '\u30f2', '\uff67': '\u30a1', '\uff68': '\u30a3', '\uff69': '\u30a5',
  '\uff6a': '\u30a7', '\uff6b': '\u30a9', '\uff6c': '\u30e3', '\uff6d': '\u30e5',
  '\uff6e': '\u30e7', '\uff6f': '\u30c3', '\uff70': '\u30fc',
  '\uff71': '\u30a2', '\uff72': '\u30a4', '\uff73': '\u30a6', '\uff74': '\u30a8',
  '\uff75': '\u30aa', '\uff76': '\u30ab', '\uff77': '\u30ad', '\uff78': '\u30af',
  '\uff79': '\u30b1', '\uff7a': '\u30b3', '\uff7b': '\u30b5', '\uff7c': '\u30b7',
  '\uff7d': '\u30b9', '\uff7e': '\u30bb', '\uff7f': '\u30bd', '\uff80': '\u30bf',
  '\uff81': '\u30c1', '\uff82': '\u30c4', '\uff83': '\u30c6', '\uff84': '\u30c8',
  '\uff85': '\u30ca', '\uff86': '\u30cb', '\uff87': '\u30cc', '\uff88': '\u30cd',
  '\uff89': '\u30ce', '\uff8a': '\u30cf', '\uff8b': '\u30d2', '\uff8c': '\u30d5',
  '\uff8d': '\u30d8', '\uff8e': '\u30db', '\uff8f': '\u30de', '\uff90': '\u30df',
  '\uff91': '\u30e0', '\uff92': '\u30e1', '\uff93': '\u30e2', '\uff94': '\u30e4',
  '\uff95': '\u30e6', '\uff96': '\u30e8', '\uff97': '\u30e9', '\uff98': '\u30ea',
  '\uff99': '\u30eb', '\uff9a': '\u30ec', '\uff9b': '\u30ed', '\uff9c': '\u30ef',
  '\uff9d': '\u30f3',
};

// 濁点・半濁点の結合マップ
const DAKUTEN_MAP = {
  '\u30ab': '\u30ac', '\u30ad': '\u30ae', '\u30af': '\u30b0', '\u30b1': '\u30b2', '\u30b3': '\u30b4',
  '\u30b5': '\u30b6', '\u30b7': '\u30b8', '\u30b9': '\u30ba', '\u30bb': '\u30bc', '\u30bd': '\u30be',
  '\u30bf': '\u30c0', '\u30c1': '\u30c2', '\u30c4': '\u30c5', '\u30c6': '\u30c7', '\u30c8': '\u30c9',
  '\u30cf': '\u30d0', '\u30d2': '\u30d3', '\u30d5': '\u30d6', '\u30d8': '\u30d9', '\u30db': '\u30dc',
  '\u30a6': '\u30f4',
};

const HANDAKUTEN_MAP = {
  '\u30cf': '\u30d1', '\u30d2': '\u30d4', '\u30d5': '\u30d7', '\u30d8': '\u30da', '\u30db': '\u30dd',
};

/**
 * 半角カタカナを全角カタカナに変換
 * @param {string} text
 * @returns {string}
 */
function halfToFullKatakana(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const fw = HW_TO_FW[ch];
    if (fw) {
      // 次の文字が濁点(ﾞ)か半濁点(ﾟ)かチェック
      const next = text[i + 1];
      if (next === '\uff9e' && DAKUTEN_MAP[fw]) {
        result += DAKUTEN_MAP[fw];
        i++;
      } else if (next === '\uff9f' && HANDAKUTEN_MAP[fw]) {
        result += HANDAKUTEN_MAP[fw];
        i++;
      } else {
        result += fw;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

// --------------------------------------------------
// 法人格変換テーブル（半角カタカナ → 略称）
// --------------------------------------------------
const CORP_TYPE_MAP = [
  // 半角カタカナの法人格プレフィックス
  { hw: /^[ｶカ][)）]/, full: '\u3308' },       // ㈱
  { hw: /^[ﾕユ][)）]/, full: '\u3292' },       // ㈲
  { hw: /^[ｲイ][)）]/, full: '(医)' },         // 医療法人
  // 法人格サフィックス（閉じ括弧あり）
  { hw: /[ｶカ][)）]$/, full: '\u3308', suffix: true },
  { hw: /[ﾕユ][)）]$/, full: '\u3292', suffix: true },
  // 法人格サフィックス（開き括弧+カナ、閉じ括弧なし — 銀行明細の文字数制限）
  { hw: /[(（][ｶカ]$/, full: '\u3308', suffix: true },
  { hw: /[(（][ﾕユ]$/, full: '\u3292', suffix: true },
];

/**
 * 法人格の略称を適用
 * ｶ)テスト → ㈱テスト, テスト(ｶ → テスト㈱
 * @param {string} name - 全角カタカナ変換済みの名称
 * @returns {string}
 */
function applyCorpAbbrev(name) {
  let result = name;
  for (const rule of CORP_TYPE_MAP) {
    if (rule.suffix) {
      result = result.replace(rule.hw, rule.full);
    } else {
      result = result.replace(rule.hw, rule.full);
    }
  }
  return result;
}

// --------------------------------------------------
// 銀行摘要プレフィックス
// --------------------------------------------------
const BANK_PREFIXES = [
  /^IB\uff8c\uff98\uff7a\uff90\s*/,    // IBﾌﾘｺﾐ
  /^\uff7a\uff73\uff7b\uff9e\uff8c\uff98\uff76\uff74\s*/,  // ｺｳｻﾞﾌﾘｶｴ
  /^\uff7f\uff73\uff77\uff9d\s*/,       // ｿｳｷﾝ
  /^\uff7c\uff9e\uff8c\uff98\s*/,       // ｼﾞﾌﾘ
  /^\uff78\uff9a\uff7c\uff9e\uff82\uff84\s*/, // ｸﾚｼﾞﾂﾄ
  /^JCB\s*/,
  /^\uff8e\uff79\uff9d\uff98\uff96\uff73\s*/, // ﾎｹﾝﾘﾖｳ
  /^\uff83\uff7d\uff73\uff98\uff96\uff73\s*/, // ﾃｽｳﾘﾖｳ
  /^\u96fb\u8a71\u6599\s*/,             // 電話料
];

/**
 * 銀行摘要プレフィックスを除去
 * @param {string} desc
 * @returns {string}
 */
function stripBankPrefix(desc) {
  let result = (desc || '').trim();
  for (const re of BANK_PREFIXES) {
    result = result.replace(re, '');
  }
  return result.trim();
}

/**
 * 引落代行プレフィックスを除去
 * @param {string} body - 銀行プレフィックス除去後のテキスト
 * @returns {{ text: string, removed: string[] }}
 */
function stripAgencyPrefix(body) {
  let result = body;
  const removed = [];
  for (const ap of AGENCY_PREFIXES) {
    if (ap.pattern.test(result)) {
      removed.push(ap.label);
      result = result.replace(ap.pattern, '');
    }
  }
  for (const sf of AGENCY_SUFFIXES) {
    if (sf.test(result)) {
      removed.push('末尾代行コード');
      result = result.replace(sf, '');
    }
  }
  return { text: result.trim(), removed };
}

// --------------------------------------------------
// 法人格の除去（matchText用 — 半角カタカナのまま）
// --------------------------------------------------
const CORP_HW_PATTERNS = [
  /^[\uff76\u30ab][\)）]/,   // ｶ) or カ) 先頭
  /^[\uff95\u30e6][\)）]/,   // ﾕ) or ユ) 先頭
  /^[\uff72\u30a4][\)）]/,   // ｲ) or イ) 先頭
  /[\(（][\uff76\u30ab]$/,   // (ｶ 末尾
  /[\(（][\uff95\u30e6]$/,   // (ﾕ 末尾
];

/**
 * 法人格を除去してコアネームを返す（matchText生成用）
 * @param {string} text - 半角カタカナのテキスト
 * @returns {string}
 */
function stripCorpType(text) {
  let result = text;
  for (const p of CORP_HW_PATTERNS) {
    result = result.replace(p, '');
  }
  return result.trim();
}

// --------------------------------------------------
// メイン: 取引先名抽出
// --------------------------------------------------

/**
 * 銀行明細の摘要から取引先名を抽出・正規化する
 *
 * @param {string} description - 銀行明細の摘要テキスト（半角カタカナ含む）
 * @returns {{
 *   partnerName: string,     // 正規化後の取引先名（全角カタカナ、法人格略称付き）
 *   matchText: string,       // マッチ条件に使うテキスト（代行・法人格除去後、半角カタカナ）
 *   original: string,        // 元の摘要
 *   removedAgents: string[], // 除去した代行表現
 *   rawName: string,         // 代行除去後・カタカナ変換前（後方互換）
 *   normalizedName: string,  // partnerNameのエイリアス（後方互換）
 *   isPersonName: boolean,   // 人名パターンか
 * }}
 */
function resolvePartnerName(description) {
  if (!description || !description.trim()) {
    return {
      partnerName: '', matchText: '', original: description || '',
      removedAgents: [], rawName: '', normalizedName: '', isPersonName: false,
    };
  }

  const original = description;

  // 1. 銀行摘要プレフィックス除去
  let body = stripBankPrefix(description);

  // 2. 引落代行プレフィックス除去
  const agencyResult = stripAgencyPrefix(body);
  body = agencyResult.text;
  const removedAgents = agencyResult.removed;

  // rawNameは代行除去後・カタカナ変換前（法人格あり）
  const rawName = body;

  // matchTextは代行除去+法人格除去後（半角カタカナのまま）
  const matchText = stripCorpType(body);

  // 3. 半角カタカナ → 全角カタカナ
  let normalized = halfToFullKatakana(body);

  // 4. 法人格略称の適用
  normalized = applyCorpAbbrev(normalized);

  // 5. スペース正規化（連続スペースを1つに）
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 6. 人名判定（半角カタカナの姓名パターン）
  const { isPersonName } = require('./transaction-type-classifier');
  const personFlag = isPersonName(body);

  // 人名の場合もスペースは保持する（姓 名の区切りとして必要）

  return {
    partnerName: normalized,
    matchText,
    original,
    removedAgents,
    rawName,
    normalizedName: normalized,
    isPersonName: personFlag,
  };
}

// --------------------------------------------------
// 取引先辞書照合（S6: 多段階取引先抽出）
// --------------------------------------------------

/**
 * 法人格記号を除去してコアネームを返す（全角カタカナ用）
 */
const CORP_FW_PATTERNS = [
  /^\u3308/,    // ㈱（先頭）
  /\u3308$/,    // ㈱（末尾）
  /^\u3292/,    // ㈲（先頭）
  /\u3292$/,    // ㈲（末尾）
  /^合同会社/,
  /^（医）/,
  /^（社）/,
];

function stripCorpTypeFW(text) {
  let result = text;
  for (const p of CORP_FW_PATTERNS) {
    result = result.replace(p, '');
  }
  return result.trim();
}

/**
 * 取引先辞書と多段階照合する
 *
 * 優先順:
 *   1. 完全一致（半角カタカナのままのパターンで、description全体 or コアネーム）
 *   2. 正規化一致（normalizer.jsで正規化後 → 辞書パートナー名で照合）
 *   3. 部分一致（パターンがdescriptionに含まれる）
 *   4. 候補提示のみ（マッチなし → resolvePartnerName()の結果を候補として返す）
 *
 * @param {string} description - 元の摘要テキスト（半角カタカナ含む）
 * @param {Object[]} clientDictRules - 顧問先辞書のルール配列
 * @param {Object} [normResult] - normalize(description)の結果（渡さなければ内部で生成）
 * @returns {{
 *   candidate_partner_name: string,   // 抽出候補（正規化後の名前）
 *   display_partner_name: string,     // 表示用（辞書の正式名称 or 正規化表示名）
 *   partner_confidence: number,       // 取引先の確信度 (0-100)
 *   partner_source: string,           // ヒット元: 'dict_exact' | 'dict_normalized' | 'dict_partial' | 'name_only'
 *   matched_rule: Object|null,        // マッチした辞書ルール
 * }}
 */
function resolvePartnerFromDict(description, clientDictRules, normResult) {
  if (!description || !clientDictRules || clientDictRules.length === 0) {
    return _noMatch(description, normResult);
  }

  // normalizer.jsの結果を取得（遅延require：循環参照回避）
  let norm = normResult;
  if (!norm) {
    const { normalize } = require('./normalizer');
    norm = normalize(description);
  }

  const resolvedBase = resolvePartnerName(description);

  // === 1. 完全一致（半角パターン === description から摘要プレフィックス除去後） ===
  // 銀行摘要除去+代行除去後のrawNameで比較
  const rawBody = resolvedBase.rawName;
  const rawCore = stripCorpType(rawBody);  // 法人格も除去したコア
  for (const rule of clientDictRules) {
    if (!rule.pattern) continue;
    if (rawBody === rule.pattern || rawCore === rule.pattern) {
      return {
        candidate_partner_name: resolvedBase.partnerName,
        display_partner_name: rule.partner || resolvedBase.partnerName,
        partner_confidence: 95,
        partner_source: 'dict_exact',
        matched_rule: rule,
      };
    }
  }

  // === 2. 正規化一致（正規化後のnormalized/displayで辞書partner名と照合） ===
  const normText = norm.normalized;   // 照合用（全角カタカナ、ノイズ除去済）
  const normCore = stripCorpTypeFW(normText);  // 法人格除去
  const dispText = norm.display;      // 表示用

  for (const rule of clientDictRules) {
    if (!rule.partner) continue;
    const rulePartner = rule.partner;
    const ruleCore = stripCorpTypeFW(rulePartner);

    // 正規化後 vs 辞書パートナー名
    if (normText === rulePartner || normCore === ruleCore
        || dispText === rulePartner || dispText === ruleCore) {
      return {
        candidate_partner_name: normText,
        display_partner_name: rulePartner,
        partner_confidence: 85,
        partner_source: 'dict_normalized',
        matched_rule: rule,
      };
    }
  }

  // === 3. 部分一致（パターンがdescriptionに含まれる） ===
  // priority順にソート（高い方を優先）
  const sorted = [...clientDictRules]
    .filter(r => r.pattern)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    const pat = rule.pattern;
    if (description.includes(pat) || rawBody.includes(pat)) {
      return {
        candidate_partner_name: resolvedBase.partnerName,
        display_partner_name: rule.partner || resolvedBase.partnerName,
        partner_confidence: 70,
        partner_source: 'dict_partial',
        matched_rule: rule,
      };
    }
  }

  // === 4. 候補提示のみ（辞書にマッチなし） ===
  return _noMatch(description, norm, resolvedBase);
}

/**
 * 辞書マッチなし時の結果を生成
 */
function _noMatch(description, norm, resolvedBase) {
  if (!resolvedBase && description) {
    resolvedBase = resolvePartnerName(description);
  }
  const displayName = (norm && norm.display) || (resolvedBase && resolvedBase.partnerName) || '';
  return {
    candidate_partner_name: displayName,
    display_partner_name: displayName,
    partner_confidence: 0,
    partner_source: 'name_only',
    matched_rule: null,
  };
}

module.exports = {
  resolvePartnerName,
  resolvePartnerFromDict,
  halfToFullKatakana,
  stripBankPrefix,
  stripAgencyPrefix,
  stripCorpType,
  stripCorpTypeFW,
  applyCorpAbbrev,
};
