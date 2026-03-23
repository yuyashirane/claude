// ============================================================
// Excelレポート生成（改良版）
// 分析結果JSONからExcelを生成
// ============================================================

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// --- スタイル定義 ---
const STYLES = {
  RED_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } },
  YELLOW_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } },
  BLUE_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } },
  GREEN_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } },
  GRAY_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
  HEADER_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } },
  SUBHEADER_FILL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF42A5F5' } },
  HEADER_FONT: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  TITLE_FONT: { bold: true, size: 16 },
  SUBTITLE_FONT: { bold: true, size: 12 },
  TOTAL_FONT: { bold: true, size: 11 },
  THIN_BORDER: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

function getSeverityFill(severity) {
  if (severity === '🔴') return STYLES.RED_FILL;
  if (severity === '🟡') return STYLES.YELLOW_FILL;
  return STYLES.BLUE_FILL;
}

class ReportGenerator {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.analysisDir = path.join(dataDir, 'analysis');
    this.config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    this.companyId = this.config.company_id;
    this.companyName = this.config.company_name;
    this.freeeBaseUrl = `https://secure.freee.co.jp`;
  }

  loadAnalysis(fileName) {
    const filePath = path.join(this.analysisDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  addHeaderRow(sheet, headers) {
    const row = sheet.addRow(headers);
    row.eachCell((cell) => {
      cell.fill = STYLES.HEADER_FILL;
      cell.font = STYLES.HEADER_FONT;
      cell.border = STYLES.THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    return row;
  }

  async generate() {
    const workbook = new ExcelJS.Workbook();

    // Load all analysis results
    const flaggedTxns = this.loadAnalysis('flagged_transactions.json') || [];
    const financialFindings = this.loadAnalysis('financial_findings.json') || [];
    const bsComparison = this.loadAnalysis('bs_comparison.json') || [];
    const plComparison = this.loadAnalysis('pl_comparison.json') || [];
    const monthlyAnalysis = this.loadAnalysis('monthly_analysis.json');
    const ratioAnalysis = this.loadAnalysis('ratio_analysis.json');

    const allFindings = [...flaggedTxns, ...financialFindings];

    // ============================================================
    // シート1: サマリー
    // ============================================================
    this.createSummarySheet(workbook, allFindings);

    // ============================================================
    // シート2: チェック結果詳細（取引レベル）
    // ============================================================
    this.createFindingsSheet(workbook, allFindings);

    // ============================================================
    // シート3: BS 3期比較
    // ============================================================
    this.createBSSheet(workbook, bsComparison);

    // ============================================================
    // シート4: PL 3期比較
    // ============================================================
    this.createPLSheet(workbook, plComparison);

    // ============================================================
    // シート5: 月次PL推移
    // ============================================================
    if (monthlyAnalysis) {
      this.createMonthlyPLSheet(workbook, monthlyAnalysis);
    }

    // ============================================================
    // シート6: 財務指標 3期比較
    // ============================================================
    if (ratioAnalysis) {
      this.createRatioSheet(workbook, ratioAnalysis);
    }

    // ============================================================
    // ファイル保存
    // ============================================================
    const outputDir = path.join('C:', 'Users', 'yuya_', 'claude', 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const fileName = `${this.companyName}_勘定科目チェック_${this.config.period_start}_${this.config.period_end}_${today}_${timestamp}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    console.log(`\nレポート出力: ${filePath}`);
    return filePath;
  }

  createSummarySheet(workbook, allFindings) {
    const sheet = workbook.addWorksheet('サマリー');

    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = '勘定科目・BS/PLチェックレポート';
    sheet.getCell('A1').font = STYLES.TITLE_FONT;

    sheet.getCell('A3').value = '事業所名:';
    sheet.getCell('B3').value = this.companyName;
    sheet.getCell('B3').font = { bold: true };
    sheet.getCell('A4').value = '対象期間:';
    sheet.getCell('B4').value = `${this.config.period_start} ~ ${this.config.period_end}`;
    sheet.getCell('A5').value = 'チェック実行日:';
    sheet.getCell('B5').value = new Date().toLocaleDateString('ja-JP');

    const redCount = allFindings.filter(f => f.severity === '🔴').length;
    const yellowCount = allFindings.filter(f => f.severity === '🟡').length;
    const blueCount = allFindings.filter(f => f.severity === '🔵').length;

    sheet.addRow([]);
    sheet.addRow(['チェック結果サマリー']).getCell(1).font = STYLES.SUBTITLE_FONT;

    this.addHeaderRow(sheet, ['重要度', '件数', '説明']);
    const r1 = sheet.addRow(['🔴 要修正', redCount, '明らかな誤りの可能性が高い']);
    r1.getCell(1).fill = STYLES.RED_FILL;
    const r2 = sheet.addRow(['🟡 要確認', yellowCount, '確認が必要']);
    r2.getCell(1).fill = STYLES.YELLOW_FILL;
    const r3 = sheet.addRow(['🔵 参考情報', blueCount, '念のため確認を推奨']);
    r3.getCell(1).fill = STYLES.BLUE_FILL;
    sheet.addRow(['合計', redCount + yellowCount + blueCount, '']);

    // カテゴリ別
    sheet.addRow([]);
    sheet.addRow(['カテゴリ別内訳']).getCell(1).font = STYLES.SUBTITLE_FONT;
    this.addHeaderRow(sheet, ['カテゴリ', '🔴', '🟡', '🔵', '合計']);

    const categories = [...new Set(allFindings.map(f => f.category))];
    categories.forEach(cat => {
      const cf = allFindings.filter(f => f.category === cat);
      sheet.addRow([
        cat,
        cf.filter(f => f.severity === '🔴').length,
        cf.filter(f => f.severity === '🟡').length,
        cf.filter(f => f.severity === '🔵').length,
        cf.length,
      ]);
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 50;
  }

  createFindingsSheet(workbook, allFindings) {
    const sheet = workbook.addWorksheet('チェック結果詳細');

    this.addHeaderRow(sheet, [
      '重要度', 'カテゴリ', '日付', '勘定科目', '取引先', '品目',
      '金額', '税区分', '摘要', '問題内容', '解説', 'freeeリンク',
    ]);

    const severityOrder = { '🔴': 0, '🟡': 1, '🔵': 2 };
    const sorted = allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    sorted.forEach(f => {
      const row = sheet.addRow([
        f.severity,
        f.category,
        f.date || '',
        f.accountName || f.item || '',
        f.partnerName || '',
        f.itemName || '',
        f.amount || 0,
        f.taxCodeName || '',
        f.description || '',
        f.issue || '',
        f.explanation || '',
        f.freeeLink ? { text: 'freeeで確認', hyperlink: f.freeeLink } : '',
      ]);

      row.getCell(7).numFmt = '#,##0';
      if (f.freeeLink) {
        row.getCell(12).font = { color: { argb: 'FF1565C0' }, underline: true };
      }

      const fill = getSeverityFill(f.severity);
      row.eachCell(cell => {
        cell.fill = fill;
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.border = STYLES.THIN_BORDER;
      });
    });

    // フィルタ
    if (sorted.length > 0) {
      sheet.autoFilter = { from: 'A1', to: `L${sorted.length + 1}` };
    }

    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 18;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 20;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 15;
    sheet.getColumn(7).width = 15;
    sheet.getColumn(8).width = 18;
    sheet.getColumn(9).width = 30;
    sheet.getColumn(10).width = 45;
    sheet.getColumn(11).width = 50;
    sheet.getColumn(12).width = 15;
  }

  createBSSheet(workbook, bsComparison) {
    const sheet = workbook.addWorksheet('BS 3期比較');

    const p2Label = this.config.periods?.prior2?.label || '前々期';
    const p1Label = this.config.periods?.prior1?.label || '前期';
    const curLabel = this.config.periods?.current?.label || '当期';

    this.addHeaderRow(sheet, [
      '勘定科目', 'カテゴリ', p2Label, p1Label, curLabel,
      '増減額(前期比)', '増減率', 'ステータス', '備考',
    ]);

    bsComparison.forEach(item => {
      const row = sheet.addRow([
        item.name,
        item.category,
        item.prior2,
        item.prior1,
        item.current,
        item.changeVsP1,
        item.changeRateVsP1 !== null ? `${item.changeRateVsP1.toFixed(1)}%` : 'N/A',
        item.status,
        item.note,
      ]);

      [3, 4, 5, 6].forEach(col => { row.getCell(col).numFmt = '#,##0'; });

      if (item.isTotal) {
        row.font = STYLES.TOTAL_FONT;
        row.eachCell(cell => { cell.fill = STYLES.GRAY_FILL; });
      }
      if (item.current < 0 && !item.isTotal) {
        row.eachCell(cell => { cell.fill = STYLES.RED_FILL; });
      }

      row.eachCell(cell => { cell.border = STYLES.THIN_BORDER; });
    });

    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 18;
    [3, 4, 5, 6].forEach(c => { sheet.getColumn(c).width = 18; });
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 30;

    if (bsComparison.length > 0) {
      sheet.autoFilter = { from: 'A1', to: `I${bsComparison.length + 1}` };
    }
  }

  createPLSheet(workbook, plComparison) {
    const sheet = workbook.addWorksheet('PL 3期比較');

    const p2Label = this.config.periods?.prior2?.label || '前々期';
    const p1Label = this.config.periods?.prior1?.label || '前期';
    const curLabel = this.config.periods?.current?.label || '当期';

    this.addHeaderRow(sheet, [
      '勘定科目', 'カテゴリ', p2Label, p1Label, curLabel,
      '月平均', '売上比', '増減額(前期比)', '増減率', '備考',
    ]);

    plComparison.forEach(item => {
      const row = sheet.addRow([
        item.name,
        item.category,
        item.prior2,
        item.prior1,
        item.current,
        item.monthlyAvg || '',
        item.salesRatio ? `${item.salesRatio}%` : '',
        item.changeVsP1,
        item.changeRateVsP1 !== null ? `${item.changeRateVsP1.toFixed(1)}%` : 'N/A',
        item.note,
      ]);

      [3, 4, 5, 6, 8].forEach(col => { row.getCell(col).numFmt = '#,##0'; });

      if (item.isTotal) {
        row.font = STYLES.TOTAL_FONT;
        row.eachCell(cell => { cell.fill = STYLES.GRAY_FILL; });
      }
      if (item.note && item.note.includes('%')) {
        row.eachCell(cell => { cell.fill = STYLES.YELLOW_FILL; });
      }

      row.eachCell(cell => { cell.border = STYLES.THIN_BORDER; });
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 15;
    [3, 4, 5, 6, 8].forEach(c => { sheet.getColumn(c).width = 18; });
    sheet.getColumn(7).width = 10;
    sheet.getColumn(9).width = 12;
    sheet.getColumn(10).width = 35;
  }

  createMonthlyPLSheet(workbook, monthlyAnalysis) {
    const sheet = workbook.addWorksheet('月次PL推移');

    const { monthlyAccounts, anomalies } = monthlyAnalysis;
    if (!monthlyAccounts) return;

    const allMonths = new Set();
    Object.values(monthlyAccounts).forEach(months => {
      Object.keys(months).forEach(m => allMonths.add(m));
    });
    const sortedMonths = [...allMonths].sort();

    this.addHeaderRow(sheet, ['勘定科目', ...sortedMonths, 'コメント']);

    Object.entries(monthlyAccounts).forEach(([name, months]) => {
      const values = sortedMonths.map(m => months[m] || 0);
      const accountAnomalies = anomalies.filter(a => a.account === name);
      const comment = accountAnomalies.map(a => `${a.month}: ${a.note}`).join('; ');

      const row = sheet.addRow([name, ...values, comment]);

      // 数値フォーマット
      for (let i = 2; i <= sortedMonths.length + 1; i++) {
        row.getCell(i).numFmt = '#,##0';
      }

      // 異常値のセルをハイライト
      accountAnomalies.forEach(a => {
        const colIdx = sortedMonths.indexOf(a.month);
        if (colIdx >= 0) {
          row.getCell(colIdx + 2).fill = STYLES.YELLOW_FILL;
          row.getCell(colIdx + 2).font = { bold: true, color: { argb: 'FFD84315' } };
        }
      });

      row.eachCell(cell => { cell.border = STYLES.THIN_BORDER; });
    });

    sheet.getColumn(1).width = 25;
    for (let i = 2; i <= sortedMonths.length + 1; i++) {
      sheet.getColumn(i).width = 14;
    }
    sheet.getColumn(sortedMonths.length + 2).width = 40;
  }

  createRatioSheet(workbook, ratioAnalysis) {
    const sheet = workbook.addWorksheet('財務指標 3期比較');

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = '財務指標 3期比較分析';
    sheet.getCell('A1').font = STYLES.TITLE_FONT;
    sheet.addRow([]);

    const periods = Object.keys(ratioAnalysis);
    this.addHeaderRow(sheet, ['指標', ...periods]);

    const ratioRows = [
      { label: '【収益性指標】', key: null },
      { label: '売上高', key: 'sales', fmt: '#,##0' },
      { label: '販管費合計', key: 'sgaTotal', fmt: '#,##0' },
      { label: '営業利益', key: 'operatingProfit', fmt: '#,##0' },
      { label: '経常利益', key: 'ordinaryProfit', fmt: '#,##0' },
      { label: '当期純利益', key: 'netIncome', fmt: '#,##0' },
      { label: '営業利益率', key: 'operatingMargin', suffix: '%' },
      { label: '経常利益率', key: 'ordinaryMargin', suffix: '%' },
      { label: '純利益率', key: 'netMargin', suffix: '%' },
      { label: '販管費率', key: 'sgaRatio', suffix: '%' },
      { label: '', key: null },
      { label: '【安全性指標】', key: null },
      { label: '総資産', key: 'totalAssets', fmt: '#,##0' },
      { label: '純資産', key: 'netAssets', fmt: '#,##0' },
      { label: '負債合計', key: 'totalLiabilities', fmt: '#,##0' },
      { label: '自己資本比率', key: 'equityRatio', suffix: '%' },
      { label: '負債比率', key: 'debtRatio', suffix: '%' },
      { label: '', key: null },
      { label: '【効率性指標】', key: null },
      { label: 'ROE（自己資本利益率）', key: 'roe', suffix: '%' },
      { label: 'ROA（総資産利益率）', key: 'roa', suffix: '%' },
    ];

    ratioRows.forEach(rr => {
      if (!rr.key && rr.label) {
        const row = sheet.addRow([rr.label]);
        row.font = { bold: true };
        row.getCell(1).fill = STYLES.SUBHEADER_FILL;
        row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        return;
      }
      if (!rr.key) {
        sheet.addRow([]);
        return;
      }

      const values = periods.map(p => {
        const data = ratioAnalysis[p];
        if (!data) return 'N/A';
        const val = data[rr.key];
        if (val === undefined || val === null || val === 'N/A') return 'N/A';
        if (rr.suffix) return `${val}${rr.suffix}`;
        return Number(val);
      });

      const row = sheet.addRow([rr.label, ...values]);
      if (rr.fmt) {
        for (let i = 2; i <= periods.length + 1; i++) {
          if (typeof row.getCell(i).value === 'number') {
            row.getCell(i).numFmt = rr.fmt;
          }
        }
      }
      row.eachCell(cell => { cell.border = STYLES.THIN_BORDER; });
    });

    sheet.getColumn(1).width = 28;
    for (let i = 2; i <= periods.length + 1; i++) {
      sheet.getColumn(i).width = 22;
    }
  }
}

// CLI実行
async function main() {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('Usage: node 04-generate-report.js <data-dir>');
    process.exit(1);
  }

  const generator = new ReportGenerator(dataDir);
  const filePath = await generator.generate();
  console.log('Done!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ReportGenerator;
