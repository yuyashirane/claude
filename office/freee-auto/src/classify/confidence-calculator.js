/**
 * confidence-calculator.js
 * 信頼度サブスコア算出モジュール（S8: 信頼度スコア再設計）
 *
 * 信頼度を単一の感覚値ではなく、7つのサブスコアの合算で算出する。
 *
 * サブスコア構成（合計0-100）:
 *   type_match:     0-15  取引類型が判定できたか
 *   partner_match:  0-25  取引先一致度
 *   history_match:  0-20  過去取引履歴一致（Phase 1では0固定）
 *   amount_pattern: 0-15  金額帯の一致
 *   account_match:  0-10  口座情報の確実性
 *   stability:      0-10  正規化後の安定性
 *   auxiliary:      0-5   補助情報（品目タグ等）
 */

// --------------------------------------------------
// サブスコア上限定義
// --------------------------------------------------
const SUB_SCORE_MAX = {
  type_match: 15,
  partner_match: 25,
  history_match: 20,
  amount_pattern: 15,
  account_match: 10,
  stability: 10,
  auxiliary: 5,
};

// --------------------------------------------------
// 各サブスコアの算出
// --------------------------------------------------

/**
 * type_match: 取引類型の判定精度
 * - EXPENSE以外の具体的類型 → 15点
 * - EXPENSE（一般経費） → 5点
 * - 未判定 → 0点
 * @param {string} transactionType
 * @returns {number} 0-15
 */
function calcTypeMatch(transactionType) {
  if (!transactionType) return 0;
  if (transactionType !== 'EXPENSE') return 15;
  return 5;
}

/**
 * partner_match: 取引先一致度
 * - dict_exact → 25点
 * - dict_normalized → 18点
 * - dict_partial → 12点
 * - name_only → 0点
 * @param {string} partnerSource - resolvePartnerFromDict の partner_source
 * @returns {number} 0-25
 */
function calcPartnerMatch(partnerSource) {
  switch (partnerSource) {
    case 'dict_exact': return 25;
    case 'dict_normalized': return 18;
    case 'dict_partial': return 12;
    default: return 0; // name_only or undefined
  }
}

/**
 * history_match: 過去取引履歴一致
 * Phase 1では常に0。Phase 2で pastPatternScore を活用予定。
 * @param {number} pastPatternScore
 * @returns {number} 0-20
 */
function calcHistoryMatch(pastPatternScore) {
  // Phase 1: 0固定
  // Phase 2: Math.min(pastPatternScore, 20)
  return 0;
}

/**
 * amount_pattern: 金額帯の一致
 * - 顧問先辞書にマッチした場合、金額が典型的な範囲かを評価
 * - 辞書マッチなし → 0点
 * - 辞書マッチあり → 金額の妥当性に応じて配点
 *
 * Phase 1では簡易判定:
 *   - 辞書マッチあり → 8点（固定）
 *   - 辞書マッチなし + 科目推測あり → 5点
 *   - 未判定 → 0点
 *
 * @param {string} accountSource - 科目の推測ソース
 * @returns {number} 0-15
 */
function calcAmountPattern(accountSource) {
  if (accountSource === 'client_dict') return 8;
  if (accountSource === 'existing_rule') return 10;
  if (accountSource === 'past_pattern') return 8;
  if (accountSource === 'general_keywords') return 5;
  if (accountSource === 'type_rule') return 5;
  return 0; // unmatched
}

/**
 * account_match: 口座情報の確実性
 * - walletable_name が正常に取得できていれば10点
 * - _noWallet フラグ付きなら0点
 * @param {Object} item - 明細オブジェクト
 * @returns {number} 0-10
 */
function calcAccountMatch(item) {
  if (item._noWallet) return 0;
  if (item.walletable_name) return 10;
  return 3; // 名前は不明だがwalletable_id はある可能性
}

/**
 * stability: 正規化後の安定性
 * normalizer.js の rulesApplied の数で判定:
 *   - 3つ以上 → 10点（複数の正規化が成功＝安定した識別）
 *   - 1-2件 → 5点
 *   - 0件 → 3点（正規化不要＝既に安定 or normalizer未使用）
 * @param {Object|null} normResult - normalize() の結果
 * @returns {number} 0-10
 */
function calcStability(normResult) {
  if (!normResult) return 3; // normalizer未使用
  const rulesCount = (normResult.rulesApplied || []).length;
  if (rulesCount >= 3) return 10;
  if (rulesCount >= 1) return 5;
  return 3;
}

/**
 * auxiliary: 補助情報の充実度
 * - 品目タグがある → +2点
 * - 税区分が確定 → +3点
 * @param {Object} classificationResult
 * @returns {number} 0-5
 */
function calcAuxiliary(classificationResult) {
  let score = 0;
  if (classificationResult.item || classificationResult.itemTag) {
    score += 2;
  }
  if (classificationResult.taxClass && classificationResult.taxClass !== '要確認') {
    score += 3;
  }
  return Math.min(score, SUB_SCORE_MAX.auxiliary);
}

// --------------------------------------------------
// メイン: サブスコア合算
// --------------------------------------------------

/**
 * 全サブスコアを算出し、合算して totalConfidence を返す
 *
 * @param {Object} params
 * @param {string} params.transactionType - Phase A の類型
 * @param {string} params.partnerSource - partner_source（dict_exact等）
 * @param {number} [params.pastPatternScore=0] - 過去パターンスコア
 * @param {string} params.accountSource - 科目の推測ソース
 * @param {Object} params.item - 元明細
 * @param {Object|null} params.normResult - normalize()の結果
 * @param {Object} params.classificationResult - 分類結果（taxClass, item等）
 * @returns {{ totalConfidence: number, subScores: Object }}
 */
function calculateConfidence(params) {
  const subScores = {
    type_match: calcTypeMatch(params.transactionType),
    partner_match: calcPartnerMatch(params.partnerSource),
    history_match: calcHistoryMatch(params.pastPatternScore || 0),
    amount_pattern: calcAmountPattern(params.accountSource),
    account_match: calcAccountMatch(params.item || {}),
    stability: calcStability(params.normResult),
    auxiliary: calcAuxiliary(params.classificationResult || {}),
  };

  const totalConfidence = Object.values(subScores).reduce((sum, v) => sum + v, 0);

  return {
    totalConfidence: Math.min(totalConfidence, 100),
    subScores,
  };
}

module.exports = {
  calculateConfidence,
  // 個別関数もエクスポート（テスト用）
  calcTypeMatch,
  calcPartnerMatch,
  calcHistoryMatch,
  calcAmountPattern,
  calcAccountMatch,
  calcStability,
  calcAuxiliary,
  SUB_SCORE_MAX,
};
