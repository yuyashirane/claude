'use strict';

const { accountChecker }    = require('./checkers/account-checker');
const { taxChecker }        = require('./checkers/tax-checker');
const { tagChecker }        = require('./checkers/tag-checker');
const { amountChecker }     = require('./checkers/amount-checker');
const { newPartnerChecker } = require('./checkers/new-partner-checker');
const { normalizeRoute }    = require('./checkers/normalize-helpers');

// Kintone送付（将来実装 — kintone-sender.js の sendCheckFindings を使用）
// dryRun=false 時は🔴🟡をKintone App②（VERIFY_CHECK）に送付する
let sendCheckFindings;
try {
  ({ sendCheckFindings } = require('../review/kintone-sender'));
} catch (e) {
  // kintone-sender が利用できない環境ではスキップ
  sendCheckFindings = null;
}

/**
 * パイプライン直後チェック（全チェッカー統合オーケストレーター）
 *
 * @param {Array}  classifiedItems  - パイプライン処理結果
 * @param {string} companyId        - 事業所ID
 * @param {Object} [options={}]
 * @param {boolean} [options.dryRun=true] - trueの場合Kintone送付をスキップ
 * @returns {Promise<{ findings: Finding[], summary: Object }>}
 */
async function postRegisterCheck(classifiedItems, companyId, options = {}) {
  const { dryRun = true } = options;

  // 空配列ガード
  if (!Array.isArray(classifiedItems) || classifiedItems.length === 0) {
    const emptySummary = buildSummary([], classifiedItems || []);
    printReport(emptySummary, []);
    return { findings: [], summary: emptySummary };
  }

  const findings = [];

  // 各チェッカーを順次実行（個別 try-catch でエラー隔離）
  const CHECKERS = [
    { name: 'accountChecker',    fn: accountChecker },
    { name: 'taxChecker',        fn: taxChecker },
    { name: 'tagChecker',        fn: tagChecker },
    { name: 'amountChecker',     fn: amountChecker },
    { name: 'newPartnerChecker', fn: newPartnerChecker },
  ];

  for (const { name, fn } of CHECKERS) {
    try {
      const result = fn(classifiedItems, companyId);
      findings.push(...result);
    } catch (err) {
      console.warn(`[VERIFY] ${name} でエラーが発生しました（スキップ）: ${err.message}`);
    }
  }

  // サマリー生成・コンソール出力
  const summary = buildSummary(findings, classifiedItems);
  printReport(summary, findings);

  // Kintone App② 送付（🔴🟡のみ、dryRun=false 時）
  if (!dryRun && sendCheckFindings) {
    const kintoneFindings = adaptForKintone(findings);
    await sendCheckFindings(kintoneFindings, {
      dryRun: false,
      config: { company_name: companyId },
    });
  } else {
    const sendTarget = findings.filter(f => f.severity === '🔴' || f.severity === '🟡').length;
    console.log(`[VERIFY][DRY-RUN] Kintone App②への送付をスキップ（${sendTarget}件）`);
  }

  return { findings, summary };
}

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * Finding 配列とパイプライン全件からサマリーを生成
 */
function buildSummary(findings, classifiedItems) {
  const targetItems = classifiedItems.filter(i =>
    ['register', 'suggest'].includes(normalizeRoute(i))
  );
  const registerCount = classifiedItems.filter(i => normalizeRoute(i) === 'register').length;
  const suggestCount  = classifiedItems.filter(i => normalizeRoute(i) === 'suggest').length;

  return {
    totalItems:    classifiedItems.length,
    checkedItems:  targetItems.length,
    registerCount,
    suggestCount,
    totalFindings: findings.length,
    bySeverity: {
      '🔴': findings.filter(f => f.severity === '🔴').length,
      '🟡': findings.filter(f => f.severity === '🟡').length,
      '🔵': findings.filter(f => f.severity === '🔵').length,
    },
    byCategory: {
      account:     findings.filter(f => f.category === 'account').length,
      tax:         findings.filter(f => f.category === 'tax').length,
      tag:         findings.filter(f => f.category === 'tag').length,
      amount:      findings.filter(f => f.category === 'amount').length,
      new_partner: findings.filter(f => f.category === 'new_partner').length,
    },
  };
}

/**
 * チェック結果をコンソールに出力
 */
function printReport(summary, findings) {
  console.log('\n=== VERIFY: パイプライン直後チェック結果 ===');
  console.log(`対象取引: ${summary.checkedItems}件（register: ${summary.registerCount}件, suggest: ${summary.suggestCount}件）`);
  console.log(`指摘合計: ${summary.totalFindings}件`);

  if (summary.totalFindings === 0) {
    console.log('  指摘事項はありません。');
    console.log('============================================\n');
    return;
  }

  console.log(`  🔴 要修正: ${summary.bySeverity['🔴']}件`);
  console.log(`  🟡 要確認: ${summary.bySeverity['🟡']}件`);
  console.log(`  🔵 情報:   ${summary.bySeverity['🔵']}件`);

  const reds    = findings.filter(f => f.severity === '🔴');
  const yellows = findings.filter(f => f.severity === '🟡');
  const blues   = findings.filter(f => f.severity === '🔵');

  if (reds.length > 0) {
    console.log('\n--- 🔴 要修正 ---');
    for (const f of reds) {
      console.log(`  [${f.checkCode}] ${f.description}`);
    }
  }
  if (yellows.length > 0) {
    console.log('\n--- 🟡 要確認 ---');
    for (const f of yellows) {
      console.log(`  [${f.checkCode}] ${f.description}`);
    }
  }
  if (blues.length > 0) {
    console.log('\n--- 🔵 情報 ---');
    for (const f of blues) {
      console.log(`  [${f.checkCode}] ${f.description}`);
    }
  }

  console.log('============================================\n');
}

/**
 * Finding を kintone-sender.js の sendCheckFindings が受け取る形式に変換
 *
 * Finding型のフィールド → toCheckRecord が参照するフィールド
 *   description   → issue
 *   currentValue  → item  （"[A-03] 受取利息" 形式）
 *   suggestedValue → explanation
 */
function adaptForKintone(findings) {
  return findings
    .filter(f => f.severity === '🔴' || f.severity === '🟡')
    .map(f => ({
      severity:    f.severity,
      category:    f.category,
      issue:       f.description,
      item:        `[${f.checkCode}] ${f.currentValue}`,
      explanation: f.suggestedValue ? `推奨: ${f.suggestedValue}` : '',
      amount:      0,
    }));
}

module.exports = { postRegisterCheck };
