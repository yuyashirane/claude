/**
 * tax-label-mapper.js
 * パイプラインの税区分・インボイス区分・収支区分を
 * freee自動登録ルールCSVの値に変換するモジュール
 */

// パイプライン税区分 → freee CSV「税区分」カラム値
const TAX_LABEL_MAP = {
  // 正式キー（freee-rule-csv-spec.md 準拠）
  '課対仕入10%':       '課対仕入',
  '課対仕入8%':        '課対仕入8%',
  '課対仕入8%（軽）':   '課対仕入8%（軽）',
  '非課仕入':          '非課仕入',
  '非課税仕入':        '非課仕入',
  '対象外':            '対象外',
  '不課税':            '不課税',
  '課税売上10%':       '課税売上',
  '課税売上8%':        '課税売上8%',
  '非課売上':          '非課売上',
  // account-matcher.js の内部値エイリアス
  '課税10%':           '課対仕入',   // 通常の課税仕入10%
  '課税8%（軽減）':     '課対仕入8%（軽）',
  '非課税':            '非課仕入',
  '課税売上':          '課税売上',
  'リバースチャージ':   '',           // freee CSV上はルールで設定不可、空で出力
  '要確認':            '',           // 人が判断
};

// パイプラインインボイス区分 → freee CSV「適格請求書等」カラム値
const INVOICE_LABEL_MAP = {
  '適格':       '取引先情報に準拠',
  '非適格80%':  '該当しない',
  '非適格50%':  '該当しない',
  '不要':       '該当しない',
  '要確認':     '',           // 空 = 人が判断
};

/**
 * パイプラインの税区分判定結果をfreee CSV値に変換
 * @param {string|null|undefined} taxClassification - パイプライン出力の税区分
 * @returns {string} freee CSV用の税区分文字列（未知の値は空文字）
 */
function toFreeeTaxLabel(taxClassification) {
  if (taxClassification == null) return '';
  return TAX_LABEL_MAP[taxClassification] ?? '';
}

/**
 * パイプラインのインボイス5分類をfreee CSV値に変換
 * @param {string|null|undefined} invoiceType - パイプライン出力のインボイス区分
 * @returns {string} freee CSV用の適格請求書等文字列（未知の値は空文字）
 */
function toFreeeInvoiceLabel(invoiceType) {
  if (invoiceType == null) return '';
  return INVOICE_LABEL_MAP[invoiceType] ?? '';
}

/**
 * income/expenseをfreee CSV「収支区分」値に変換
 * @param {string} entrySide - 'income' or 'expense'
 * @returns {string} '収入' or '支出'
 */
function toFreeeEntrySide(entrySide) {
  if (entrySide === 'income') return '収入';
  if (entrySide === 'expense') return '支出';
  return '支出'; // デフォルト
}

module.exports = {
  toFreeeTaxLabel,
  toFreeeInvoiceLabel,
  toFreeeEntrySide,
  // テスト用にマップも公開
  TAX_LABEL_MAP,
  INVOICE_LABEL_MAP,
};
