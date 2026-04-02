/**
 * rule-csv-generator.js
 * CLASSIFY結果を freee自動登録ルールCSV に変換して出力するモジュール
 *
 * 入力: src/classify/unprocessed-processor.js の processWalletTxns() 戻り値
 * 出力: Shift_JIS (cp932) エンコードの53カラムCSV
 * 仕様: references/operations/freee-rule-csv-spec.md
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const {
  toFreeeTaxLabel,
  toFreeeInvoiceLabel,
  toFreeeEntrySide,
} = require('./tax-label-mapper');

// freee自動登録ルールCSVヘッダー（53カラム）
const CSV_HEADER = '収支区分,取引口座,カードラベル,取引内容,マッチ条件,金額（最小値）,金額（最大値）,優先度,マッチ後のアクション,振替口座,取引テンプレート,購入データ原本に準拠,取引先,適格請求書等,勘定科目,税区分,品目,部門,メモタグ（複数指定可・カンマ区切り）,セグメント1,セグメント2,セグメント3,備考,消込を実行する際の差額,差額金額の設定（消込の過小入金・出金）,勘定科目（消込の過小入金・出金）,税区分（消込の過小入金・出金）,品目（消込の過小入金・出金）,部門（消込の過小入金・出金）,メモタグ（複数指定可・カンマ区切り）（消込の過小入金・出金）,セグメント1（消込の過小入金・出金）,セグメント2（消込の過小入金・出金）,セグメント3（消込の過小入金・出金）,備考（消込の過小入金・出金）,勘定科目（消込の過小入金・出金の複合差額）,税区分（消込の過小入金・出金の複合差額）,品目（消込の過小入金・出金の複合差額）,部門（消込の過小入金・出金の複合差額）,メモタグ（複数指定可・カンマ区切り）（消込の過小入金・出金の複合差額）,セグメント1（消込の過小入金・出金の複合差額）,セグメント2（消込の過小入金・出金の複合差額）,セグメント3（消込の過小入金・出金の複合差額）,備考（消込の過小入金・出金の複合差額）,差額金額の設定（消込の過剰入金・出金）,勘定科目（消込の過剰入金・出金）,税区分（消込の過剰入金・出金）,品目（消込の過剰入金・出金）,部門（消込の過剰入金・出金）,メモタグ（複数指定可・カンマ区切り）（消込の過剰入金・出金）,セグメント1（消込の過剰入金・出金）,セグメント2（消込の過剰入金・出金）,セグメント3（消込の過剰入金・出金）,備考（消込の過剰入金・出金）';

/**
 * CSVフィールドのエスケープ
 * カンマ・ダブルクォート・改行を含む場合はダブルクォートで囲む
 */
function escapeCsvField(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * マッチ条件の選択
 * auto_register → 部分一致（繰り返し使えるルール）
 * それ以外 → 完全一致（一回限りの推測ルール）
 */
function selectMatchCondition(item) {
  if (item.routeDestination === 'auto_register') {
    return '部分一致';
  }
  return '完全一致';
}

/**
 * マッチ後のアクション選択
 * auto_register → 取引を登録する
 * それ以外 → 取引を推測する
 */
function selectAction(item) {
  if (item.routeDestination === 'auto_register') {
    return '取引を登録する';
  }
  return '取引を推測する';
}

/**
 * パイプライン出力アイテムからフラット形式のフィールドを抽出
 * processWalletTxns()のネスト構造とテスト用フラット構造の両方に対応
 * @param {Object} item - パイプライン出力またはフラットオブジェクト
 * @returns {Object} フラットなフィールドオブジェクト
 */
function normalizeItem(item) {
  // パイプライン出力（ネスト構造: item.transaction, item.classification, item.routing）
  if (item.routing && item.routing.decision) {
    return {
      routeDestination: item.routing.decision,
      entrySide: item.transaction?.debit_credit || 'expense',
      description: item.transaction?.description || '',
      walletableName: item.walletableName || '',
      partnerName: item.transaction?.partner_name || '',
      accountName: item.classification?.estimated_account || '',
      taxClassification: item.classification?.estimated_tax_class || '',
      invoiceType: item.classification?.invoice_class || '',
      confidenceScore: item.classification?.confidence_score || 0,
    };
  }
  // テスト用フラット構造（routeDestination直接指定）
  return {
    routeDestination: item.routeDestination || '',
    entrySide: item.entrySide || 'expense',
    description: item.description || '',
    walletableName: item.walletableName || '',
    partnerName: item.partnerName || '',
    accountName: item.accountName || '',
    taxClassification: item.taxClassification || '',
    invoiceType: item.invoiceType || '',
    confidenceScore: item.confidenceScore || 0,
  };
}

/**
 * CLASSIFY済み1明細を53要素の配列に変換
 * @param {Object} item - 分類済み明細（パイプライン出力 or フラット形式）
 * @returns {string[]|null} 53要素の配列、またはスキップ時null
 */
function toRuleCsvRow(item) {
  const n = normalizeItem(item);

  // CSV行を生成しないルート
  if (n.routeDestination === 'kintone_senior' || n.routeDestination === 'excluded'
      || n.routeDestination === 'exclude') {
    return null;
  }

  const row = new Array(53).fill('');

  // カラム0〜6: 条件側（重複判定キー）
  row[0] = toFreeeEntrySide(n.entrySide);       // 収支区分
  row[1] = n.walletableName || '';               // 取引口座
  row[2] = '';                                   // カードラベル（通常空）
  row[3] = n.description;                        // 取引内容 ※原文そのまま
  row[4] = selectMatchCondition(n);              // マッチ条件
  row[5] = '';                                   // 金額（最小値）
  row[6] = '';                                   // 金額（最大値）

  // カラム7〜22: 処理側
  row[7] = '0';                                  // 優先度
  row[8] = selectAction(n);                      // マッチ後のアクション
  row[9] = '';                                   // 振替口座
  row[10] = '';                                  // 取引テンプレート
  row[11] = '';                                  // 購入データ原本に準拠
  row[12] = n.partnerName || '';                 // 取引先
  row[13] = toFreeeInvoiceLabel(n.invoiceType);  // 適格請求書等
  row[14] = n.accountName || '';                 // 勘定科目
  row[15] = toFreeeTaxLabel(n.taxClassification); // 税区分
  row[16] = '';                                  // 品目
  row[17] = '';                                  // 部門
  row[18] = '';                                  // メモタグ
  // カラム19〜52: セグメント・備考・消込関連 → 全て空（初期値のまま）

  return row;
}

/**
 * 重複判定キー（カラム0〜6を結合）を生成
 */
function buildDedupeKey(row) {
  return row.slice(0, 7).join('\t');
}

/**
 * 既存ルールCSVからカラム0〜6の重複判定キーセットを構築
 * @param {string} csvPath - 既存CSVファイルパス
 * @returns {Set<string>} 重複判定キーのSet
 */
function loadExistingKeys(csvPath) {
  const keys = new Set();
  const buf = fs.readFileSync(csvPath);
  const text = iconv.decode(buf, 'cp932');
  const lines = text.split(/\r?\n/);

  // 1行目はヘッダーなのでスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    if (fields.length >= 7) {
      keys.add(fields.slice(0, 7).join('\t'));
    }
  }
  return keys;
}

/**
 * CSV行をパース（ダブルクォート対応）
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

/**
 * CLASSIFY結果を自動登録ルールCSVに変換して出力
 *
 * @param {Object} classifiedResult - processWalletTxns()の戻り値
 * @param {Object} options
 * @param {string} options.companyId - freee事業所ID
 * @param {string} [options.outputDir] - CSV出力先ディレクトリ（デフォルト: ./rule-csv/）
 * @param {string} [options.encoding] - 'cp932'(デフォルト) or 'utf-8'
 * @param {string} [options.existingRuleCsvPath] - 既存ルールCSV（重複排除用）
 * @returns {Object} { csvPath, stats: { total, register, suggest, skipped, deduplicated } }
 */
function generateRuleCsv(classifiedResult, options = {}) {
  const {
    companyId,
    outputDir = './rule-csv',
    encoding = 'cp932',
    existingRuleCsvPath,
  } = options;

  if (!companyId) {
    throw new Error('options.companyId は必須です');
  }

  const items = classifiedResult.all || classifiedResult.items || [];
  const stats = { total: items.length, register: 0, suggest: 0, skipped: 0, deduplicated: 0 };

  // 既存ルールの重複判定キーを読み込み
  let existingKeys = new Set();
  if (existingRuleCsvPath && fs.existsSync(existingRuleCsvPath)) {
    existingKeys = loadExistingKeys(existingRuleCsvPath);
  }

  // 各明細をCSV行に変換
  const rows = [];
  for (const item of items) {
    const row = toRuleCsvRow(item);
    if (!row) {
      stats.skipped++;
      continue;
    }

    // 重複排除
    const key = buildDedupeKey(row);
    if (existingKeys.has(key)) {
      stats.deduplicated++;
      continue;
    }

    // アクション別カウント
    if (row[8] === '取引を登録する') {
      stats.register++;
    } else {
      stats.suggest++;
    }

    rows.push(row);
  }

  // CSV文字列の構築
  const csvLines = [CSV_HEADER];
  for (const row of rows) {
    csvLines.push(row.map(escapeCsvField).join(','));
  }
  const csvText = csvLines.join('\r\n') + '\r\n';

  // 出力ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ファイル名: {companyId}_rules_{timestamp}.csv
  const timestamp = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 14);
  const fileName = `${companyId}_rules_${timestamp}.csv`;
  const csvPath = path.join(outputDir, fileName);

  // エンコードして書き出し
  if (encoding === 'utf-8') {
    fs.writeFileSync(csvPath, csvText, 'utf-8');
  } else {
    const encoded = iconv.encode(csvText, 'cp932');
    fs.writeFileSync(csvPath, encoded);
  }

  return { csvPath, stats };
}

module.exports = {
  generateRuleCsv,
  // テスト用に内部関数も公開
  toRuleCsvRow,
  escapeCsvField,
  parseCsvLine,
  buildDedupeKey,
  selectMatchCondition,
  selectAction,
  CSV_HEADER,
};

// CLI実行対応
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node rule-csv-generator.js <input-result.json> [--existing <existing.csv>] [--company <id>] [--output <dir>] [--encoding utf-8|cp932]');
    process.exit(1);
  }

  const inputPath = args[0];
  let existingRuleCsvPath;
  let companyId = '474381'; // デフォルト: テスト事業所
  let outputDir = './rule-csv';
  let encoding = 'cp932';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--existing' && args[i + 1]) {
      existingRuleCsvPath = args[++i];
    } else if (args[i] === '--company' && args[i + 1]) {
      companyId = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[++i];
    } else if (args[i] === '--encoding' && args[i + 1]) {
      encoding = args[++i];
    }
  }

  const resultJson = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const result = generateRuleCsv(resultJson, { companyId, outputDir, encoding, existingRuleCsvPath });

  console.log('--- ルールCSV生成完了 ---');
  console.log(`出力先: ${result.csvPath}`);
  console.log(`合計: ${result.stats.total}件`);
  console.log(`  登録ルール: ${result.stats.register}件`);
  console.log(`  推測ルール: ${result.stats.suggest}件`);
  console.log(`  スキップ: ${result.stats.skipped}件`);
  console.log(`  重複除外: ${result.stats.deduplicated}件`);
}
