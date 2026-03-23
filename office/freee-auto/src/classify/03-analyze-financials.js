// ============================================================
// 財務分析エンジン
// 3期比較、月次推移、財務指標分析
// ============================================================

const fs = require('fs');
const path = require('path');
const rules = require('../shared/rules');

class FinancialAnalyzer {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.rawDir = path.join(dataDir, 'raw');
    this.analysisDir = path.join(dataDir, 'analysis');

    if (!fs.existsSync(this.analysisDir)) {
      fs.mkdirSync(this.analysisDir, { recursive: true });
    }

    this.config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    this.companyId = this.config.company_id;
    this.freeeBaseUrl = `https://secure.freee.co.jp/companies/${this.companyId}`;

    this.findings = [];
  }

  loadJSON(fileName) {
    const filePath = path.join(this.rawDir, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: ${fileName} not found`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  // ============================================================
  // BS 3期比較
  // ============================================================
  compareBSThreePeriods() {
    const current = this.loadJSON('trial_bs_current.json');
    const prior1 = this.loadJSON('trial_bs_prior1.json');
    const prior2 = this.loadJSON('trial_bs_prior2.json');

    if (!current) {
      console.warn('BS current data not available');
      return null;
    }

    const getBalances = (data) => {
      if (!data) return {};
      const balances = data.trial_bs?.balances || data.balances || data;
      const result = {};
      (Array.isArray(balances) ? balances : []).forEach(b => {
        if (b.account_item_name && !b.total_line) {
          result[b.account_item_name] = {
            closing: b.closing_balance || 0,
            opening: b.opening_balance || 0,
            category: b.account_category_name || '',
          };
        }
        // total lineも保存
        if (b.total_line && b.account_category_name) {
          result[`【${b.account_category_name}合計】`] = {
            closing: b.closing_balance || 0,
            opening: b.opening_balance || 0,
            category: b.account_category_name,
            isTotal: true,
          };
        }
      });
      return result;
    };

    const curBal = getBalances(current);
    const p1Bal = getBalances(prior1);
    const p2Bal = getBalances(prior2);

    // 全科目をマージ
    const allAccounts = new Set([
      ...Object.keys(curBal),
      ...Object.keys(p1Bal),
      ...Object.keys(p2Bal),
    ]);

    const comparison = [];
    allAccounts.forEach(name => {
      const cur = curBal[name]?.closing || 0;
      const p1 = p1Bal[name]?.closing || 0;
      const p2 = p2Bal[name]?.closing || 0;
      const cat = curBal[name]?.category || p1Bal[name]?.category || p2Bal[name]?.category || '';
      const isTotal = curBal[name]?.isTotal || false;

      const changeVsP1 = cur - p1;
      const changeRateVsP1 = p1 !== 0 ? (changeVsP1 / Math.abs(p1) * 100) : (cur !== 0 ? 999 : 0);

      let status = '';
      let note = '';

      // マイナス残高チェック
      if (cur < 0 && !isTotal && !name.includes('累計額') && !name.includes('引当金')) {
        const shouldNotBeNegative = rules.NO_NEGATIVE_BS_ACCOUNTS.some(n => name.includes(n));
        if (shouldNotBeNegative) {
          status = '⚠️ マイナス';
          note = '通常マイナスにならない科目';
          this.findings.push({
            severity: '🔴', category: 'BS異常値',
            item: name, amount: cur,
            issue: `${name}の残高がマイナス（${cur.toLocaleString()}円）です`,
            explanation: 'この科目は通常マイナスにならない科目です。記帳漏れや処理ミスの可能性があります。',
          });
        }
      }

      // 残高が0であるべき科目
      if (rules.SHOULD_BE_ZERO_ACCOUNTS.some(n => name.includes(n)) && cur !== 0) {
        status = '⚠️ 要確認';
        note = '通常ゼロであるべき科目';
        this.findings.push({
          severity: '🔴', category: 'BS異常値',
          item: name, amount: cur,
          issue: `${name}に${cur.toLocaleString()}円の残高があります`,
          explanation: 'この科目は通常ゼロであるべきです。未処理の取引がないか確認してください。',
        });
      }

      // 大幅変動
      if (Math.abs(changeRateVsP1) > 50 && Math.abs(changeVsP1) > 100000 && !isTotal) {
        if (!status) status = '📊 大幅変動';
        if (!note) note = `前期比${changeRateVsP1 > 0 ? '+' : ''}${changeRateVsP1.toFixed(0)}%`;
      }

      comparison.push({
        name, category: cat, isTotal,
        prior2: p2, prior1: p1, current: cur,
        changeVsP1, changeRateVsP1: Math.abs(changeRateVsP1) > 999 ? null : changeRateVsP1,
        status, note,
      });
    });

    const outputPath = path.join(this.analysisDir, 'bs_comparison.json');
    fs.writeFileSync(outputPath, JSON.stringify(comparison, null, 2), 'utf-8');
    console.log(`BS 3期比較: ${comparison.length}科目 → ${outputPath}`);

    return comparison;
  }

  // ============================================================
  // PL 3期比較
  // ============================================================
  comparePLThreePeriods() {
    const current = this.loadJSON('trial_pl_current.json');
    const prior1 = this.loadJSON('trial_pl_prior1.json');
    const prior2 = this.loadJSON('trial_pl_prior2.json');

    if (!current) {
      console.warn('PL current data not available');
      return null;
    }

    const months = this.config.period_months || 1;

    const getBalances = (data) => {
      if (!data) return {};
      const balances = data.trial_pl?.balances || data.balances || data;
      const result = {};
      (Array.isArray(balances) ? balances : []).forEach(b => {
        const key = b.account_item_name || (b.total_line ? `【${b.account_category_name}合計】` : null);
        if (key) {
          result[key] = {
            closing: b.closing_balance || 0,
            category: b.account_category_name || '',
            isTotal: !!b.total_line,
            ratio: b.composition_ratio || 0,
          };
        }
      });
      return result;
    };

    const curPL = getBalances(current);
    const p1PL = getBalances(prior1);
    const p2PL = getBalances(prior2);

    const allAccounts = new Set([
      ...Object.keys(curPL),
      ...Object.keys(p1PL),
      ...Object.keys(p2PL),
    ]);

    const sales = curPL['売上高']?.closing || 1;

    const comparison = [];
    allAccounts.forEach(name => {
      const cur = curPL[name]?.closing || 0;
      const p1 = p1PL[name]?.closing || 0;
      const p2 = p2PL[name]?.closing || 0;
      const cat = curPL[name]?.category || '';
      const isTotal = curPL[name]?.isTotal || false;

      const changeVsP1 = cur - p1;
      const changeRateVsP1 = p1 !== 0 ? (changeVsP1 / Math.abs(p1) * 100) : (cur !== 0 ? 999 : 0);

      let note = '';
      // 大幅変動
      if (Math.abs(changeRateVsP1) > 30 && Math.abs(changeVsP1) > 100000 && !isTotal) {
        note = `前期同期比${changeRateVsP1 > 0 ? '+' : ''}${changeRateVsP1.toFixed(0)}%`;
        this.findings.push({
          severity: '🟡', category: 'PL変動',
          item: name, amount: cur,
          issue: `${name}が前期同期比で${changeRateVsP1.toFixed(0)}%変動しています（${p1.toLocaleString()}円→${cur.toLocaleString()}円）`,
          explanation: '大幅な変動がある費目です。変動の原因を確認してください。',
        });
      }

      comparison.push({
        name, category: cat, isTotal,
        prior2: p2, prior1: p1, current: cur,
        monthlyAvg: Math.round(cur / months),
        salesRatio: (cur / sales * 100).toFixed(1),
        changeVsP1, changeRateVsP1: Math.abs(changeRateVsP1) > 999 ? null : changeRateVsP1,
        note,
      });
    });

    const outputPath = path.join(this.analysisDir, 'pl_comparison.json');
    fs.writeFileSync(outputPath, JSON.stringify(comparison, null, 2), 'utf-8');
    console.log(`PL 3期比較: ${comparison.length}科目 → ${outputPath}`);

    return comparison;
  }

  // ============================================================
  // 月次PL分析 (異常検知)
  // ============================================================
  analyzeMonthlyPL() {
    const monthlyData = [];

    // 月次PLファイルを読み込み
    for (let i = 1; i <= 24; i++) {
      const fileName = `trial_pl_month_${i}.json`;
      const data = this.loadJSON(fileName);
      if (data) {
        monthlyData.push(data);
      }
    }

    // 単一ファイルの場合
    const singleFile = this.loadJSON('trial_pl_monthly.json');
    if (singleFile && Array.isArray(singleFile)) {
      monthlyData.push(...singleFile);
    }

    if (monthlyData.length === 0) {
      console.warn('Monthly PL data not available');
      return null;
    }

    // 各月のPLを集計
    const monthlyAccounts = {};

    monthlyData.forEach((data, idx) => {
      const balances = data.trial_pl?.balances || data.balances || data;
      const month = data.month || data.trial_pl?.end_month || (idx + 1);
      const year = data.year || data.trial_pl?.fiscal_year || 0;
      const label = `${year}/${String(month).padStart(2, '0')}`;

      (Array.isArray(balances) ? balances : []).forEach(b => {
        if (b.account_item_name && !b.total_line) {
          if (!monthlyAccounts[b.account_item_name]) {
            monthlyAccounts[b.account_item_name] = {};
          }
          monthlyAccounts[b.account_item_name][label] = b.closing_balance || 0;
        }
      });
    });

    // 異常検知
    const anomalies = [];
    Object.entries(monthlyAccounts).forEach(([name, months]) => {
      const values = Object.values(months);
      if (values.length < 3) return;

      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const stddev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);

      Object.entries(months).forEach(([month, value]) => {
        if (stddev > 0 && Math.abs(value - avg) > 2 * stddev && Math.abs(value - avg) > 50000) {
          anomalies.push({
            account: name,
            month,
            value,
            average: Math.round(avg),
            deviation: Math.round(value - avg),
            note: value > avg ? '大幅増加' : '大幅減少',
          });

          this.findings.push({
            severity: '🟡', category: '月次異常',
            item: name, amount: value,
            issue: `${name}が${month}に異常値を示しています（${value.toLocaleString()}円、平均${Math.round(avg).toLocaleString()}円）`,
            explanation: `月平均${Math.round(avg).toLocaleString()}円に対し、${month}は${value.toLocaleString()}円（偏差: ${Math.round(value - avg).toLocaleString()}円）です。原因を確認してください。`,
          });
        }
      });
    });

    const output = { monthlyAccounts, anomalies };
    const outputPath = path.join(this.analysisDir, 'monthly_analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`月次PL分析: ${Object.keys(monthlyAccounts).length}科目, 異常値${anomalies.length}件 → ${outputPath}`);

    return output;
  }

  // ============================================================
  // 財務指標分析 (3期比較)
  // ============================================================
  calculateRatios() {
    const periods = ['prior2', 'prior1', 'current'];
    const labels = [
      this.config.periods?.prior2?.label || '前々期',
      this.config.periods?.prior1?.label || '前期',
      this.config.periods?.current?.label || '当期',
    ];

    const ratios = {};

    periods.forEach((period, idx) => {
      const pl = this.loadJSON(`trial_pl_${period}.json`);
      const bs = this.loadJSON(`trial_bs_${period}.json`);

      if (!pl || !bs) {
        ratios[labels[idx]] = null;
        return;
      }

      const getPLValue = (data, name) => {
        const balances = data.trial_pl?.balances || data.balances || [];
        const item = balances.find(b => b.account_item_name === name || (b.total_line && b.account_category_name === name));
        return item?.closing_balance || 0;
      };

      const getBSValue = (data, name) => {
        const balances = data.trial_bs?.balances || data.balances || [];
        const item = balances.find(b =>
          b.account_item_name === name ||
          (b.total_line && b.account_category_name === name) ||
          (b.total_line && name === '負債及び純資産' && b.account_category_name === name)
        );
        return item?.closing_balance || 0;
      };

      const sales = getPLValue(pl, '売上高') || 1;
      const sgaTotal = getPLValue(pl, '販売管理費');
      const operatingProfit = getPLValue(pl, '営業損益金額');
      const ordinaryProfit = getPLValue(pl, '経常損益金額');
      const netIncome = getPLValue(pl, '当期純損益金額');

      const totalAssets = getBSValue(bs, '資産');
      const netAssets = getBSValue(bs, '純資産');
      const totalLiabilities = getBSValue(bs, '負債');

      ratios[labels[idx]] = {
        sales,
        sgaTotal,
        operatingProfit,
        ordinaryProfit,
        netIncome,
        totalAssets,
        netAssets,
        totalLiabilities,
        operatingMargin: (operatingProfit / sales * 100).toFixed(1),
        ordinaryMargin: (ordinaryProfit / sales * 100).toFixed(1),
        netMargin: (netIncome / sales * 100).toFixed(1),
        sgaRatio: (sgaTotal / sales * 100).toFixed(1),
        equityRatio: totalAssets > 0 ? (netAssets / totalAssets * 100).toFixed(1) : 'N/A',
        debtRatio: netAssets > 0 ? (totalLiabilities / netAssets * 100).toFixed(1) : 'N/A',
        roe: netAssets > 0 ? (netIncome / netAssets * 100).toFixed(1) : 'N/A',
        roa: totalAssets > 0 ? (netIncome / totalAssets * 100).toFixed(1) : 'N/A',
      };
    });

    const outputPath = path.join(this.analysisDir, 'ratio_analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(ratios, null, 2), 'utf-8');
    console.log(`財務指標分析: ${Object.keys(ratios).filter(k => ratios[k]).length}期分 → ${outputPath}`);

    return ratios;
  }

  // ============================================================
  // メイン実行
  // ============================================================
  run() {
    console.log('\n=== 財務分析エンジン開始 ===');

    this.compareBSThreePeriods();
    this.comparePLThreePeriods();
    this.analyzeMonthlyPL();
    this.calculateRatios();

    // findings を追加出力
    const outputPath = path.join(this.analysisDir, 'financial_findings.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.findings, null, 2), 'utf-8');

    console.log(`\n=== 財務分析結果 ===`);
    console.log(`BS/PL変動等の指摘: ${this.findings.length}件`);
    console.log(`結果保存: ${outputPath}`);

    return this.findings;
  }
}

// CLI実行
if (require.main === module) {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('Usage: node 03-analyze-financials.js <data-dir>');
    process.exit(1);
  }

  const analyzer = new FinancialAnalyzer(dataDir);
  analyzer.run();
}

module.exports = FinancialAnalyzer;
