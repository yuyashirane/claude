/**
 * transaction-type-classifier.js
 * 取引類型判定モジュール（Phase A）
 *
 * 未処理明細を8つの取引類型に分類する。
 * 勘定科目の確定は行わない（Phase Bで多段階推測する）。
 *
 * 類型:
 *   LOAN_REPAY        — 借入返済（複合仕訳）         ※自動確定禁止
 *   ATM               — ATM引出・預入（振替）         ※自動確定禁止
 *   SOCIAL_INSURANCE  — 社会保険料（複合仕訳）        ※自動確定禁止
 *   CREDIT_PULL       — クレカ引落（振替）
 *   TRANSFER          — 口座間振替（自社口座間）
 *   SALES_IN          — 売上入金                      ※不明入金は自動確定禁止
 *   PERSONAL_PAYMENT  — 個人宛支払（中間類型）        ※自動確定禁止
 *   EXPENSE           — 通常経費（上記以外）
 */

// --------------------------------------------------
// 銀行摘要のプレフィックス（振込・口座振替等の接頭辞）
// --------------------------------------------------
const DESCRIPTION_PREFIXES = [
  'IBﾌﾘｺﾐ', 'ｿｳｷﾝ', 'ｼﾞﾌﾘ', 'ｺｳｻﾞﾌﾘｶｴ',
  'JCB', 'ﾎｹﾝﾘﾖｳ', 'ﾃｽｳﾘﾖｳ', '電話料',
];

/**
 * 摘要からプレフィックスを除去して本体部分を取得
 * 例: "IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ" → "ﾊﾞﾊﾞ ﾉﾘﾌﾐ"
 * @param {string} desc
 * @returns {string} プレフィックス除去後の文字列
 */
function stripPrefix(desc) {
  const trimmed = (desc || '').trim();
  for (const prefix of DESCRIPTION_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

// --------------------------------------------------
// 借入返済キーワード
// --------------------------------------------------
const LOAN_REPAY_KEYWORDS = [
  'ｺﾞﾍﾝｻｲ', 'ﾍﾝｻｲ', 'ﾘﾍﾞﾗｲ',
  'ｺｳｺ', // 公庫（半角カタカナ）
  'ﾕｳｼ',  // 融資返済
];

// --------------------------------------------------
// ATMキーワード
// --------------------------------------------------
const ATM_KEYWORDS = ['ｼﾞﾄﾞｳｷ', 'ATM', 'CD '];

// --------------------------------------------------
// クレカ引落キーワード
// --------------------------------------------------
const CREDIT_PULL_KEYWORDS = ['ｸﾚｼﾞﾂﾄ'];

// --------------------------------------------------
// 社会保険料キーワード（複合仕訳扱い → SOCIAL_INSURANCE類型）
// 預り金/法定福利費の複合仕訳。単純経費扱い禁止。
// --------------------------------------------------
const SOCIAL_INSURANCE_KEYWORDS = [
  // 半角カタカナ（銀行明細の原文）
  '\uff7a\uff73\uff7e\uff72\uff8e\uff79\uff9d\uff98\uff96\uff73',  // ｺｳｾｲﾎｹﾝﾘﾖｳ（厚生保険料）
  '\uff7a\uff73\uff7e\uff72\uff8e\uff79\uff9d',  // ｺｳｾｲﾎｹﾝ（厚生保険）
  '\uff79\uff9d\uff8e\uff9f\uff78\uff90\uff71\uff72',  // ｹﾝﾎﾟｸﾐｱｲ（健保組合）
  '\uff7a\uff78\uff90\uff9d\uff79\uff9d\uff7a\uff73\uff8e\uff79\uff9d',  // ｺｸﾐﾝｹﾝｺｳﾎｹﾝ（国民健康保険）
  '\uff7a\uff78\uff90\uff9d\uff88\uff9d\uff77\uff9d',  // ｺｸﾐﾝﾈﾝｷﾝ（国民年金）
  '\uff7a\uff73\uff7e\uff72\uff88\uff9d\uff77\uff9d',  // ｺｳｾｲﾈﾝｷﾝ（厚生年金）
  '\uff9b\uff73\uff77\uff9d',  // ﾛｳｷﾝ（労金＝労働保険）
  '\uff7c\uff94\uff76\uff72\uff8e\uff79\uff9d',  // ｼﾔｶｲﾎｹﾝ（社会保険）
  '\uff88\uff9d\uff77\uff9d\uff77\uff7a\uff73',  // ﾈﾝｷﾝｷｺｳ（年金機構）
  '\uff79\uff9d\uff7a\uff73\uff8e\uff79\uff9d',  // ｹﾝｺｳﾎｹﾝ（健康保険）
  '\uff9b\uff73\uff84\uff9e\uff73\uff8e\uff79\uff9d',  // ﾛｳﾄﾞｳﾎｹﾝ（労働保険）
  // 全角カタカナ/漢字（freee明細等）
  '厚生保険料', '厚生保険', '厚生年金', '健康保険', '社会保険',
  '労働保険', '国民健康保険', '国民年金', '年金機構', '健保組合',
];

// --------------------------------------------------
// 人名パターン判定
// --------------------------------------------------

/**
 * 半角カタカナの人名パターンを判定
 * 「姓（2-6文字）+ スペース + 名（1-6文字）」
 *
 * 注意: これは「個人宛支払」の中間類型に分類するだけ。
 * 給料手当/外注費/立替金等の最終判定はPhase Bで行う。
 *
 * @param {string} text - プレフィックス除去済みの摘要テキスト
 * @returns {boolean}
 */
function isPersonName(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;

  // 半角カタカナ: ｦ(0xFF66)〜ﾝ(0xFF9D), ﾞ(0xFF9E), ﾟ(0xFF9F), ｧ(0xFF67)〜ｯ(0xFF6F), ー(0xFF70)
  // 姓（2-6文字）+ 空白 + 名（1-6文字）
  // 名の後に余計な文字がないこと
  return /^[ｦ-ﾝﾞﾟｧ-ｯｰ]{2,6}\s+[ｦ-ﾝﾞﾟｧ-ｯｰ]{1,6}$/.test(trimmed);
}

/**
 * 摘要全体から人名を検出（プレフィックス付きも対応）
 * 例: "IBﾌﾘｺﾐ   ﾊﾞﾊﾞ ﾉﾘﾌﾐ" → true
 * 例: "ﾓﾘﾑﾗ ﾒｲ" → true
 * 例: "ｿｳｷﾝ     ｵｲｶﾜ ｾﾝｼﾞ" → true
 * @param {string} description - 元の摘要
 * @returns {boolean}
 */
function hasPersonName(description) {
  const body = stripPrefix(description);
  return isPersonName(body);
}

// --------------------------------------------------
// 売上入金パターン
// --------------------------------------------------

/**
 * 売上入金パターンの判定
 * - entry_side が income
 * - 決済サービス（Square、Park24等）
 * - 法人名からの入金
 * - 個人名からの入金（個人顧客の売上入金）
 *
 * 注意: ATM入金・口座振替入金は先に除外済みの前提
 * @param {Object} item
 * @param {string} body - プレフィックス除去済み摘要
 * @returns {boolean}
 */
function isSalesIncome(item, body) {
  if (item.entry_side !== 'income') return false;

  // 決済サービスからの入金
  const paymentServices = ['ｽｸｴｱ', 'ﾊﾟ-ｸ24', 'SQUARE', 'PARK24', 'ﾛﾎﾞﾂﾄﾍﾟｲ'];
  if (paymentServices.some(kw => body.includes(kw))) return true;

  // 法人名（ｶ)で始まる等）からの入金
  if (/^[ｶｶﾞ][)）]/.test(body)) return true;

  // 人名からの入金 → 売上入金として分類
  if (isPersonName(body)) return true;

  // その他のincomeは広義の売上入金候補
  return false;
}

// --------------------------------------------------
// メイン: 取引類型判定
// --------------------------------------------------

/**
 * 取引類型を判定する
 *
 * @param {Object} item - 正規化済み明細
 * @param {string} item.description - 明細摘要
 * @param {string} item.entry_side - 'income' | 'expense'
 * @param {string} item.walletable_type - 'bank_account' | 'credit_card' | 'wallet'
 * @param {string} item.walletable_name - 口座名
 * @param {number} item.amount - 金額
 * @param {string[]} [ownAccountNames] - 自社の口座名一覧（口座間振替判定用）
 * @returns {{ type: string, confidence: number, note: string }}
 */
function classifyTransactionType(item, ownAccountNames) {
  const desc = (item.description || '').trim();
  const body = stripPrefix(desc);
  const ownNames = ownAccountNames || [];

  // 1. 借入返済（ｺﾞﾍﾝｻｲ等）
  if (LOAN_REPAY_KEYWORDS.some(kw => desc.includes(kw))) {
    return {
      type: 'LOAN_REPAY',
      confidence: 90,
      note: '借入返済。複合仕訳（元本+利息）の推測が必要',
      autoConfirmBlocked: true,
    };
  }

  // 2. 社会保険料（独立した類型。複合仕訳扱い）
  if (SOCIAL_INSURANCE_KEYWORDS.some(kw => desc.includes(kw))) {
    return {
      type: 'SOCIAL_INSURANCE',
      confidence: 85,
      note: '社会保険料。預り金/法定福利費の複合仕訳。単純経費扱い禁止',
      autoConfirmBlocked: true,
    };
  }

  // 3. ATM引出・預入
  if (ATM_KEYWORDS.some(kw => desc.includes(kw))) {
    const direction = item.entry_side === 'income' ? '預入' : '引出';
    return {
      type: 'ATM',
      confidence: 95,
      note: `ATM${direction}。現金勘定への振替`,
      autoConfirmBlocked: true,
    };
  }

  // 4. クレカ引落（銀行口座からの引落）
  if (CREDIT_PULL_KEYWORDS.some(kw => desc.includes(kw))
      && item.walletable_type === 'bank_account') {
    return {
      type: 'CREDIT_PULL',
      confidence: 90,
      note: `クレカ引落（${body}）。クレカ口座への振替`,
    };
  }

  // 5. 口座間振替（自社の他口座名が摘要に含まれる）
  if (ownNames.length > 0) {
    const matchedAccount = ownNames.find(name =>
      name && desc.includes(name)
    );
    if (matchedAccount) {
      return {
        type: 'TRANSFER',
        confidence: 85,
        note: `口座間振替（${matchedAccount}）`,
      };
    }
  }

  // 6. 売上入金（income側パターン）
  if (item.entry_side === 'income') {
    if (isSalesIncome(item, body)) {
      // 不明入金（個人名 or パターン不明確）は自動確定禁止
      const isUnknown = !(/^[ｶｶﾞ][)）]/.test(body)) && !['ｽｸｴｱ', 'ﾊﾟ-ｸ24', 'SQUARE', 'PARK24', 'ﾛﾎﾞﾂﾄﾍﾟｲ'].some(kw => body.includes(kw));
      return {
        type: 'SALES_IN',
        confidence: 70,
        note: '売上入金の可能性。売掛金消込 or 売上高の推測が必要。仮受金/借入/立替回収の可能性も要検討',
        autoConfirmBlocked: isUnknown,
      };
    }
    // incomeでも売上パターンに一致しないもの（利息、還付金等）
    // → 一般的な入金としてEXPENSEフローで処理
  }

  // 7. 個人宛支払（expense側の人名パターン）
  if (item.entry_side === 'expense' && hasPersonName(desc)) {
    return {
      type: 'PERSONAL_PAYMENT',
      confidence: 60,
      note: '個人宛支払。給与/外注費/立替精算/役員関連等の可能性あり',
      autoConfirmBlocked: true,
      withholdingPossible: true,
    };
  }

  // 8. 通常経費（上記いずれにも該当しない）
  return {
    type: 'EXPENSE',
    confidence: 50,
    note: '通常の経費支出。Phase Bで科目を推測',
  };
}

module.exports = {
  classifyTransactionType,
  isPersonName,
  hasPersonName,
  stripPrefix,
  // テスト用
  LOAN_REPAY_KEYWORDS,
  ATM_KEYWORDS,
  CREDIT_PULL_KEYWORDS,
  DESCRIPTION_PREFIXES,
};
