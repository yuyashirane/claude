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
  generalLedgerLink,
  determineLinkStartDate,
  buildBalanceLink,
} = require('../shared/freee-links');

// report-config/ から分離済み定数・ヘルパーを読み込み
const {
  COLORS, FONTS, BORDER_THIN,
  DETAIL_ROW_FILL, DETAIL_ROW_FONT, DETAIL_LINK_FONT, LINK_FONT,
  NUM_FMT, SEVERITY_ORDER,
} = require('./report-config/styles');

const {
  CATEGORY_LABELS, CATEGORY_ORDER, CHECK_GROUPS, CHECK_CODE_LABELS,
  getCategoryLabel,
} = require('./report-config/labels');

const {
  CODE_TO_ACCOUNT,
  getMonthRange,
  extractAccountNameFromDescription,
  inferFreeeLink,
  isValidFreeeLink,
  getLinkDisplayText,
  getDetailLinkText,
} = require('./report-config/link-mappings');

// ============================================================
// ヘルパー
// ============================================================

/**
 * フォルダ名として安全な文字列に変換する。
 * Windows のフォルダ名で使えない文字（\ / : * ? " < > |）を _ に置換し、
 * 末尾の空白とピリオドを削除する。
 *
 * @param {string} name - 変換対象の文字列
 * @returns {string} サニタイズ済みの文字列
 */
function sanitizeFolderName(name) {
  if (!name) return '';
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\s.]+$/, '');
}

function getOutputPath(companyId, targetMonth, outputDir, companyName) {
  let dir;
  if (outputDir) {
    dir = outputDir;
  } else {
    const safeName = sanitizeFolderName(companyName);
    const folderName = safeName ? `${companyId}_${safeName}` : String(companyId);
    dir = path.join(process.cwd(), 'reports', folderName);
  }
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // 事業所名をファイル名に含める（取得できない場合はcompanyIdでフォールバック）
  const safeCompanyName = (companyName || String(companyId))
    .replace(/[\\/:*?"<>|]/g, '')  // Windowsのファイル名禁止文字
    .replace(/\s+/g, '_')          // スペースをアンダースコアに
    .slice(0, 30);                 // 長すぎる場合は切り詰め
  return path.join(dir, `${safeCompanyName}_帳簿チェック_${targetMonth}_${timestamp}.xlsx`);
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

  // 列幅
  ws.getColumn('A').width = 24;
  ws.getColumn('B').width = 14;
  ws.getColumn('C').width = 14;
  ws.getColumn('D').width = 14;
  ws.getColumn('E').width = 10;

  // ── 行1: タイトル ──
  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value     = `${companyName} 帳簿チェックレポート`;
  title.font      = { name: 'Meiryo UI', size: 16, bold: true };
  title.alignment = { horizontal: 'left' };

  // ── 行3〜4: メタ情報 ──
  const [y, m] = targetMonth.split('-').map(Number);
  const now     = new Date();
  ws.getCell('A3').value = '対象月';
  ws.getCell('A3').font  = FONTS.body;
  ws.getCell('B3').value = `${y}年${m}月`;
  ws.getCell('B3').font  = FONTS.bodyBold;
  ws.getCell('A4').value = 'チェック実行日';
  ws.getCell('A4').font  = FONTS.body;
  ws.getCell('B4').value = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  ws.getCell('B4').font  = FONTS.bodyBold;

  // ── 行6: 指摘サマリー ──
  ws.getCell('A6').value = '指摘サマリー';
  ws.getCell('A6').font  = { name: 'Meiryo UI', size: 13, bold: true };

  // 行8: ヘッダー（紺背景・白文字）
  const sevLabels = ['', '🔴要修正', '🟡要確認', '🔵情報'];
  sevLabels.forEach((label, i) => {
    ws.getRow(8).getCell(i + 1).value = label;
  });
  styleHeaderCells(ws.getRow(8), 1, 4);

  // 行9: 数値行（大きなフォント + 重要度色背景）
  const redCount    = findings.filter(f => f.severity === '🔴').length;
  const yellowCount = findings.filter(f => f.severity === '🟡').length;
  const blueCount   = findings.filter(f => f.severity === '🔵').length;

  ws.getCell('A9').value = '件数';
  ws.getCell('A9').font  = FONTS.bodyBold;
  ws.getCell('A9').border = BORDER_THIN;

  const sevData = [
    { col: 'B', count: redCount,    bg: 'FFFFE0E0' },
    { col: 'C', count: yellowCount, bg: 'FFFFFFD0' },
    { col: 'D', count: blueCount,   bg: 'FFE0E8FF' },
  ];
  for (const { col, count, bg } of sevData) {
    const cell = ws.getCell(`${col}9`);
    cell.value     = count;
    cell.font      = { name: 'Meiryo UI', size: 24, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = BORDER_THIN;
    fillCell(cell, bg);
  }
  ws.getRow(9).height = 40;

  // ── 行11: チェック項目別内訳 ──
  ws.getCell('A11').value = 'チェック項目別内訳';
  ws.getCell('A11').font  = { name: 'Meiryo UI', size: 13, bold: true };

  // 行13: ヘッダー
  const grpHeaders = ['チェック項目', '🔴', '🟡', '🔵', '合計'];
  grpHeaders.forEach((h, i) => {
    ws.getRow(13).getCell(i + 1).value = h;
  });
  styleHeaderCells(ws.getRow(13), 1, 5);

  // 行14〜: CHECK_GROUPS 別データ
  let grpRow = 14;
  for (const group of CHECK_GROUPS) {
    const grpFindings = findings.filter(f => group.categories.includes(f.category));
    const r = grpFindings.filter(f => f.severity === '🔴').length;
    const y2 = grpFindings.filter(f => f.severity === '🟡').length;
    const b = grpFindings.filter(f => f.severity === '🔵').length;
    const total = grpFindings.length;

    ws.getCell(`A${grpRow}`).value = group.label;
    ws.getCell(`B${grpRow}`).value = r || '-';
    ws.getCell(`C${grpRow}`).value = y2 || '-';
    ws.getCell(`D${grpRow}`).value = b || '-';
    ws.getCell(`E${grpRow}`).value = total || '-';
    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      ws.getCell(`${col}${grpRow}`).font   = FONTS.body;
      ws.getCell(`${col}${grpRow}`).border = BORDER_THIN;
      if (col !== 'A') {
        ws.getCell(`${col}${grpRow}`).alignment = { horizontal: 'center' };
      }
    });
    grpRow++;
  }

  // 合計行（上罫線で区切り）
  const totalRow = grpRow;
  ws.getCell(`A${totalRow}`).value = '合計';
  ws.getCell(`B${totalRow}`).value = redCount || '-';
  ws.getCell(`C${totalRow}`).value = yellowCount || '-';
  ws.getCell(`D${totalRow}`).value = blueCount || '-';
  ws.getCell(`E${totalRow}`).value = findings.length || '-';
  ['A', 'B', 'C', 'D', 'E'].forEach(col => {
    const cell = ws.getCell(`${col}${totalRow}`);
    cell.font   = FONTS.bodyBold;
    cell.border = {
      top:    { style: 'medium' },
      left:   { style: 'thin' },
      bottom: { style: 'thin' },
      right:  { style: 'thin' },
    };
    if (col !== 'A') cell.alignment = { horizontal: 'center' };
  });

  // ── チェック実行結果 ──
  const checkTitleRow = totalRow + 2;
  ws.getCell(`A${checkTitleRow}`).value = 'チェック実行結果';
  ws.getCell(`A${checkTitleRow}`).font  = { name: 'Meiryo UI', size: 13, bold: true };

  // ヘッダー
  const checkHeaderRow = checkTitleRow + 2;
  const chkHeaders = ['コード', 'チェック名', '結果', '件数'];
  chkHeaders.forEach((h, i) => {
    ws.getRow(checkHeaderRow).getCell(i + 1).value = h;
  });
  styleHeaderCells(ws.getRow(checkHeaderRow), 1, 4);

  // findingsのcheckCodeをカウント
  const codeCountMap = {};
  for (const f of findings) {
    codeCountMap[f.checkCode] = (codeCountMap[f.checkCode] || 0) + 1;
  }

  // 全チェックコード行
  let chkRow = checkHeaderRow + 1;
  for (const [code, label] of Object.entries(CHECK_CODE_LABELS)) {
    const cnt = codeCountMap[code] || 0;
    const result = cnt > 0 ? '⚠️' : '✅';

    ws.getCell(`A${chkRow}`).value = code;
    ws.getCell(`B${chkRow}`).value = label;
    ws.getCell(`C${chkRow}`).value = result;
    ws.getCell(`D${chkRow}`).value = cnt;
    ['A', 'B', 'C', 'D'].forEach(col => {
      ws.getCell(`${col}${chkRow}`).font   = FONTS.body;
      ws.getCell(`${col}${chkRow}`).border = BORDER_THIN;
    });
    ws.getCell(`C${chkRow}`).alignment = { horizontal: 'center' };
    ws.getCell(`D${chkRow}`).alignment = { horizontal: 'center' };

    // 指摘ありの行を薄黄ハイライト
    if (cnt > 0) {
      ['A', 'B', 'C', 'D'].forEach(col => {
        fillCell(ws.getCell(`${col}${chkRow}`), COLORS.severityMed);
      });
    }
    chkRow++;
  }
}

// ============================================================
// Sheet 2: 指摘一覧
// ============================================================

/**
 * 親行の description を要約する（details がある場合のみ）
 * details の取引先列挙部分を除去し、概要のみにする
 */
function truncateParentDescription(finding) {
  if (!finding.details || finding.details.length === 0) {
    return finding.description || '';
  }
  const desc = finding.description || '';
  // 「。」の後に「取引先」「内訳」等が続く場合、最初の文で切る
  const firstSentence = desc.split(/。\s*(?:取引先|内訳)/)[0];
  return firstSentence.endsWith('。') ? firstSentence : firstSentence + '。';
}

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
    const hasDetails = Array.isArray(f.details) && f.details.length > 0;

    // ── 親行 ──
    const row = ws.addRow({
      severity:       f.severity      || '',
      checkCode:      f.checkCode     || '',
      category:       getCategoryLabel(f.category),
      description:    truncateParentDescription(f),
      currentValue:   f.currentValue  || '',
      suggestedValue: f.suggestedValue || '',
      freeeLink:      '',
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
    if (isValidFreeeLink(f.freeeLink)) {
      const linkCell = row.getCell(7);
      linkCell.value = { text: 'freeeで確認', hyperlink: f.freeeLink };
      linkCell.font  = LINK_FONT;
    }
    totalRows++;

    // ── details 子行 ──
    if (hasDetails) {
      for (const detail of f.details) {
        const dateStr = detail.date || '';
        const desc    = detail.description || '';
        const prefix  = dateStr ? `\u3000\u3000${dateStr}  ${desc}` : `\u3000\u3000${desc}`;
        const amtStr  = detail.amount != null ? `${detail.amount.toLocaleString()}円` : '';

        const detailRow = ws.addRow({
          severity:       '',
          checkCode:      '',
          category:       '',
          description:    prefix,
          currentValue:   amtStr,
          suggestedValue: detail.counterAccount || '',
          freeeLink:      '',
        });

        detailRow.eachCell((cell) => {
          cell.fill   = DETAIL_ROW_FILL;
          cell.font   = DETAIL_ROW_FONT;
          cell.border = BORDER_THIN;
        });

        // D列・F列に wrapText
        detailRow.getCell(4).alignment = { wrapText: true, vertical: 'top' };
        detailRow.getCell(6).alignment = { wrapText: true, vertical: 'top' };

        if (isValidFreeeLink(detail.freeeLink)) {
          const linkCell = detailRow.getCell(7);
          linkCell.value = { text: '明細を開く', hyperlink: detail.freeeLink };
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
 * PL月次推移で表示するセクション定義。
 * type: 'summary' = 集計行（カテゴリ合計）, 'details' = そのカテゴリの明細科目を展開
 * isSubtotal: true の行は小計行として太字＋背景色で強調
 */
const PL_SECTIONS = [
  { type: 'summary',  category: '売上高',               label: '売上高' },
  { type: 'details',  category: '売上原価' },
  { type: 'summary',  category: '売上原価',             label: '売上原価 計' },
  { type: 'summary',  category: '売上総損益金額',       label: '売上総利益',           isSubtotal: true },
  { type: 'details',  category: '販売管理費' },
  { type: 'summary',  category: '販売管理費',           label: '販売管理費 計',        isSubtotal: true },
  { type: 'summary',  category: '営業損益金額',         label: '営業利益',             isSubtotal: true },
  { type: 'details',  category: '営業外収益' },
  { type: 'summary',  category: '営業外収益',           label: '営業外収益 計' },
  { type: 'details',  category: '営業外費用' },
  { type: 'summary',  category: '営業外費用',           label: '営業外費用 計' },
  { type: 'summary',  category: '経常損益金額',         label: '経常利益',             isSubtotal: true },
  { type: 'details',  category: '特別利益' },
  { type: 'summary',  category: '特別利益',             label: '特別利益 計' },
  { type: 'details',  category: '特別損失' },
  { type: 'summary',  category: '特別損失',             label: '特別損失 計' },
  { type: 'summary',  category: '税引前当期純損益金額', label: '税引前当期純利益',     isSubtotal: true },
  { type: 'details',  category: '法人税等' },
  { type: 'summary',  category: '法人税等',             label: '法人税等 計' },
  { type: 'summary',  category: '当期純損益金額',       label: '当期純利益',           isSubtotal: true },
];

/**
 * PL月次推移: 新レイアウト（期首〜対象月の月別単月金額 + 累計 + 元帳リンク）
 *
 * 集計科目（小計・利益行）を中心に表示し、明細科目は残高のある科目のみ展開。
 * 集計行は太字＋背景色、小計行はさらに強調表示。
 */
function createPlTrendSheet(ws, { plTrend, monthlyData, companyId }) {
  const months      = plTrend.months;       // ['2025-10', '2025-11', ...]
  const accounts    = plTrend.accounts;     // { name|__summary__cat: { id, category, monthlyAmounts, total, isSummary } }
  const accountList = plTrend.accountList;  // [{ id, name, category, isSummary }]
  const fiscalYearId = monthlyData.fiscalYearId || null;

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

  // ── PL構造に従って行を構築 ──
  // accountList から明細科目を category ごとにグループ化
  const detailsByCategory = {};
  for (const acc of accountList) {
    if (acc.isSummary) continue;
    if (!detailsByCategory[acc.category]) detailsByCategory[acc.category] = [];
    detailsByCategory[acc.category].push(acc);
  }

  // 表示する行リストを構築
  const displayRows = [];
  for (const section of PL_SECTIONS) {
    if (section.type === 'summary') {
      const key = `__summary__${section.category}`;
      const accData = accounts[key];
      if (!accData) continue;
      displayRows.push({
        name: section.label,
        accData,
        id: null,
        isSummary: true,
        isSubtotal: section.isSubtotal || false,
      });
    } else if (section.type === 'details') {
      const details = detailsByCategory[section.category] || [];
      for (const acc of details) {
        const key = acc.name;
        const accData = accounts[key];
        if (!accData) continue;
        // 全月ゼロの明細はスキップ
        const hasAmount = (accData.monthlyAmounts || []).some((v) => v !== 0);
        if (!hasAmount) continue;
        displayRows.push({
          name: acc.name,
          accData,
          id: acc.id,
          isSummary: false,
          isSubtotal: false,
        });
      }
    }
  }

  // フォールバック: PL_SECTIONSに該当しなかった明細科目を末尾に追加
  // （旧フォーマットのデータや想定外のカテゴリへの対応）
  const renderedNames = new Set(displayRows.map((r) => r.name));
  for (const acc of accountList) {
    if (acc.isSummary) continue;
    if (renderedNames.has(acc.name)) continue;
    const accData = accounts[acc.name];
    if (!accData) continue;
    const hasAmount = (accData.monthlyAmounts || []).some((v) => v !== 0);
    if (!hasAmount) continue;
    displayRows.push({
      name: acc.name,
      accData,
      id: acc.id,
      isSummary: false,
      isSubtotal: false,
    });
  }

  // ── 行4〜: データ行 ──
  let rowNum = 4;
  for (const item of displayRows) {
    const { name, accData, id, isSummary, isSubtotal } = item;
    const row = ws.getRow(rowNum);

    // 科目名セル
    const nameCell = row.getCell(1);
    nameCell.value  = isSummary ? name : `  ${name}`;
    nameCell.font   = isSubtotal ? FONTS.bodyBold : FONTS.body;
    nameCell.border = BORDER_THIN;
    if (isSubtotal) fillCell(nameCell, COLORS.subtotalBg);

    const monthlyAmounts = accData.monthlyAmounts || [];

    for (let i = 0; i < numMonths; i++) {
      const cell   = row.getCell(monthStartCol + i);
      const amount = monthlyAmounts[i] || 0;

      // 月の日付範囲（総勘定元帳リンク用）— 明細科目のみリンク
      const { start: mStart, end: mEnd } = getMonthRange(months[i]);
      const url = (id && name)
        ? generalLedgerLink(companyId, name, mStart, mEnd, { fiscalYearId })
        : null;

      // HYPERLINK数式で金額＋リンク（ゼロ以外、明細科目のみ）
      if (amount !== 0 && url) {
        cell.value = { formula: `HYPERLINK("${url}",${amount})`, result: amount };
      } else {
        cell.value = amount;
      }

      cell.numFmt    = NUM_FMT;
      cell.border    = BORDER_THIN;
      cell.alignment = { horizontal: 'right' };

      // フォント: 小計行は太字、ゼロ値はグレー
      if (isSubtotal) {
        cell.font = amount === 0
          ? { ...FONTS.bodyBold, color: { argb: COLORS.zeroText } }
          : FONTS.bodyBold;
      } else if (amount === 0) {
        cell.font = { ...FONTS.body, color: { argb: COLORS.zeroText } };
      } else {
        cell.font = FONTS.body;
      }

      // 小計行の背景色
      if (isSubtotal) fillCell(cell, COLORS.subtotalBg);

      // 対象月ハイライト（最終月列、小計行以外）
      if (i === numMonths - 1 && !isSubtotal) {
        fillCell(cell, COLORS.targetMonthBg);
      }

      // 前月比50%超変動（明細科目のみ）
      if (!isSummary && i > 0) {
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
    if (isSubtotal) fillCell(cumCell, COLORS.subtotalBg);

    // 元帳リンク（全期間、明細科目のみ）
    const linkCell = row.getCell(linkCol);
    linkCell.border = BORDER_THIN;
    if (isSubtotal) fillCell(linkCell, COLORS.subtotalBg);
    if (id && name) {
      const { start: fStart } = getMonthRange(months[0]);
      const { end: fEnd }     = getMonthRange(months[numMonths - 1]);
      const fullUrl = generalLedgerLink(companyId, name, fStart, fEnd, { fiscalYearId });
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
  const fiscalYearId    = monthlyData.fiscalYearId || null;
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

    // 元帳リンク（総勘定元帳）
    if (b.account_item_id && b.account_item_name) {
      const url = generalLedgerLink(
        companyId, b.account_item_name, fiscalStartDate, endDate, { fiscalYearId }
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
// チェック項目別シート（CHECK_GROUPS単位で自動生成）
// ============================================================

/**
 * CHECK_GROUPS ごとの指摘専用シートを生成する
 * 0件のグループも生成し「✅ 指摘事項はありません」を表示
 */
function createGroupSheets(wb, { findings }) {
  for (const group of CHECK_GROUPS) {
    const groupFindings = findings.filter(f => group.categories.includes(f.category));

    // シート名は31文字制限
    const sheetName = group.label.slice(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      properties: { tabColor: { argb: groupFindings.length > 0 ? COLORS.tabRed : COLORS.tabGreen } },
    });

    // 列幅設定
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 70;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 40;
    ws.getColumn(6).width = 14;

    // ── ヘッダーエリア ──
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value     = group.label;
    ws.getCell('A1').font      = { name: 'Meiryo UI', size: 13, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'left' };

    ws.getCell('A2').value = group.description;
    ws.getCell('A2').font  = { name: 'Meiryo UI', size: 9, color: { argb: 'FF888888' } };

    // 0件の場合: 「✅ 指摘事項はありません」を表示して終了
    if (groupFindings.length === 0) {
      ws.getCell('A4').value = '✅ 指摘事項はありません';
      ws.getCell('A4').font  = { name: 'Meiryo UI', size: 12, bold: true, color: { argb: 'FF2E7D32' } };
      continue;
    }

    // 行4: テーブルヘッダー（カテゴリ列省略）
    const headers = ['重要度', 'コード', '指摘内容', '現在の値', '推奨値/基準', 'freeeリンク'];
    const headerRow = ws.getRow(4);
    headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
    styleHeaderCells(headerRow, 1, 6);

    // ── データ行（severity ソート） ──
    const sorted = [...groupFindings].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    );

    let totalRows = 0;
    for (const f of sorted) {
      const hasDetails = Array.isArray(f.details) && f.details.length > 0;

      // 親行
      const row = ws.addRow([
        f.severity      || '',
        f.checkCode     || '',
        truncateParentDescription(f),
        f.currentValue  || '',
        f.suggestedValue || '',
        '',
      ]);
      const color = severityFill(f.severity);
      row.eachCell((cell) => {
        cell.font   = FONTS.body;
        cell.border = BORDER_THIN;
        fillCell(cell, color);
      });
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(5).alignment = { wrapText: true, vertical: 'top' };

      if (isValidFreeeLink(f.freeeLink)) {
        const linkCell = row.getCell(6);
        linkCell.value = { text: 'freeeで確認', hyperlink: f.freeeLink };
        linkCell.font  = LINK_FONT;
      }
      totalRows++;

      // 子行
      if (hasDetails) {
        for (const detail of f.details) {
          const dateStr = detail.date || '';
          const desc    = detail.description || '';
          const prefix  = dateStr ? `\u3000\u3000${dateStr}  ${desc}` : `\u3000\u3000${desc}`;
          const amtStr  = detail.amount != null ? `${detail.amount.toLocaleString()}円` : '';

          const detailRow = ws.addRow([
            '',
            '',
            prefix,
            amtStr,
            detail.counterAccount || '',
            '',
          ]);
          detailRow.eachCell((cell) => {
            cell.fill   = DETAIL_ROW_FILL;
            cell.font   = DETAIL_ROW_FONT;
            cell.border = BORDER_THIN;
          });
          detailRow.getCell(3).alignment = { wrapText: true, vertical: 'top' };
          detailRow.getCell(5).alignment = { wrapText: true, vertical: 'top' };

          if (isValidFreeeLink(detail.freeeLink)) {
            const linkCell = detailRow.getCell(6);
            linkCell.value = { text: '明細を開く', hyperlink: detail.freeeLink };
            linkCell.font  = DETAIL_LINK_FONT;
          }
          totalRows++;
        }
      }
    }

    ws.autoFilter = { from: 'A4', to: `F${totalRows + 4}` };
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }
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

  // freeeLink が null の指摘にリンクを推定付与
  const enrichedFindings = findings.map(f => {
    if (f.freeeLink) return f;
    const inferred = inferFreeeLink(f, monthlyData);
    if (inferred) return { ...f, freeeLink: inferred };
    return f;
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'freee-auto (Claude Code)';
  wb.created = new Date();

  createSummarySheet (wb, { companyName, companyId, targetMonth, findings: enrichedFindings });
  createFindingsSheet(wb, { findings: enrichedFindings });
  createGroupSheets  (wb, { findings: enrichedFindings });
  createBsSheet      (wb, { monthlyData, companyId });
  createPlSheet      (wb, { monthlyData, plTrend, companyId });
  createPartnerSheet (wb, { monthlyData });

  const filePath = getOutputPath(companyId, targetMonth, outputDir, companyName);
  await wb.xlsx.writeFile(filePath);

  return filePath;
}

// ============================================================
// エクスポート
// ============================================================

module.exports = { generateMonthlyReport, inferFreeeLink, isValidFreeeLink };
