'use strict';

/**
 * report-config/labels.js — カテゴリ・チェックコード・グループのラベル定義
 *
 * サマリーシート・指摘一覧シート・個別シートで使用する
 * カテゴリ名・チェックコード名・グループ構成の一元定義。
 *
 * 変更例:
 *   - 新しいチェックコードを追加 → CHECK_CODE_LABELS に追加
 *   - カテゴリの表示名を変更 → CATEGORY_LABELS を修正
 *   - グループのシート構成を変更 → CHECK_GROUPS を修正
 */

// ============================================================
// カテゴリ名の日本語化
// ============================================================

/**
 * カテゴリの内部名 → 日本語表示名マッピング
 * サマリーシート・指摘一覧シート・個別シートのシート名に使用
 */
const CATEGORY_LABELS = {
  data_quality:        'データ品質',
  cash_deposit:        '現金・預金',
  extraordinary_tax:   '営業外・税金',
  loan_lease:          '借入金・リース',
  officer_loan:        '役員・関連取引',
  fixed_asset:         '固定資産',
  rent:                '地代家賃',
  payroll:             '人件費',
  outsource:           '外注費',
  revenue_receivable:  '売上・売掛金',
  purchase_payable:    '仕入・買掛金',
  balance_anomaly:     '残高異常',
  period_allocation:   '期間配分',
  tax_classification:  '消費税区分',
  withholding_tax:     '源泉所得税',
  advance_tax_payment: '予定納税',
};

/**
 * カテゴリの表示順序（サマリーのカテゴリ別内訳で使用）
 * 実務的な重要度・確認順に並べる
 */
const CATEGORY_ORDER = [
  'data_quality',
  'cash_deposit',
  'tax_classification',
  'withholding_tax',
  'advance_tax_payment',
  'extraordinary_tax',
  'payroll',
  'outsource',
  'revenue_receivable',
  'purchase_payable',
  'rent',
  'loan_lease',
  'officer_loan',
  'fixed_asset',
  'balance_anomaly',
  'period_allocation',
];

/**
 * チェック項目グループの定義
 * 個別シート生成用。関連するカテゴリをグルーピング
 */
const CHECK_GROUPS = [
  {
    id: 'tax',
    label: '消費税区分チェック',
    categories: ['tax_classification'],
    description: '勘定科目と消費税区分の組み合わせの妥当性を検証します。',
  },
  {
    id: 'withholding',
    label: '源泉所得税チェック',
    categories: ['withholding_tax'],
    description: '士業報酬・外注費等の源泉徴収の漏れ・計算誤りを検出します。',
  },
  {
    id: 'advance_tax',
    label: '予定納税チェック',
    categories: ['advance_tax_payment'],
    description: '法人税・消費税の中間納付の処理状況を確認します。',
  },
  {
    id: 'bs_check',
    label: 'BS残高指摘',
    categories: ['cash_deposit', 'loan_lease', 'officer_loan', 'balance_anomaly'],
    description: '貸借対照表の科目残高の異常・滞留・マイナス残高を検出します。',
  },
  {
    id: 'pl_check',
    label: 'PL・期間配分チェック',
    categories: ['revenue_receivable', 'purchase_payable', 'rent', 'fixed_asset', 'period_allocation', 'payroll', 'outsource'],
    description: '損益計算書の月次推移・期間配分・固定費の変動を検出します。',
  },
  {
    id: 'data_tax_misc',
    label: 'データ品質・その他',
    categories: ['data_quality', 'extraordinary_tax'],
    description: '未処理明細・重複・仮勘定・資金諸口等のデータ品質を検証します。',
  },
];

/**
 * 全チェックコード → チェック名のマッピング
 * サマリーシートの「チェック実行結果」テーブルに使用
 */
const CHECK_CODE_LABELS = {
  'DQ-01': '未処理明細の残存',
  'DQ-02': '重複計上の疑い',
  'DQ-03': 'PL全科目ゼロ',
  'CD-01': '現金マイナス残高',
  'CD-02': '預金マイナス残高',
  'CD-03': '現金100万円超',
  'CD-04': '預金の前月比変動',
  'ET-01': '未確定勘定に残高',
  'ET-02': '資金諸口に残高',
  'ET-03': '仮受金・仮払金に残高',
  'ET-04': '未払法人税等の残高',
  'ET-05': '未払消費税等の残高',
  'ET-06': '雑収入・雑損失の内容確認',
  'ET-07': '受取利息の源泉税確認',
  'LL-01': '借入金の返済予定との不一致',
  'LL-02': '借入金のマイナス残高',
  'LL-03': '支払利息の異常',
  'OL-01': '役員貸付金・借入金のマイナス',
  'OL-02': '役員貸付金の増加',
  'OL-03': '立替経費のマイナス残高',
  'OL-04': '役員貸借の相殺確認',
  'FA-01': '消耗品費10万円以上',
  'FA-02': '修繕費20万円以上',
  'FA-03': '固定資産台帳との不一致',
  'RT-01': '地代家賃の金額変動',
  'RT-02': '更新料・礼金20万円以上',
  'RT-03': '地代家賃の取引先タグ漏れ',
  'PY-01': '役員報酬の期中変動',
  'PY-02': '法定福利費の異常',
  'PY-03': '源泉税・住民税の滞留',
  'PY-04': '給与手当の前月比異常',
  'OS-01': '士業報酬の源泉徴収確認',
  'OS-02': '外注の源泉税滞留',
  'RR-01': '売上の月次推移異常',
  'RR-02': '売掛金の滞留',
  'RR-03': '売上の取引先タグ漏れ',
  'PP-01': '仕入の月次推移異常',
  'PP-02': '買掛金・未払金の滞留',
  'PP-03': 'クレジットカード未払金の滞留',
  'PP-04': 'その他経費の異常',
  'BA-01': 'BS科目のマイナス残高',
  'BA-02': '滞留残高（2ヶ月以上変動なし）',
  'BA-03': '仮勘定の未解消',
  'BA-04': '前月比50%超変動',
  'BA-05': '本来ゼロの科目に残高',
  'PA-01': '前払費用の償却漏れ',
  'PA-02': '前払費用の過大償却',
  'PA-03': '前払費用の停滞',
  'PA-04': '定期発生費用の欠損',
  'PA-05': '定期費用の金額変動',
  'PA-06': '未払金の洗い替え確認',
  'PA-07': '前受金の洗い替え確認',
  'PA-08': '前払費用の洗い替え確認',
  'TC-01': '不課税科目に課税仕入',
  'TC-02': '非課税科目に課税仕入',
  'TC-03': '地代家賃の住居系非課税',
  'TC-04': '海外サービスの税区分',
  'TC-05': '軽減税率の適用確認',
  'TC-06': '同一科目内の税区分混在',
  'TC-07': '売上の税区分チェック',
  'TC-08': '高額課税仕入の確認',
  'WT-01': '個人士業への源泉未処理',
  'WT-02': 'デザイン等の源泉対象報酬',
  'WT-03': '源泉税額の検算',
  'WT-04': '預り金残高の滞留',
  'WT-05': '納期の特例リマインド',
  'WT-06': '非居住者への支払い確認',
  'AT-01': '法人税の中間納付確認',
  'AT-02': '消費税の中間納付確認',
  'AT-03': '未払税金残高推移チェック',
};

/**
 * カテゴリ名を日本語に変換するヘルパー
 */
function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

module.exports = {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CHECK_GROUPS,
  CHECK_CODE_LABELS,
  getCategoryLabel,
};
