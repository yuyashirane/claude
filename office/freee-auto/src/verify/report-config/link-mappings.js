'use strict';

/**
 * report-config/link-mappings.js — freeeリンク推定・検証ロジック
 *
 * freeeLink 未設定の指摘に対するリンク推定、
 * リンクの有効性チェック、リンク表示テキストの一元定義。
 *
 * 変更例:
 *   - チェックコードに対応する科目を追加 → CODE_TO_ACCOUNT に追加
 *   - リンク表示テキストを変更 → getLinkDisplayText/getDetailLinkText を修正
 */

const {
  generalLedgerLink,
} = require('../../shared/freee-links');

// ============================================================
// チェックコード → 勘定科目名マッピング
// ============================================================

/**
 * チェックコード → 対応する勘定科目名のマッピング（限定スコープ）
 * 確実に科目が特定できるコードのみ。
 */
const CODE_TO_ACCOUNT = {
  'WT-04': '預り金',
  'AT-01': '法人税、住民税及び事業税',
  'AT-02': '未払消費税等',
  'PY-01': '役員報酬',
  'PY-02': '法定福利費',
  'OL-01': '役員貸付金',
  'RT-01': '地代家賃',
};

// ============================================================
// ヘルパー
// ============================================================

/** 'YYYY-MM' → { start: 'YYYY-MM-01', end: 'YYYY-MM-DD(末日)' } */
function getMonthRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// ============================================================
// freeeリンク推定・検証
// ============================================================

/**
 * finding の description から科目名を抽出する汎用ロジック
 * 「〇〇」「《〇〇》」等のパターンに対応
 * @param {string} description
 * @returns {string|null}
 */
function extractAccountNameFromDescription(description) {
  if (!description) return null;
  const m1 = description.match(/「([^」]+?)」/);
  if (m1) return m1[1];
  const m2 = description.match(/《([^》]+?)》/);
  if (m2) return m2[1];
  return null;
}

/**
 * finding に freeeLink がない場合、推定リンクを生成
 * @param {Object} finding
 * @param {Object} data - monthlyData
 * @returns {string|null}
 */
function inferFreeeLink(finding, data) {
  if (finding.freeeLink) return finding.freeeLink;

  const companyId   = data.companyId || data.companyId;
  const targetMonth = data.targetMonth;
  if (!companyId || !targetMonth) return null;

  // 1. チェックコードから科目名を特定
  let accountName = CODE_TO_ACCOUNT[finding.checkCode] || null;

  // 2. マッピングにない場合は description から抽出を試みる
  if (!accountName) {
    accountName = extractAccountNameFromDescription(finding.description);
  }

  if (!accountName) return null;

  // 対象月の期間を算出
  const { start, end } = getMonthRange(targetMonth);

  return generalLedgerLink(companyId, accountName, start, end);
}

/**
 * freeeLink が有効なURLかを簡易チェック
 * 無効なリンクはハイパーリンクとして設定しない
 * @param {string} link
 * @returns {boolean}
 */
function isValidFreeeLink(link) {
  if (!link || typeof link !== 'string') return false;
  return link.startsWith('https://') && link.includes('freee.co.jp');
}

/** リンクURLからリンク種別に応じた表示テキストを返す */
function getLinkDisplayText(url) {
  if (!url) return '';
  if (url.includes('deal_id=')) return '仕訳を開く';
  if (url.includes('general_ledgers')) return '元帳を開く';
  if (url.includes('journals')) return '仕訳帳を開く';
  return 'freeeで開く';
}

/** 子行リンクの表示テキスト */
function getDetailLinkText(url) {
  if (!url) return '';
  if (url.includes('deal_id=')) return '取引を開く';
  if (url.includes('general_ledgers')) return '元帳を開く';
  return '開く';
}

module.exports = {
  CODE_TO_ACCOUNT,
  getMonthRange,
  extractAccountNameFromDescription,
  inferFreeeLink,
  isValidFreeeLink,
  getLinkDisplayText,
  getDetailLinkText,
};
