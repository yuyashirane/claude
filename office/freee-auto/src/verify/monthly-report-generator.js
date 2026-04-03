'use strict';

/**
 * monthly-report-generator.js
 *
 * 月次帳簿チェック結果をExcelレポートとして出力するモジュール。
 * デザインは源泉チェックレポートと統一（ヘッダー色 FF2F5496 等）。
 *
 * シート構成（最大5シート）:
 *   1. サマリー       — 判定凡例・重要度別・カテゴリ別件数集計
 *   2. 指摘一覧       — findings配列の全件テーブル（重要度ソート）
 *   3. BS残高チェック  — trialBs の残高一覧（マイナス・前月比異常をハイライト・元帳リンク）
 *   4. PL月次推移     — 期首〜対象月の月別単月金額（元帳リンク付き）
 *   5. 取引先別残高   — trialBsByPartner がある場合のみ生成
 *
 * エクスポート:
 *   generateMonthlyReport(params): Promise<string>  ← 出力ファイルパスを返す
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const {
  getPartnerBalances,
} = require('./monthly-checks/trial-helpers');

const {
  journalsByAccountLink,
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
} = require('../shared/freee-links');

// ============================================================
// スタイル定義（源泉チェックレポートと統一）
// ============================================================

const COLORS = {
  headerBg:       'FF2F5496', // ヘッダー背景（紺色: 源泉チェックレポートと同一）
  headerFont:     'FFFFFFFF', // ヘッダー文字（白）
  severityHigh:   'FFFFC7CE', // 🔴 薄赤
  severityMed:    'FFFFEB9C', // 🟡 薄黄
  severityLow:    'FFC6EFCE', // 🔵 薄緑
  negative:       'FFFFC7CE', // マイナス値
  warning:        'FFFFEB9C', // 警告（前月比異常等）
  targetMonthBg:  'FFE8EEF7', // 対象月ハイライト（薄青）
  targetMonthHdr: 'FF1F3864', // 対象月ヘッダー（濃紺）
  zeroText:       'FF999999', // ゼロ値テキスト（グレー）
  tabRed:         'FFCC0000',
  tabBlue:        'FF2980B9',
  tabGray:        'FF95A5A6',
  tabGreen:       'FF27AE60',
};

const FONTS = {
  title:    { name: 'Meiryo UI', size: 14, bold: true },
  subtitle: { name: 'Meiryo UI', size: 11 },
  header:   { name: 'Meiryo UI', size: 10, bold: true, color: { argb: COLORS.headerFont } },
  body:     { name: 'Meiryo UI', size: 10 },
  bodyBold: { name: 'Meiryo UI', size: 10, bold: true },
};

const BORDER_THIN = {
  top:    { style: 'thin' },
  left:   { style: 'thin' },
  bottom: { style: 'thin' },
  right:  { style: 'thin' },
};

// details 子行スタイル
const DETAIL_ROW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
const DETAIL_ROW_FONT = { name: 'Meiryo UI', size: 9, color: { argb: 'FF666666' } };
const DETAIL_LINK_FONT = { name: 'Meiryo UI', size: 9, color: { argb: 'FF0066CC' }, underline: true };
const LINK_FONT = { name: 'Meiryo UI', size: 10, color: { argb: 'FF0066CC' }, underline: true };

const NUM_FMT = '#,##0';

// severity の表示順 (🔴→🟡→🔵)
const SEVERITY_ORDER = { '🔴': 0, '🟡': 1, '🔵': 2 };

/** リンクURLからリンク種別に応じた表示テキストを返す */
function getLinkDisplayText(url) {
  if (!url) return '';
  if (url.includes('deal_id=')) return '仕訳を開く';
  if (url.includes('general_ledgers')) return '元帳を開く';
  if (url.includes('journals')) return '仕訳帳を開く';
  return 'freeeで開く';
}

/** 子行リンクの表示テキスト */
function getDetailLinkText(url) {
  if (!url) return '';
  if (url.includes('deal_id=')) return '取引を開く';
  if (url.includes('general_ledgers')) return '元帳を開く';
  return '開く';
}

// ============================================================
// ヘルパー
// ============================================================

function getOutputPath(companyId, targetMonth, outputDir) {
  const dir = outputDir || path.join(process.cwd(), 'reports', String(companyId));
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(dir, `monthly_check_${targetMonth}_${timestamp}.xlsx`);
}

function fillCell(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function severityFill(severity) {
  if (severity === '🔴') return COLORS.severityHigh;
  if (severity === '🟡') return COLORS.severityMed;
  return COLORS.severityLow;
}

/** 列番号(1始まり)をExcel列文字に変換: 1→A, 2→B, 27→AA */
function colLetter(n) {
  let letter = '';
  while (n > 0) {
    n--;
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}

/** 'YYYY-MM' → { start: 'YYYY-MM-01', end: 'YYYY-MM-DD(末日)' } */
function getMonthRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/** ヘッダースタイル適用（指定範囲のセル） */
function styleHeaderCells(row, from, to) {
  for (let i = from; i <= to; i++) {
    const cell = row.getCell(i);
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font      = FONTS.header;
    cell.border    = BORDER_THIN;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  row.height = 22;
}

// ============================================================
// Sheet 1: サマリー
// ============================================================

function createSummarySheet(wb, { companyName, companyId, targetMonth, findings }) {
  const ws = wb.addWorksheet('サマリー', {
    properties: { tabColor: { argb: COLORS.headerBg } },
  });

  ws.getColumn('A').width = 30;
  ws.getColumn('B').width = 40;
  ws.getColumn('C').width = 8;
  ws.getColumn('D').width = 8;
  ws.getColumn('E').width = 8;

  // ── 行1: タイトル ──
  ws.mergeCells('A1:G1');
  const title = ws.getCell('A1');
  title.value     = `${companyName} 月次チェックレポート`;
  title.font      = FONTS.title;
  title.alignment = { horizontal: 'center' };

  // ── 行2: サブタイトル ──
  const [y, m] = targetMonth.split('-').map(Number);
  const now     = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  ws.getCell('A2').value = `対象月: ${y}年${m}月 / チェック実行日: ${dateStr}`;
  ws.getCell('A2').font  = FONTS.subtitle;

  // ── 行4: 判定凡例 ──
  ws.getCell('A4').value = '【判定凡例】';
  ws.getCell('A4').font  = FONTS.bodyBold;

  const legends = [
    ['🔴 要修正', '記帳誤りまたは修正が必要な項目', COLORS.severityHigh],
    ['🟡 要確認', '確認が必要な項目',               COLORS.severityMed],
    ['🔵 情報',   '参考情報',                       COLORS.severityLow],
  ];
  legends.forEach(([label, desc, color], i) => {
    const row = 5 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font  = FONTS.body;
    fillCell(ws.getCell(`A${row}`), color);
    ws.getCell(`B${row}`).value = desc;
    ws.getCell(`B${row}`).font  = FONTS.body;
  });

  // ── 行9: 指摘サマリー ──
  ws.getCell('A9').value = '【指摘サマリー】';
  ws.getCell('A9').font  = FONTS.bodyBold;

  // 行10: ヘッダー
  ws.getCell('A10').value = '重要度';
  ws.getCell('B10').value = '件数';
  styleHeaderCells(ws.getRow(10), 1, 2);

  // 行11-13: 重要度別件数
  const sevRows = [
    ['🔴 重大', findings.filter(f => f.severity === '🔴').length, COLORS.severityHigh],
    ['🟡 警告', findings.filter(f => f.severity === '🟡').length, COLORS.severityMed],
    ['🔵 情報', findings.filter(f => f.severity === '🔵').length, COLORS.severityLow],
  ];
  sevRows.forEach(([label, cnt, color], i) => {
    const row = 11 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font  = FONTS.body;
    ws.getCell(`B${row}`).value = cnt;
    ws.getCell(`B${row}`).font  = FONTS.body;
    fillCell(ws.getCell(`A${row}`), color);
    fillCell(ws.getCell(`B${row}`), color);
  });

  // 行14: 合計
  ws.getCell('A14').value = '合計';
  ws.getCell('A14').font  = FONTS.bodyBold;
  ws.getCell('B14').value = findings.length;
  ws.getCell('B14').font  = FONTS.bodyBold;

  // ── 行16: カテゴリ別内訳 ──
  ws.getCell('A16').value = '【カテゴリ別内訳】';
  ws.getCell('A16').font  = FONTS.bodyBold;

  // 行17: ヘッダー
  const catHeaders = ['カテゴリ', '🔴', '🟡', '🔵', '合計'];
  catHeaders.forEach((h, i) => {
    ws.getRow(17).getCell(i + 1).value = h;
  });
  styleHeaderCells(ws.getRow(17), 1, 5);

  // 行18〜: カテゴリ別データ
  const categories = [...new Set(findings.map(f => f.category))].sort();
  categories.forEach((cat, i) => {
    const row = 18 + i;
    const catFindings = findings.filter(f => f.category === cat);
    ws.getCell(`A${row}`).value = cat;
    ws.getCell(`B${row}`).value = catFindings.filter(f => f.severity === '🔴').length;
    ws.getCell(`C${row}`).value = catFindings.filter(f => f.severity === '🟡').length;
    ws.getCell(`D${row}`).value = catFindings.filter(f => f.severity === '🔵').length;
    ws.getCell(`E${row}`).value = catFindings.length;
    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      ws.getCell(`${col}${row}`).font   = FONTS.body;
      ws.getCell(`${col}${row}`).border = BORDER_THIN;
    });
  });
}

// ============================================================
// Sheet 2: 指摘一覧
// ============================================================

function createFindingsSheet(wb, { findings }) {
  const ws = wb.addWorksheet('指摘一覧', {
    properties: { tabColor: { argb: COLORS.tabRed } },
  });

  ws.columns = [
    { header: '重要度',       key: 'severity',       width: 8  },
    { header: 'コード',       key: 'checkCode',      width: 10 },
    { header: 'カテゴリ',     key: 'category',       width: 18 },
    { header: '指摘内容',     key: 'description',    width: 60 },
    { header: '現在の値',     key: 'currentValue',   width: 18 },
    { header: '推奨値/基準',  key: 'suggestedValue', width: 40 },
    { header: 'freeeリンク',  key: 'freeeLink',      width: 14 },
  ];
  styleHeaderCells(ws.getRow(1), 1, 7);

  // severity でソート（🔴→🟡→🔵）
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );

  let totalRows = 0;
  for (const f of sorted) {
    // ── 親行 ──
    const row = ws.addRow({
      severity:       f.severity      || '',
      checkCode:      f.checkCode     || '',
      category:       f.category      || '',
      description:    f.description   || '',
      currentValue:   f.currentValue  || '',
      suggestedValue: f.suggestedValue || '',
      freeeLink:      f.freeeLink ? getLinkDisplayText(f.freeeLink) : '',
    });
    const color = severityFill(f.severity);
    row.eachCell((cell) => {
      cell.font   = FONTS.body;
      cell.border = BORDER_THIN;
      fillCell(cell, color);
    });

    // D列・F列に wrapText
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };

    // freeeLink をハイパーリンクに変換（列 G = 7）
    if (f.freeeLink) {
      const linkText = getLinkDisplayText(f.freeeLink);
      const linkCell = row.getCell(7);
      linkCell.value = { text: linkText, hyperlink: f.freeeLink };
      linkCell.font  = DETAIL_LINK_FONT;
    }
    totalRows++;

    // ── details 子行 ──
    if (Array.isArray(f.details) && f.details.length > 0) {
      for (const detail of f.details) {
        const dateStr = detail.date || '';
        const desc    = detail.description || '';
        const prefix  = dateStr ? `    └ ${dateStr}  ${desc}` : `    └ ${desc}`;
        const amtStr  = detail.amount != null ? `${detail.amount.toLocaleString()}円` : '';

        const detailRow = ws.addRow({
          severity:       '',
          checkCode:      '',
          category:       '',
          description:    prefix,
          currentValue:   amtStr,
          suggestedValue: detail.counterAccount || '',
          freeeLink:      detail.freeeLink ? getDetailLinkText(detail.freeeLink) : '',
        });

        detailRow.eachCell((cell) => {
          cell.fill   = DETAIL_ROW_FILL;
          cell.font   = DETAIL_ROW_FONT;
          cell.border = BORDER_THIN;
        });

        // D列・F列に wrapText
        detailRow.getCell(4).alignment = { wrapText: true, vertical: 'top' };
        detailRow.getCell(6).alignment = { wrapText: true, vertical: 'top' };

        if (detail.freeeLink) {
          const detailLinkText = getDetailLinkText(detail.freeeLink);
          const linkCell = detailRow.getCell(7);
          linkCell.value = { text: detailLinkText, hyperlink: detail.freeeLink };
          linkCell.font  = DETAIL_LINK_FONT;
        }
        totalRows++;
      }
    }
  }

  ws.autoFilter = { from: 'A1', to: `G${totalRows + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ============================================================
// Sheet 3: BS残高チェック
// ============================================================

function createBsSheet(wb, { monthlyData, companyId }) {
  const ws = wb.addWorksheet('BS残高チェック', {
    properties: { tabColor: { argb: COLORS.tabGray } },
  });

  const hasPrev = !!(monthlyData.prevMonth?.trialBs);

  // 列設定（科目コード列を削除、変動率・元帳リンク追加）
  const cols = [
    { header: '科目名',   key: 'name',    width: 30 },
    { header: '当月残高', key: 'closing', width: 16 },
  ];
  if (hasPrev) {
    cols.push({ header: '前月残高', key: 'prev',  width: 16 });
    cols.push({ header: '前月差',   key: 'diff',  width: 16 });
    cols.push({ header: '変動率',   key: 'rate',  width: 10 });
    cols.push({ header: '判定',     key: 'judge', width: 10 });
  }
  cols.push({ header: '元帳', key: 'link', width: 14 });
  ws.columns = cols;
  styleHeaderCells(ws.getRow(1), 1, cols.length);

  // 残高データ
  const rawBalances = monthlyData.trialBs
    ? (monthlyData.trialBs.trial_bs?.balances || []).filter(b => b.account_item_name)
    : [];

  const prevBalMap = {};
  if (hasPrev) {
    const prevRaw = monthlyData.prevMonth.trialBs?.trial_bs?.balances || [];
    for (const b of prevRaw) {
      if (b.account_item_name) prevBalMap[b.account_item_name] = b.closing_balance;
    }
  }

  // 日付計算（元帳リンク用）
  const [tYear, tMonth] = (monthlyData.targetMonth || '2026-03').split('-').map(Number);
  const startMonth      = monthlyData.startMonth || 10;
  const fiscalYear      = monthlyData.fiscalYear || tYear;
  const fiscalStartDate = `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay         = new Date(tYear, tMonth, 0).getDate();
  const endDate         = `${tYear}-${String(tMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  for (const b of rawBalances) {
    const closing = b.closing_balance;
    const prevBal = hasPrev ? (prevBalMap[b.account_item_name] ?? 0) : null;
    const diff    = hasPrev ? closing - prevBal : null;

    let judge = '';
    if (closing < 0) judge = '⚠️';
    else if (hasPrev && prevBal !== 0 && Math.abs(diff) > Math.abs(prevBal) * 0.5) judge = '△';

    let rate = '';
    if (hasPrev && prevBal !== 0) {
      rate = ((diff / Math.abs(prevBal)) * 100).toFixed(1) + '%';
    }

    const rowData = { name: b.account_item_name, closing };
    if (hasPrev) {
      rowData.prev  = prevBal;
      rowData.diff  = diff;
      rowData.rate  = rate;
      rowData.judge = judge;
    }
    rowData.link = '';

    const row = ws.addRow(rowData);
    row.eachCell((cell) => {
      cell.font   = FONTS.body;
      cell.border = BORDER_THIN;
    });

    // 数値フォーマット
    row.getCell('closing').numFmt    = NUM_FMT;
    row.getCell('closing').alignment = { horizontal: 'right' };
    if (hasPrev) {
      row.getCell('prev').numFmt    = NUM_FMT;
      row.getCell('prev').alignment = { horizontal: 'right' };
      row.getCell('diff').numFmt    = NUM_FMT;
      row.getCell('diff').alignment = { horizontal: 'right' };
      row.getCell('rate').alignment = { horizontal: 'right' };
    }

    // ハイライト
    if (closing < 0) fillCell(row.getCell('closing'), COLORS.negative);
    if (hasPrev && judge === '△') fillCell(row.getCell('diff'), COLORS.warning);

    // 元帳リンク（残高変動期を自動探索 → 総勘定元帳 or 仕訳帳を選択）
    if (b.account_item_name && b.account_item_id) {
      const fiscalYearId = monthlyData.fiscalYearId || null;
      const historicalBs = monthlyData.historicalBs || null;
      const url = buildBalanceLink(companyId, b.account_item_name, b.account_item_id, endDate, {
        openingBalance: b.opening_balance, closingBalance: closing,
        fiscalYear, startMonth, fiscalYearId, historicalBs,
      });
      const linkCell = row.getCell('link');
      linkCell.value = { text: '元帳を開く', hyperlink: url };
      linkCell.font  = LINK_FONT;
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ============================================================
// Sheet 4: PL月次推移
// ============================================================

function createPlSheet(wb, { monthlyData, plTrend, companyId }) {
  const ws = wb.addWorksheet('PL月次推移', {
    properties: { tabColor: { argb: COLORS.tabGreen } },
  });

  if (plTrend && plTrend.months && plTrend.months.length > 0) {
    createPlTrendSheet(ws, { plTrend, monthlyData, companyId });
  } else {
    createPlLegacySheet(ws, { monthlyData, companyId });
  }
}

/**
 * PL月次推移: 新レイアウト（期首〜対象月の月別単月金額 + 累計 + 元帳リンク）
 */
function createPlTrendSheet(ws, { plTrend, monthlyData, companyId }) {
  const months      = plTrend.months;       // ['2025-10', '2025-11', ...]
  const accounts    = plTrend.accounts;     // { name: { id, category, monthlyAmounts, total } }
  const accountList = plTrend.accountList;  // [{ id, name, category }]

  const numMonths     = months.length;
  const monthStartCol = 2;                           // B列
  const cumulativeCol = monthStartCol + numMonths;   // 累計列
  const linkCol       = cumulativeCol + 1;           // 元帳列
  const totalCols     = linkCol;

  // ── 行1: タイトル ──
  const lastColLetter = colLetter(totalCols);
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell('A1').value     = '損益計算書 月次推移';
  ws.getCell('A1').font      = FONTS.title;
  ws.getCell('A1').alignment = { horizontal: 'center' };

  // ── 行3: ヘッダー ──
  const headerRow = ws.getRow(3);
  headerRow.getCell(1).value = '科目名';
  months.forEach((m, i) => {
    const [, mon] = m.split('-').map(Number);
    headerRow.getCell(monthStartCol + i).value = `${mon}月`;
  });
  headerRow.getCell(cumulativeCol).value = '累計';
  headerRow.getCell(linkCol).value       = '元帳';
  styleHeaderCells(headerRow, 1, totalCols);

  // 対象月ヘッダーを濃紺に
  const targetColIdx = monthStartCol + numMonths - 1;
  headerRow.getCell(targetColIdx).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.targetMonthHdr },
  };

  // 列幅
  ws.getColumn(1).width = 30;
  for (let i = 0; i < numMonths; i++) ws.getColumn(monthStartCol + i).width = 14;
  ws.getColumn(cumulativeCol).width = 16;
  ws.getColumn(linkCol).width       = 14;

  // ── 行4〜: データ行 ──
  let rowNum = 4;
  for (const acc of accountList) {
    const accData = accounts[acc.name];
    if (!accData) continue;

    const row = ws.getRow(rowNum);
    row.getCell(1).value  = acc.name;
    row.getCell(1).font   = FONTS.body;
    row.getCell(1).border = BORDER_THIN;

    const monthlyAmounts = accData.monthlyAmounts || [];

    for (let i = 0; i < numMonths; i++) {
      const cell   = row.getCell(monthStartCol + i);
      const amount = monthlyAmounts[i] || 0;

      // 月の日付範囲（元帳リンク用）
      const { start: mStart, end: mEnd } = getMonthRange(months[i]);
      const url = acc.id
        ? journalsByAccountLink(companyId, acc.id, mStart, mEnd, acc.name)
        : null;

      // HYPERLINK数式で金額＋リンク（ゼロ以外）
      if (amount !== 0 && url) {
        cell.value = { formula: `HYPERLINK("${url}",${amount})`, result: amount };
      } else {
        cell.value = amount;
      }

      cell.numFmt    = NUM_FMT;
      cell.border    = BORDER_THIN;
      cell.alignment = { horizontal: 'right' };

      // ゼロ値はグレー文字
      if (amount === 0) {
        cell.font = { ...FONTS.body, color: { argb: COLORS.zeroText } };
      } else {
        cell.font = FONTS.body;
      }

      // 対象月ハイライト（最終月列）
      if (i === numMonths - 1) {
        fillCell(cell, COLORS.targetMonthBg);
      }

      // 前月比50%超変動
      if (i > 0) {
        const prevAmt = monthlyAmounts[i - 1] || 0;
        if (prevAmt !== 0 && Math.abs(amount - prevAmt) > Math.abs(prevAmt) * 0.5) {
          fillCell(cell, COLORS.warning);
        }
      }
    }

    // 累計列（SUM式）
    const cumCell  = row.getCell(cumulativeCol);
    const firstCol = colLetter(monthStartCol);
    const lastCol  = colLetter(monthStartCol + numMonths - 1);
    cumCell.value     = { formula: `SUM(${firstCol}${rowNum}:${lastCol}${rowNum})`, result: accData.total || 0 };
    cumCell.numFmt    = NUM_FMT;
    cumCell.font      = FONTS.bodyBold;
    cumCell.border    = BORDER_THIN;
    cumCell.alignment = { horizontal: 'right' };

    // 元帳リンク（全期間）
    const linkCell = row.getCell(linkCol);
    linkCell.border = BORDER_THIN;
    if (acc.id) {
      const { start: fStart } = getMonthRange(months[0]);
      const { end: fEnd }     = getMonthRange(months[numMonths - 1]);
      const fullUrl = journalsByAccountLink(companyId, acc.id, fStart, fEnd, acc.name);
      linkCell.value = { text: '元帳', hyperlink: fullUrl };
      linkCell.font  = LINK_FONT;
    }

    rowNum++;
  }

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
}

/**
 * PL月次推移: フォールバック（plTrend未取得時の旧レイアウト、デザイン統一済み）
 */
function createPlLegacySheet(ws, { monthlyData, companyId }) {
  const hasPrev = !!(monthlyData.prevMonth?.trialPl);

  const cols = [
    { header: '科目名', key: 'name',    width: 30 },
    { header: '当月',   key: 'current', width: 16 },
  ];
  if (hasPrev) cols.push({ header: '前月', key: 'prev', width: 16 });
  cols.push({ header: '元帳', key: 'link', width: 14 });
  ws.columns = cols;
  styleHeaderCells(ws.getRow(1), 1, cols.length);

  const rawBalances = monthlyData.trialPl
    ? (monthlyData.trialPl.trial_pl?.balances || []).filter(b => b.account_item_name)
    : [];

  const prevYtdMap = {};
  if (hasPrev) {
    const prevRaw = monthlyData.prevMonth.trialPl?.trial_pl?.balances || [];
    for (const b of prevRaw) {
      if (b.account_item_name) prevYtdMap[b.account_item_name] = b.closing_balance;
    }
  }

  // 日付計算（元帳リンク用）
  const [tYear, tMonth] = (monthlyData.targetMonth || '2026-03').split('-').map(Number);
  const startMonth      = monthlyData.startMonth || 10;
  const fiscalYear      = monthlyData.fiscalYear || tYear;
  const fiscalStartDate = `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay         = new Date(tYear, tMonth, 0).getDate();
  const endDate         = `${tYear}-${String(tMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  for (const b of rawBalances) {
    const prevYtd    = hasPrev ? (prevYtdMap[b.account_item_name] ?? 0) : 0;
    const currentAmt = b.closing_balance - prevYtd;
    const prevAmt    = hasPrev ? (prevYtdMap[b.account_item_name] ?? null) : null;

    const rowData = { name: b.account_item_name, current: currentAmt };
    if (hasPrev) rowData.prev = prevAmt;
    rowData.link = '';

    const row = ws.addRow(rowData);
    row.eachCell((cell) => {
      cell.font   = FONTS.body;
      cell.border = BORDER_THIN;
    });

    row.getCell('current').numFmt    = NUM_FMT;
    row.getCell('current').alignment = { horizontal: 'right' };
    if (hasPrev) {
      row.getCell('prev').numFmt    = NUM_FMT;
      row.getCell('prev').alignment = { horizontal: 'right' };
    }

    // 元帳リンク
    if (b.account_item_id) {
      const url = journalsByAccountLink(
        companyId, b.account_item_id, fiscalStartDate, endDate, b.account_item_name
      );
      const linkCell = row.getCell('link');
      linkCell.value = { text: '元帳', hyperlink: url };
      linkCell.font  = LINK_FONT;
    }

    // 変動ハイライト
    if (hasPrev && prevAmt && prevAmt !== 0 &&
        Math.abs(currentAmt - prevAmt) > Math.abs(prevAmt) * 0.5) {
      fillCell(row.getCell('current'), COLORS.warning);
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ============================================================
// Sheet 5: 取引先別残高
// ============================================================

const PARTNER_ACCOUNTS = ['売掛金', '買掛金', '未払金'];

function createPartnerSheet(wb, { monthlyData }) {
  if (!monthlyData.trialBsByPartner) return;

  const ws = wb.addWorksheet('取引先別残高', {
    properties: { tabColor: { argb: COLORS.tabBlue } },
  });

  ws.columns = [
    { header: '科目名',   key: 'account',  width: 22 },
    { header: '取引先名', key: 'partner',  width: 30 },
    { header: '残高',     key: 'balance',  width: 16 },
    { header: '滞留判定', key: 'stagnant', width: 12 },
  ];
  styleHeaderCells(ws.getRow(1), 1, 4);

  const rows = [];
  for (const accName of PARTNER_ACCOUNTS) {
    const partners = getPartnerBalances(monthlyData.trialBsByPartner, accName);
    for (const p of partners) {
      if (!p.closing_balance && !p.opening_balance) continue;
      const isStagnant = p.opening_balance !== 0 &&
        p.closing_balance === p.opening_balance;
      rows.push({
        account:  accName,
        partner:  p.name || p.partner_name || String(p.id),
        balance:  p.closing_balance,
        stagnant: isStagnant ? '滞留' : '',
      });
    }
  }

  rows.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.font   = FONTS.body;
      cell.border = BORDER_THIN;
    });
    row.getCell('balance').numFmt    = NUM_FMT;
    row.getCell('balance').alignment = { horizontal: 'right' };

    if (r.stagnant === '滞留') {
      fillCell(row.getCell('stagnant'), COLORS.warning);
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ============================================================
// メイン: generateMonthlyReport
// ============================================================

/**
 * 月次チェックレポートを生成する
 *
 * @param {Object} params
 * @param {string|number} params.companyId    - 事業所ID
 * @param {string}        params.companyName  - 事業所名（表示用）
 * @param {string}        params.targetMonth  - 対象月 'YYYY-MM'
 * @param {Array}         params.findings     - monthly-checker.js の findings 配列
 * @param {Object}        params.monthlyData  - monthly-data-fetcher.js の fetchMonthlyData() 戻り値
 * @param {Object}        [params.plTrend]    - fetchMonthlyPlTrend() の戻り値（月次推移データ）
 * @param {string}        [params.outputDir]  - 出力先ディレクトリ（省略時: reports/{companyId}/）
 * @returns {Promise<string>} 生成されたExcelファイルのフルパス
 */
async function generateMonthlyReport(params) {
  const {
    companyId,
    companyName,
    targetMonth,
    findings    = [],
    monthlyData = {},
    plTrend     = null,
    outputDir,
  } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'freee-auto (Claude Code)';
  wb.created = new Date();

  createSummarySheet (wb, { companyName, companyId, targetMonth, findings });
  createFindingsSheet(wb, { findings });
  createBsSheet      (wb, { monthlyData, companyId });
  createPlSheet      (wb, { monthlyData, plTrend, companyId });
  createPartnerSheet (wb, { monthlyData });

  const filePath = getOutputPath(companyId, targetMonth, outputDir);
  await wb.xlsx.writeFile(filePath);

  return filePath;
}

// ============================================================
// エクスポート
// ============================================================

module.exports = { generateMonthlyReport };
