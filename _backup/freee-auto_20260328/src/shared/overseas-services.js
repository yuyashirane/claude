// ============================================================
// 海外インターネットサービス 消費税区分データベース
// ============================================================
//
// serviceType:
//   'consumer'  = 消費者向け電気通信利用役務の提供
//   'business'  = 事業者向け電気通信利用役務の提供
//   'mixed'     = サービス/プランにより異なる
//   'domestic'  = 国内法人経由（国内取引）
//
// invoiceRegistered:
//   true   = インボイス登録済（登録国外事業者）
//   false  = 未登録
//   null   = 登録状況要確認
//
// expectedTaxTreatment (課税売上割合95%以上の場合):
//   'taxable_10'        = 課対仕入10%（消費者向け・インボイス登録済）
//   'taxable_domestic'  = 課対仕入10%（国内取引）
//   'non_taxable'       = 対象外（事業者向け・課税売上割合95%以上）
//   'check_required'    = 要確認（mixed等）
//
// expectedTaxTreatmentUnder95 (課税売上割合95%未満の場合):
//   'reverse_charge'    = リバースチャージ方式（事業者向け）
//   'taxable_10'        = 課対仕入10%（消費者向け・インボイス登録済）
//   'no_credit'         = 仕入税額控除不可（消費者向け・未登録国外事業者）
//   'taxable_domestic'  = 課対仕入10%（国内取引）
//   'check_required'    = 要確認

const OVERSEAS_SERVICES = [
  // === A ===
  {
    id: 'adobe_cc',
    serviceName: 'Adobe Creative Cloud',
    keywords: ['adobe', 'アドビ', 'creative cloud', 'photoshop', 'illustrator', 'acrobat', 'lightroom', 'premiere', 'after effects', 'indesign', 'xd'],
    partnerKeywords: ['adobe', 'アドビ'],
    provider: 'Adobe Systems Software Ireland Limited',
    country: 'アイルランド',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T3700150007275',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'インボイス登録済のため課税取引。消費者向け電気通信利用役務の提供。',
  },
  {
    id: 'aws',
    serviceName: 'Amazon Web Services (AWS)',
    keywords: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'cloudfront', 'rds', 'dynamodb'],
    partnerKeywords: ['amazon web services', 'aws'],
    provider: 'Amazon Web Services, Inc.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T9700150104216',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'インボイス登録済のため課税取引。消費者向け電気通信利用役務の提供。',
  },
  {
    id: 'apple',
    serviceName: 'Apple（App Store等）',
    keywords: ['app store', 'apple', 'itunes', 'icloud'],
    partnerKeywords: ['apple', 'アップル'],
    provider: 'Apple Inc.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'mixed',
    invoiceRegistered: null,
    invoiceNumber: null,
    expectedTaxTreatment: 'check_required',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: 'App Store等は消費者向けで課税、法人向けサービスは事業者向け。サービスにより区分が異なるため要確認。',
  },
  // === C ===
  {
    id: 'canva',
    serviceName: 'Canva',
    keywords: ['canva', 'キャンバ'],
    partnerKeywords: ['canva', 'キャンバ', 'キヤンバ'],
    provider: 'Canva Pty Ltd',
    country: 'オーストラリア',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T2700150107555',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'インボイス登録済のため課税取引。消費者向け電気通信利用役務の提供。',
  },
  {
    id: 'claude',
    serviceName: 'Claude',
    keywords: ['claude', 'anthropic'],
    partnerKeywords: ['anthropic', 'アンソロピック'],
    provider: 'Anthropic, PBC',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'no_credit',
    expectedTaxTreatmentUnder95: 'no_credit',
    notes: '未登録国外事業者。消費者向け電気通信利用役務の提供だが、インボイス未登録のため仕入税額控除不可。少額特例（税込1万円未満）は適用可能。',
  },
  // === D ===
  {
    id: 'dropbox',
    serviceName: 'Dropbox',
    keywords: ['dropbox', 'ドロップボックス'],
    partnerKeywords: ['dropbox', 'ドロップボックス'],
    provider: 'ドロップボックス インターナショナル アンリミテッド カンパニー',
    country: 'アイルランド',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T6700150104169',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'インボイス登録済のため課税取引。消費者向け電気通信利用役務の提供。',
  },
  // === F ===
  {
    id: 'facebook_ads',
    serviceName: 'Facebook広告',
    keywords: ['facebook広告', 'fb広告', 'meta広告', 'instagram広告', 'フェイスブック広告', 'インスタグラム広告', 'facebook ads', 'meta ads'],
    partnerKeywords: ['meta platforms', 'meta', 'facebook', 'フェイスブック', 'メタ'],
    provider: 'Meta Platforms, Inc.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'business',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'non_taxable',
    expectedTaxTreatmentUnder95: 'reverse_charge',
    notes: '事業者向け電気通信利用役務の提供。課税売上割合95%以上の場合は対象外。95%未満の場合はリバースチャージ方式。2023年10月1日以降、インボイス制度により経過措置適用不可。',
    isAdvertising: true,
  },
  // === G ===
  {
    id: 'github',
    serviceName: 'GitHub',
    keywords: ['github', 'ギットハブ'],
    partnerKeywords: ['github', 'ギットハブ'],
    provider: 'GitHub, Inc.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'mixed',
    invoiceRegistered: true,
    invoiceNumber: 'T4700150079306',
    expectedTaxTreatment: 'check_required',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: '利用プランにより区分が異なる。Enterprise版は事業者向け（リバースチャージ対象）、Team/Pro等は消費者向け（インボイス登録済のため課税）。',
  },
  {
    id: 'google_ads',
    serviceName: 'Google広告',
    keywords: ['google広告', 'google ads', 'グーグル広告', 'adwords', 'アドワーズ'],
    partnerKeywords: ['グーグル合同会社', 'google合同会社', 'google llc'],
    provider: 'グーグル合同会社',
    country: '日本',
    isDomestic: true,
    serviceType: 'business',
    invoiceRegistered: true,
    invoiceNumber: 'T1010401089234',
    expectedTaxTreatment: 'taxable_domestic',
    expectedTaxTreatmentUnder95: 'taxable_domestic',
    notes: '日本法人（グーグル合同会社）経由で提供されるため国内取引として課税取引。',
    isAdvertising: true,
  },
  {
    id: 'google_workspace',
    serviceName: 'Google Workspace',
    keywords: ['google workspace', 'gsuite', 'g suite', 'gmail business', 'google drive business'],
    partnerKeywords: ['google asia pacific', 'google asia'],
    provider: 'Google Asia Pacific Pte. Ltd.',
    country: 'シンガポール',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T4700150006045',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: '登録国外事業者のため課税取引。消費者向け電気通信利用役務の提供。',
  },
  // === M ===
  {
    id: 'microsoft_365',
    serviceName: 'Microsoft 365',
    keywords: ['microsoft 365', 'office 365', 'office365', 'microsoft365', 'マイクロソフト365'],
    partnerKeywords: ['microsoft', 'マイクロソフト'],
    provider: 'Microsoft Corporation',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'mixed',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'check_required',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: '消費者向けプランと事業者向けプランで区分が異なる。利用プランの確認が必要。未登録の場合、消費者向けプランでも仕入税額控除不可。',
  },
  // === N ===
  {
    id: 'netflix',
    serviceName: 'Netflix',
    keywords: ['netflix', 'ネットフリックス'],
    partnerKeywords: ['netflix', 'ネットフリックス'],
    provider: 'Netflix International B.V. / Netflix 合同会社',
    country: 'オランダ / 日本',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: null,
    invoiceNumber: null,
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: '消費者向け電気通信利用役務の提供。登録状況要確認。少額特例は利用できるが、1万円超は対象外。個人向けストリーミングサービス。',
  },
  // === O ===
  {
    id: 'openai',
    serviceName: 'OpenAI（ChatGPT等）',
    keywords: ['openai', 'chatgpt', 'chat gpt', 'gpt-4', 'gpt4', 'dall-e', 'whisper api'],
    partnerKeywords: ['openai', 'オープンエーアイ'],
    provider: 'OpenAI Inc.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'mixed',
    invoiceRegistered: true,
    invoiceNumber: 'T4700150127989',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: '2025年1月以降インボイス登録済。API利用は事業者向け、ChatGPT一般利用は消費者向け。API利用の場合、課税売上割合95%未満ではリバースチャージ対象の可能性あり。',
  },
  // === S ===
  {
    id: 'shopify',
    serviceName: 'Shopify',
    keywords: ['shopify', 'ショッピファイ'],
    partnerKeywords: ['shopify', 'ショッピファイ'],
    provider: 'Shopify Inc.',
    country: 'カナダ',
    isDomestic: false,
    serviceType: 'business',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'non_taxable',
    expectedTaxTreatmentUnder95: 'reverse_charge',
    notes: '事業者向け電気通信利用役務の提供。ECプラットフォームは事業者向けサービスのためリバースチャージ対象。課税売上割合95%以上の場合は対象外。',
  },
  {
    id: 'shutterstock',
    serviceName: 'Shutterstock',
    keywords: ['shutterstock', 'シャッターストック'],
    partnerKeywords: ['shutterstock', 'シャッターストック'],
    provider: 'Shutterstock Ireland',
    country: 'アイルランド',
    isDomestic: false,
    serviceType: 'business',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'non_taxable',
    expectedTaxTreatmentUnder95: 'reverse_charge',
    notes: '事業者向け。リバースチャージ方式適用。海外拠点・国内支店なし。',
  },
  {
    id: 'slack',
    serviceName: 'Slack',
    keywords: ['slack', 'スラック'],
    partnerKeywords: ['slack', 'スラック'],
    provider: 'Slack Technologies',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: null,
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'インボイス登録済。消費者向け電気通信利用役務の提供として課税取引。',
  },
  {
    id: 'spotify',
    serviceName: 'Spotify',
    keywords: ['spotify', 'スポティファイ'],
    partnerKeywords: ['spotify', 'スポティファイ'],
    provider: 'Spotify AB',
    country: 'スウェーデン',
    isDomestic: false,
    serviceType: 'mixed',
    invoiceRegistered: null,
    invoiceNumber: null,
    expectedTaxTreatment: 'check_required',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: '個人利用と事業利用で区分が異なる。消費者向け（課税）と事業者向け（不課税）の判定が必要。登録状況要確認。',
  },
  // === X ===
  {
    id: 'x_ads',
    serviceName: 'X（旧Twitter）広告',
    keywords: ['twitter広告', 'x広告', 'ツイッター広告', 'twitter ads', 'x ads'],
    partnerKeywords: ['x corp', 'twitter', 'ツイッター'],
    provider: 'X Corp.',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'business',
    invoiceRegistered: false,
    invoiceNumber: null,
    expectedTaxTreatment: 'non_taxable',
    expectedTaxTreatmentUnder95: 'reverse_charge',
    notes: '事業者向け電気通信利用役務の提供。2023年10月1日以降、インボイス制度により経過措置適用不可。Facebookと同様の扱い。',
    isAdvertising: true,
  },
  // === Y ===
  {
    id: 'youtube_premium',
    serviceName: 'YouTube Premium',
    keywords: ['youtube premium', 'youtube music', 'ユーチューブプレミアム'],
    partnerKeywords: ['google', 'youtube', 'グーグル'],
    provider: 'Google LLC',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: null,
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'taxable_10',
    notes: 'Googleの登録により課税取引。消費者向け電気通信利用役務の提供。',
  },
  // === Z ===
  {
    id: 'zoom',
    serviceName: 'Zoom',
    keywords: ['zoom', 'ズーム'],
    partnerKeywords: ['zoom', 'ズーム'],
    provider: 'Zoom Video Communications',
    country: 'アメリカ',
    isDomestic: false,
    serviceType: 'consumer',
    invoiceRegistered: true,
    invoiceNumber: 'T6700150118763',
    expectedTaxTreatment: 'taxable_10',
    expectedTaxTreatmentUnder95: 'check_required',
    notes: '消費者向けプランは課税（インボイス登録済）、事業者向けプランはリバースチャージ対象。',
  },
];

// 広告関連サービスの追加キーワード（事業者向けの判定補助）
const ADVERTISING_KEYWORDS = [
  '広告', 'ads', 'advertising', 'ad ', '広告費', '広告宣伝', 'プロモーション', 'promotion',
  'campaign', 'キャンペーン', 'リスティング', 'ディスプレイ',
];

// freee税区分コードの期待値マッピング
const TAX_TREATMENT_TO_FREEE_CODES = {
  // 課対仕入10%（消費者向け・登録済 or 国内取引）
  taxable_10: [136, 138, 34, 36, 129, 155],
  // 国内取引として課税
  taxable_domestic: [136, 138, 34, 36, 129, 155],
  // 対象外（事業者向け・課税売上割合95%以上）
  non_taxable: [2],
  // 仕入税額控除不可（消費者向け・未登録国外事業者） → 対象外として処理
  no_credit: [2],
  // リバースチャージ（事業者向け・課税売上割合95%未満）
  // freeeでのリバースチャージ用税区分コードは会社設定による
  reverse_charge: [],
};

// 消費者向け・未登録国外事業者の少額特例閾値（税込）
const SMALL_AMOUNT_THRESHOLD = 10000;

module.exports = {
  OVERSEAS_SERVICES,
  ADVERTISING_KEYWORDS,
  TAX_TREATMENT_TO_FREEE_CODES,
  SMALL_AMOUNT_THRESHOLD,
};
