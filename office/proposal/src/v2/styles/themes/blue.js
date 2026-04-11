// src/v2/styles/themes/blue.js
// 青系テーマ — v1現行カラーベース
// v1実値: NAVY=1B3A5C, ACCENT=2E75B6, LIGHT_BG=EDF3F8, MEDIUM_BG=D5E8F0, BORDER=B0C4DE

module.exports = {
  name: "blue",
  displayName: "青系（スタンダード）",
  colors: {
    primary: "1B3A5C",         // v1 NAVY — 見出し・表紙メインカラー
    secondary: "2E75B6",       // v1 ACCENT — 下線・ヘッダーライン
    accent: "2E75B6",          // v1 ACCENT
    headerBg: "1B3A5C",        // テーブルヘッダー背景（v1: NAVY）
    headerText: "FFFFFF",      // テーブルヘッダー文字色
    sectionTitle: "1B3A5C",    // セクションタイトル色（v1: NAVY）
    sectionBorder: "2E75B6",   // セクション見出し下線色（v1: ACCENT）
    tableHeaderBg: "1B3A5C",   // テーブルヘッダー背景（v1: NAVY濃色+白文字）
    tableHeaderText: "FFFFFF",
    tableAltBg: "EDF3F8",      // テーブル交互行背景（v1: LIGHT_BG）
    tableTotalBg: "D5E8F0",    // テーブル合計行背景（v1: MEDIUM_BG）
    tableTotalText: "1B3A5C",  // テーブル合計行文字色
    tableBorder: "B0C4DE",     // テーブル罫線（v1: BORDER_COLOR）
    bodyText: "333333",        // 本文テキスト（v1: TEXT_DARK）
    bodyTextLight: "666666",   // 補足テキスト（v1: TEXT_LIGHT）
    discount: "C00000",        // 値引き表示用（赤系）
    white: "FFFFFF",
  },
};
