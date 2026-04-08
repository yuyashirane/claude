'use strict';

/**
 * monthly-data-fetcher.js
 *
 * 月次帳簿チェックに必要なデータをfreee REST APIから動的取得するモジュール。
 * 認証トークンは freee-MCP が管理する ~/.config/freee-mcp/tokens.json から読み込む。
 * 取得データは data/{companyId}/monthly/{targetMonth}/ にキャッシュ保存（24時間有効）。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { determineCutoffDate } = require('./monthly-checks/cutoff-date');

// ============================================================
// パス定数
// ============================================================

const FREEE_MCP_DIR = path.join(os.homedir(), '.config', 'freee-mcp');
const TOKENS_FILE = path.join(FREEE_MCP_DIR, 'tokens.json');
const MCP_CONFIG_FILE = path.join(FREEE_MCP_DIR, 'config.json');
const DATA_DIR = path.resolve(__dirname, '../../data');

const FREEE_API_BASE = 'https://api.freee.co.jp';
const FREEE_TOKEN_URL = 'https://accounts.secure.freee.co.jp/public_api/token';

// ============================================================
// トークン管理
// ============================================================

function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) {
    throw new Error(
      `freee認証情報が見つかりません: ${TOKENS_FILE}\n` +
      'freee-MCPで認証を完了してから再実行してください。'
    );
  }
  return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
}

function isTokenExpired(tokens) {
  // expires_at はミリ秒。60秒のバッファを持って判定
  return Date.now() > tokens.expires_at - 60_000;
}

async function refreshAccessToken() {
  const config = JSON.parse(fs.readFileSync(MCP_CONFIG_FILE, 'utf-8'));
  const tokens = loadTokens();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refresh_token,
  }).toString();

  const result = await httpPost(FREEE_TOKEN_URL, body, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  if (!result.access_token) {
    throw new Error(`トークン更新失敗: ${JSON.stringify(result)}`);
  }

  const newTokens = {
    ...tokens,
    access_token: result.access_token,
    refresh_token: result.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + result.expires_in * 1000,
    token_type: result.token_type || tokens.token_type,
  };
  saveTokens(newTokens);
  return newTokens;
}

async function getValidToken() {
  let tokens = loadTokens();
  if (isTokenExpired(tokens)) {
    console.log('  [Token] アクセストークンを更新中...');
    tokens = await refreshAccessToken();
    console.log('  [Token] 更新完了');
  }
  return tokens.access_token;
}

// ============================================================
// HTTP ヘルパー
// ============================================================

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSONパースエラー: ${e.message} (body: ${data.substring(0, 100)})`));
        }
      });
    });
    req.on('error', reject);
  });
}

function httpPost(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSONパースエラー: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * freee REST API GET
 */
function freeeGet(apiPath, params, token) {
  const url = new URL(`${FREEE_API_BASE}${apiPath}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return httpGet(url.toString(), {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
}

// ============================================================
// 日付ユーティリティ
// ============================================================

/**
 * targetMonth から N ヶ月ずらした月を返す
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {number} delta - 月数差（負=過去）
 * @returns {string} 'YYYY-MM'
 */
function shiftMonth(targetMonth, delta) {
  const [year, month] = targetMonth.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 指定年月の末日を返す
 */
function getLastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * fiscal_years 配列から targetMonth が属する会計年度情報を特定
 *
 * freee API の fiscal_year パラメータは「期首年（start_date の年）」を使う仕様。
 * 例: 9月決算で start_date="2025-10-01", end_date="2026-09-30"
 *     → freee の fiscal_year = 2025（start_date の年）
 *
 * ※ end_date の年（2026）を使うと PL が全ゼロになるため注意。
 *   BS は fiscal_year に依存せず残高を返すが、PL は期首年でのみ正しいデータが返る。
 */
function detectFiscalYear(targetMonth, fiscalYears) {
  if (!fiscalYears || fiscalYears.length === 0) return null;

  const target = new Date(targetMonth + '-01');

  for (const fy of fiscalYears) {
    const start = new Date(fy.start_date);
    const end = new Date(fy.end_date);
    if (target >= start && target <= end) {
      return {
        fiscalYear: start.getFullYear(),        // start_date の年 = freee の fiscal_year
        startMonth: start.getMonth() + 1,
        startDate: fy.start_date,
        endDate: fy.end_date,
        fiscalYearId: fy.id || null,            // freee内部ID（総勘定元帳URL用）
      };
    }
  }

  // 範囲外の場合: end_date で降順ソートして最新期を基準に推定
  const sorted = [...fiscalYears].sort(
    (a, b) => new Date(b.end_date) - new Date(a.end_date)
  );
  const latest = sorted[0];
  const latestEnd = new Date(latest.end_date);
  const latestStart = new Date(latest.start_date);
  const latestFiscalYear = latestStart.getFullYear(); // start_date の年
  const startMonth = latestStart.getMonth() + 1;

  // target が最新会計年度より後 → 次の年度（まだデータがない期）
  if (target > latestEnd) {
    return {
      fiscalYear: latestFiscalYear + 1,
      startMonth,
      startDate: null,
      endDate: null,
      fiscalYearId: null,
    };
  }
  // target が最古より前 → 最古の期を返す
  const oldest = sorted[sorted.length - 1];
  return {
    fiscalYear: new Date(oldest.start_date).getFullYear(), // start_date の年
    startMonth: new Date(oldest.start_date).getMonth() + 1,
    startDate: null,
    endDate: null,
    fiscalYearId: null,
  };
}

// ============================================================
// キャッシュ管理
// ============================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

function getCachePath(companyId, targetMonth) {
  return path.join(DATA_DIR, String(companyId), 'monthly', targetMonth, 'monthly-data.json');
}

function loadCache(companyId, targetMonth) {
  const cachePath = getCachePath(companyId, targetMonth);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (Date.now() - new Date(data.fetchedAt).getTime() < CACHE_TTL_MS) {
      return data;
    }
    return null; // 期限切れ
  } catch {
    return null;
  }
}

function saveCache(companyId, targetMonth, data) {
  const cachePath = getCachePath(companyId, targetMonth);
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  [Cache] 保存: ${cachePath}`);
}

// ============================================================
// マスタデータ読み込み
// ============================================================

function loadMasterJson(companyId, ...filenames) {
  for (const name of filenames) {
    const p = path.join(DATA_DIR, String(companyId), name);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {
        // 読み込み失敗なら次を試みる
      }
    }
  }
  return null;
}

// ============================================================
// 取引一覧（ページネーション対応）
// ============================================================

// deals API の注意: meta.total_count は日付フィルタを無視した全件数を返すケースがある。
// そのため total_count によるループ制御を行わず、取得件数が limit 未満になったら終了する。
// また上限 MAX_DEALS_PER_MONTH 件を超えたら打ち切り、issue_date で対象月内に絞り込む。
const MAX_DEALS_PER_MONTH = 500;

async function fetchAllDeals(companyId, year, month, token) {
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-${getLastDay(year, month)}`;

  const allDeals = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const result = await freeeGet('/api/1/deals', {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
      limit,
      offset,
    }, token);

    const page = result.deals || [];
    // issue_date が対象月内のものだけを収録
    const filtered = page.filter((d) => d.issue_date >= startDate && d.issue_date <= endDate);
    allDeals.push(...filtered);

    offset += limit;

    // 終了条件:
    //   (a) 取得件数が limit 未満 → 最終ページ
    //   (b) フィルタ結果がゼロかつページが存在 → 日付範囲を外れた（降順の場合）
    //   (c) 累積が上限を超えた
    if (
      page.length < limit ||
      (filtered.length === 0 && page.length > 0) ||
      allDeals.length >= MAX_DEALS_PER_MONTH
    ) {
      break;
    }
  }

  return allDeals;
}

// ============================================================
// 前月・前年同月用（BS+PL、取引先別含む）の部分取得
// ============================================================

async function fetchPartialData(companyId, targetMonth, token, fiscalYears) {
  const [, month] = targetMonth.split('-').map(Number);
  const fyInfo = detectFiscalYear(targetMonth, fiscalYears);
  if (!fyInfo) return null;

  // BS: 単月スナップショット / PL: 期首月〜対象月のYTD累計
  // 取引先別（ByPartner）も同時取得: RR-02売掛金滞留、PP-02買掛金滞留、RT-01家賃変動で使用
  const [bsResult, plResult, bsByPartnerResult, plByPartnerResult] = await Promise.allSettled([
    freeeGet('/api/1/reports/trial_bs', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: month,
      end_month: month,
    }, token),
    freeeGet('/api/1/reports/trial_pl', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: fyInfo.startMonth,
      end_month: month,
    }, token),
    freeeGet('/api/1/reports/trial_bs', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: month,
      end_month: month,
      breakdown_display_type: 'partner',
    }, token),
    freeeGet('/api/1/reports/trial_pl', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: fyInfo.startMonth,
      end_month: month,
      breakdown_display_type: 'partner',
    }, token),
  ]);

  return {
    targetMonth,
    fiscalYear: fyInfo.fiscalYear,
    trialBs:          bsResult.status          === 'fulfilled' ? bsResult.value          : null,
    trialPl:          plResult.status          === 'fulfilled' ? plResult.value          : null,
    trialBsByPartner: bsByPartnerResult.status === 'fulfilled' ? bsByPartnerResult.value : null,
    trialPlByPartner: plByPartnerResult.status === 'fulfilled' ? plByPartnerResult.value : null,
    errors: [
      bsResult.status          === 'rejected' ? `trialBs: ${bsResult.reason?.message}`                   : null,
      plResult.status          === 'rejected' ? `trialPl: ${plResult.reason?.message}`                   : null,
      bsByPartnerResult.status === 'rejected' ? `trialBsByPartner: ${bsByPartnerResult.reason?.message}` : null,
      plByPartnerResult.status === 'rejected' ? `trialPlByPartner: ${plByPartnerResult.reason?.message}` : null,
    ].filter(Boolean),
  };
}

// ============================================================
// メイン: fetchMonthlyData
// ============================================================

/**
 * 月次帳簿チェックに必要なデータを全て取得する
 *
 * @param {string|number} companyId - 事業所ID
 * @param {string} targetMonth - 対象月 'YYYY-MM'
 * @param {Object} [options]
 * @param {boolean} [options.includePrevMonth=false] - 前月BS/PLを取得するか
 * @param {boolean} [options.includePrevYear=false]  - 前年同月BS/PLを取得するか
 * @param {boolean} [options.forceRefresh=false]     - キャッシュを無視して再取得
 * @returns {Promise<MonthlyData>}
 */
async function fetchMonthlyData(companyId, targetMonth, options = {}) {
  const {
    includePrevMonth = false,
    includePrevYear = false,
    forceRefresh = false,
  } = options;

  // キャッシュ確認（前月・前年オプションが変わっていないことが前提）
  if (!forceRefresh) {
    const cached = loadCache(companyId, targetMonth);
    if (cached) {
      console.log(`  [Cache] キャッシュヒット: data/${companyId}/monthly/${targetMonth}/monthly-data.json`);
      return cached;
    }
  }

  const token = await getValidToken();
  const [year, month] = targetMonth.split('-').map(Number);

  // ────────────────────────────────────────
  // 1. 事業所情報（会計年度・期首月を特定）
  // ────────────────────────────────────────
  console.log(`  [API] 事業所情報を取得中 (company_id: ${companyId})...`);
  const companyResp = await freeeGet(`/api/1/companies/${companyId}`, null, token);
  const company = companyResp.company;
  const fiscalYears = company.fiscal_years || [];

  const fyInfo = detectFiscalYear(targetMonth, fiscalYears);
  if (!fyInfo) {
    throw new Error(`対象月 ${targetMonth} に対応する会計年度が見つかりませんでした。`);
  }

  console.log(`  [Info] 会計年度: ${fyInfo.fiscalYear}, 期首月: ${fyInfo.startMonth}月`);

  // ────────────────────────────────────────
  // 2. メインデータを並行取得
  // ────────────────────────────────────────
  console.log('  [API] 試算表・取引データを並行取得中...');

  const [
    bsResult,
    bsByItemResult,
    bsByPartnerResult,
    plResult,
    plByPartnerResult,
  ] = await Promise.allSettled([
    freeeGet('/api/1/reports/trial_bs', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: month,
      end_month: month,
    }, token),
    freeeGet('/api/1/reports/trial_bs', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: month,
      end_month: month,
      breakdown_display_type: 'item',
    }, token),
    freeeGet('/api/1/reports/trial_bs', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: month,
      end_month: month,
      breakdown_display_type: 'partner',
    }, token),
    // trial_pl は期首月から対象月までの累計（YTD）で取得する
    // start_month=期首月, end_month=対象月 とすることで年度累計PLが得られる
    freeeGet('/api/1/reports/trial_pl', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: fyInfo.startMonth,
      end_month: month,
    }, token),
    freeeGet('/api/1/reports/trial_pl', {
      company_id: companyId,
      fiscal_year: fyInfo.fiscalYear,
      start_month: fyInfo.startMonth,
      end_month: month,
      breakdown_display_type: 'partner',
    }, token),
  ]);

  // 取引一覧はページネーションがあるため個別取得
  console.log('  [API] 取引一覧を取得中（ページネーション対応）...');
  let deals = null;
  let dealsError = null;
  try {
    deals = await fetchAllDeals(companyId, year, month, token);
    console.log(`  [API] 取引一覧: ${deals.length}件`);
  } catch (e) {
    dealsError = e.message;
    console.warn(`  [警告] deals 取得失敗: ${e.message}`);
  }

  // 未処理明細の存在チェック（あり/なしのみ判定するため limit:1 で十分）
  console.log('  [API] 未処理明細の存在チェック中...');
  let walletTxns = null;
  let walletTxnsError = null;
  try {
    const mm = String(month).padStart(2, '0');
    const endDate = `${year}-${mm}-${getLastDay(year, month)}`;
    const result = await freeeGet('/api/1/wallet_txns', {
      company_id: companyId,
      status: 'unsettled',
      end_date: endDate,
      limit: 1,
    }, token);
    walletTxns = result?.wallet_txns || [];
    console.log(`  [API] 未処理明細: ${walletTxns.length > 0 ? 'あり' : 'なし'}`);
  } catch (e) {
    walletTxnsError = e.message;
    console.warn(`  [警告] wallet_txns 取得失敗: ${e.message}`);
  }

  // 結果を整理（失敗は null として記録）
  const trialBs = bsResult.status === 'fulfilled' ? bsResult.value : null;
  const trialBsByItem = bsByItemResult.status === 'fulfilled' ? bsByItemResult.value : null;
  const trialBsByPartner = bsByPartnerResult.status === 'fulfilled' ? bsByPartnerResult.value : null;
  const trialPl = plResult.status === 'fulfilled' ? plResult.value : null;
  const trialPlByPartner = plByPartnerResult.status === 'fulfilled' ? plByPartnerResult.value : null;

  // 失敗ログ
  const fetchErrors = [];
  const checks = [
    ['trialBs', bsResult],
    ['trialBsByItem', bsByItemResult],
    ['trialBsByPartner', bsByPartnerResult],
    ['trialPl', plResult],
    ['trialPlByPartner', plByPartnerResult],
  ];
  for (const [name, result] of checks) {
    if (result.status === 'rejected') {
      const msg = `${name}: ${result.reason?.message}`;
      fetchErrors.push(msg);
      console.warn(`  [警告] ${msg}`);
    }
  }
  if (dealsError) fetchErrors.push(`deals: ${dealsError}`);
  if (walletTxnsError) fetchErrors.push(`wallet_txns: ${walletTxnsError}`);

  // ────────────────────────────────────────
  // 3. マスタデータ（ローカルキャッシュ優先）
  // ────────────────────────────────────────
  const accountItems = loadMasterJson(companyId,
    'account_items.json', 'account-items-master.json');
  const partners = loadMasterJson(companyId,
    'partners.json', 'partners-master.json');

  if (!accountItems) console.log('  [Info] 勘定科目マスタ: ローカルキャッシュなし');
  if (!partners) console.log('  [Info] 取引先マスタ: ローカルキャッシュなし');

  // ────────────────────────────────────────
  // 4. 前月・前年同月データ（オプション）
  // ────────────────────────────────────────
  let prevMonth = null;
  let prevYearMonth = null;

  if (includePrevMonth) {
    const prevMonthStr = shiftMonth(targetMonth, -1);
    console.log(`  [API] 前月データ取得中 (${prevMonthStr})...`);
    try {
      prevMonth = await fetchPartialData(companyId, prevMonthStr, token, fiscalYears);
    } catch (e) {
      console.warn(`  [警告] 前月データ取得失敗: ${e.message}`);
    }
  }

  if (includePrevYear) {
    const prevYearStr = shiftMonth(targetMonth, -12);
    console.log(`  [API] 前年同月データ取得中 (${prevYearStr})...`);
    try {
      prevYearMonth = await fetchPartialData(companyId, prevYearStr, token, fiscalYears);
    } catch (e) {
      console.warn(`  [警告] 前年同月データ取得失敗: ${e.message}`);
    }
  }

  // ────────────────────────────────────────
  // 5. 結果オブジェクトを組み立ててキャッシュ保存
  // ────────────────────────────────────────
  const result = {
    // 対象月メインデータ
    trialBs,
    trialBsByItem,
    trialBsByPartner,
    trialPl,
    trialPlByPartner,
    deals,
    walletTxns,

    // マスタ
    accountItems,
    partners,

    // 比較データ（オプション）
    prevMonth,
    prevYearMonth,

    // メタ情報
    companyId: String(companyId),
    companyName: company.display_name || company.name || String(companyId),
    targetMonth,
    fiscalYear: fyInfo.fiscalYear,
    startMonth: fyInfo.startMonth,
    fiscalYearId: fyInfo.fiscalYearId || null,  // freee内部ID（総勘定元帳URL用）
    fetchedAt: new Date().toISOString(),

    // エラー記録
    fetchErrors: fetchErrors.length > 0 ? fetchErrors : undefined,
  };

  saveCache(companyId, targetMonth, result);
  return result;
}

// ============================================================
// --month auto 用: 対象月を自動解決する
// ============================================================

/**
 * walletTxns（未処理明細）を取得して対象月を自動判定する
 *
 * --month auto 時に monthly-checker.js から呼び出す。
 * fetchMonthlyData より軽量（wallet_txns 1エンドポイントのみ）。
 *
 * @param {string|number} companyId
 * @returns {Promise<{ targetMonth: string, mode: 'auto', reason: string }>}
 */
async function resolveAutoMonth(companyId) {
  const token = await getValidToken();

  console.log(`  [Auto] 未処理明細を取得中 (company_id: ${companyId})...`);
  let walletTxns = [];
  try {
    // ページネーション対応で全件取得（最古日付を正確に取るため）
    const MAX_AUTO_TXNS = 1000;
    const limit = 100;
    let offset = 0;
    for (;;) {
      const raw = await freeeGet('/api/1/wallet_txns', {
        company_id: companyId,
        status: 'unsettled',
        limit,
        offset,
      }, token);
      const page = raw?.wallet_txns || [];
      walletTxns.push(...page);
      offset += limit;
      if (page.length < limit || walletTxns.length >= MAX_AUTO_TXNS) {
        break;
      }
    }
    console.log(`  [Auto] 未処理明細: ${walletTxns.length}件`);
  } catch (e) {
    console.warn(`  [Auto] wallet_txns 取得失敗: ${e.message} → 先月を採用`);
    walletTxns = [];
  }

  return determineCutoffDate(walletTxns);
}

// ============================================================
// PL月次推移データ取得
// ============================================================

/**
 * PL月次推移データを取得する
 *
 * 期首月から対象月までの各月について、YTD累計PLを順次取得し、
 * 前月との差分を計算して各月の単月PLを算出する。
 *
 * @param {string|number} companyId - 事業所ID
 * @param {number} fiscalYear - freee fiscal_year パラメータ（期首年）
 * @param {number} startMonth - 期首月（1〜12）
 * @param {string} targetMonth - 対象月 'YYYY-MM'
 * @returns {Promise<Object>} { months, accounts, accountList, fetchedAt }
 */
async function fetchMonthlyPlTrend(companyId, fiscalYear, startMonth, targetMonth) {
  // キャッシュ確認
  const cachePath = path.join(DATA_DIR, String(companyId), 'monthly', targetMonth, 'pl-trend.json');
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
        console.log(`  [Cache] PL月次推移キャッシュヒット: ${cachePath}`);
        return cached;
      }
    } catch {
      // キャッシュ読み込み失敗は無視
    }
  }

  // 月リストを構築（期首月〜対象月、年跨ぎ対応）
  const [targetYear, targetMon] = targetMonth.split('-').map(Number);
  const months = [];
  let curYear = fiscalYear;
  let curMonth = startMonth;

  // 期首月が1月より大きい場合、期首年の期首月からスタート
  // 例: 10月決算 → fiscalYear=2025, startMonth=10 → 2025-10, 2025-11, 2025-12, 2026-01, ...
  for (let i = 0; i < 12; i++) {
    const mm = String(curMonth).padStart(2, '0');
    const monthStr = `${curYear}-${mm}`;
    months.push(monthStr);

    if (monthStr === targetMonth) break;

    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
  }

  console.log(`  [API] PL月次推移を取得中（${months.length}ヶ月分）...`);

  const token = await getValidToken();
  const total = months.length;

  // 各月のYTD累計PLを順次取得
  const ytdResults = [];
  for (let i = 0; i < total; i++) {
    if (i % 3 === 0) {
      console.log(`  [API] PL取得: ${i + 1}/${total}...`);
    }

    const [, endMonth] = months[i].split('-').map(Number);
    const result = await freeeGet('/api/1/reports/trial_pl', {
      company_id: companyId,
      fiscal_year: fiscalYear,
      start_month: startMonth,
      end_month: endMonth,
    }, token);

    ytdResults.push(result);
  }

  // 最後のYTD結果から勘定科目リストを抽出
  const lastResult = ytdResults[ytdResults.length - 1];
  const balances = lastResult?.trial_pl?.balances || [];

  const accountList = [];
  const accounts = {};

  // 全勘定科目を走査して月次金額を計算
  // balances には明細科目（account_item_id あり）と集計行（account_item_id なし）が混在
  for (const item of balances) {
    const id = item.account_item_id;
    const name = item.account_item_name;
    const category = item.account_category_name || '';
    const isSummary = !id;

    // 集計行はカテゴリ名をキーとして格納（明細科目と区別）
    const displayName = isSummary ? category : name;
    const accountKey = isSummary ? `__summary__${category}` : name;

    accountList.push({ id: id || null, name: displayName, category, isSummary });

    // 各月のYTD累計から closing_balance を抽出
    const ytdAmounts = ytdResults.map((r) => {
      const bs = r?.trial_pl?.balances || [];
      const found = isSummary
        ? bs.find((b) => !b.account_item_id && b.account_category_name === category)
        : bs.find((b) => b.account_item_id === id);
      return found ? (found.closing_balance || 0) : 0;
    });

    // YTD差分で単月金額を算出: month[0] = YTD[0], month[i] = YTD[i] - YTD[i-1]
    const monthlyAmounts = ytdAmounts.map((ytd, i) => {
      return i === 0 ? ytd : ytd - ytdAmounts[i - 1];
    });

    const totalAmount = ytdAmounts[ytdAmounts.length - 1];

    accounts[accountKey] = {
      id: id || null,
      category,
      monthlyAmounts,
      total: totalAmount,
      isSummary,
    };
  }

  const result = {
    months,
    accounts,
    accountList,
    fetchedAt: new Date().toISOString(),
  };

  // キャッシュ保存
  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`  [Cache] PL月次推移保存: ${cachePath}`);

  return result;
}

// ============================================================
// 過去期BS取得（リンク生成用: 残高変動期の自動探索）
// ============================================================

/**
 * 過去N期分のBS試算表（期末スナップショット）を取得する。
 *
 * 各期の trial_bs から科目ごとの opening_balance / closing_balance を取得し、
 * determineLinkStartDate が「残高が最後に変動した期」を特定するために使用する。
 *
 * @param {string|number} companyId - 事業所ID
 * @param {number} currentFiscalYear - 当期の fiscal_year（期首年）
 * @param {number} startMonth - 期首月（1〜12）
 * @param {string} targetMonth - 対象月 'YYYY-MM'（キャッシュキー用）
 * @param {number} [maxPeriods=5] - 遡る最大期数
 * @returns {Promise<Object>} { '2024': { '売掛金': { opening: 100, closing: 150 }, ... }, ... }
 */
async function fetchHistoricalBs(companyId, currentFiscalYear, startMonth, targetMonth, maxPeriods = 5) {
  // キャッシュ確認
  const cachePath = path.join(DATA_DIR, String(companyId), 'monthly', targetMonth, 'historical-bs.json');
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
        console.log(`  [Cache] 過去期BSキャッシュヒット: ${cachePath}`);
        return cached.data;
      }
    } catch { /* キャッシュ破損 → 再取得 */ }
  }

  const token = await getValidToken();
  const result = {};
  // 期末月: startMonth=10 → 期末月=9, startMonth=1 → 期末月=12
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;

  console.log(`  [API] 過去期BS取得中（最大${maxPeriods}期）...`);

  // 並行取得（Promise.allSettled）
  const promises = [];
  for (let i = 1; i <= maxPeriods; i++) {
    const pastFiscalYear = currentFiscalYear - i;
    promises.push(
      freeeGet('/api/1/reports/trial_bs', {
        company_id: companyId,
        fiscal_year: pastFiscalYear,
        start_month: endMonth,
        end_month: endMonth,
      }, token).then(res => ({ fiscalYear: pastFiscalYear, data: res }))
    );
  }

  const results = await Promise.allSettled(promises);
  let fetchedCount = 0;

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { fiscalYear: fy, data: bsResp } = r.value;
    const balances = bsResp?.trial_bs?.balances || [];
    if (balances.length === 0) continue;

    const periodData = {};
    for (const b of balances) {
      if (!b.account_item_name) continue;
      periodData[b.account_item_name] = {
        opening: b.opening_balance,
        closing: b.closing_balance,
      };
    }
    result[String(fy)] = periodData;
    fetchedCount++;
  }

  console.log(`  [Info] 過去期BS: ${fetchedCount}期分取得`);

  // キャッシュ保存
  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    data: result,
  }, null, 2), 'utf-8');
  console.log(`  [Cache] 過去期BS保存: ${cachePath}`);

  return result;
}

// ============================================================
// エクスポート
// ============================================================

module.exports = { fetchMonthlyData, resolveAutoMonth, fetchMonthlyPlTrend, fetchHistoricalBs };
