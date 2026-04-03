'use strict';

const { detectOverseasService } = require('../../shared/overseas-services');
const {
  normalizeRoute,
  normalizeAccount,
  normalizeTaxLabel,
  normalizeDescription,
  normalizeWalletTxnId,
  normalizeConfidenceBreakdown,
} = require('./normalize-helpers');

// account-matcher.js の R04判定と同じキーワード群をローカル定数として定義
// （既存コード変更ゼロの原則: importせず同等定数を持つ）
const FOOD_KEYWORDS = [
  '弁当', '食品', '飲料', 'お茶', 'ジュース', '水', '食料', 'テイクアウト',
  'チョコレート', 'チョコ', '食料品', '菓子', 'スーパー', 'コンビニ',
  'まいばすけっと', 'セブン', 'ローソン', 'ファミリーマート',
  'ウーバーイーツ', 'Uber Eats', '出前館', 'ケーキ', 'パン',
];
// 食品に見えても標準税率のケース
const FOOD_EXCEPTION_KEYWORDS = [
  '外食', 'レストラン', '居酒屋', '酒', 'ビール', 'ワイン',
  'ケータリング', '出張料理',
];
const NON_FOOD_KEYWORDS = [
  '日用品', '雑貨', '衣料', 'LED', '看板', '文具', '電池',
];
// account-matcher.js R04後半ブランチ: 新聞定期購読（軽減8%）
const NEWSPAPER_KEYWORDS    = ['新聞', '日経', '読売', '朝日', '毎日', '産経', '日刊'];
const SUBSCRIPTION_KEYWORDS = ['定期', '購読', '月極', '月ぎめ'];

// 非課税対象科目（スペック通り3科目のみ）
const NON_TAXABLE_ACCOUNTS = ['支払保険料', '受取利息', '受取配当金'];

// 不課税対象科目（スペック通り5科目）
const NON_SUBJECT_ACCOUNTS = [
  '給料手当', '役員報酬', '法定福利費', '租税公課', '法人税、住民税及び事業税',
];

/**
 * 消費税区分の妥当性チェッカー
 * @param {Array} items - classifiedItems配列
 * @param {string} companyId - 事業所ID（将来拡張用）
 * @returns {Array} Finding配列
 */
function taxChecker(items, companyId) {
  const findings = [];
  const targets = items.filter(i => ['register', 'suggest'].includes(normalizeRoute(i)));

  for (const item of targets) {
    const taxLabel   = normalizeTaxLabel(item);
    const desc       = normalizeDescription(item);
    const account    = normalizeAccount(item);
    const id         = normalizeWalletTxnId(item);
    const breakdown  = normalizeConfidenceBreakdown(item);

    // T-01: 海外サービスの課税区分チェック
    //
    // 指摘するケース:
    //   isDomestic=false かつ invoiceRegistered=false or null → 対象外であるべき
    // 指摘しないケース:
    //   isDomestic=true（国内法人経由）→ 課対仕入で正しい
    //   invoiceRegistered=true → freee取引先マスタで処理されるため問題なし
    if (taxLabel.startsWith('課対仕入')) {
      const detected = detectOverseasService(desc);
      if (detected) {
        const svc = detected.service;
        if (!svc.isDomestic && !svc.invoiceRegistered) {
          findings.push({
            severity: '🔴',
            category: 'tax',
            checkCode: 'T-01',
            walletTxnId: id,
            description: `海外サービス「${svc.serviceName}」はインボイス未登録のため、対象外（不課税）の可能性があります。「${desc}」`,
            currentValue: taxLabel,
            suggestedValue: '対象外',
            confidence: 90,
          });
        }
      }
    }

    // T-02: 軽減税率の誤適用チェック
    const isReducedLabel = taxLabel.includes('軽減') || taxLabel.includes('8%');
    const hasFoodKw = FOOD_KEYWORDS.some(kw => desc.includes(kw));
    const hasFoodException = FOOD_EXCEPTION_KEYWORDS.some(kw => desc.includes(kw));
    const hasNonFoodKw = NON_FOOD_KEYWORDS.some(kw => desc.includes(kw));

    // 軽減税率なのに食品キーワードなし（かつ非食品キーワードあり or 食品例外あり）
    if (isReducedLabel && (!hasFoodKw || hasFoodException || hasNonFoodKw)) {
      findings.push({
        severity: '🔴',
        category: 'tax',
        checkCode: 'T-02',
        walletTxnId: id,
        description: `税区分「${taxLabel}」（軽減税率）が設定されていますが、食品・軽減税率対象品目の判定を確認してください。「${desc}」`,
        currentValue: taxLabel,
        suggestedValue: '課対仕入（標準10%）',
        confidence: 85,
      });
    // 食品キーワードあり（例外なし・非食品なし）なのに標準税率
    } else if (!isReducedLabel && hasFoodKw && !hasFoodException && !hasNonFoodKw
               && taxLabel.startsWith('課対仕入')) {
      findings.push({
        severity: '🔴',
        category: 'tax',
        checkCode: 'T-02',
        walletTxnId: id,
        description: `摘要に食品キーワードがありますが、軽減税率（8%）が設定されていません。「${desc}」`,
        currentValue: taxLabel,
        suggestedValue: '課対仕入（軽減税率8%）',
        confidence: 80,
      });
    }

    // T-02拡張: 新聞定期購読の軽減税率チェック（account-matcher.js R04後半ブランチ）
    // 定期購読契約の新聞は軽減8%対象（週2回以上発行）
    {
      const hasNewspaper    = NEWSPAPER_KEYWORDS.some(kw => desc.includes(kw));
      const hasSubscription = SUBSCRIPTION_KEYWORDS.some(kw => desc.includes(kw));
      if (hasNewspaper && hasSubscription && taxLabel.startsWith('課対仕入') && !isReducedLabel) {
        findings.push({
          severity: '🔴',
          category: 'tax',
          checkCode: 'T-02',
          walletTxnId: id,
          description: `新聞の定期購読は軽減税率8%の対象です。「${desc}」`,
          currentValue: taxLabel,
          suggestedValue: '課対仕入（軽減8%）',
          confidence: 85,
        });
      }
    }

    // T-03: 非課税判定漏れの可能性
    if (taxLabel.startsWith('課対仕入') && NON_TAXABLE_ACCOUNTS.includes(account)) {
      findings.push({
        severity: '🟡',
        category: 'tax',
        checkCode: 'T-03',
        walletTxnId: id,
        description: `「${account}」は非課税取引の可能性があります（現在: ${taxLabel}）。「${desc}」`,
        currentValue: taxLabel,
        suggestedValue: '非課仕入',
        confidence: 75,
      });
    }

    // T-03拡張: 地代家賃の非課税チェック
    // 住居用 → 非課税 / 事務所・店舗・駐車場 → 課税（確認推奨）
    if (account === '地代家賃' && taxLabel.startsWith('課対仕入')) {
      const residentialKeywords = ['住居', '居住', 'マンション', 'アパート', '住宅', '社宅', '寮'];
      const hasResidentialHint = residentialKeywords.some(kw => desc.includes(kw));
      if (hasResidentialHint) {
        findings.push({
          severity: '🟡',
          category: 'tax',
          checkCode: 'T-03',
          walletTxnId: id,
          description: `地代家賃に課税仕入が設定されていますが、住居用（非課税）の可能性があります。「${desc}」`,
          currentValue: taxLabel,
          suggestedValue: '非課仕入',
          confidence: 75,
        });
      } else {
        findings.push({
          severity: '🔵',
          category: 'tax',
          checkCode: 'T-03',
          walletTxnId: id,
          description: `地代家賃「${desc}」の課税区分を確認してください。住居用の場合は非課税です。`,
          currentValue: taxLabel,
          suggestedValue: '住居用なら非課仕入',
          confidence: 40,
        });
      }
    }

    // T-04: 不課税判定漏れの可能性
    if (taxLabel.startsWith('課対仕入') && NON_SUBJECT_ACCOUNTS.includes(account)) {
      findings.push({
        severity: '🟡',
        category: 'tax',
        checkCode: 'T-04',
        walletTxnId: id,
        description: `「${account}」は不課税取引の可能性があります（現在: ${taxLabel}）。「${desc}」`,
        currentValue: taxLabel,
        suggestedValue: '対象外',
        confidence: 75,
      });
    }

    // T-05: 税区分の確信度が低い（taxClarity が undefined の場合はスキップ）
    if (breakdown && breakdown.taxClarity !== undefined && breakdown.taxClarity < 10) {
      findings.push({
        severity: '🔵',
        category: 'tax',
        checkCode: 'T-05',
        walletTxnId: id,
        description: `税区分の明確度スコアが低い（${breakdown.taxClarity}pt）ため、課税区分の確認を推奨します。「${desc}」`,
        currentValue: `taxClarity: ${breakdown.taxClarity}pt`,
        suggestedValue: '税区分を手動確認',
        confidence: 60,
      });
    }
  }

  return findings;
}

module.exports = { taxChecker };
