'use strict';

/**
 * company-resolver.js — 顧問先名からfreee company IDを解決する
 *
 * 解決順序:
 *   1. ローカルマッピングファイル（data/company-map.json）を検索
 *   2. 完全一致 → 部分一致（あいまい検索）
 *   3. 見つからない場合は null を返す
 *
 * 将来拡張:
 *   - Kintone顧客カルテ（App ID: 206）からの検索
 *   - freee-MCP API検索
 *
 * @module company-resolver
 */

const path = require('path');
const fs = require('fs');

/**
 * 顧問先名からfreee company IDを解決する
 *
 * @param {string} companyName - 顧問先名（部分一致OK）
 * @returns {{ companyId: string, companyName: string } | null}
 */
function resolveCompanyId(companyName) {
  if (!companyName) return null;

  // 1. ローカルマッピングファイルを読み込み
  const mapPath = path.join(__dirname, '../../data/company-map.json');
  if (!fs.existsSync(mapPath)) return null;

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  // map の形式: { "474381": "あしたの会計事務所税理士法人", ... }

  // 2. 完全一致
  for (const [id, name] of Object.entries(map)) {
    if (name === companyName) return { companyId: id, companyName: name };
  }

  // 3. 部分一致（入力が名前に含まれる or 名前が入力に含まれる）
  const normalized = companyName.toLowerCase();
  for (const [id, name] of Object.entries(map)) {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes(normalized) || normalized.includes(normalizedName)) {
      return { companyId: id, companyName: name };
    }
  }

  return null;
}

/**
 * 登録済みの全顧問先一覧を返す
 * @returns {Array<{ companyId: string, companyName: string }>}
 */
function listCompanies() {
  const mapPath = path.join(__dirname, '../../data/company-map.json');
  if (!fs.existsSync(mapPath)) return [];

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  return Object.entries(map).map(([id, name]) => ({ companyId: id, companyName: name }));
}

module.exports = { resolveCompanyId, listCompanies };
