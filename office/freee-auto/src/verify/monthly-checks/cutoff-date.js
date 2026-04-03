'use strict';

/**
 * cutoff-date.js
 *
 * 基準日（対象月）自動判定ロジック
 *
 * モード:
 *   manual: --month YYYY-MM で直接指定（このモジュールは不使用）
 *   auto:   walletTxns（未処理明細）の日付から最後のクリーン月を自動判定
 *
 * 自動判定アルゴリズム:
 *   1. walletTxns が空 → 当日の前月を基準月とする（全明細登録済み）
 *   2. walletTxns に未処理明細がある場合:
 *      - 全明細の date フィールドを昇順ソート
 *      - 最古の未処理明細の属する月の前月 = 最後のクリーン月
 *      - 例: 最古未処理が 2026-04-02 → 対象月 = 2026-03
 *      - 例: 最古未処理が 2026-03-15 → 対象月 = 2026-02
 */

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * YYYY-MM 形式で「指定年月の前月」を返す
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {string} 'YYYY-MM'
 */
function prevMonthStr(year, month) {
  const d = new Date(year, month - 2, 1); // month-1 は 0-indexed, さらに -1 で前月
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================================
// determineCutoffDate
// ============================================================

/**
 * 未処理明細一覧から対象月（基準月）を自動判定する
 *
 * @param {Array<{date?: string}>|null} walletTxns - 未処理明細一覧
 * @param {Object}  [options]
 * @param {string}  [options.today] - 今日の日付 'YYYY-MM-DD'（テスト用。省略時は実行日）
 * @returns {{ targetMonth: string, mode: 'auto', reason: string }}
 */
function determineCutoffDate(walletTxns, options = {}) {
  const today = options.today ? new Date(options.today) : new Date();
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // 1-indexed

  // ── ケース1: 未処理明細なし ──────────────────────────────
  if (!walletTxns || walletTxns.length === 0) {
    return {
      targetMonth: prevMonthStr(todayYear, todayMonth),
      mode: 'auto',
      reason: '未処理明細なし → 先月を基準月として採用',
    };
  }

  // ── ケース2: 日付フィールドでフィルタ → 昇順ソート ─────────
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const dates = walletTxns
    .map((t) => t.date)
    .filter((d) => typeof d === 'string' && DATE_RE.test(d))
    .sort(); // 文字列比較で 昇順

  // 日付が取れなかった場合はフォールバック
  if (dates.length === 0) {
    return {
      targetMonth: prevMonthStr(todayYear, todayMonth),
      mode: 'auto',
      reason: `未処理明細 ${walletTxns.length}件あり（日付不明）→ 先月を基準月として採用`,
    };
  }

  // ── ケース3: 最古の未処理明細日付 → その月の前月が基準月 ────
  const oldestDate = dates[0];
  const [oldestYear, oldestMonth] = oldestDate.split('-').map(Number);
  const targetMonth = prevMonthStr(oldestYear, oldestMonth);

  return {
    targetMonth,
    mode: 'auto',
    reason: `最古の未処理明細: ${oldestDate}（全 ${walletTxns.length}件）→ ${targetMonth} を基準月として採用`,
  };
}

// ============================================================
// エクスポート
// ============================================================

module.exports = { determineCutoffDate };
