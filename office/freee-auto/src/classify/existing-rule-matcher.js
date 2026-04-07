/**
 * existing-rule-matcher.js
 * 既存自動登録ルールCSVとの照合モジュール
 *
 * freeeからエクスポートした既存ルールCSV（Shift_JIS）を読み込み、
 * 未処理明細と7条件（収支区分・取引口座・取引内容・マッチ条件・金額範囲）で照合する。
 *
 * 設計原則: 取引内容の一致だけで採用しない。条件全体を見る。
 */

const fs = require('fs');
const iconv = require('iconv-lite');

// --------------------------------------------------
// CSVパーサー（ダブルクォート対応）
// --------------------------------------------------

/**
 * CSV行をパース（ダブルクォート対応）
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// --------------------------------------------------
// ルールCSVの読み込み
// --------------------------------------------------

/**
 * 既存ルールCSVを読み込み、構造化されたルール配列を返す
 *
 * @param {string} csvPath - CSVファイルパス
 * @param {Object} [options]
 * @param {string} [options.encoding='cp932'] - エンコーディング
 * @returns {Object[]} ルール配列
 */
function loadRuleCsv(csvPath, options = {}) {
  const encoding = options.encoding || 'cp932';

  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const buf = fs.readFileSync(csvPath);
  const text = encoding === 'utf-8'
    ? buf.toString('utf-8')
    : iconv.decode(buf, encoding);
  const lines = text.split(/\r?\n/);

  if (lines.length < 2) return [];

  const rules = [];
  // 1行目はヘッダー → スキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    if (fields.length < 16) continue;

    rules.push({
      entrySide: fields[0] || '',        // 収支区分: 「収入」or「支出」
      walletName: fields[1] || '',       // 取引口座
      cardLabel: fields[2] || '',        // カードラベル
      content: fields[3] || '',          // 取引内容
      matchType: fields[4] || '完全一致', // マッチ条件
      amountMin: fields[5] ? Number(fields[5]) : null, // 金額（最小値）
      amountMax: fields[6] ? Number(fields[6]) : null, // 金額（最大値）
      priority: Number(fields[7]) || 0,  // 優先度
      action: fields[8] || '',           // マッチ後のアクション
      transferAccount: fields[9] || '',  // 振替口座
      partner: fields[12] || '',         // 取引先
      invoiceType: fields[13] || '',     // 適格請求書等
      account: fields[14] || '',         // 勘定科目
      taxClass: fields[15] || '',        // 税区分
      item: fields[16] || '',            // 品目
      _lineNumber: i + 1,               // デバッグ用行番号
    });
  }

  return rules;
}

// --------------------------------------------------
// テキストマッチ
// --------------------------------------------------

/**
 * マッチ条件に基づくテキスト照合
 * @param {string} target - 照合対象（明細の摘要）
 * @param {string} pattern - ルールの取引内容
 * @param {string} matchType - 「完全一致」「部分一致」「前方一致」
 * @returns {boolean}
 */
function matchText(target, pattern, matchType) {
  if (!target || !pattern) return false;

  // 比較時はスペースを正規化（連続スペースを1つに、前後トリム）
  const normalizeSpaces = (s) => s.replace(/\s+/g, ' ').trim();
  const t = normalizeSpaces(target);
  const p = normalizeSpaces(pattern);

  switch (matchType) {
    case '完全一致':
      return t === p;
    case '部分一致':
      return t.includes(p);
    case '前方一致':
      return t.startsWith(p);
    default:
      return t === p; // デフォルトは完全一致
  }
}

// --------------------------------------------------
// メイン: 既存ルール照合
// --------------------------------------------------

/**
 * 単一ルールとのマッチ判定
 * @param {Object} item - 照合対象
 * @param {Object} rule - ルール1件
 * @returns {boolean}
 */
function matchesSingleRule(item, rule) {
  const description = item.description || '';
  const entrySideJa = item.entrySideJa || '';
  const walletableName = item.walletableName || '';
  const amount = Math.abs(item.amount || 0);

  // 1. 取引内容のマッチ
  if (!matchText(description, rule.content, rule.matchType)) return false;

  // 2. 収支区分の一致（指定ありの場合のみ）
  if (rule.entrySide && rule.entrySide !== entrySideJa) return false;

  // 3. 取引口座の一致（指定ありの場合のみ）
  if (rule.walletName && rule.walletName !== walletableName) return false;

  // 4. カードラベルの一致（指定ありの場合のみ）
  if (rule.cardLabel && rule.cardLabel !== (item.cardLabel || '')) return false;

  // 5. 金額条件（最小値）
  if (rule.amountMin !== null && amount < rule.amountMin) return false;

  // 6. 金額条件（最大値）
  if (rule.amountMax !== null && amount > rule.amountMax) return false;

  return true;
}

/**
 * 条件指定の多さ（specificity）を算出
 * 取引口座・金額最小値・金額最大値の指定有無でカウント
 */
function ruleSpecificity(rule) {
  let count = 0;
  if (rule.walletName) count++;
  if (rule.amountMin !== null) count++;
  if (rule.amountMax !== null) count++;
  if (rule.cardLabel) count++;
  return count;
}

/**
 * 明細を既存ルール群と照合し、最も優先度の高いルールを返す
 *
 * 照合条件（全て一致で採用）:
 *   1. 取引内容 × マッチ条件（完全一致/部分一致/前方一致）
 *   2. 収支区分（指定ありの場合のみ）
 *   3. 取引口座（指定ありの場合のみ）
 *   4. カードラベル（指定ありの場合のみ）
 *   5. 金額条件（最小値）
 *   6. 金額条件（最大値）
 *
 * 複数ヒット時の優先順位:
 *   1. 完全一致 > 前方一致 > 部分一致
 *   2. 同じマッチ条件内では「優先度」フィールドの値が大きい方を優先
 *   3. 同じ優先度なら、条件指定が多い方（金額条件あり等）を優先
 *
 * @param {Object} item - 照合対象の明細
 * @param {string} item.description - 摘要テキスト
 * @param {string} item.entrySideJa - 「収入」or「支出」
 * @param {string} [item.walletableName] - 口座名
 * @param {number} [item.amount] - 金額（絶対値）
 * @param {Object[]} rules - loadRuleCsv()の出力
 * @returns {Object|null} マッチしたルール情報、またはnull
 */
function matchExistingRules(item, rules) {
  if (!rules || rules.length === 0) return null;

  // 全ルールをスキャンし、条件一致するものを全て収集
  const matches = [];
  for (const rule of rules) {
    if (matchesSingleRule(item, rule)) {
      matches.push(rule);
    }
  }

  if (matches.length === 0) return null;

  // 優先順位でソート
  const matchOrder = { '\u5b8c\u5168\u4e00\u81f4': 0, '\u524d\u65b9\u4e00\u81f4': 1, '\u90e8\u5206\u4e00\u81f4': 2 };
  matches.sort((a, b) => {
    // 1. マッチ条件の厳密さ（完全一致 > 前方一致 > 部分一致）
    const diff1 = (matchOrder[a.matchType] ?? 9) - (matchOrder[b.matchType] ?? 9);
    if (diff1 !== 0) return diff1;

    // 2. 優先度（大きい方が優先）
    const diff2 = (b.priority || 0) - (a.priority || 0);
    if (diff2 !== 0) return diff2;

    // 3. 条件指定の多さ
    return ruleSpecificity(b) - ruleSpecificity(a);
  });

  const best = matches[0];
  return {
    account: best.account || null,
    taxClass: best.taxClass || null,
    partner: best.partner || null,
    item: best.item || null,
    action: best.action || null,
    transferAccount: best.transferAccount || null,
    invoiceType: best.invoiceType || null,
    confidence: 92,
    source: 'existing_rule',
    matchedContent: best.content,
    matchType: best.matchType,
    priority: String(best.priority || 0),
    note: `\u65e2\u5b58\u30eb\u30fc\u30eb\u4e00\u81f4\uff08${best.matchType}\u3001\u512a\u5148\u5ea6: ${best.priority || 0}\uff09`,
  };
}

module.exports = {
  loadRuleCsv,
  matchExistingRules,
  matchText,
  parseCsvLine,
};
