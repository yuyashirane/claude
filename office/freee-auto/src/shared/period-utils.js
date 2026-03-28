// ============================================================
// 期間ユーティリティ
// ============================================================

/**
 * ユーザー指定の期間から3期比較用の期間を計算する
 * @param {string} startDate - 開始日 (YYYY-MM-DD)
 * @param {string} endDate - 終了日 (YYYY-MM-DD)
 * @returns {Object} 3期分の期間情報
 */
function calculateThreePeriods(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // 月数を計算
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

  // 前期同期
  const prior1Start = new Date(start);
  prior1Start.setFullYear(prior1Start.getFullYear() - 1);
  const prior1End = new Date(end);
  prior1End.setFullYear(prior1End.getFullYear() - 1);

  // 前々期同期
  const prior2Start = new Date(start);
  prior2Start.setFullYear(prior2Start.getFullYear() - 2);
  const prior2End = new Date(end);
  prior2End.setFullYear(prior2End.getFullYear() - 2);

  return {
    current: {
      start: formatDate(start),
      end: formatDate(end),
      months,
      label: `当期 (${formatDateShort(start)}〜${formatDateShort(end)})`,
    },
    prior1: {
      start: formatDate(prior1Start),
      end: formatDate(prior1End),
      months,
      label: `前期 (${formatDateShort(prior1Start)}〜${formatDateShort(prior1End)})`,
    },
    prior2: {
      start: formatDate(prior2Start),
      end: formatDate(prior2End),
      months,
      label: `前々期 (${formatDateShort(prior2Start)}〜${formatDateShort(prior2End)})`,
    },
    bsDates: {
      current: formatDate(end),
      prior1: formatDate(prior1End),
      prior2: formatDate(prior2End),
    },
  };
}

/**
 * 期間内の各月の開始日・終了日を取得
 */
function getMonthlyPeriods(startDate, endDate) {
  const periods = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const monthStart = new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    // monthEndをendDate以降にしない
    const actualEnd = monthEnd > end ? end : monthEnd;

    periods.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      start: formatDate(monthStart),
      end: formatDate(actualEnd),
      label: `${current.getFullYear()}/${String(current.getMonth() + 1).padStart(2, '0')}`,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return periods;
}

/**
 * freee APIの会計年度パラメータを計算
 * @param {string} date - 対象日付
 * @param {number} fiscalYearEndMonth - 決算月 (1-12)
 */
function getFiscalYearParam(date, fiscalYearEndMonth) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();

  // 決算月が9月の場合、2024年10月は2025年度
  if (month > fiscalYearEndMonth) {
    return year + 1;
  }
  return year;
}

/**
 * 会計年度の開始日・終了日を返す
 * @param {string|Date} date - 対象日付
 * @param {number} fiscalEndMonth - 決算月 (1-12)
 * @returns {{ start: string, end: string }} YYYY-MM-DD形式
 */
function getFiscalYear(date, fiscalEndMonth) {
  const d = typeof date === "string" ? new Date(date) : date;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  let endYear, startYear;
  if (month <= fiscalEndMonth) {
    endYear = year;
  } else {
    endYear = year + 1;
  }
  startYear = endYear - 1;

  const startMonth = fiscalEndMonth + 1 > 12 ? 1 : fiscalEndMonth + 1;
  const startYearActual = fiscalEndMonth === 12 ? endYear : startYear;

  const start = `${startYearActual}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(endYear, fiscalEndMonth, 0).getDate();
  const end = `${endYear}-${String(fiscalEndMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { start, end };
}

/**
 * 文字列をDateオブジェクトに変換
 * YYYY-MM-DD, YYYY/MM/DD, 和暦（令和X年X月X日）等に対応
 * @param {string} str
 * @returns {Date|null}
 */
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  // 和暦（令和）
  const reMatch = s.match(/令和(\d+)[年/.-](\d+)[月/.-](\d+)/);
  if (reMatch) {
    return new Date(2018 + Number(reMatch[1]), Number(reMatch[2]) - 1, Number(reMatch[3]));
  }

  // 和暦（平成）
  const hsMatch = s.match(/平成(\d+)[年/.-](\d+)[月/.-](\d+)/);
  if (hsMatch) {
    return new Date(1988 + Number(hsMatch[1]), Number(hsMatch[2]) - 1, Number(hsMatch[3]));
  }

  // フォールバック
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateShort(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  calculateThreePeriods,
  getMonthlyPeriods,
  getFiscalYearParam,
  getFiscalYear,
  parseDate,
  formatDate,
  formatDateShort,
};
