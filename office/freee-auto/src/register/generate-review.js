#!/usr/bin/env node
/**
 * generate-review.js
 * レビュー用Excel生成CLIスクリプト
 *
 * 使い方:
 *   node src/register/generate-review.js --company 11890320
 *   node src/register/generate-review.js --company 11890320 --existing-rules rule-csv/xxx.csv
 *   node src/register/generate-review.js --company 11890320 --month 2026-03
 *
 * 処理フロー:
 *   1. 未処理明細データを読み込み（data/{companyId}/raw/wallet_txns_unprocessed.json）
 *   2. 既存自動登録ルールCSVを読み込み（指定時）
 *   3. 顧問先固有辞書を読み込み（data/client-dicts/{companyId}.json）
 *   4. 全件を classifyMultiStage で多段階推測
 *   5. レビュー用Excelを出力
 */

const path = require('path');
const fs = require('fs');
const { classifyMultiStage, loadClientDict } = require('../classify/multi-stage-classifier');
const { loadRuleCsv } = require('../classify/existing-rule-matcher');
const { generateReviewSheet } = require('./review-sheet-generator');

// --------------------------------------------------
// 口座マスタ（walletable_id → 口座名マップ）
// --------------------------------------------------

/**
 * 口座マスタをロードする
 * 1. ローカルキャッシュ data/{companyId}/walletables.json があればそれを使用
 * 2. なければ空マップを返す（CLIからfreee API取得は別途）
 *
 * @param {string} companyId - freee事業所ID
 * @param {string} baseDir - プロジェクトルート
 * @returns {Map<number, string>} walletable_id → 口座名
 */
function loadWalletableMap(companyId, baseDir) {
  const cachePath = path.join(baseDir, 'data', companyId, 'walletables.json');
  const map = new Map();
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const walletables = data.walletables || data;
      for (const w of walletables) {
        if (w.id && w.name) {
          map.set(w.id, w.name);
        }
      }
    } catch (e) {
      console.warn(`口座マスタ読み込みエラー: ${e.message}`);
    }
  }
  return map;
}

/**
 * 各明細にwalletable_nameを補完する
 * @param {Array} txns - 未処理明細配列
 * @param {Map<number, string>} walletMap - walletable_id → 口座名マップ
 * @returns {{ enriched: Array, noWalletCount: number }}
 */
function enrichWalletNames(txns, walletMap) {
  let noWalletCount = 0;
  const enriched = txns.map(txn => {
    // 既にwalletable_nameがあればそのまま
    if (txn.walletable_name) return txn;

    const wId = txn.walletable_id;
    if (wId && walletMap.has(wId)) {
      return { ...txn, walletable_name: walletMap.get(wId) };
    }

    // 口座名取得不可
    noWalletCount++;
    return { ...txn, walletable_name: '', _noWallet: true };
  });
  return { enriched, noWalletCount };
}

// --------------------------------------------------
// 引数パース
// --------------------------------------------------

function parseArgs(argv) {
  const args = { company: null, existingRules: null, month: null, outputDir: null };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--company': args.company = argv[++i]; break;
      case '--existing-rules': args.existingRules = argv[++i]; break;
      case '--month': args.month = argv[++i]; break;
      case '--output-dir': args.outputDir = argv[++i]; break;
    }
  }
  return args;
}

// --------------------------------------------------
// メイン
// --------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (!args.company) {
    console.error('使い方: node src/register/generate-review.js --company <companyId> [--existing-rules <path>] [--month YYYY-MM]');
    process.exit(1);
  }

  const companyId = args.company;
  const baseDir = path.join(__dirname, '..', '..');

  console.log(`\n=== レビュー用Excel生成: ${companyId} ===\n`);

  // --- 1. 未処理明細データの読み込み ---
  const rawPath = path.join(baseDir, 'data', companyId, 'raw', 'wallet_txns_unprocessed.json');
  if (!fs.existsSync(rawPath)) {
    console.error(`未処理明細が見つかりません: ${rawPath}`);
    process.exit(1);
  }
  const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  const txns = rawData.wallet_txns || rawData;
  console.log(`未処理明細: ${txns.length}件`);

  // status=2 (処理済み) や rule_matched をフィルタ
  const filtered = txns.filter(t => t.status !== 2 && !t.rule_matched);
  console.log(`対象明細: ${filtered.length}件（処理済み・ルールマッチ済みを除外）`);

  // --- 1.5. 口座情報の補完 ---
  const walletMap = loadWalletableMap(companyId, baseDir);
  if (walletMap.size > 0) {
    console.log(`口座マスタ: ${walletMap.size}件`);
    for (const [id, name] of walletMap) {
      console.log(`  ${id} → ${name}`);
    }
  } else {
    console.warn('⚠ 口座マスタが見つかりません。data/{companyId}/walletables.json を配置してください');
  }

  const { enriched: unprocessed, noWalletCount } = enrichWalletNames(filtered, walletMap);
  if (noWalletCount > 0) {
    console.warn(`⚠ 口座名取得不可: ${noWalletCount}件（レビュー対象に回します）`);
  } else if (walletMap.size > 0) {
    console.log(`口座名補完: 全件完了`);
  }

  // --- 2. 既存自動登録ルールCSVの読み込み ---
  let existingRules = [];
  if (args.existingRules) {
    const csvPath = path.resolve(args.existingRules);
    existingRules = loadRuleCsv(csvPath);
    console.log(`既存ルール: ${existingRules.length}件（${csvPath}）`);
  } else {
    // rule-csv/ から最新のCSVを自動検出
    const ruleDir = path.join(baseDir, 'rule-csv');
    if (fs.existsSync(ruleDir)) {
      const csvFiles = fs.readdirSync(ruleDir)
        .filter(f => f.startsWith(companyId + '_') && f.endsWith('.csv'))
        .sort()
        .reverse();
      if (csvFiles.length > 0) {
        const csvPath = path.join(ruleDir, csvFiles[0]);
        existingRules = loadRuleCsv(csvPath);
        console.log(`既存ルール: ${existingRules.length}件（自動検出: ${csvFiles[0]}）`);
      } else {
        console.log('既存ルール: なし（CSVファイル未検出）');
      }
    }
  }

  // --- 3. 顧問先固有辞書の読み込み ---
  const clientDictRules = loadClientDict(companyId);
  console.log(`顧問先辞書: ${clientDictRules.length}件`);

  // --- 4. 顧問先名取得 ---
  let companyName = '';
  const dictPath = path.join(baseDir, 'data', 'client-dicts', `${companyId}.json`);
  if (fs.existsSync(dictPath)) {
    try {
      const dictData = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
      companyName = dictData.companyName || '';
    } catch { /* ignore */ }
  }

  // --- 5. 全件分類 ---
  console.log('\n--- 多段階推測 実行中... ---');
  const results = [];
  for (const txn of unprocessed) {
    const item = {
      description: txn.description || '',
      entry_side: txn.entry_side || 'expense',
      walletable_type: txn.walletable_type || '',
      walletable_name: txn.walletable_name || '',
      amount: txn.amount || 0,
    };

    // 口座取得不可の明細は推測対象から除外し、レビュー対象に回す
    if (txn._noWallet) {
      results.push({
        transactionType: 'UNKNOWN',
        account: null,
        taxClass: null,
        action: null,
        overallConfidence: 0,
        accountSource: 'unmatched',
        note: '口座取得不可のためレビュー対象',
        partner: '',
        matchCondition: '',
        matchText: '',
        _original: {
          description: txn.description,
          walletable_name: '',
          amount: txn.amount,
          entry_side: txn.entry_side,
          _noWallet: true,
        },
      });
      continue;
    }

    const msResult = classifyMultiStage(item, {
      existingRules,
      clientDictRules,
      ownAccountNames: [],
      pastPatternMatch: null,
      pastPatternScore: 0,
    });

    results.push({
      ...msResult,
      _original: {
        description: txn.description,
        walletable_name: txn.walletable_name || '',
        amount: txn.amount,
        entry_side: txn.entry_side,
      },
    });
  }

  // --- 6. サマリー表示 ---
  console.log('\n--- 取引類型別 ---');
  const byType = {};
  for (const r of results) {
    byType[r.transactionType] = (byType[r.transactionType] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}件`);
  }

  console.log('\n--- 推測ソース別 ---');
  const bySource = {};
  for (const r of results) {
    bySource[r.accountSource] = (bySource[r.accountSource] || 0) + 1;
  }
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}件`);
  }

  console.log('\n--- アクション別 ---');
  const byAction = {};
  for (const r of results) {
    const key = r.action || '要確認(null)';
    byAction[key] = (byAction[key] || 0) + 1;
  }
  for (const [action, count] of Object.entries(byAction).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${action}: ${count}件`);
  }

  console.log('\n--- 信頼度分布 ---');
  const confBuckets = { high: 0, medium: 0, low: 0 };
  for (const r of results) {
    if (r.overallConfidence >= 70) confBuckets.high++;
    else if (r.overallConfidence >= 30) confBuckets.medium++;
    else confBuckets.low++;
  }
  console.log(`  70+点 (薄緑): ${confBuckets.high}件`);
  console.log(`  30-69点 (薄黄): ${confBuckets.medium}件`);
  console.log(`  0-29点 (薄赤): ${confBuckets.low}件`);

  // 品質指標
  const excludedTypes = ['LOAN_REPAY', 'ATM', 'CREDIT_PULL', 'TRANSFER', 'SOCIAL_INSURANCE'];
  const expenseCount = results.filter(r => !excludedTypes.includes(r.transactionType)).length;
  const matchedCount = results.filter(r => r.accountSource !== 'unmatched' && !excludedTypes.includes(r.transactionType)).length;
  const zappCount = results.filter(r => r.account === '雑費').length;
  const unmatchedItems = results.filter(r => r.accountSource === 'unmatched');

  console.log('\n--- 品質指標 ---');
  console.log(`  処理対象（除外以外）: ${expenseCount}件`);
  console.log(`  推測成功: ${matchedCount}件 (${expenseCount ? (matchedCount / expenseCount * 100).toFixed(1) : 0}%)`);
  console.log(`  雑費フォールバック: ${zappCount}件 (${expenseCount ? (zappCount / expenseCount * 100).toFixed(1) : 0}%)`);
  console.log(`  未判定: ${unmatchedItems.length}件 (${expenseCount ? (unmatchedItems.length / expenseCount * 100).toFixed(1) : 0}%)`);

  // --- 7. レビュー用Excel生成 ---
  console.log('\n--- レビュー用Excel生成 ---');
  const outputDir = args.outputDir || path.join(baseDir, 'reports');
  const { filePath, stats } = await generateReviewSheet(results, {
    companyId,
    companyName,
    targetMonth: args.month || '',
    outputDir,
  });
  console.log(`出力: ${filePath}`);
  console.log(`統計: 合計=${stats.total} 推測=${stats.suggest} 要確認=${stats.review} 除外=${stats.excluded}`);

  // --- 8. 未判定の明細を表示（デバッグ用） ---
  if (unmatchedItems.length > 0 && unmatchedItems.length <= 60) {
    console.log('\n--- 未判定の明細 ---');
    for (const r of unmatchedItems) {
      console.log(`  [${r.transactionType}] ${r._original.description} | ${Math.abs(r._original.amount).toLocaleString()}円`);
    }
  }

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error(e); process.exit(1); });
