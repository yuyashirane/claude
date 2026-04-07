/**
 * multi-stage-classifier.js
 * 多段階推測オーケストレーター
 *
 * Phase A（取引類型判定）→ Phase B（多段階推測）→ Phase C（取引先・品目生成）を統合。
 * 既存の classifyTransaction() を置き換える新フローのエントリポイント。
 *
 * 設計原則:
 *   1. 税区分も勘定科目と同じ多段階推測
 *   2. 人名パターンは「個人宛支払」の中間類型。即「給料手当」にしない
 *   3. 既存ルール照合は条件全体（7項目）を見る
 *   4. 初回は安全側。全件「推測する」or「要確認」
 *   5. 未判定は「要確認」。��費フォールバック禁止
 */

const { classifyTransactionType, stripPrefix } = require('./transaction-type-classifier');
const { matchExistingRules, loadRuleCsv } = require('./existing-rule-matcher');
const { resolvePartnerName, resolvePartnerFromDict } = require('./partner-name-resolver');

// 既存の account-matcher.js からキーワード辞書を利用（Phase B ⑤）
// classifyTransaction は直接使わず、matchKeywords相当のロジックを再利用
const { FREEE_ACCOUNT_IDS, TAX_CLASS_TO_CODE } = require('./account-matcher');

// S8: 信頼度サブスコア算出
const { calculateConfidence } = require('./confidence-calculator');

// --------------------------------------------------
// Phase B: 多段階推測の優先順位
//   ① 既存自動登録ルール照合
//   ② freee過去取引パターン照合（buildPatternStoreの結果）
//   ③ 顧問先固有辞書
//   ④ 業種辞書（Phase 2で実装予定）
//   ⑤ 一般キーワード辞書（22科目）
//   ⑥ 未判定（「要確認」フラグ）
// --------------------------------------------------

/**
 * 顧問先固有辞書を読み込む
 * @param {string} companyId
 * @param {string} [baseDir] - data/client-dicts/ のベースパス
 * @returns {Object[]} ルール配列
 */
function loadClientDict(companyId, baseDir) {
  const fs = require('fs');
  const path = require('path');
  const dictDir = baseDir || path.join(__dirname, '..', '..', 'data', 'client-dicts');
  const dictPath = path.join(dictDir, `${companyId}.json`);

  if (!fs.existsSync(dictPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    return data.rules || [];
  } catch {
    return [];
  }
}

/**
 * 顧問先固有辞書との照合
 * @param {string} description - 摘���テキスト（半角カタカナのまま）
 * @param {Object[]} dictRules - loadClientDict()の出力
 * @returns {Object|null}
 */
function matchClientDict(description, dictRules) {
  if (!dictRules || dictRules.length === 0) return null;

  // 優先度の高い順にソート
  const sorted = [...dictRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    if (!rule.pattern) continue;

    let matched = false;
    const matchType = rule.matchType || 'partial';

    if (matchType === 'exact') {
      matched = description.trim() === rule.pattern;
    } else if (matchType === 'prefix') {
      matched = description.includes(rule.pattern) && description.indexOf(rule.pattern) < 20;
    } else {
      // partial（デフォルト）
      matched = description.includes(rule.pattern);
    }

    if (matched) {
      return {
        account: rule.account || null,
        taxClass: rule.taxClass || null,
        partner: rule.partner || null,
        item: rule.item || null,
        confidence: 85,
        source: 'client_dict',
        matchedPattern: rule.pattern,
        note: rule.reason || `顧問先固有辞書一致`,
      };
    }
  }

  return null;
}

/**
 * 既存account-matcherのキーワード辞書で照合（Phase B ⑤）
 * classifyTransaction()の内部ロジックを再利用するが、
 * 雑費フォールバックは行わない。
 *
 * @param {string} description - 摘要テキスト
 * @param {string} entry_side - 'income' | 'expense'
 * @returns {Object|null}
 */
function matchGeneralKeywords(description, entry_side) {
  // account-matcher.js の ACCOUNT_KEYWORDS を直接参照
  const { classifyTransaction } = require('./account-matcher');

  // 一時的なitemオブジェクトで classifyTransaction を呼び出す
  // amount=0は除外判定されるため、ダミー値を設定
  const tempItem = {
    transaction: {
      description,
      partner_name: '',
      amount: 1000,
      entry_side: entry_side || 'expense',
    },
  };

  classifyTransaction(tempItem, { pastPatternScore: 0 });

  const cls = tempItem.classification;

  // 「雑費」はフォールバック結果なので採用しない（設計原則5）
  if (!cls || cls.estimated_account === '雑費' || cls.excluded) {
    return null;
  }

  return {
    account: cls.estimated_account,
    taxClass: cls.estimated_tax_class,
    confidence: Math.min(cls.confidence_score, 65), // キーワード辞書の上限は65
    source: 'general_keywords',
    note: `一般キーワード辞書（${cls.matched_accounts?.[0]?.matchedKeywords?.join(',') || '?'}）`,
  };
}

/**
 * 過去取引パターンとの照合（Phase B ②）
 * @param {Object|null} pastPatternMatch - patternStore.matchPattern()の結果
 * @param {number} pastPatternScore - patternStore.calculatePastPatternScore()の結果
 * @returns {Object|null}
 */
function matchPastPattern(pastPatternMatch, pastPatternScore) {
  if (!pastPatternMatch || pastPatternScore <= 0) return null;

  return {
    account: pastPatternMatch.accountName || null,
    taxClass: pastPatternMatch.taxClassName || null,
    partner: pastPatternMatch.partnerName || null,
    confidence: Math.min(50 + pastPatternScore, 80),
    source: 'past_pattern',
    note: `過去取引パターン（スコア: ${pastPatternScore}）`,
  };
}

// --------------------------------------------------
// Phase B: 勘定科目・税区分の独立推測
// --------------------------------------------------

/**
 * 勘定科目と税区分をそれぞれ独立に多段階推測する
 * 科目は①で解決、税区分は③で解決、というケースを許容する
 *
 * @param {Object} item - 正規化済み明細
 * @param {string} desc - 摘要テキスト
 * @param {string} entrySide - 'income' | 'expense'
 * @param {string} entrySideJa - '収入' | '支出'
 * @param {Object} options
 * @returns {{ account, accountSource, accountConf, taxClass, taxClassSource, taxClassConf, item, partner, reasoning[] }}
 */
function resolveAccountAndTax(item, desc, entrySide, entrySideJa, options) {
  let account = null, accountSource = 'unmatched', accountConf = 0;
  let taxClass = null, taxClassSource = 'unmatched', taxClassConf = 0;
  let itemTag = null, partnerTag = null;
  const reasoning = [];

  // 推測ソース一覧（優先順に試行）
  const sources = [];

  // ① 既存自動登録ルール照合
  if (options.existingRules) {
    const ruleMatch = matchExistingRules({
      description: desc,
      entrySideJa,
      walletableName: item.walletable_name || '',
      amount: Math.abs(item.amount || 0),
    }, options.existingRules);
    if (ruleMatch && ruleMatch.account !== '雑費') {
      sources.push({ ...ruleMatch, _source: 'existing_rule', _conf: 92 });
    }
  }

  // ② 過去取引パターン照合
  const pastMatch = matchPastPattern(
    options.pastPatternMatch,
    options.pastPatternScore || 0
  );
  if (pastMatch && pastMatch.account) {
    sources.push({ ...pastMatch, _source: 'past_pattern', _conf: pastMatch.confidence });
  }

  // ③ 顧問先固有辞書
  if (options.clientDictRules) {
    const dictMatch = matchClientDict(desc, options.clientDictRules);
    if (dictMatch) {
      sources.push({ ...dictMatch, _source: 'client_dict', _conf: 80 });
    }
  }

  // ④ 業種辞書（Phase 2で実装予定 → スキップ）

  // ⑤ 一般キーワード辞書（22科目）
  const kwMatch = matchGeneralKeywords(desc, entrySide);
  if (kwMatch && kwMatch.account) {
    sources.push({ ...kwMatch, _source: 'general_keywords', _conf: kwMatch.confidence });
  }

  // 独立推測: 各ソースを優先順に走査し、未解決の項目だけ埋める
  for (const src of sources) {
    // 勘定科目
    if (!account && src.account && src.account !== '雑費') {
      account = src.account;
      accountSource = src._source;
      accountConf = src._conf;
      reasoning.push(`科目: ${src._source}（${src.account}）`);
    }
    // 税区分
    if (!taxClass && src.taxClass) {
      taxClass = src.taxClass;
      taxClassSource = src._source;
      taxClassConf = src._conf;
      reasoning.push(`税区分: ${src._source}（${src.taxClass}）`);
    }
    // 品目タグ（最初に見つかったものを採用）
    if (!itemTag && src.item) {
      itemTag = src.item;
    }
    // 取引先名（最初に見つかったものを採用）
    if (!partnerTag && src.partner) {
      partnerTag = src.partner;
    }
    // 両方解決したら早期リターン
    if (account && taxClass) break;
  }

  // ⑥ 未判定 — 雑費にしない、null + 要確認
  if (!account) {
    reasoning.push('科目: 未判定（既存ルール・辞書・キーワードいずれにもマッチせず）');
  }
  if (!taxClass) {
    reasoning.push('税区分: 未判定');
  }

  return {
    account, accountSource, accountConf,
    taxClass, taxClassSource, taxClassConf,
    item: itemTag, partner: partnerTag,
    reasoning,
  };
}

// --------------------------------------------------
// Phase C: マッチ条件の生成
// --------------------------------------------------

/**
 * マッチ条件（完全一致/部分一致）とマッチテキストを決定
 * @param {Object} item - 元明細
 * @param {Object} resolvedPartner - resolvePartnerName()の結果
 * @param {string} source - 推測ソース
 * @returns {{ matchCondition: string, matchText: string }}
 */
function determineMatchCondition(item, resolvedPartner, source) {
  // 既存ルール一致 or 顧問先辞書一致 → 部分一致（安定したパターン）
  if (source === 'existing_rule' || source === 'client_dict' || source === 'past_pattern') {
    return {
      matchCondition: '部分一致',
      matchText: resolvedPartner.matchText || resolvedPartner.rawName || stripPrefix(item.description || ''),
    };
  }

  // それ以外 → 完全一致（一回限り）
  return {
    matchCondition: '完全一致',
    matchText: item.description || '',
  };
}

// --------------------------------------------------
// アクション決定（初回は安全側）
// --------------------------------------------------

/**
 * マッチ後のアクションを決定
 * フェーズ1では「取引を登録する」は使わない（設計原則4）
 * autoConfirmBlocked: true の場合はスコアに関わらず null（要確認）
 * @param {number} confidence
 * @param {boolean} [autoConfirmBlocked=false]
 * @returns {string}
 */
function determineAction(confidence, autoConfirmBlocked) {
  // autoConfirmBlocked は常に要確認
  if (autoConfirmBlocked) return null;
  // フェーズ1: 「取引を登録する」は使わない
  if (confidence >= 45) return '取引を推測する';
  return null; // 要確認（CSVに含めない）
}

// --------------------------------------------------
// メイン: 多段階分類
// --------------------------------------------------

/**
 * 多段階推測オーケストレーター
 *
 * @param {Object} item - 正規化済み明細
 * @param {string} item.description - 摘要テキスト（半角カタカナ含む）
 * @param {string} item.entry_side - 'income' | 'expense'
 * @param {string} item.walletable_type - 'bank_account' | 'credit_card' | 'wallet'
 * @param {string} item.walletable_name - 口座名
 * @param {number} item.amount - 金額
 * @param {Object} [options]
 * @param {Object[]} [options.existingRules] - loadRuleCsv()で読み込んだ既存ルール
 * @param {Object[]} [options.clientDictRules] - loadClientDict()で読み込んだ顧問先辞書
 * @param {string[]} [options.ownAccountNames] - 自社口座名一覧
 * @param {Object} [options.pastPatternMatch] - 過去パターンマッチ結果
 * @param {number} [options.pastPatternScore] - 過去パターンスコア
 * @returns {Object} 多段階推測結果
 */
function classifyMultiStage(item, options = {}) {
  const desc = item.description || '';
  const entrySide = item.entry_side || 'expense';
  const entrySideJa = entrySide === 'income' ? '収入' : '支出';

  // --- Phase A: 取引類型判定 ---
  const typeResult = classifyTransactionType(item, options.ownAccountNames);

  // --- Phase B: 多段階推測 ---
  let bestMatch = null;

  // 複合仕訳系（LOAN_REPAY, ATM, CREDIT_PULL, TRANSFER）は
  // 科目を固定的に推測
  if (typeResult.type === 'ATM') {
    bestMatch = {
      account: null, taxClass: null,
      confidence: 90, source: 'type_rule',
      note: 'ATM: 振替口座（現金）への振替。自動登録ルールでは対応不可',
      transferAccount: '現金',
    };
  } else if (typeResult.type === 'CREDIT_PULL') {
    bestMatch = {
      account: null, taxClass: null,
      confidence: 90, source: 'type_rule',
      note: 'クレカ引落: クレカ口座への振替。自動登録ルールでは対応不可',
    };
  } else if (typeResult.type === 'LOAN_REPAY') {
    bestMatch = {
      account: null, taxClass: null,
      confidence: 80, source: 'type_rule',
      note: typeResult.note,
    };
  } else if (typeResult.type === 'SOCIAL_INSURANCE') {
    bestMatch = {
      account: null, taxClass: null,
      confidence: 85, source: 'type_rule',
      note: '社会保険料。預り金/法定福利費の複合仕訳。単純経費扱い禁止',
    };
  } else if (typeResult.type === 'TRANSFER') {
    bestMatch = {
      account: null, taxClass: null,
      confidence: 85, source: 'type_rule',
      note: typeResult.note,
    };
  } else {
    // EXPENSE / PERSONAL_PAYMENT / SALES_IN → 多段階推測
    // 勘定科目と税区分をそれぞれ独立に推測する
    const resolved = resolveAccountAndTax(item, desc, entrySide, entrySideJa, options);

    // SALES_IN の場合は売上高候補を強化
    if (typeResult.type === 'SALES_IN' && !resolved.account) {
      resolved.account = '売上高';
      resolved.accountSource = resolved.accountSource === 'unmatched' ? 'type_rule' : resolved.accountSource;
      resolved.accountConf = Math.max(resolved.accountConf, 60);
      resolved.reasoning.push('売上入金パターン → 売上高推測');
    }
    if (typeResult.type === 'SALES_IN' && !resolved.taxClass) {
      resolved.taxClass = '課税売上10%';
      resolved.taxClassSource = resolved.taxClassSource === 'unmatched' ? 'type_rule' : resolved.taxClassSource;
      resolved.taxClassConf = Math.max(resolved.taxClassConf, 60);
    }

    bestMatch = {
      account: resolved.account,
      taxClass: resolved.taxClass,
      confidence: Math.max(resolved.accountConf, resolved.taxClassConf),
      source: resolved.accountSource,
      taxClassSource: resolved.taxClassSource,
      accountConfidence: resolved.accountConf,
      taxClassConfidence: resolved.taxClassConf,
      note: resolved.reasoning.join(' / '),
      item: resolved.item,
      partner: resolved.partner,
    };
  }

  // --- Phase C: 取引先・品目・マッチ条件の生成 ---
  const resolvedPartner = resolvePartnerName(desc);

  // S6: 多段階取引先辞書照合（normalizer結果を活用）
  let normResult = null;
  try {
    const { normalize } = require('./normalizer');
    normResult = normalize(desc);
  } catch { /* normalizer未利用時は null */ }

  const dictPartner = resolvePartnerFromDict(desc, options.clientDictRules || [], normResult);

  // 取引先名の決定: bestMatch(科目推測時) > 辞書照合 > 基本正規化
  let partnerName;
  if (bestMatch.partner) {
    partnerName = bestMatch.partner;
  } else if (dictPartner.partner_source !== 'name_only') {
    partnerName = dictPartner.display_partner_name;
  } else {
    partnerName = (normResult && normResult.display) || resolvedPartner.partnerName || '';
  }

  const matchCond = determineMatchCondition(item, resolvedPartner, bestMatch.source);

  // 税区分ソースの独立管理（resolveAccountAndTax経由の場合は独立ソースあり）
  const taxClassSource = bestMatch.taxClassSource || bestMatch.source;
  const taxClassConfidence = bestMatch.taxClassConfidence
    ?? (bestMatch.taxClass ? bestMatch.confidence : 0);
  const accountConfidence = bestMatch.accountConfidence ?? bestMatch.confidence;

  // S8: サブスコア算出による信頼度再設計
  const isBlocked = typeResult.autoConfirmBlocked || false;
  const confidenceResult = calculateConfidence({
    transactionType: typeResult.type,
    partnerSource: dictPartner.partner_source,
    pastPatternScore: options.pastPatternScore || 0,
    accountSource: bestMatch.source,
    item,
    normResult,
    classificationResult: {
      taxClass: bestMatch.taxClass,
      item: bestMatch.item,
      itemTag: bestMatch.item,
    },
  });
  const overallConfidence = confidenceResult.totalConfidence;

  // autoConfirmBlocked の場合はスコアに関わらず action=null
  const action = determineAction(overallConfidence, isBlocked);

  // 結果オブジェクト
  return {
    // 取引類型（Phase A）
    transactionType: typeResult.type,
    transactionTypeConfidence: typeResult.confidence,
    transactionTypeNote: typeResult.note,

    // 勘定科目推測（Phase B）
    account: bestMatch.account || null,
    accountSource: bestMatch.source,
    accountConfidence,

    // 税区分推測（Phase B — 勘定科目と独立して推測）
    taxClass: bestMatch.taxClass || null,
    taxClassSource,
    taxClassConfidence,

    // 取引先（Phase C）— partnerResult(ネスト) + partner(フラット/後方互換)
    partner: partnerName,
    partnerResult: resolvedPartner,
    isPersonName: resolvedPartner.isPersonName,

    // S6: 取引先辞書照合結果
    candidate_partner_name: dictPartner.candidate_partner_name,
    display_partner_name: dictPartner.display_partner_name,
    partner_confidence: dictPartner.partner_confidence,
    partner_source: dictPartner.partner_source,

    // 正規化結果
    normResult: normResult || null,

    // 品目（Phase C）
    item: bestMatch.item || null,
    itemTag: bestMatch.item || null,

    // マッチ条件（Phase C）
    matchCondition: matchCond.matchCondition,
    matchText: matchCond.matchText,

    // アクション（初回は安全側）
    action,

    // 振替口座（ATM等の場合）
    transferAccount: bestMatch.transferAccount || null,

    // S8: 全体信頼度（サブスコア合算）
    overallConfidence,
    totalConfidence: confidenceResult.totalConfidence,
    subScores: confidenceResult.subScores,

    // 自動確定禁止フラグ（Phase A由来）
    autoConfirmBlocked: isBlocked,

    // 源泉徴収対象可能性（PERSONAL_PAYMENT）
    withholdingPossible: typeResult.withholdingPossible || false,

    // 推測理由
    note: bestMatch.note,
    reasoning: bestMatch.note,
  };
}

// --------------------------------------------------
// アダプター: 既存 classification 形式への変換
// --------------------------------------------------

/**
 * multi-stage-classifierの出力を既存のitem.classification形式に変換
 * これにより既存のCSV生成パイプラインが壊れない
 *
 * @param {Object} msResult - classifyMultiStage()の戻り値
 * @returns {Object} 既存classification形式 + _multiStage拡張
 */
function toClassificationFormat(msResult) {
  const account = msResult.account || '要確認';
  const taxClass = msResult.taxClass || '要確認';

  return {
    // 既存フィールド（CSV生成パイプライン互換）
    estimated_account: account,
    estimated_account_id: FREEE_ACCOUNT_IDS[account] || null,
    estimated_tax_class: taxClass,
    estimated_tax_code: TAX_CLASS_TO_CODE[taxClass] || 0,
    invoice_class: null, // Phase 2で実装
    confidence_score: msResult.overallConfidence,
    confidence_rank: msResult.overallConfidence >= 75 ? 'High'
      : msResult.overallConfidence >= 45 ? 'Medium' : 'Low',
    score_breakdown: msResult.subScores || {
      keyword_match: 0,
      past_pattern: 0,
      amount_validity: 0,
      tax_rule_clarity: 0,
      description_quality: 0,
    },
    tax_flags: [],
    tax_flag_details: [],
    special_flags: [],
    matched_accounts: [],
    routing_reason: `${msResult.transactionType} / ${msResult.accountSource} / ${msResult.note}`,

    // 除外フラグ（複合仕訳系）
    excluded: ['LOAN_REPAY', 'ATM', 'CREDIT_PULL', 'TRANSFER', 'SOCIAL_INSURANCE'].includes(msResult.transactionType),
    exclude_reason: ['LOAN_REPAY', 'ATM', 'CREDIT_PULL', 'TRANSFER', 'SOCIAL_INSURANCE'].includes(msResult.transactionType)
      ? msResult.note : null,

    // 品目タグ
    item_tag: msResult.item || '',

    // 新フィールド（元データ保持）
    _multiStage: msResult,
  };
}

module.exports = {
  classifyMultiStage,
  toClassificationFormat,
  resolveAccountAndTax,
  loadClientDict,
  matchClientDict,
  matchGeneralKeywords,
  matchPastPattern,
  determineMatchCondition,
  determineAction,
};
