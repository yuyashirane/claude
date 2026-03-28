/**
 * 勘定科目・税区分マッチング + 信頼度スコア算出
 *
 * 標準明細を受け取り classification を付与する:
 *   - 勘定科目（22科目）
 *   - 消費税区分（R01〜R12チェック）
 *   - インボイス区分（5区分）
 *   - 信頼度スコア（0〜100点・5要素）
 *   - 判定理由
 *
 * 統合元:
 *   - references/accounting/account-dictionary.md（キーワード辞書）
 *   - references/tax/tax-classification-rules.md（R01〜R12）
 *   - references/tax/invoice-rules.md（インボイス判定フロー）
 *   - references/accounting/confidence-score-rules.md（スコア基準）
 *   - src/shared/rules.js（閾値・ソフトウェアKW・書籍KW等）
 *   - src/shared/overseas-services.js（海外サービスDB）
 */

const { detectOverseasService } = require("../shared/overseas-services");
const {
  ASSET_THRESHOLDS,
  REPAIR_THRESHOLDS,
  SOFTWARE_KEYWORDS,
  BOOK_KEYWORDS,
  TAX_CODE_NAMES,
} = require("../shared/rules");

// --------------------------------------------------
// 勘定科目キーワード辞書（22科目）
// 指示の22科目 + account-dictionary.md + rules.js のキーワードを統合
// --------------------------------------------------
const ACCOUNT_KEYWORDS = {
  旅費交通費: {
    keywords: [
      // 指示の16キーワード
      "電車", "新幹線", "JR", "タクシー", "バス", "Suica", "PASMO", "交通費",
      "出張", "航空券", "ANA", "JAL", "高速道路", "ETC", "駐車場", "ガソリン",
      // account-dictionary.md追加分
      "飛行機", "ICOCA", "宿泊", "ホテル", "定期券", "回数券",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "海外出張の一部は不課税",
  },
  通信費: {
    keywords: [
      "電話", "携帯", "NTT", "KDDI", "au", "ソフトバンク", "docomo",
      "インターネット", "プロバイダ", "切手", "郵便", "宅配便", "ヤマト", "佐川",
      // account-dictionary.md追加分
      "通信", "Wi-Fi", "回線", "はがき", "レターパック", "宅急便", "日本郵便",
      "クリックポスト",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
  },
  消耗品費: {
    keywords: [
      "文具", "コピー用紙", "トナー", "事務用品", "Amazon", "アスクル",
      "ヨドバシ", "ビックカメラ", "PC周辺機器",
      // account-dictionary.md追加分
      "文房具", "インク", "USB", "モノタロウ", "ホームセンター", "工具", "備品",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "10万円以上は固定資産計上の要否を検討",
  },
  接待交際費: {
    keywords: [
      "接待", "会食", "懇親会", "居酒屋", "レストラン", "お中元", "お歳暮",
      "贈答", "ゴルフ",
      // account-dictionary.md追加分
      "飲食", "手土産", "花", "慶弔", "祝金", "香典", "ギフト",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "慶弔見舞金は不課税。1人5,000円以下の飲食は交際費除外可（税務上）",
  },
  会議費: {
    keywords: [
      "会議", "ミーティング", "コーヒー", "カフェ", "スターバックス", "弁当",
      // account-dictionary.md追加分
      "打合せ", "喫茶", "昼食", "ケータリング",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "弁当等は軽減8%の場合あり",
  },
  新聞図書費: {
    keywords: [
      "書籍", "本", "雑誌", "新聞", "日経", "Kindle", "電子書籍",
      // account-dictionary.md追加分
      "定期購読", "セミナー", "研修", "講座", "受講料",
      // rules.js BOOK_KEYWORDS追加分
      "図書", "ブック", "テキスト", "参考書", "専門書",
      "読み放題", "unlimited", "audible", "オーディブル",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "新聞定期購読は軽減8%",
  },
  地代家賃: {
    keywords: [
      "家賃", "賃料", "共益費", "管理費", "テナント", "事務所", "オフィス",
      // account-dictionary.md追加分
      "倉庫", "月極",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "土地部分は非課税、住宅は非課税",
  },
  水道光熱費: {
    keywords: [
      "電気", "水道", "ガス", "電力", "東京電力", "東京ガス",
      // account-dictionary.md追加分
      "関西電力", "大阪ガス", "中部電力", "九州電力", "北海道電力",
      "エネオス", "ENEOS", "光熱費",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
  },
  保険料: {
    keywords: [
      "保険", "損保", "火災保険", "自動車保険", "賠償保険",
      // account-dictionary.md追加分
      "生命保険", "損害保険", "傷害保険",
    ],
    defaultTax: "非課税",
    taxGroup: "non_taxable",
  },
  支払手数料: {
    keywords: [
      "手数料", "振込手数料", "ATM", "代引手数料", "決済手数料",
      // account-dictionary.md追加分
      "仲介手数料", "税理士", "会計士", "弁護士", "司法書士", "社労士",
      "コンサル", "アドバイザリー", "紹介料",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "源泉徴収の要否を確認",
  },
  広告宣伝費: {
    keywords: [
      "広告", "宣伝", "チラシ", "HP制作", "SEO", "リスティング", "SNS広告",
      // account-dictionary.md追加分
      "Google Ads", "Meta", "Facebook", "Instagram", "Yahoo",
      "バナー", "ポスター", "DM", "ダイレクトメール", "プロモーション",
      "求人広告", "Indeed", "マイナビ",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "海外プラットフォーム→R06/R08参照",
  },
  外注費: {
    keywords: [
      "外注", "業務委託", "フリーランス", "下請", "デザイン", "翻訳",
      "システム開発",
      // account-dictionary.md追加分
      "委託料", "制作", "開発", "コンサルティング", "ライティング",
      "清掃", "警備", "人材派遣",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "源泉徴収の要否を確認（士業・デザイン・原稿料等）",
  },
  給料手当: {
    keywords: [
      "給与", "給料", "賞与", "ボーナス", "手当", "残業代",
      // account-dictionary.md追加分
      "賃金", "アルバイト", "パート",
    ],
    defaultTax: "不課税",
    taxGroup: "not_taxable",
    notes: "通勤手当は課税仕入10%（R11）",
  },
  法定福利費: {
    keywords: [
      "社会保険", "健康保険", "厚生年金", "雇用保険", "労災保険",
      // account-dictionary.md追加分
      "法定福利",
    ],
    defaultTax: "不課税",
    taxGroup: "not_taxable",
  },
  福利厚生費: {
    keywords: [
      "福利厚生", "健康診断", "社員旅行", "忘年会", "新年会",
      // account-dictionary.md追加分
      "歓迎会", "送別会", "制服", "作業着", "社宅", "ユニフォーム",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "慶弔見舞金は不課税、社宅家賃は非課税（R12参照）",
  },
  租税公課: {
    keywords: [
      "法人税", "住民税", "事業税", "固定資産税", "印紙",
      // account-dictionary.md追加分
      "登録免許税", "自動車税", "不動産取得税", "市県民税",
      "過怠税", "延滞金", "加算税", "収入印紙",
    ],
    defaultTax: "不課税",
    taxGroup: "not_taxable",
  },
  減価償却費: {
    keywords: ["減価償却", "償却"],
    defaultTax: "不課税",
    taxGroup: "not_taxable",
    notes: "取得時に課税仕入処理済み",
  },
  修繕費: {
    keywords: ["修繕", "修理", "補修", "メンテナンス", "リフォーム", "改修"],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "20万円以上は資本的支出の検討",
  },
  仕入高: {
    keywords: [
      "仕入", "商品仕入", "原材料",
      // account-dictionary.md追加分
      "商品", "材料", "部品", "製品", "在庫",
    ],
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "飲食料品は軽減8%",
  },
  売上高: {
    keywords: ["売上", "報酬", "顧問料", "コンサルティング"],
    defaultTax: "課税売上10%",
    taxGroup: "taxable_sale",
  },
  支払利息: {
    keywords: ["利息", "利子", "金利", "ローン利息"],
    defaultTax: "非課税",
    taxGroup: "non_taxable",
  },
  雑費: {
    keywords: [], // キーワードなし（フォールバック用）
    defaultTax: "課税10%",
    taxGroup: "taxable",
    notes: "多用注意",
  },
};

// --------------------------------------------------
// freee勘定科目ID（あしたの会計事務所 474381）
// ⚠ IDは事業所ごとに異なる。他社展開時はAPI取得が必要
// --------------------------------------------------
const FREEE_ACCOUNT_IDS = {
  旅費交通費: 236940269,
  通信費: 236940270,
  消耗品費: 236940271,
  接待交際費: 236940272,
  会議費: 236940273,
  新聞図書費: 236940274,
  水道光熱費: 236940275,
  地代家賃: 236940276,
  保険料: 236940277,
  支払手数料: 236940278,
  広告宣伝費: 236940279,
  外注費: 236940281,
  給料手当: 236940282,
  法定福利費: 236940283,
  福利厚生費: 236940284,
  租税公課: 236940285,
  減価償却費: 236940286,
  修繕費: 236940287,
  仕入高: 236940261,
  売上高: 236940260,
  雑費: 236940288,
  支払利息: 236940289,
};

// --------------------------------------------------
// 消費税コード（freee API用）
// --------------------------------------------------
const TAX_CODES = {
  tax_10: 136,           // 課対仕入10%
  tax_8: 137,            // 課対仕入8%（非対仕入10%だが実質8%枠で使用）
  tax_8_reduced: 163,    // 課対仕入8%(軽)
  tax_10_sale: 102,      // 課税売上（旧）
  tax_10_sale_new: 129,  // 課税売上10%
  tax_8_sale: 108,       // 課対仕入8%（旧）
  tax_8_sale_reduced: 156, // 課税売上8%(軽)
  non_taxable: 23,       // 非課仕入
  not_taxable: 2,        // 対象外
  not_taxable_38: 38,    // 対外仕入
  tax_free_export: 25,   // 輸出免税
  reverse_charge: 148,   // リバースチャージ
  invoice_80: 189,       // 課対仕入(控80)10%
  invoice_50: 190,       // 課対仕入(控50)10%
  unknown: 0,
};

// 税区分テキスト→freee税コードマッピング
const TAX_CLASS_TO_CODE = {
  "課税10%": TAX_CODES.tax_10,
  "課税8%（軽減）": TAX_CODES.tax_8_reduced,
  "課税売上10%": TAX_CODES.tax_10_sale_new,
  "課税売上8%": TAX_CODES.tax_8_sale_reduced,
  "非課税": TAX_CODES.non_taxable,
  "不課税": TAX_CODES.not_taxable,
  "対象外": TAX_CODES.not_taxable,
  "免税": TAX_CODES.not_taxable_38,
  "リバースチャージ": TAX_CODES.reverse_charge,
  "非適格80%": TAX_CODES.invoice_80,
  "非適格50%": TAX_CODES.invoice_50,
  "要確認": TAX_CODES.unknown,
};

// --------------------------------------------------
// 除外キーワード
// --------------------------------------------------
const EXCLUSION_KEYWORDS = [
  "振替", "振込", "相殺", "戻入", "取消", "キャンセル",
  "口座間", "立替", "預り", "仮受", "仮払", "資金移動",
];

// --------------------------------------------------
// メイン関数
// --------------------------------------------------

/**
 * 標準明細に勘定科目・税区分・信頼度スコアを付与
 *
 * @param {Object} item - format-standardizer.js で生成した標準明細（StandardRow形式もOK）
 * @param {Object} [options]
 * @param {Array} [options.pastDeals] - freee過去仕訳データ（将来拡張）
 * @returns {Object} classification が付与された標準明細
 */
function classifyTransaction(item, options = {}) {
  // StandardRow形式とformat-standardizer形式の両方に対応
  const tx = item.transaction || item;
  const description = tx.description || "";
  const partnerName = tx.partner_name || tx.counterpart || "";
  const amount = tx.amount || 0;
  const searchText = `${description} ${partnerName}`.toLowerCase();

  // 0. 除外チェック
  if (isExcluded(item)) {
    item.classification = {
      estimated_account: null,
      estimated_tax_class: null,
      invoice_class: null,
      confidence_score: 0,
      confidence_rank: "Excluded",
      excluded: true,
      exclude_reason: getExcludeReason(item),
      score_breakdown: {
        keyword_match: 0, past_pattern: 0, amount_validity: 0,
        tax_rule_clarity: 0, description_quality: 0,
      },
      tax_flags: [],
      tax_flag_details: [],
      special_flags: [],
      matched_accounts: [],
      routing_reason: "除外対象",
    };
    return item;
  }

  // 1. キーワードマッチ（30pt）
  const keywordResult = matchKeywords(searchText, tx.account_hint);

  // 2. 過去仕訳パターン（30pt）— 未実装、0pt固定
  const pastResult = { score: 0, detail: "過去仕訳データ未参照" };

  // 3. 金額の妥当性（15pt）
  const amountResult = scoreAmount(Math.abs(amount));

  // 4. 消費税ルール明確さ（15pt）
  const taxResult = checkTaxRules(keywordResult.bestAccount, searchText, amount);

  // 5. 摘要の情報量（10pt）
  const descResult = scoreDescription(description);

  const totalScore = keywordResult.score + pastResult.score
    + amountResult.score + taxResult.score + descResult.score;
  const rank = totalScore >= 75 ? "High" : totalScore >= 45 ? "Medium" : "Low";

  // 特殊フラグ（rules.jsの閾値を使用）
  const specialFlags = [];
  const absAmt = Math.abs(amount);
  if (keywordResult.bestAccount === "消耗品費") {
    if (absAmt >= ASSET_THRESHOLDS.HIGH) {
      specialFlags.push("固定資産確認（30万円以上→原則固定資産）");
    } else if (absAmt >= ASSET_THRESHOLDS.MEDIUM) {
      specialFlags.push("固定資産確認（20万円以上→一括償却資産検討）");
    } else if (absAmt >= ASSET_THRESHOLDS.LOW) {
      specialFlags.push("固定資産確認（10万円以上→少額減価償却検討）");
    }
  }
  if (keywordResult.bestAccount === "修繕費") {
    if (absAmt >= REPAIR_THRESHOLDS.HIGH) {
      specialFlags.push("資本的支出確認（60万円以上→可能性高）");
    } else if (absAmt >= REPAIR_THRESHOLDS.MEDIUM) {
      specialFlags.push("資本的支出確認（20万円以上→要確認）");
    }
  }
  if (["外注費", "支払手数料"].includes(keywordResult.bestAccount)
      && /士業|デザイン|原稿|翻訳|コンサル|税理士|弁護士|司法書士|社労士/.test(searchText)) {
    specialFlags.push("源泉徴収確認");
  }
  // ソフトウェア関連のチェック（rules.js統合）
  if (absAmt >= ASSET_THRESHOLDS.LOW
      && SOFTWARE_KEYWORDS.some((kw) => searchText.includes(kw.toLowerCase()))) {
    if (!specialFlags.some((f) => f.includes("固定資産"))) {
      specialFlags.push("ソフトウェア資産化検討（10万円以上）");
    }
  }

  // インボイス区分
  const invoiceClass = determineInvoiceClass(
    keywordResult.bestAccount, searchText, taxResult, absAmt
  );

  // 判定理由
  const parts = [`${rank}（${totalScore}点）`];
  if (keywordResult.bestAccount) {
    parts.push(`科目: ${keywordResult.bestAccount}`);
  } else {
    parts.push("科目: マッチなし→雑費");
  }
  if (taxResult.flags.length > 0) {
    parts.push(`税指摘: ${taxResult.flags.join(",")}`);
  }

  item.classification = {
    estimated_account: keywordResult.bestAccount || "雑費",
    estimated_account_id: FREEE_ACCOUNT_IDS[keywordResult.bestAccount || "雑費"],
    estimated_tax_class: taxResult.determinedTax || keywordResult.defaultTax || "課税10%",
    estimated_tax_code: TAX_CLASS_TO_CODE[
      taxResult.determinedTax || keywordResult.defaultTax || "課税10%"
    ] || 0,
    invoice_class: invoiceClass,
    confidence_score: totalScore,
    confidence_rank: rank,
    score_breakdown: {
      keyword_match: keywordResult.score,
      past_pattern: pastResult.score,
      amount_validity: amountResult.score,
      tax_rule_clarity: taxResult.score,
      description_quality: descResult.score,
    },
    tax_flags: taxResult.flags,
    tax_flag_details: taxResult.flagDetails,
    special_flags: specialFlags,
    matched_accounts: keywordResult.allMatches,
    routing_reason: parts.join(" / "),
  };

  return item;
}

/**
 * 複数の標準明細を一括分類
 */
function classifyTransactions(items, options = {}) {
  return items.map((item) => classifyTransaction(item, options));
}

// --------------------------------------------------
// 除外判定
// --------------------------------------------------

function isExcluded(item) {
  const tx = item.transaction || item;
  if (tx.rule_matched === true) return true;
  if (tx.amount === 0 || item.rawData?.amount === 0) return true;
  const text = `${tx.description || ""} ${tx.partner_name || tx.counterpart || ""}`.toLowerCase();
  return EXCLUSION_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

function getExcludeReason(item) {
  const tx = item.transaction || item;
  if (tx.rule_matched === true) return "rule_matched（freee自動仕訳ルール適用済み）";
  if (tx.amount === 0 || item.rawData?.amount === 0) return "金額0";
  const text = `${tx.description || ""} ${tx.partner_name || tx.counterpart || ""}`.toLowerCase();
  const matched = EXCLUSION_KEYWORDS.find((kw) => text.includes(kw.toLowerCase()));
  return matched ? `除外キーワード「${matched}」` : "不明";
}

// --------------------------------------------------
// 要素1: キーワード辞書マッチ（30点満点）
// キーワード長に比例してスコア加算
// --------------------------------------------------

function matchKeywords(searchText, accountHint) {
  // ヒント完全一致
  if (accountHint && ACCOUNT_KEYWORDS[accountHint]) {
    return {
      score: 30,
      bestAccount: accountHint,
      defaultTax: ACCOUNT_KEYWORDS[accountHint].defaultTax,
      allMatches: [{ account: accountHint, matchedKeywords: ["(ヒント一致)"], score: 30 }],
    };
  }

  const matches = [];
  for (const [account, config] of Object.entries(ACCOUNT_KEYWORDS)) {
    if (config.keywords.length === 0) continue;
    const matchedKw = config.keywords.filter((kw) =>
      searchText.includes(kw.toLowerCase())
    );
    if (matchedKw.length > 0) {
      const longestMatch = Math.max(...matchedKw.map((kw) => kw.length));
      matches.push({
        account,
        matchedKeywords: matchedKw,
        keywordCount: matchedKw.length,
        longestMatch,
        defaultTax: config.defaultTax,
      });
    }
  }

  matches.sort((a, b) =>
    b.keywordCount - a.keywordCount || b.longestMatch - a.longestMatch
  );

  if (matches.length === 0) {
    return { score: 0, bestAccount: null, defaultTax: null, allMatches: [] };
  }

  // キーワード長に比例したスコア（30pt満点）
  let score;
  if (matches.length === 1) {
    const longest = matches[0].longestMatch;
    score = longest >= 4 ? 30 : longest >= 2 ? 25 : 20;
  } else if (matches.length === 2) {
    score = 15;
  } else {
    score = 8; // 3つ以上マッチ → 曖昧
  }

  return {
    score,
    bestAccount: matches[0].account,
    defaultTax: matches[0].defaultTax,
    allMatches: matches.map((m) => ({
      account: m.account,
      matchedKeywords: m.matchedKeywords,
      score: m.keywordCount,
    })),
  };
}

// --------------------------------------------------
// 要素3: 金額の妥当性（15点満点）
// --------------------------------------------------

function scoreAmount(absAmount) {
  if (absAmount < 100000) return { score: 15, detail: "10万円未満" };
  if (absAmount < 300000) return { score: 10, detail: "10〜30万円" };
  return { score: 5, detail: "30万円以上" };
}

// --------------------------------------------------
// 要素4: 消費税ルールチェック R01〜R12（15点満点）
// tax-classification-rules.md の全ルールを統合
// --------------------------------------------------

function checkTaxRules(account, searchText, amount) {
  const flags = [];
  const flagDetails = [];
  let determinedTax = null;
  const config = account ? ACCOUNT_KEYWORDS[account] : null;

  if (!account) {
    // 科目未定でも海外サービスチェックは実行
    const overseasCheck = detectOverseasService(searchText);
    if (overseasCheck) {
      flags.push("R06");
      flagDetails.push({
        rule: "R06", severity: "🟡",
        message: `海外サービス（${overseasCheck.service.serviceName}）検出・科目未定`,
      });
      return { score: 3, flags, flagDetails, determinedTax: "要確認", detail: "R06: 海外サービス検出・科目未定" };
    }
    return { score: 0, flags: [], flagDetails: [], determinedTax: null, detail: "科目未定" };
  }

  // === R01: 非課税取引（保険料, 利息, 住居等）が課税になっていないか ===
  if (["保険料", "支払利息"].includes(account)) {
    determinedTax = "非課税";
    return { score: 15, flags, flagDetails, determinedTax,
      detail: `R01: ${account}→非課税（明確）` };
  }
  // R01追加: 地代家賃の住宅部分
  if (account === "地代家賃" && /住宅|社宅|寮|マンション/.test(searchText)) {
    flags.push("R01");
    flagDetails.push({ rule: "R01", severity: "🟡",
      message: "住宅関連→非課税の可能性（R02: 土地・住宅が課税になっていないか）" });
    determinedTax = "非課税";
    return { score: 8, flags, flagDetails, determinedTax,
      detail: "R01: 住宅関連→非課税の可能性" };
  }

  // === R02: 不課税取引（給与, 寄付, 香典等）が課税になっていないか ===
  if (["給料手当", "法定福利費", "租税公課", "減価償却費"].includes(account)) {
    determinedTax = "不課税";
    return { score: 15, flags, flagDetails, determinedTax,
      detail: `R02: ${account}→不課税（明確）` };
  }
  // R02追加: 福利厚生費の慶弔見舞金は不課税
  if (account === "福利厚生費" && /慶弔|香典|祝金|見舞/.test(searchText)) {
    flags.push("R02");
    flagDetails.push({ rule: "R02", severity: "🟡",
      message: "慶弔見舞金→不課税の可能性" });
    determinedTax = "不課税";
    return { score: 8, flags, flagDetails, determinedTax,
      detail: "R02: 慶弔見舞金→不課税" };
  }
  // R02追加: 接待交際費の香典等は不課税
  if (account === "接待交際費" && /香典|祝金|見舞|弔慰/.test(searchText)) {
    flags.push("R02");
    flagDetails.push({ rule: "R02", severity: "🟡",
      message: "香典・祝金→不課税の可能性" });
    determinedTax = "不課税";
    return { score: 8, flags, flagDetails, determinedTax,
      detail: "R02: 香典・祝金→不課税" };
  }

  // === R04: 軽減税率8%対象（食品,飲料,新聞 ※外食・酒除く） ===
  if (/弁当|食品|飲料|お茶|ジュース|水|食料|テイクアウト/.test(searchText)) {
    if (!/外食|レストラン|居酒屋|酒|ビール|ワイン|ケータリング|出張料理/.test(searchText)) {
      flags.push("R04");
      flagDetails.push({ rule: "R04", severity: "🟡",
        message: "軽減税率8%対象の可能性（食品・飲料）" });
      determinedTax = "課税8%（軽減）";
      return { score: 12, flags, flagDetails, determinedTax,
        detail: "R04: 軽減税率8%の可能性" };
    }
  }
  if (/新聞/.test(searchText) && /定期購読|月額|月ぎめ|週2/.test(searchText)) {
    flags.push("R04");
    flagDetails.push({ rule: "R04", severity: "🟡",
      message: "新聞定期購読→軽減税率8%" });
    determinedTax = "課税8%（軽減）";
    return { score: 12, flags, flagDetails, determinedTax,
      detail: "R04: 新聞定期購読→軽減8%" };
  }

  // === R06: 海外サービスのリバースチャージ対象チェック ===
  const overseasResult = detectOverseasService(searchText);
  if (overseasResult) {
    const svc = overseasResult.service;
    if (svc.expectedTaxTreatment === "non_taxable" || svc.serviceType === "business") {
      // 事業者向け海外サービス → RC（課税売上割合95%以上なら対象外）
      determinedTax = "リバースチャージ";
      // R06でRC判定の場合はフラグなし（仕様通り: taxClass=reverse_chargeならフラグなし）
      return { score: 10, flags: [], flagDetails: [], determinedTax,
        detail: `R06: ${svc.serviceName}→RC` };
    }
    if (svc.expectedTaxTreatment === "taxable_10") {
      determinedTax = "課税10%";
      return { score: 12, flags, flagDetails, determinedTax,
        detail: `海外サービス（${svc.serviceName}）→課税10%（登録済み）` };
    }
    if (svc.expectedTaxTreatment === "no_credit") {
      // 消費者向け・未登録国外事業者
      flags.push("R06");
      flagDetails.push({ rule: "R06", severity: "🟡",
        message: `${svc.serviceName}: 未登録国外事業者→仕入税額控除不可` });
      determinedTax = "対象外";
      return { score: 8, flags, flagDetails, determinedTax,
        detail: `R06: ${svc.serviceName}→控除不可` };
    }
    if (svc.expectedTaxTreatment === "check_required") {
      flags.push("R06");
      flagDetails.push({ rule: "R06", severity: "🟡",
        message: `海外サービス（${svc.serviceName}）: サービス区分要確認` });
      return { score: 3, flags, flagDetails, determinedTax: "要確認",
        detail: `R06: ${svc.serviceName}→要確認` };
    }
  }

  // === R08: 給与関連が課税になっていないか ===
  if (/給与|給料|賞与|ボーナス|手当/.test(searchText)
      && config && config.taxGroup === "taxable") {
    flags.push("R08");
    flagDetails.push({ rule: "R08", severity: "🔴",
      message: "給与関連が課税仕入になっている可能性" });
    return { score: 3, flags, flagDetails, determinedTax: "要確認",
      detail: "R08: 給与関連→課税仕入の可能性" };
  }

  // === R09: 租税公課が課税になっていないか ===
  if (/印紙|法人税|住民税|事業税|固定資産税|自動車税|登録免許/.test(searchText)
      && config && config.taxGroup === "taxable") {
    flags.push("R09");
    flagDetails.push({ rule: "R09", severity: "🔴",
      message: "租税公課が課税仕入になっている可能性" });
    return { score: 3, flags, flagDetails, determinedTax: "要確認",
      detail: "R09: 租税公課→課税仕入の可能性" };
  }

  // === R11: 勘定科目と税区分の整合性 ===
  if (account === "売上高") {
    determinedTax = "課税売上10%";
    return { score: 15, flags, flagDetails, determinedTax,
      detail: "R11: 売上高→課税売上10%（明確）" };
  }

  // デフォルト: 税区分が明確な科目
  if (config && config.defaultTax) {
    determinedTax = config.defaultTax;
    return { score: 12, flags, flagDetails, determinedTax,
      detail: `${account}→${determinedTax}（概ね明確）` };
  }

  return { score: 8, flags, flagDetails, determinedTax: "課税10%", detail: "デフォルト" };
}

// --------------------------------------------------
// 要素5: 摘要の情報量（10点満点）
// --------------------------------------------------

function scoreDescription(description) {
  if (!description) return { score: 0, detail: "摘要なし" };
  const len = description.length;
  if (len >= 20) return { score: 10, detail: `${len}文字（十分）` };
  if (len >= 10) return { score: 7, detail: `${len}文字（やや短い）` };
  if (len >= 5) return { score: 4, detail: `${len}文字（短い）` };
  return { score: 0, detail: `${len}文字（情報不足）` };
}

// --------------------------------------------------
// インボイス区分判定（invoice-rules.md統合）
// --------------------------------------------------

function determineInvoiceClass(account, searchText, taxResult, absAmount) {
  const config = account ? ACCOUNT_KEYWORDS[account] : null;

  // 非課税・不課税は「不要」
  if (config && (config.taxGroup === "non_taxable" || config.taxGroup === "not_taxable")) {
    return "不要";
  }

  // 3万円未満の公共交通機関（鉄道・バス）→「不要」
  if (absAmount < 30000 && /電車|バス|JR|Suica|PASMO|ICOCA|新幹線|地下鉄/.test(searchText)) {
    return "不要";
  }

  // 切手・郵便→「不要」
  if (/切手|郵便/.test(searchText)) {
    return "不要";
  }

  // 海外サービスの場合、登録状況を確認
  const overseas = detectOverseasService(searchText);
  if (overseas) {
    const svc = overseas.service;
    if (svc.invoiceRegistered === true) return "適格";
    if (svc.invoiceRegistered === false) {
      const now = new Date();
      if (now <= new Date("2026-09-30")) return "非適格80%";
      if (now <= new Date("2029-09-30")) return "非適格50%";
      return "非適格";
    }
    return "要確認";
  }

  // 少額特例: 税込1万円未満（2023/10/1〜2029/9/30）
  // ※ 基準期間の課税売上高1億円以下の事業者が対象（ここでは金額のみ判定）
  if (absAmount < 10000) {
    const now = new Date();
    if (now <= new Date("2029-09-30")) {
      return "要確認"; // 少額特例の適用可能性はあるが、取引先の登録状況不明
    }
  }

  return "要確認";
}

module.exports = {
  classifyTransaction,
  classifyTransactions,
  ACCOUNT_KEYWORDS,
  FREEE_ACCOUNT_IDS,
  TAX_CODES,
  TAX_CLASS_TO_CODE,
  EXCLUSION_KEYWORDS,
};
