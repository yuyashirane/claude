/**
 * 過去パターンストア（30pt）
 *
 * freee API の過去12ヶ月の処理済み取引（deals）から摘要・取引先→勘定科目の
 * パターンをキャッシュし、新規明細の分類に再利用する。
 *
 * フォールバック優先順位:
 *   1. ファイルキャッシュ  : data/{companyId}/past-deals.json が新鮮なら即返す
 *   2. freee API 取得    : キャッシュ未存在 or 古い場合に取得してキャッシュ保存
 *   3. 空ストア          : API 未接続（テスト環境等）は空パターンを返す（0pt固定）
 */

"use strict";

const fs    = require("fs");
const path  = require("path");
const https = require("https");
const iconv = require("iconv-lite");

// --------------------------------------------------
// 定数
// --------------------------------------------------

/** キャッシュの有効期限（ms）: 24時間 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** API ページサイズ上限 */
const PAGE_LIMIT = 100;

/** キャッシュファイル名 */
const CACHE_FILE = "past-deals.json";

/** data/ ディレクトリの絶対パス */
const DATA_ROOT = path.resolve(__dirname, "../../data");

// --------------------------------------------------
// テキスト正規化
// --------------------------------------------------

/**
 * 摘要・取引先名を正規化してパターンキーを生成する。
 * - スペース除去
 * - 全角→半角（数字・英字）
 * - 4桁以上の連続数字 → * （注文番号等をワイルドカード化）
 * - 日付パターン (MM/DD) → *
 * - 大文字統一
 *
 * @param {string} desc
 * @returns {string}
 */
function normalizeDescription(desc) {
  if (!desc || typeof desc !== "string") return "";
  return desc
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\d{4,}/g, "*")
    .replace(/\d{2}\/\d{2}/g, "*")
    .toUpperCase();
}

// --------------------------------------------------
// カタカナ抽出・振込名マッピング
// --------------------------------------------------

/**
 * 明細の摘要からカタカナ部分（振込名）を抽出する。
 * 銀行振込明細のパターン:
 *   「振込 フジワラ ケイ」         → 「フジワラケイ」
 *   「振込　㈱アックスコンサルティング」 → 「アックスコンサルティング」
 *   「フリコミ テスト タロウ」     → 「テストタロウ」
 *
 * @param {string} desc - 正規化済みの摘要（normalizeDescription 適用後）
 * @returns {string|null} カタカナ文字列（スペース除去済み）or null
 */
function extractKanaFromDescription(desc) {
  if (!desc) return null;

  // 振込・フリコミ等のプレフィックスを除去
  let cleaned = desc.replace(/^(振込|フリコミ|入金|ニュウキン|送金|ソウキン)[^\u30A0-\u30FF]*/i, "");

  // ㈱㈲等の会社記号とスペースを除去
  cleaned = cleaned.replace(/[㈱㈲]/g, "").replace(/\s+/g, "");

  // カタカナが含まれていれば返す（ひらがな・漢字混じりは対象外）
  if (/[ァ-ヶー]/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * 既存自動登録ルールCSV（cp932）からカタカナ→取引先名マッピングを構築する。
 *
 * ヘッダー行から自動でカラム位置を検出する（新旧フォーマット対応）。
 *   新フォーマット（53列）: [3]取引内容 / [12]取引先 / [14]勘定科目 / [15]税区分
 *   旧フォーマット（21列）: [2]取引内容 / [12]取引先 / [10]勘定科目 / [11]税区分
 *
 * @param {string} csvPath - CSVファイルのパス（Shift_JIS / cp932）
 * @returns {Object} { [normalizedKana]: { partnerName, accountName, taxClassification, count } }
 */
function buildKanaMapFromRuleCsv(csvPath) {
  const kanaMap = {};

  let text;
  try {
    const buf = fs.readFileSync(csvPath);
    text = iconv.decode(buf, "cp932");
  } catch (e) {
    console.warn(`[past-pattern-store] ルールCSV読込失敗 (${csvPath}): ${e.message}`);
    return kanaMap;
  }

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return kanaMap;

  // ヘッダーからカラム位置を自動検出
  const headerCols = lines[0].split(",");
  const colIdx = detectRuleCsvColumns(headerCols);
  if (!colIdx) {
    console.warn("[past-pattern-store] ルールCSVのヘッダーが認識できません");
    return kanaMap;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 簡易CSV分割（カンマ区切り、クォートなし前提）
    const cols = line.split(",");
    if (cols.length <= colIdx.partner) continue;

    const content     = (cols[colIdx.content]  || "").trim();
    const partnerName = (cols[colIdx.partner]  || "").trim();
    const accountName = (cols[colIdx.account]  || "").trim();
    const taxClass    = (cols[colIdx.tax]      || "").trim();

    if (!content || !partnerName) continue;

    // 取引内容にカタカナが含まれる場合のみ対象
    if (!/[ァ-ヶー]/.test(content)) continue;

    // スペース除去 + 振込プレフィックス除去して正規化キーを作成
    // extractKanaFromDescription() と同じ正規化を適用してキーを一致させる
    let kanaKey = content.replace(/\s+/g, "").replace(/[㈱㈲]/g, "");
    kanaKey = kanaKey.replace(/^(振込|フリコミ|入金|ニュウキン|送金|ソウキン)/, "");
    if (!kanaKey) continue;

    if (!kanaMap[kanaKey]) {
      kanaMap[kanaKey] = { partnerName, accountName, taxClassification: taxClass, count: 0 };
    }
    kanaMap[kanaKey].count++;
    // 最新エントリで勘定科目・税区分を上書き
    if (accountName) kanaMap[kanaKey].accountName       = accountName;
    if (taxClass)    kanaMap[kanaKey].taxClassification = taxClass;
  }

  return kanaMap;
}

/**
 * ルールCSVのヘッダーからカラムインデックスを検出する。
 * 新フォーマット（53列、カードラベルあり）と旧フォーマット（21列）に対応。
 *
 * @param {string[]} headerCols - ヘッダー行をカンマ分割した配列
 * @returns {{ content: number, partner: number, account: number, tax: number }|null}
 */
function detectRuleCsvColumns(headerCols) {
  const contentIdx = headerCols.findIndex((h) => h.trim() === "取引内容");
  const partnerIdx = headerCols.findIndex((h) => h.trim() === "取引先");
  const accountIdx = headerCols.findIndex((h) => h.trim() === "勘定科目");
  const taxIdx     = headerCols.findIndex((h) => h.trim() === "税区分");

  if (contentIdx < 0 || partnerIdx < 0) return null;

  return {
    content: contentIdx,
    partner: partnerIdx,
    account: accountIdx >= 0 ? accountIdx : -1,
    tax:     taxIdx >= 0     ? taxIdx     : -1,
  };
}

/**
 * partners API レスポンスからカタカナ→取引先名マッピングを構築する。
 * partner.shortcut1 / shortcut2 にカタカナ読みが格納されることがある。
 *
 * @param {Array} partners - freee /api/1/partners レスポンスの partners 配列
 * @returns {Object} { [normalizedKana]: { partnerName, accountName, taxClassification, count } }
 */
function buildKanaMapFromPartners(partners) {
  const kanaMap = {};

  for (const p of (partners || [])) {
    const name = (p.name || "").trim();
    if (!name) continue;

    for (const field of ["shortcut1", "shortcut2"]) {
      const kana = (p[field] || "").trim().replace(/\s+/g, "").replace(/[㈱㈲]/g, "");
      if (!kana || !/[ァ-ヶー]/.test(kana)) continue;

      if (!kanaMap[kana]) {
        kanaMap[kana] = { partnerName: name, accountName: "", taxClassification: "", count: 1 };
      }
    }
  }

  return kanaMap;
}

// --------------------------------------------------
// deals API レスポンスからパターン抽出
// --------------------------------------------------

/**
 * deals 配列からパターンマップを構築する。
 * キー: 取引先名 > 明細摘要 の正規化文字列（優先順）
 *
 * freee APIのdealsレスポンスには account_item_name / tax_code_name / partner.name が
 * 含まれない場合がある（IDのみ）。その場合、masterMaps で名前解決する。
 *
 * @param {Array} deals - freee /api/1/deals レスポンスの deals 配列
 * @param {Object} [masterMaps] - マスタマッピング（省略可）
 * @param {Object} [masterMaps.accountItems] - { [account_item_id]: "勘定科目名" }
 * @param {Object} [masterMaps.taxCodes]     - { [tax_code]: "税区分名" }
 * @param {Object} [masterMaps.partners]     - { [partner_id]: "取引先名" }
 * @returns {Object} { [normalizedKey]: PatternEntry }
 */
function extractPatternsFromDeals(deals, masterMaps) {
  const patterns = {};
  const acctMap    = (masterMaps && masterMaps.accountItems) || {};
  const taxMap     = (masterMaps && masterMaps.taxCodes)     || {};
  const partnerMap = (masterMaps && masterMaps.partners)     || {};

  for (const deal of deals) {
    // 取引先名の解決: partner.name → masterMaps.partners[partner_id]
    const resolvedPartnerName =
      deal.partner?.name ||
      (deal.partner_id && partnerMap[deal.partner_id]) ||
      "";

    // パターンキー: 取引先名が最も安定した識別子
    const rawKey =
      resolvedPartnerName ||
      deal.details?.[0]?.description ||
      null;

    if (!rawKey) continue;

    const key = normalizeDescription(rawKey);
    if (!key || key.length < 2) continue;

    // 勘定科目名の解決: account_item_name → masterMaps.accountItems[account_item_id]
    const detail = deal.details?.[0];
    const accountName =
      detail?.account_item_name ||
      (detail?.account_item_id && acctMap[detail.account_item_id]) ||
      "";

    // 税区分名の解決: tax_code_name → masterMaps.taxCodes[tax_code]
    const taxClassification =
      detail?.tax_code_name ||
      (detail?.tax_code && taxMap[detail.tax_code]) ||
      "";

    const partnerName = resolvedPartnerName;
    const issueDate   = deal.issue_date || "";

    if (!patterns[key]) {
      patterns[key] = {
        accountName,
        taxClassification,
        partnerName,
        count: 0,
        lastDate: issueDate,
      };
    }

    patterns[key].count++;
    if (issueDate > patterns[key].lastDate) {
      patterns[key].lastDate = issueDate;
    }
    // 最新の取引の勘定科目・税区分で上書き（最新が最も正確と想定）
    if (issueDate === patterns[key].lastDate) {
      if (accountName)       patterns[key].accountName       = accountName;
      if (taxClassification) patterns[key].taxClassification = taxClassification;
    }
  }

  return patterns;
}

// --------------------------------------------------
// freee API ユーティリティ
// --------------------------------------------------

/**
 * freee REST API GET リクエスト（https モジュール使用）
 *
 * @param {string} accessToken
 * @param {string} apiPath  - 例: "/api/1/deals"
 * @param {Object} query
 * @returns {Promise<Object>}
 */
function freeeApiGet(accessToken, apiPath, query) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams(query).toString();
    const fullPath = params ? `${apiPath}?${params}` : apiPath;

    const options = {
      hostname: "api.freee.co.jp",
      path: fullPath,
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * deals API を全件ページネーション取得する。
 *
 * @param {string} accessToken
 * @param {string|number} companyId
 * @param {number} monthsBack  - 過去何ヶ月分
 * @returns {Promise<Array>}   - deals 配列
 */
async function fetchAllDeals(accessToken, companyId, monthsBack) {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - monthsBack);
  const startDate = start.toISOString().slice(0, 10);
  const endDate   = today.toISOString().slice(0, 10);

  const allDeals = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await freeeApiGet(accessToken, "/api/1/deals", {
      company_id:       String(companyId),
      start_issue_date: startDate,
      end_issue_date:   endDate,
      limit:            PAGE_LIMIT,
      offset,
    });

    const deals = data.deals || [];
    allDeals.push(...deals);

    if (deals.length < PAGE_LIMIT) {
      hasMore = false;
    } else {
      offset += PAGE_LIMIT;
    }
  }

  return allDeals;
}

// --------------------------------------------------
// ファイルキャッシュ
// --------------------------------------------------

/**
 * @param {string|number} companyId
 * @param {string} [cacheDir]
 * @returns {string} キャッシュファイルの絶対パス
 */
function getCachePath(companyId, cacheDir) {
  const dir = cacheDir || path.join(DATA_ROOT, String(companyId));
  return path.join(dir, CACHE_FILE);
}

/**
 * キャッシュファイルを読み込む。
 * 存在しない / 期限切れ / 壊れている場合は null を返す。
 *
 * @param {string} cachePath
 * @returns {Object|null} patterns オブジェクト or null
 */
function loadCache(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, "utf-8");
    const cached = JSON.parse(raw);
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    if (age > CACHE_TTL_MS) return null; // 期限切れ
    return cached.patterns || null;
  } catch {
    return null;
  }
}

/**
 * パターンをキャッシュファイルに保存する。
 *
 * @param {string} cachePath
 * @param {Object} patterns
 */
function saveCache(cachePath, patterns) {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ cachedAt: new Date().toISOString(), patterns }, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.warn(`[past-pattern-store] キャッシュ保存失敗: ${e.message}`);
  }
}

// --------------------------------------------------
// PastPatternStore クラス
// --------------------------------------------------

class PastPatternStore {
  /**
   * @param {Object} patterns - { [normalizedKey]: PatternEntry }
   * @param {Object} [kanaMap] - { [kana]: { partnerName, accountName, taxClassification, count } }
   */
  constructor(patterns, kanaMap) {
    /** @type {Object} { [normalizedKey]: PatternEntry } */
    this.patterns = patterns || {};
    this._patternEntries = Object.entries(this.patterns);
    /** @type {Object} カタカナ→取引先名マッピング */
    this.kanaMap = kanaMap || {};
  }

  /**
   * 明細の摘要テキストに対して過去パターンを照合する。
   *
   * @param {string} description
   * @returns {{ accountName, taxClassification, partnerName, count, lastDate, matchType }|null}
   *   matchType: 'exact' | 'partial' | 'kana_mapped' | null（マッチなし）
   */
  matchPattern(description) {
    const normalizedDesc = normalizeDescription(description);
    if (!normalizedDesc) return null;

    // 1. 完全一致
    if (this.patterns[normalizedDesc]) {
      return { ...this.patterns[normalizedDesc], matchType: "exact" };
    }

    // 2. 部分一致（キーが摘要に含まれる、または摘要がキーに含まれる）
    for (const [key, pattern] of this._patternEntries) {
      const overlapLen = Math.min(key.length, normalizedDesc.length);
      if (overlapLen < 3) continue; // 短すぎるキーは除外
      if (normalizedDesc.includes(key) || key.includes(normalizedDesc)) {
        return { ...pattern, matchType: "partial" };
      }
    }

    // 3. カタカナマッピング経由のマッチ
    //    「振込 フジワラ ケイ」→ kanaMapで「フジワラケイ」→「藤原啓」→ patterns検索
    const kanaKey = extractKanaFromDescription(normalizedDesc);
    if (kanaKey && this.kanaMap[kanaKey]) {
      const mapped = this.kanaMap[kanaKey];
      // patternsにも同じ取引先があれば完全な情報を使う
      if (mapped.partnerName) {
        const partnerKey = normalizeDescription(mapped.partnerName);
        if (this.patterns[partnerKey]) {
          return { ...this.patterns[partnerKey], matchType: "kana_mapped" };
        }
      }
      // patternsになくてもkanaMap自体に科目情報があれば使う
      return { ...mapped, matchType: "kana_mapped", count: mapped.count || 1 };
    }

    return null;
  }

  /**
   * パターンマッチ結果からスコア（0〜30pt）を算出する。
   *
   * スコア表:
   *   完全一致 + 3回以上出現      → 30pt
   *   完全一致 + 1〜2回出現      → 20pt
   *   部分一致 + 3回以上出現      → 20pt
   *   部分一致 + 1〜2回出現      → 10pt
   *   カタカナ経由 + 3回以上出現  → 25pt
   *   カタカナ経由 + 1〜2回出現  → 15pt
   *   マッチなし                 →  0pt
   *
   * @param {Object|null} pattern - matchPattern() の戻り値
   * @returns {number}
   */
  calculatePastPatternScore(pattern) {
    if (!pattern) return 0;
    const { matchType, count } = pattern;
    if (matchType === "exact")       return count >= 3 ? 30 : 20;
    if (matchType === "partial")     return count >= 3 ? 20 : 10;
    if (matchType === "kana_mapped") return count >= 3 ? 25 : 15;
    return 0;
  }

  /** 登録パターン数 */
  get size() {
    return this._patternEntries.length;
  }

  /** カタカナマッピング登録数 */
  get kanaMapSize() {
    return Object.keys(this.kanaMap).length;
  }
}

// --------------------------------------------------
// マスタマッピング読込
// --------------------------------------------------

/**
 * data/{companyId}/ にあるマスタファイルを読み込み、ID→名前のマッピングを返す。
 * ファイルが存在しない場合は空オブジェクトを返す（エラーにしない）。
 *
 * 対象ファイル:
 *   - account-items-master.json : { [account_item_id]: "勘定科目名" }
 *   - tax-codes-master.json    : { [tax_code]: "税区分名" }
 *   - partners-master.json     : { [partner_id]: "取引先名" }
 *
 * @param {string|null} dataDir - マスタファイルのあるディレクトリ
 * @returns {Object} { accountItems, taxCodes, partners }
 */
function loadMasterMaps(dataDir) {
  const result = { accountItems: {}, taxCodes: {}, partners: {} };
  if (!dataDir) return result;

  const files = [
    { key: "accountItems", file: "account-items-master.json" },
    { key: "taxCodes",     file: "tax-codes-master.json" },
    { key: "partners",     file: "partners-master.json" },
  ];

  for (const { key, file } of files) {
    try {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        result[key] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch {
      // ファイルが壊れていても無視
    }
  }

  return result;
}

// --------------------------------------------------
// エントリポイント
// --------------------------------------------------

/**
 * 過去パターンストアを構築する。
 *
 * @param {Object} options
 * @param {string|number} options.companyId            - freee 事業所 ID
 * @param {string}        [options.cacheDir]           - キャッシュ保存先（デフォルト: data/{companyId}/）
 * @param {number}        [options.monthsBack=12]      - 取得対象の過去月数
 * @param {Array}         [options.deals]               - テスト用: deals 配列を直接渡す
 * @param {string}        [options.existingRuleCsvPath] - 既存ルールCSVパス（カタカナマップ構築）
 * @param {Array}         [options.partners]            - partners API レスポンス（カタカナマップ補完）
 * @param {Object}        [options.masterMaps]          - マスタマッピング（IDから名前を解決）
 * @param {Object}        [options.masterMaps.accountItems] - { [account_item_id]: "勘定科目名" }
 * @param {Object}        [options.masterMaps.taxCodes]     - { [tax_code]: "税区分名" }
 * @param {Object}        [options.masterMaps.partners]     - { [partner_id]: "取引先名" }
 * @returns {Promise<PastPatternStore>}
 */
async function buildPatternStore(options = {}) {
  const {
    companyId, cacheDir, monthsBack = 12,
    deals: dealsOverride, existingRuleCsvPath, partners,
    masterMaps,
  } = options;

  // masterMapsの自動ロード: cacheDir内にマスタファイルがあれば読む
  const resolvedMasterMaps = masterMaps || loadMasterMaps(cacheDir || (companyId ? path.join(DATA_ROOT, String(companyId)) : null));

  // カタカナマッピングの構築（方法C → 方法B の順で補完）
  let kanaMap = {};
  if (existingRuleCsvPath) {
    const csvMap = buildKanaMapFromRuleCsv(existingRuleCsvPath);
    kanaMap = { ...kanaMap, ...csvMap };
    console.log(`[past-pattern-store] ルールCSVからカタカナマップ構築: ${Object.keys(csvMap).length} 件`);
  }
  if (partners) {
    const partnerMap = buildKanaMapFromPartners(partners);
    // partners由来は既存CSVを上書きしない
    kanaMap = { ...partnerMap, ...kanaMap };
    console.log(`[past-pattern-store] partnersからカタカナマップ補完: ${Object.keys(partnerMap).length} 件`);
  }

  // --- テスト用の直接渡し ---
  if (Array.isArray(dealsOverride)) {
    const patterns = extractPatternsFromDeals(dealsOverride, resolvedMasterMaps);
    return new PastPatternStore(patterns, kanaMap);
  }

  if (!companyId) {
    console.warn("[past-pattern-store] companyId 未指定 → 空ストアを返します");
    return new PastPatternStore({}, kanaMap);
  }

  const cachePath = getCachePath(companyId, cacheDir);

  // --- キャッシュ優先 ---
  const cachedPatterns = loadCache(cachePath);
  if (cachedPatterns) {
    const store = new PastPatternStore(cachedPatterns, kanaMap);
    console.log(`[past-pattern-store] キャッシュ読込: ${store.size} パターン (${cachePath})`);
    return store;
  }

  // --- freee API 取得 ---
  const accessToken = process.env.FREEE_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("[past-pattern-store] FREEE_ACCESS_TOKEN 未設定 → 空ストアを返します（0pt固定）");
    return new PastPatternStore({}, kanaMap);
  }

  try {
    console.log(`[past-pattern-store] API取得開始 (companyId=${companyId}, 過去${monthsBack}ヶ月)`);
    const deals = await fetchAllDeals(accessToken, companyId, monthsBack);
    const patterns = extractPatternsFromDeals(deals, resolvedMasterMaps);
    saveCache(cachePath, patterns);
    const store = new PastPatternStore(patterns, kanaMap);
    console.log(`[past-pattern-store] API取得完了: ${deals.length} 件 → ${store.size} パターン`);
    return store;
  } catch (e) {
    console.warn(`[past-pattern-store] API取得失敗: ${e.message} → 空ストアを返します`);
    return new PastPatternStore({}, kanaMap);
  }
}

// --------------------------------------------------
// スタンドアロン関数（ストアなしで使いやすいラッパー）
// --------------------------------------------------

/**
 * ストアを使ったスコア算出の便利ラッパー。
 * ストアのメソッドを直接使うほうが効率的だが、テスト用途に提供。
 *
 * @param {PastPatternStore} store
 * @param {string} description
 * @returns {number} 0〜30
 */
function scoreDescription(store, description) {
  const pattern = store.matchPattern(description);
  return store.calculatePastPatternScore(pattern);
}

// --------------------------------------------------
// エクスポート
// --------------------------------------------------

module.exports = {
  buildPatternStore,
  normalizeDescription,
  extractPatternsFromDeals,
  extractKanaFromDescription,
  buildKanaMapFromRuleCsv,
  buildKanaMapFromPartners,
  loadMasterMaps,
  scoreDescription,
  PastPatternStore,
};
