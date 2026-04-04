'use strict';

/**
 * report-config/styles.js — Excelレポートのスタイル定数
 *
 * 色・フォント・罫線・セル書式の一元定義。
 * 源泉チェックレポートと統一デザイン（ヘッダー色 FF2F5496 等）。
 *
 * 変更例:
 *   - ヘッダー色を変えたい → COLORS.headerBg を変更
 *   - フォントを変えたい → FONTS の各プロパティを変更
 *   - 子行の背景色を変えたい → DETAIL_ROW_FILL.fgColor.argb を変更
 */

// ============================================================
// 色定義
// ============================================================

const COLORS = {
  headerBg:       'FF2F5496', // ヘッダー背景（紺色: 源泉チェックレポートと同一）
  headerFont:     'FFFFFFFF', // ヘッダー文字（白）
  severityHigh:   'FFFFC7CE', // 🔴 薄赤
  severityMed:    'FFFFEB9C', // 🟡 薄黄
  severityLow:    'FFC6EFCE', // 🔵 薄緑
  negative:       'FFFFC7CE', // マイナス値
  warning:        'FFFFEB9C', // 警告（前月比異常等）
  targetMonthBg:  'FFE8EEF7', // 対象月ハイライト（薄青）
  targetMonthHdr: 'FF1F3864', // 対象月ヘッダー（濃紺）
  zeroText:       'FF999999', // ゼロ値テキスト（グレー）
  tabRed:         'FFCC0000',
  tabBlue:        'FF2980B9',
  tabGray:        'FF95A5A6',
  tabGreen:       'FF27AE60',
};

// ============================================================
// フォント定義
// ============================================================

const FONTS = {
  title:    { name: 'Meiryo UI', size: 14, bold: true },
  subtitle: { name: 'Meiryo UI', size: 11 },
  header:   { name: 'Meiryo UI', size: 10, bold: true, color: { argb: COLORS.headerFont } },
  body:     { name: 'Meiryo UI', size: 10 },
  bodyBold: { name: 'Meiryo UI', size: 10, bold: true },
};

// ============================================================
// 罫線定義
// ============================================================

const BORDER_THIN = {
  top:    { style: 'thin' },
  left:   { style: 'thin' },
  bottom: { style: 'thin' },
  right:  { style: 'thin' },
};

// ============================================================
// details 子行スタイル
// ============================================================

const DETAIL_ROW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
const DETAIL_ROW_FONT = { name: 'Meiryo UI', size: 9, color: { argb: 'FF555555' } };
const DETAIL_LINK_FONT = { name: 'Meiryo UI', size: 9, color: { argb: 'FF0066CC' }, underline: true };
const LINK_FONT = { name: 'Meiryo UI', size: 10, color: { argb: 'FF0066CC' }, underline: true };

// ============================================================
// 数値フォーマット・ソート順
// ============================================================

const NUM_FMT = '#,##0';

// severity の表示順 (🔴→🟡→🔵)
const SEVERITY_ORDER = { '🔴': 0, '🟡': 1, '🔵': 2 };

module.exports = {
  COLORS,
  FONTS,
  BORDER_THIN,
  DETAIL_ROW_FILL,
  DETAIL_ROW_FONT,
  DETAIL_LINK_FONT,
  LINK_FONT,
  NUM_FMT,
  SEVERITY_ORDER,
};
