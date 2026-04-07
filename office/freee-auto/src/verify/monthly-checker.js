'use strict';

/**
 * monthly-checker.js
 *
 * 月次帳簿チェック オーケストレーター（スケルトン）
 *
 * 実行コマンド:
 *   node src/verify/monthly-checker.js --company 474381 --month 2026-03
 *
 * 処理フロー:
 *   1. freee APIで BS/PL/取引データを取得（monthly-data-fetcher.js）
 *   2. 11個のチェックモジュールを実行（Step 3〜12 で順次追加）
 *   3. 結果をコンソール出力 / Excelレポート生成（Step 13で追加）
 *   4. Kintone App②に🔴🟡を送付（Step 14で追加）
 */

const { fetchMonthlyData, resolveAutoMonth, fetchMonthlyPlTrend, fetchHistoricalBs } = require('./monthly-data-fetcher');

// ============================================================
// チェックモジュール（後続Stepで順次 require を追加）
// ============================================================
const { dataQualityCheck }       = require('./monthly-checks/data-quality');       // Step 3: F-1〜F-4
const { cashDepositCheck }       = require('./monthly-checks/cash-deposit');       // Step 3: GA-1
const { extraordinaryTaxCheck }  = require('./monthly-checks/extraordinary-tax'); // Step 3: HC-1〜HC-4
const { loanLeaseCheck }         = require('./monthly-checks/loan-lease');         // Step 4: HB1-1
const { fixedAssetCheck }        = require('./monthly-checks/fixed-asset');        // Step 4: GD-1, JC1-1
const { rentCheck }              = require('./monthly-checks/rent');               // Step 5: HD-1, HD-2
const { payrollCheck }           = require('./monthly-checks/payroll');            // Step 5: JC2-1, JC2-2
const { outsourceCheck }         = require('./monthly-checks/outsource');          // Step 6: HB2-1, JA-1
const { officerLoanCheck }       = require('./monthly-checks/officer-loan');       // Step 4: JB-1
const { revenueReceivableCheck } = require('./monthly-checks/revenue-receivable'); // Step 5: HA-1, GC-1
const { purchasePayableCheck }   = require('./monthly-checks/purchase-payable');   // Step 5: JC3-1〜JC3-4
const { balanceAnomalyCheck }    = require('./monthly-checks/balance-anomaly');    // Step N: BA-01〜BA-05
const { periodAllocationCheck } = require('./monthly-checks/period-allocation'); // Step N: PA-01〜PA-08
const { taxClassificationCheck } = require('./monthly-checks/tax-classification'); // TC-01〜TC-08
const { withholdingTaxCheck }    = require('./monthly-checks/withholding-tax');    // WT-01〜WT-06
const { advanceTaxPaymentCheck } = require('./monthly-checks/advance-tax-payment'); // AT-01〜AT-03

// ============================================================
// Finding 型定義（JSDoc）
// ============================================================
/**
 * @typedef {Object} Finding
 * @property {'🔴'|'🟡'|'🔵'} severity - 重要度
 * @property {string} category          - カテゴリ（チェックコードプレフィックス）
 * @property {string} checkCode         - チェックコード（例: 'GA-1', 'JC2-1'）
 * @property {string} description       - 人が読む指摘文
 * @property {string} [currentValue]    - 現在の値
 * @property {string} [suggestedValue]  - 推奨値
 * @property {string} [freeeLink]       - freee Web画面へのリンク
 */

// ============================================================
// サマリー生成
// ============================================================

function buildSummary(findings, companyId, targetMonth, data) {
  const byCategory = {};
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  return {
    companyId,
    companyName: data.companyName || companyId,
    targetMonth,
    fiscalYear: data.fiscalYear,
    startMonth: data.startMonth,
    totalFindings: findings.length,
    bySeverity: {
      '🔴': findings.filter((f) => f.severity === '🔴').length,
      '🟡': findings.filter((f) => f.severity === '🟡').length,
      '🔵': findings.filter((f) => f.severity === '🔵').length,
    },
    byCategory,
    fetchedAt: data.fetchedAt,
    fetchErrors: data.fetchErrors || [],
  };
}

// ============================================================
// コンソール出力
// ============================================================

function printSummary(summary) {
  console.log('\n=== チェック結果 ===');
  console.log(`事業所: ${summary.companyName} (ID: ${summary.companyId})`);
  console.log(`対象月: ${summary.targetMonth}  会計年度: ${summary.fiscalYear}  期首月: ${summary.startMonth}月`);
  console.log(`指摘合計: ${summary.totalFindings}件`);
  console.log(`  🔴 要修正: ${summary.bySeverity['🔴']}件`);
  console.log(`  🟡 要確認: ${summary.bySeverity['🟡']}件`);
  console.log(`  🔵 情報:   ${summary.bySeverity['🔵']}件`);

  if (summary.fetchErrors.length > 0) {
    console.log('\n--- データ取得エラー ---');
    for (const err of summary.fetchErrors) {
      console.warn(`  ⚠️  ${err}`);
    }
  }
}

function printFindings(findings) {
  if (findings.length === 0) {
    console.log('\n指摘事項はありません。（チェックモジュール未実装）');
    return;
  }
  console.log('\n--- 指摘詳細 ---');
  for (const f of findings) {
    const val = f.currentValue ? ` [${f.currentValue}]` : '';
    console.log(`${f.severity} [${f.checkCode}] ${f.description}${val}`);
  }
}

function printDataSummary(data) {
  console.log('\n取得完了:');
  console.log(`  trialBs:           ${data.trialBs ? '取得済' : '未取得'}`);
  console.log(`  trialBsByItem:     ${data.trialBsByItem ? '取得済' : '未取得'}`);
  console.log(`  trialBsByPartner:  ${data.trialBsByPartner ? '取得済' : '未取得'}`);
  console.log(`  trialPl:           ${data.trialPl ? '取得済' : '未取得'}`);
  console.log(`  trialPlByPartner:  ${data.trialPlByPartner ? '取得済' : '未取得'}`);
  console.log(`  deals:             ${data.deals != null ? `${data.deals.length}件` : '未取得'}`);
  console.log(`  walletTxns:        ${data.walletTxns != null ? `${data.walletTxns.length}件` : '未取得'}`);
  console.log(`  accountItems:      ${data.accountItems ? 'ローカルキャッシュ' : 'なし'}`);
  console.log(`  partners:          ${data.partners ? 'ローカルキャッシュ' : 'なし'}`);
  console.log(`  prevMonth:         ${data.prevMonth ? '取得済' : '未取得'}`);
  console.log(`  prevYearMonth:     ${data.prevYearMonth ? '取得済' : '未取得'}`);
}

// ============================================================
// メイン: monthlyCheck
// ============================================================

/**
 * 月次帳簿チェックを実行する
 *
 * @param {string|number} companyId  - 事業所ID
 * @param {string}        targetMonth - 対象月 'YYYY-MM'
 * @param {Object}        [options]
 * @param {boolean}       [options.dryRun=true] - true: Kintone送付しない
 * @returns {Promise<{ findings: Finding[], summary: Object, data: Object }>}
 */
async function monthlyCheck(companyId, targetMonth, options = {}) {
  const { dryRun = true } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(` 月次帳簿チェック: ${companyId} / ${targetMonth}`);
  console.log(`${'='.repeat(60)}\n`);

  // ────────────────────────────────────
  // 1. データ取得
  // ────────────────────────────────────
  console.log('データ取得中...');
  const data = await fetchMonthlyData(companyId, targetMonth, {
    includePrevMonth: true,
    includePrevYear: true,
  });

  printDataSummary(data);

  // ────────────────────────────────────
  // 1b. 過去期BS取得（リンク生成用: 残高変動期の自動探索）
  // ────────────────────────────────────
  if (data.fiscalYear && data.startMonth) {
    try {
      data.historicalBs = await fetchHistoricalBs(
        companyId, data.fiscalYear, data.startMonth, targetMonth
      );
    } catch (err) {
      console.warn(`  [警告] 過去期BS取得スキップ: ${err.message}`);
      data.historicalBs = null;
    }
  }

  // ────────────────────────────────────
  // 2. チェックモジュール実行
  //    （後続Stepで各行のコメントを外す）
  // ────────────────────────────────────
  const findings = [];

  findings.push(...dataQualityCheck(data));       // Step 3: DQ-01〜DQ-03
  findings.push(...cashDepositCheck(data));       // Step 3: CD-01〜CD-04
  findings.push(...extraordinaryTaxCheck(data)); // Step 3: ET-01〜ET-07
  findings.push(...loanLeaseCheck(data));         // Step 4: LL-01〜LL-03
  findings.push(...officerLoanCheck(data));       // Step 4: OL-01〜OL-04
  findings.push(...fixedAssetCheck(data));        // Step 4: FA-01〜FA-02
  findings.push(...rentCheck(data));               // Step 5: RT-01〜RT-03
  findings.push(...payrollCheck(data));            // Step 5: PY-01〜PY-04
  findings.push(...outsourceCheck(data));           // Step 6: OS-01
  findings.push(...revenueReceivableCheck(data));  // Step 5: RR-01〜RR-03
  findings.push(...purchasePayableCheck(data));    // Step 5: PP-01〜PP-04
  findings.push(...balanceAnomalyCheck(data));     // Step N: BA-01〜BA-05（ドリルダウン）
  findings.push(...periodAllocationCheck(data));  // Step N: PA-01〜PA-08（期間配分）
  findings.push(...taxClassificationCheck(data)); // TC-01〜TC-08（消費税区分）
  findings.push(...withholdingTaxCheck(data));    // WT-01〜WT-06（源泉所得税）
  findings.push(...advanceTaxPaymentCheck(data)); // AT-01〜AT-03（予定納税）

  // ────────────────────────────────────
  // 3. サマリー生成・出力
  // ────────────────────────────────────
  const summary = buildSummary(findings, companyId, targetMonth, data);

  printSummary(summary);
  printFindings(findings);

  // ────────────────────────────────────
  // 4. Kintone App② 送付（Step 14 で実装）
  // ────────────────────────────────────
  if (!dryRun && findings.some((f) => f.severity !== '🔵')) {
    // TODO Step 14: await sendToKintone(findings.filter(f => f.severity !== '🔵'), companyId);
    console.log('\n[Kintone] 送付対象あり（Step 14 で実装予定）');
  }

  // ────────────────────────────────────
  // 5. Excel レポート生成
  // ────────────────────────────────────
  if (!dryRun) {
    const { generateMonthlyReport } = require('./monthly-report-generator');
    try {
      // PL月次推移データを取得（期首〜対象月の月別単月金額）
      let plTrend = null;
      if (data.fiscalYear && data.startMonth) {
        console.log('  [API] PL月次推移データを取得中...');
        try {
          plTrend = await fetchMonthlyPlTrend(
            companyId, data.fiscalYear, data.startMonth, targetMonth
          );
          console.log(`  [Info] PL月次推移: ${plTrend.months?.length || 0}ヶ月分取得`);
        } catch (plErr) {
          console.warn(`  [警告] PL月次推移取得失敗（フォールバック使用）: ${plErr.message}`);
        }
      }

      const reportPath = await generateMonthlyReport({
        companyId,
        companyName: data.companyName || String(companyId),
        targetMonth,
        findings,
        monthlyData: data,
        plTrend,
      });
      console.log(`📊 Excelレポート生成: ${reportPath}`);
    } catch (err) {
      console.error(`⚠️ レポート生成失敗（チェック結果には影響なし）: ${err.message}`);
    }
  }

  console.log('\n完了。');

  return { findings, summary, data };
}

// ============================================================
// CLI エントリポイント
// ============================================================

if (require.main === module) {
  const { resolveCompanyIdAsync } = require('../shared/company-resolver');

  const args = process.argv.slice(2);
  let companyId, companyNameArg, targetMonthArg;
  let dryRun = true; // デフォルトはdryRun

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--company'      && args[i + 1]) companyId = args[i + 1];
    if (args[i] === '--company-name' && args[i + 1]) companyNameArg = args[i + 1];
    if (args[i] === '--month'        && args[i + 1]) targetMonthArg = args[i + 1];
    if (args[i] === '--no-dry-run')  dryRun = false;
    if (args[i] === '--dry-run')     dryRun = true;
  }

  if (!companyId && !companyNameArg || !targetMonthArg) {
    console.error('使用方法:');
    console.error('  node src/verify/monthly-checker.js --company {id} --month YYYY-MM|auto [--no-dry-run]');
    console.error('  node src/verify/monthly-checker.js --company-name {名前} --month YYYY-MM|auto [--no-dry-run]');
    console.error('');
    console.error('例（IDで指定）: node src/verify/monthly-checker.js --company 474381 --month 2026-03 --no-dry-run');
    console.error('例（名前で指定）: node src/verify/monthly-checker.js --company-name あしたの --month 2026-03 --no-dry-run');
    console.error('例（自動月判定）: node src/verify/monthly-checker.js --company 474381 --month auto');
    process.exit(1);
  }

  (async () => {
    // --company-name が指定された場合、ローカル→Kintoneの順で company ID を解決
    if (!companyId && companyNameArg) {
      const resolved = await resolveCompanyIdAsync(companyNameArg);
      if (resolved && resolved.companyId) {
        companyId = resolved.companyId;
        const sourceLabel = resolved.source === 'local' ? 'company-map.json'
          : resolved.source === 'kintone' ? 'Kintone顧客カルテ' : resolved.source;
        console.log(`顧問先名「${companyNameArg}」→ ${resolved.companyName} (ID: ${resolved.companyId}、ソース: ${sourceLabel})`);
        if (resolved.source === 'kintone') {
          console.log(`  → data/company-map.json に自動追加しました（次回以降はローカルで即解決）`);
        }
      } else if (resolved && resolved.source === 'kintone-no-id') {
        console.error(`エラー: 「${resolved.companyName}」のfreee事業所IDがKintone顧客カルテに未登録です（レコードID: ${resolved.recordId}）`);
        console.error('先に company-resolver で解決してください:');
        console.error(`  node src/shared/company-resolver.js --search "${companyNameArg}"`);
        process.exit(1);
      } else {
        console.error(`エラー: 「${companyNameArg}」に一致する顧問先が見つかりません。`);
        console.error('data/company-map.json にエントリを追加するか、Kintone顧客カルテを確認してください。');
        process.exit(1);
      }
    }
    let targetMonth = targetMonthArg;

    // --month auto: walletTxns から対象月を自動判定
    if (targetMonth === 'auto') {
      console.log('\n基準日を自動判定中...');
      const cutoffResult = await resolveAutoMonth(companyId);
      targetMonth = cutoffResult.targetMonth;
      console.log(`基準日判定結果: ${targetMonth}（自動 / 理由: ${cutoffResult.reason}）`);
    } else {
      console.log(`\n基準日判定結果: ${targetMonth}（手動）`);
    }

    console.log(`モード: ${dryRun ? 'dryRun（レポート生成なし）' : '本番（Excelレポート生成）'}`);
    await monthlyCheck(companyId, targetMonth, { dryRun });
    process.exit(0);
  })().catch((err) => {
    console.error('\nエラー:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}

// ============================================================
// エクスポート
// ============================================================

module.exports = { monthlyCheck };
