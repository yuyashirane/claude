// src/v2/styles/themes/index.js
// テーマローダー

const blue = require("./blue");
const orange = require("./orange");
const gray = require("./gray");

const THEMES = {
  blue,
  orange,
  gray,
};

const DEFAULT_THEME = "blue";

/**
 * テーマ名からテーマオブジェクトを取得
 * @param {string} themeName - 'blue' | 'orange' | 'gray'
 * @returns {Object} テーマオブジェクト
 */
function getTheme(themeName) {
  const name = themeName || DEFAULT_THEME;
  if (!THEMES[name]) {
    console.warn(`Unknown theme '${name}', falling back to '${DEFAULT_THEME}'`);
    return THEMES[DEFAULT_THEME];
  }
  return THEMES[name];
}

/**
 * 利用可能なテーマ一覧を取得
 * @returns {Array<{name: string, displayName: string}>}
 */
function listThemes() {
  return Object.values(THEMES).map(t => ({
    name: t.name,
    displayName: t.displayName,
  }));
}

module.exports = {
  getTheme,
  listThemes,
  DEFAULT_THEME,
  THEMES,
};
