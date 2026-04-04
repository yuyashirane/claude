// ============================================================
// 勘定科目チェックルール定義
// ============================================================

// 費用科目で固定資産化チェックの対象となる勘定科目カテゴリ
const EXPENSE_CATEGORIES_FOR_ASSET_CHECK = [
  '販売管理費',
];

// 固定資産化チェックの除外科目名（部分一致）
const ASSET_CHECK_EXCLUDE_ACCOUNTS = [
  '地代家賃', '給料手当', '役員報酬', '法定福利費', '福利厚生費',
  '保険料', '租税公課', '支払利息', '減価償却費', '長期前払費用償却',
  '賞与', '退職給付', '雑給', '通勤手当',
];

// 固定資産化の金額閾値
const ASSET_THRESHOLDS = {
  HIGH: 300000,    // 30万円以上 → 🔴 原則固定資産
  MEDIUM: 200000,  // 20万円以上 → 🟡 一括償却資産 or 固定資産
  LOW: 100000,     // 10万円以上 → 🔵 少額減価償却の検討
};

// 修繕費チェックの金額閾値
const REPAIR_THRESHOLDS = {
  HIGH: 600000,    // 60万円以上 → 🔴 資本的支出の可能性高
  MEDIUM: 200000,  // 20万円以上 → 🟡 要確認
};

// ソフトウェア関連キーワード
const SOFTWARE_KEYWORDS = [
  'ライセンス', 'license', 'サブスクリプション', 'subscription',
  '開発', 'システム', 'ソフト', 'アプリ', 'クラウド', 'saas',
  '年間', '年額', 'annual', 'プラン', 'プレミアム', 'エンタープライズ',
  'AWS', 'Azure', 'Google Cloud', 'GCP',
  'Salesforce', 'セールスフォース', 'kintone', 'キントーン',
  'Slack', 'スラック', 'Zoom', 'ズーム', 'Teams',
  'freee', 'マネーフォワード', 'MFクラウド',
  'ChatGPT', 'Claude', 'AI', 'Notion', 'Figma',
  'Adobe', 'アドビ', 'Microsoft', 'マイクロソフト', 'Office',
  'Dropbox', 'ドロップボックス', 'Box', 'OneDrive',
  'GitHub', 'GitLab', 'Atlassian', 'Jira', 'Confluence',
  'HubSpot', 'ハブスポット', 'Zendesk',
];

// 書籍・図書関連キーワード
const BOOK_KEYWORDS = [
  '書籍', '本', 'kindle', 'キンドル', '図書', 'ブック', 'book',
  '雑誌', '新聞', '購読', 'テキスト', '参考書', '専門書',
  '読み放題', 'unlimited', 'audible', 'オーディブル',
];

// Amazon関連キーワード
const AMAZON_KEYWORDS = [
  'amazon', 'アマゾン', 'amzn',
];

// 外注費の毎月同額チェック用
const OUTSOURCING_KEYWORDS = [
  '外注', '委託', '業務委託', 'アウトソーシング', 'outsourc',
];

// 毎月定額であるべき勘定科目名
const CONSTANT_MONTHLY_ACCOUNTS = [
  '役員報酬',
];

// 期間按分キーワード（月額/年額の判定）
const MONTHLY_KEYWORDS = ['月額', '月分', '月次', '/月', 'ヶ月', 'か月', 'カ月'];
const ANNUAL_KEYWORDS = ['年額', '年間', '年分', '/年', 'annual', '年会費', '年契約'];

// 通常マイナスにならないBS科目
const NO_NEGATIVE_BS_ACCOUNTS = [
  '現金', '預金', '売掛金', '未収入金', '前払費用', '未収還付',
  '工具器具備品', '建物', '一括償却資産', 'ソフトウェア',
  '敷金', '保険積立金', '出資金', '長期前払費用',
  '未払金', '未払費用', '預り金', '前受金',
  '長期借入金', '長期未払金', '役員借入金',
  '資本金',
];

// 諸口科目（残高が0であるべき）
const SHOULD_BE_ZERO_ACCOUNTS = [
  '資金諸口', '資金外諸口', '複合', '未確定勘定', '諸口',
];

// 雑勘定（使いすぎ注意）
const MISC_ACCOUNTS = ['雑費', '雑損失', '雑収入'];

// 税区分コードのマッピング
const TAX_CODE_NAMES = {
  2: '対象外',
  21: '課税売上', 22: '輸出売上', 23: '非課売上', 24: '非資売上', 25: '対外売上',
  34: '課対仕入', 35: '非対仕入', 36: '共対仕入',
  37: '非課仕入', 38: '対外仕入',
  101: '課税売上8%', 108: '課対仕入8%', 109: '非対仕入8%', 110: '共対仕入8%',
  129: '課税売上10%', 136: '課対仕入10%', 137: '非対仕入10%', 138: '共対仕入10%',
  155: '課税10%',
  156: '課税売上8%(軽)', 163: '課対仕入8%(軽)', 164: '非対仕入8%(軽)', 165: '共対仕入8%(軽)',
  183: '課対仕入(控80)', 184: '課対仕入(控50)',
  185: '課対仕入(控80)8%', 186: '課対仕入(控50)8%',
  187: '課対仕入(控80)8%(軽)', 188: '課対仕入(控50)8%(軽)',
  189: '課対仕入(控80)10%', 190: '課対仕入(控50)10%',
};

// 対象外であるべき勘定科目（部分一致）
const NON_TAXABLE_ACCOUNTS = [
  '給料手当', '役員報酬', '賞与', '雑給', '法定福利費', '退職給付',
  '預り金', '未払金', '売掛金', '未収入金', '前払費用',
  '長期借入金', '長期未払金', '役員借入金', '資本金',
  '減価償却', '貸倒引当金',
];

module.exports = {
  EXPENSE_CATEGORIES_FOR_ASSET_CHECK,
  ASSET_CHECK_EXCLUDE_ACCOUNTS,
  ASSET_THRESHOLDS,
  REPAIR_THRESHOLDS,
  SOFTWARE_KEYWORDS,
  BOOK_KEYWORDS,
  AMAZON_KEYWORDS,
  OUTSOURCING_KEYWORDS,
  CONSTANT_MONTHLY_ACCOUNTS,
  MONTHLY_KEYWORDS,
  ANNUAL_KEYWORDS,
  NO_NEGATIVE_BS_ACCOUNTS,
  SHOULD_BE_ZERO_ACCOUNTS,
  MISC_ACCOUNTS,
  TAX_CODE_NAMES,
  NON_TAXABLE_ACCOUNTS,
};
