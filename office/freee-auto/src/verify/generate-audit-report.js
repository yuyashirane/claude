const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ============================================================
// freee 勘定科目・BS/PLチェックレポート生成スクリプト
// ============================================================

const COMPANY_ID = 474381;
const COMPANY_NAME = 'あしたの会計事務所税理士法人';
const PERIOD_START = '2024-10-01';
const PERIOD_END = '2025-03-31';
const FREEE_BASE_URL = `https://secure.freee.co.jp/companies/${COMPANY_ID}`;

// --- PL Data (2024/10 - 2025/3) ---
const plData = {
  '売上高': { closing: 58058255 },
  '役員報酬': { closing: 11130000 },
  '給料手当': { closing: 7783078 },
  '賞与': { closing: 1265650 },
  '退職給付費用': { closing: -239000 },
  '法定福利費': { closing: 2049646 },
  '福利厚生費': { closing: 101156 },
  '採用教育費': { closing: 1540808 },
  '外注費': { closing: 247740 },
  '広告宣伝費': { closing: 15000 },
  '交際費': { closing: 53850 },
  '会議費': { closing: 22310 },
  '旅費交通費': { closing: 301526 },
  '通信費': { closing: 784825 },
  '消耗品費': { closing: 234012 },
  '水道光熱費': { closing: 240686 },
  '新聞図書費': { closing: 59642 },
  '諸会費': { closing: 237000 },
  '支払手数料': { closing: 2488964 },
  '地代家賃': { closing: 840219 },
  '保険料': { closing: 502050 },
  '減価償却費': { closing: 596528 },
  '長期前払費用償却': { closing: 75666 },
  '雑費': { closing: 6195 },
  '受取利息': { closing: 29467 },
  '雑収入': { closing: 400000 },
  '支払利息': { closing: 11903 },
  '法人税・住民税及び事業税': { closing: 4512 },
  '販売管理費合計': { closing: 30337551 },
  '営業利益': { closing: 27720704 },
  '経常利益': { closing: 28138268 },
  '当期純利益': { closing: 28133756 },
};

// --- BS Data ---
const bsData = {
  '【税】ＰａｙＰａｙ銀行': { opening: 27592484, closing: 48011928 },
  '【税】江東信組（法人）': { opening: 2393407, closing: 1031441 },
  '【税】城北信金（法人）': { opening: 310384, closing: 310384 },
  '【会】ＰａｙＰａｙ銀行': { opening: 0, closing: -350413, category: '現金・預金' },
  '売掛金': { opening: 11200546, closing: 17505379 },
  '前払費用': { opening: 812709, closing: 812709 },
  '未収還付法人税等': { opening: 0, closing: -1644 },
  '一括償却資産': { opening: 159800, closing: 327800 },
  'ソフトウェア': { opening: 3631500, closing: 3084000 },
  '長期前払費用': { opening: 663297, closing: 547635 },
  '保険積立金': { opening: 9149075, closing: 9545680 },
  '資金諸口': { opening: 0, closing: 5000000 },
  '未払金': { opening: 1226706, closing: 3011506 },
  '未払費用': { opening: 4148756, closing: 8754267 },
  '未払法人税等': { opening: 1072500, closing: 0 },
  '未払消費税等': { opening: 2657000, closing: 0 },
  '預り金': { opening: 1517844, closing: 1689620 },
  '【税】アメリカン・エキスプレス': { opening: 730731, closing: 190823 },
  '【税】freeeカード Unlimited': { opening: 48549, closing: -142196 },
  '未払金（白根裕也）': { opening: 0, closing: -159343 },
  '未払金（長瀬祐基）': { opening: 0, closing: 129052 },
  '役員借入金': { opening: 1331810, closing: 1331810 },
  'Amazonビジネス（API）': { opening: 0, closing: -43172 },
  '長期借入金': { opening: 13510000, closing: 13255000 },
  '長期未払金': { opening: 3652500, closing: 3375000 },
  '資本金': { opening: 1500000, closing: 1500000 },
  '繰越利益': { opening: 25021393, closing: 25021393 },
  '資産合計': { opening: 56423036, closing: 86174123 },
  '負債合計': { opening: 29901643, closing: 31518974 },
  '純資産合計': { opening: 26521393, closing: 54655149 },
};

// ============================================================
// チェックルール実行
// ============================================================

const findings = [];

function addFinding(severity, category, details) {
  findings.push({ severity, category, ...details });
}

// --- 1. BS異常値チェック ---

// 預金マイナスチェック
if (bsData['【会】ＰａｙＰａｙ銀行'].closing < 0) {
  addFinding('🔴', '現金・預金', {
    item: '【会】ＰａｙＰａｙ銀行',
    amount: bsData['【会】ＰａｙＰａｙ銀行'].closing,
    issue: '預金残高がマイナスになっています（-350,413円）',
    explanation: '預金残高がマイナスになることは通常あり得ません。記帳漏れ、入金未処理、または口座間振替の処理ミスが考えられます。当座借越契約がない限り、原因を確認して修正が必要です。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// 資金諸口チェック
if (bsData['資金諸口'].closing !== 0) {
  addFinding('🔴', '貸借不一致', {
    item: '資金諸口',
    amount: bsData['資金諸口'].closing,
    issue: '資金諸口に5,000,000円の残高が残っています',
    explanation: '資金諸口は通常ゼロであるべき勘定科目です。取引の相手勘定が未処理の可能性があります。入出金の登録はあるが、相手方の取引登録が完了していない状態です。早急に原因を特定し、適切な勘定科目に振り替えてください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// 未払金（白根裕也）マイナスチェック
if (bsData['未払金（白根裕也）'].closing < 0) {
  addFinding('🔴', '勘定科目区分', {
    item: '未払金（白根裕也）',
    amount: bsData['未払金（白根裕也）'].closing,
    issue: '未払金残高がマイナス（-159,343円）です。実質的に立替金（役員貸付金）の状態です',
    explanation: '未払金がマイナスということは、会社から役員への支払超過（立替金）が発生しています。役員貸付金として認定されるリスクがあり、認定利息の課税（年4.1%）が発生する可能性があります。精算処理を行うか、勘定科目を立替金/仮払金に振り替えてください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// freeeカードマイナス
if (bsData['【税】freeeカード Unlimited'].closing < 0) {
  addFinding('🟡', '現金・預金', {
    item: '【税】freeeカード Unlimited',
    amount: bsData['【税】freeeカード Unlimited'].closing,
    issue: 'クレジットカード残高がマイナス（-142,196円）になっています',
    explanation: 'クレジットカードの未払残高がマイナスということは、支払済みだが利用明細の取込・登録が完了していない取引がある可能性があります。freeeの「自動で経理」で未処理の取引がないか確認してください。',
    freee_link: `${FREEE_BASE_URL}/walletables`,
  });
}

// Amazon残高マイナス
if (bsData['Amazonビジネス（API）'].closing < 0) {
  addFinding('🟡', '現金・預金', {
    item: 'Amazonビジネス（API）',
    amount: bsData['Amazonビジネス（API）'].closing,
    issue: 'Amazonビジネス残高がマイナス（-43,172円）になっています',
    explanation: '明細の取込と経費登録のタイミングのズレが考えられます。未処理の取引がないか確認してください。',
    freee_link: `${FREEE_BASE_URL}/walletables`,
  });
}

// 未収還付法人税等マイナス
if (bsData['未収還付法人税等'].closing < 0) {
  addFinding('🟡', '勘定科目区分', {
    item: '未収還付法人税等',
    amount: bsData['未収還付法人税等'].closing,
    issue: '未収還付法人税等がマイナス（-1,644円）です',
    explanation: '未収還付法人税等は資産科目のため、マイナスは通常ありません。少額ですが、未払法人税等への振替が適切か確認してください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 2. 役員報酬の定期同額チェック ---
// 月次データがないため、6ヶ月合計から推定
const monthlyDirectorComp = plData['役員報酬'].closing / 6;
addFinding('🟡', '人件費', {
  item: '役員報酬',
  amount: plData['役員報酬'].closing,
  issue: `役員報酬 6ヶ月合計: ${plData['役員報酬'].closing.toLocaleString()}円（月平均: ${Math.round(monthlyDirectorComp).toLocaleString()}円）。定期同額であることを確認してください`,
  explanation: '定期同額給与の要件を満たさない場合、損金不算入となります。期中での変更がある場合は、事前確定届出給与の届出がされているか確認が必要です。月次推移で各月の支給額を確認してください。',
  freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
});

// --- 3. 退職給付費用マイナスチェック ---
if (plData['退職給付費用'].closing < 0) {
  addFinding('🟡', '勘定科目区分', {
    item: '退職給付費用',
    amount: plData['退職給付費用'].closing,
    issue: '退職給付費用がマイナス（-239,000円）になっています',
    explanation: '費用科目がマイナスになるのは通常と異なります。退職給付引当金の戻入や、DC拠出金の過大計上の取消等の可能性がありますが、処理内容を確認してください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 4. 支払手数料の高額チェック ---
const feeRatio = plData['支払手数料'].closing / plData['売上高'].closing * 100;
if (feeRatio > 3) {
  addFinding('🟡', '経費分析', {
    item: '支払手数料',
    amount: plData['支払手数料'].closing,
    issue: `支払手数料が売上高の${feeRatio.toFixed(1)}%（${plData['支払手数料'].closing.toLocaleString()}円）を占めています`,
    explanation: '支払手数料の構成比が高めです。内訳を確認し、ソフトウェア（クラウドサービスの年額利用料等）や前払費用に計上すべきものが含まれていないか確認してください。また、顧問料や業務委託費が含まれている場合は、適切な科目への振替を検討してください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 5. 雑収入の内容確認 ---
if (plData['雑収入'].closing >= 100000) {
  addFinding('🔵', '営業外損益', {
    item: '雑収入',
    amount: plData['雑収入'].closing,
    issue: `雑収入に${plData['雑収入'].closing.toLocaleString()}円が計上されています`,
    explanation: '雑収入の内容を確認し、適切な勘定科目（受取手数料、受取保険金等）への振替を検討してください。また、消費税区分が適切かも確認が必要です。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 6. 前払費用の確認 ---
if (bsData['前払費用'].opening === bsData['前払費用'].closing && bsData['前払費用'].closing > 0) {
  addFinding('🟡', '前払費用', {
    item: '前払費用',
    amount: bsData['前払費用'].closing,
    issue: `前払費用が期首から変動なし（${bsData['前払費用'].closing.toLocaleString()}円）です`,
    explanation: '前払費用は期間の経過に応じて費用化されるべきですが、6ヶ月間変動がありません。費用化の仕訳が漏れていないか、または全額を長期前払費用に振り替えるべきでないか確認してください。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 7. 売掛金の増加チェック ---
const arIncrease = (bsData['売掛金'].closing - bsData['売掛金'].opening) / bsData['売掛金'].opening * 100;
if (arIncrease > 30) {
  addFinding('🔵', '売上債権', {
    item: '売掛金',
    amount: bsData['売掛金'].closing,
    issue: `売掛金が期首から${arIncrease.toFixed(0)}%増加しています（${bsData['売掛金'].opening.toLocaleString()}円 → ${bsData['売掛金'].closing.toLocaleString()}円）`,
    explanation: '売掛金が大幅に増加しています。売上増加に伴う正常な増加であれば問題ありませんが、回収遅延や不良債権の発生がないか確認してください。また、期末の売上計上（期ズレ）がないかも確認が必要です。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 8. 未払費用の増加チェック ---
const apIncrease = (bsData['未払費用'].closing - bsData['未払費用'].opening) / bsData['未払費用'].opening * 100;
if (apIncrease > 50) {
  addFinding('🟡', '負債', {
    item: '未払費用',
    amount: bsData['未払費用'].closing,
    issue: `未払費用が期首から${apIncrease.toFixed(0)}%増加しています（${bsData['未払費用'].opening.toLocaleString()}円 → ${bsData['未払費用'].closing.toLocaleString()}円）`,
    explanation: '未払費用が大幅に増加しています。給与計算の未払計上や、経費の未払計上が適切に行われているか確認してください。過大計上により利益を圧縮していないかも確認が必要です。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 9. 役員借入金の確認 ---
if (bsData['役員借入金'].closing > 0) {
  addFinding('🔵', '役員関連', {
    item: '役員借入金',
    amount: bsData['役員借入金'].closing,
    issue: `役員借入金が${bsData['役員借入金'].closing.toLocaleString()}円あります`,
    explanation: '役員借入金がある場合、無利息であれば税務上の問題は通常ありませんが、返済計画の策定と議事録の整備を推奨します。金融機関からの評価にも影響する場合があります。',
    freee_link: `${FREEE_BASE_URL}/reports/general_ledgers`,
  });
}

// --- 10. 一括償却資産の新規計上 ---
const newIkkatsu = bsData['一括償却資産'].closing - bsData['一括償却資産'].opening;
if (newIkkatsu > 0) {
  addFinding('🔵', '固定資産', {
    item: '一括償却資産',
    amount: newIkkatsu,
    issue: `当期に一括償却資産が${newIkkatsu.toLocaleString()}円新規計上されています`,
    explanation: '一括償却資産（10万円以上20万円未満）は3年均等償却です。中小企業者は少額減価償却資産の特例（30万円未満一括費用化、年間300万円まで）の適用も検討できます。',
    freee_link: `${FREEE_BASE_URL}/fixed_assets`,
  });
}

// --- 11. 財務指標分析 ---
const salesAmount = plData['売上高'].closing;
const operatingProfit = plData['営業利益'].closing;
const ordinaryProfit = plData['経常利益'].closing;
const totalAssets = bsData['資産合計'].closing;
const netAssets = bsData['純資産合計'].closing;
const totalLiabilities = bsData['負債合計'].closing;

const operatingMargin = operatingProfit / salesAmount * 100;
const ordinaryMargin = ordinaryProfit / salesAmount * 100;
const equityRatio = netAssets / totalAssets * 100;
const sgaRatio = plData['販売管理費合計'].closing / salesAmount * 100;
const personnelRatio = (plData['役員報酬'].closing + plData['給料手当'].closing + plData['賞与'].closing + plData['法定福利費'].closing) / salesAmount * 100;

// ============================================================
// Excel レポート生成
// ============================================================

async function generateReport() {
  const workbook = new ExcelJS.Workbook();

  // --- 色定義 ---
  const RED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
  const YELLOW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
  const BLUE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const TITLE_FONT = { bold: true, size: 16 };
  const SUBTITLE_FONT = { bold: true, size: 12 };

  // ============================================================
  // シート1: サマリー
  // ============================================================
  const summarySheet = workbook.addWorksheet('サマリー');

  // タイトル
  summarySheet.mergeCells('A1:F1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = '勘定科目・BS/PLチェックレポート';
  titleCell.font = TITLE_FONT;

  summarySheet.getCell('A3').value = '事業所名:';
  summarySheet.getCell('B3').value = COMPANY_NAME;
  summarySheet.getCell('B3').font = { bold: true };

  summarySheet.getCell('A4').value = '対象期間:';
  summarySheet.getCell('B4').value = `${PERIOD_START} ~ ${PERIOD_END}`;

  summarySheet.getCell('A5').value = 'チェック実行日:';
  summarySheet.getCell('B5').value = new Date().toLocaleDateString('ja-JP');

  summarySheet.getCell('A6').value = '会計年度:';
  summarySheet.getCell('B6').value = '2024年10月〜2025年9月（9月決算）';

  // 結果サマリー
  summarySheet.getCell('A8').value = 'チェック結果サマリー';
  summarySheet.getCell('A8').font = SUBTITLE_FONT;

  const redCount = findings.filter(f => f.severity === '🔴').length;
  const yellowCount = findings.filter(f => f.severity === '🟡').length;
  const blueCount = findings.filter(f => f.severity === '🔵').length;

  const summaryHeaders = ['重要度', '件数', '説明'];
  const summaryRow9 = summarySheet.addRow(summaryHeaders);
  summaryRow9.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const redRow = summarySheet.addRow(['🔴 要修正', redCount, '明らかな誤りの可能性が高い。早急に確認・修正が必要']);
  redRow.getCell(1).fill = RED_FILL;

  const yellowRow = summarySheet.addRow(['🟡 要確認', yellowCount, '確認が必要。誤りの可能性がある']);
  yellowRow.getCell(1).fill = YELLOW_FILL;

  const blueRow = summarySheet.addRow(['🔵 参考情報', blueCount, '念のため確認を推奨']);
  blueRow.getCell(1).fill = BLUE_FILL;

  summarySheet.addRow(['合計', redCount + yellowCount + blueCount, '']);

  // カテゴリ別集計
  summarySheet.addRow([]);
  summarySheet.addRow(['カテゴリ別内訳']).getCell(1).font = SUBTITLE_FONT;

  const catHeaders = ['カテゴリ', '🔴要修正', '🟡要確認', '🔵参考情報', '合計'];
  const catHeaderRow = summarySheet.addRow(catHeaders);
  catHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const categories = [...new Set(findings.map(f => f.category))];
  categories.forEach(cat => {
    const catFindings = findings.filter(f => f.category === cat);
    summarySheet.addRow([
      cat,
      catFindings.filter(f => f.severity === '🔴').length,
      catFindings.filter(f => f.severity === '🟡').length,
      catFindings.filter(f => f.severity === '🔵').length,
      catFindings.length,
    ]);
  });

  // 財務概要
  summarySheet.addRow([]);
  summarySheet.addRow(['財務概要（6ヶ月: 2024/10 - 2025/3）']).getCell(1).font = SUBTITLE_FONT;

  const finHeaders = ['項目', '金額', '比率/指標'];
  const finHeaderRow = summarySheet.addRow(finHeaders);
  finHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const finRows = [
    ['売上高', salesAmount, '100%'],
    ['販売管理費合計', plData['販売管理費合計'].closing, `${sgaRatio.toFixed(1)}%`],
    ['営業利益', operatingProfit, `営業利益率: ${operatingMargin.toFixed(1)}%`],
    ['経常利益', ordinaryProfit, `経常利益率: ${ordinaryMargin.toFixed(1)}%`],
    ['当期純利益', plData['当期純利益'].closing, ''],
    ['', '', ''],
    ['総資産', totalAssets, ''],
    ['純資産', netAssets, `自己資本比率: ${equityRatio.toFixed(1)}%`],
    ['負債合計', totalLiabilities, ''],
    ['', '', ''],
    ['人件費合計', plData['役員報酬'].closing + plData['給料手当'].closing + plData['賞与'].closing + plData['法定福利費'].closing, `人件費率: ${personnelRatio.toFixed(1)}%`],
  ];

  finRows.forEach(row => {
    const r = summarySheet.addRow(row);
    if (typeof row[1] === 'number') {
      r.getCell(2).numFmt = '#,##0';
    }
  });

  // 列幅設定
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getColumn(3).width = 50;

  // ============================================================
  // シート2: チェック結果詳細
  // ============================================================
  const detailSheet = workbook.addWorksheet('チェック結果詳細');

  const detailHeaders = ['重要度', 'カテゴリ', '勘定科目/項目', '金額', '問題内容', '解説・対応方法', 'freeeリンク'];
  const detailHeaderRow = detailSheet.addRow(detailHeaders);
  detailHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  // 重要度順にソート
  const severityOrder = { '🔴': 0, '🟡': 1, '🔵': 2 };
  const sortedFindings = findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  sortedFindings.forEach(f => {
    const row = detailSheet.addRow([
      f.severity,
      f.category,
      f.item,
      f.amount,
      f.issue,
      f.explanation,
      { text: 'freeeで確認', hyperlink: f.freee_link },
    ]);

    // 金額フォーマット
    row.getCell(4).numFmt = '#,##0';

    // リンクスタイル
    row.getCell(7).font = { color: { argb: 'FF1565C0' }, underline: true };

    // 重要度に応じた背景色
    const fill = f.severity === '🔴' ? RED_FILL : f.severity === '🟡' ? YELLOW_FILL : BLUE_FILL;
    row.eachCell((cell) => {
      cell.fill = fill;
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });

  // 列幅設定
  detailSheet.getColumn(1).width = 10;
  detailSheet.getColumn(2).width = 15;
  detailSheet.getColumn(3).width = 25;
  detailSheet.getColumn(4).width = 18;
  detailSheet.getColumn(5).width = 50;
  detailSheet.getColumn(6).width = 60;
  detailSheet.getColumn(7).width = 15;

  // フィルタ設定
  detailSheet.autoFilter = {
    from: 'A1',
    to: `G${sortedFindings.length + 1}`,
  };

  // ============================================================
  // シート3: BS残高一覧
  // ============================================================
  const bsSheet = workbook.addWorksheet('BS残高チェック');

  const bsHeaders = ['勘定科目', '期首残高', '当期末残高', '増減額', '増減率', 'ステータス', '備考'];
  const bsHeaderRow = bsSheet.addRow(bsHeaders);
  bsHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  Object.entries(bsData).forEach(([name, data]) => {
    const change = data.closing - data.opening;
    const changeRate = data.opening !== 0 ? (change / Math.abs(data.opening) * 100) : (data.closing !== 0 ? 999 : 0);

    let status = '✅ 正常';
    let note = '';

    if (data.closing < 0 && !['貸倒引当金(売)', '減価償却累計額'].includes(name)) {
      status = '⚠️ マイナス残高';
      note = '通常マイナスにならない科目です';
    } else if (Math.abs(changeRate) > 100 && Math.abs(change) > 100000) {
      status = '📊 大幅変動';
      note = `前期比${changeRate > 0 ? '+' : ''}${changeRate.toFixed(0)}%`;
    }

    const row = bsSheet.addRow([name, data.opening, data.closing, change, `${changeRate.toFixed(1)}%`, status, note]);
    row.getCell(2).numFmt = '#,##0';
    row.getCell(3).numFmt = '#,##0';
    row.getCell(4).numFmt = '#,##0';

    if (data.closing < 0) {
      row.eachCell(cell => { cell.fill = RED_FILL; });
    }
  });

  bsSheet.getColumn(1).width = 30;
  bsSheet.getColumn(2).width = 18;
  bsSheet.getColumn(3).width = 18;
  bsSheet.getColumn(4).width = 18;
  bsSheet.getColumn(5).width = 12;
  bsSheet.getColumn(6).width = 18;
  bsSheet.getColumn(7).width = 30;

  // ============================================================
  // シート4: PL分析
  // ============================================================
  const plSheet = workbook.addWorksheet('PL分析');

  const plHeaders = ['勘定科目', '金額（6ヶ月）', '月平均', '売上比', '備考'];
  const plHeaderRow = plSheet.addRow(plHeaders);
  plHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const plItems = [
    '売上高', '', '役員報酬', '給料手当', '賞与', '退職給付費用', '法定福利費', '福利厚生費',
    '採用教育費', '外注費', '広告宣伝費', '交際費', '会議費', '旅費交通費', '通信費',
    '消耗品費', '水道光熱費', '新聞図書費', '諸会費', '支払手数料', '地代家賃', '保険料',
    '減価償却費', '長期前払費用償却', '雑費', '', '販売管理費合計', '営業利益', '経常利益', '当期純利益',
  ];

  plItems.forEach(item => {
    if (item === '') {
      plSheet.addRow([]);
      return;
    }
    const data = plData[item];
    if (!data) return;

    const monthly = Math.round(data.closing / 6);
    const ratio = (data.closing / salesAmount * 100).toFixed(1);

    let note = '';
    if (item === '退職給付費用' && data.closing < 0) note = '⚠️ マイナス - 要確認';
    if (item === '支払手数料' && parseFloat(ratio) > 3) note = '⚠️ 構成比が高い';
    if (item === '雑費') note = data.closing < 10000 ? '✅ 少額' : '⚠️ 要確認';

    const row = plSheet.addRow([item, data.closing, monthly, `${ratio}%`, note]);
    row.getCell(2).numFmt = '#,##0';
    row.getCell(3).numFmt = '#,##0';

    if (['売上高', '販売管理費合計', '営業利益', '経常利益', '当期純利益'].includes(item)) {
      row.font = { bold: true };
    }
  });

  plSheet.getColumn(1).width = 25;
  plSheet.getColumn(2).width = 20;
  plSheet.getColumn(3).width = 18;
  plSheet.getColumn(4).width = 12;
  plSheet.getColumn(5).width = 30;

  // ============================================================
  // シート5: 財務指標
  // ============================================================
  const ratioSheet = workbook.addWorksheet('財務指標');

  ratioSheet.mergeCells('A1:C1');
  ratioSheet.getCell('A1').value = '財務指標分析';
  ratioSheet.getCell('A1').font = TITLE_FONT;

  ratioSheet.addRow([]);

  const ratioHeaders = ['指標', '値', '評価'];
  const ratioHeaderRow = ratioSheet.addRow(ratioHeaders);
  ratioHeaderRow.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const ratios = [
    ['【収益性】', '', ''],
    ['営業利益率', `${operatingMargin.toFixed(1)}%`, operatingMargin > 20 ? '✅ 非常に良好' : operatingMargin > 10 ? '✅ 良好' : '⚠️ 要改善'],
    ['経常利益率', `${ordinaryMargin.toFixed(1)}%`, ordinaryMargin > 20 ? '✅ 非常に良好' : ordinaryMargin > 10 ? '✅ 良好' : '⚠️ 要改善'],
    ['販管費率', `${sgaRatio.toFixed(1)}%`, ''],
    ['人件費率', `${personnelRatio.toFixed(1)}%`, personnelRatio < 50 ? '✅ 適正範囲' : '⚠️ 高め'],
    ['', '', ''],
    ['【安全性】', '', ''],
    ['自己資本比率', `${equityRatio.toFixed(1)}%`, equityRatio > 50 ? '✅ 非常に良好' : equityRatio > 30 ? '✅ 良好' : '⚠️ 要注意'],
    ['負債比率', `${(totalLiabilities / netAssets * 100).toFixed(1)}%`, ''],
    ['', '', ''],
    ['【その他】', '', ''],
    ['月商', `${Math.round(salesAmount / 6).toLocaleString()}円`, ''],
    ['売掛金回転期間', `${(bsData['売掛金'].closing / (salesAmount / 6) * 30).toFixed(0)}日`, ''],
  ];

  ratios.forEach(row => {
    const r = ratioSheet.addRow(row);
    if (row[0].startsWith('【')) {
      r.font = { bold: true };
    }
  });

  ratioSheet.getColumn(1).width = 25;
  ratioSheet.getColumn(2).width = 20;
  ratioSheet.getColumn(3).width = 30;

  // ============================================================
  // ファイル保存
  // ============================================================
  const baseDir = process.env.REPORT_OUTPUT_DIR
    ? path.resolve(process.env.REPORT_OUTPUT_DIR)
    : path.resolve(__dirname, '../../reports');
  const outputDir = path.join(baseDir, String(COMPANY_ID));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const fileName = `${COMPANY_NAME}_勘定科目チェック_${PERIOD_START}_${PERIOD_END}_${today}.xlsx`;
  const filePath = path.join(outputDir, fileName);

  await workbook.xlsx.writeFile(filePath);

  console.log('===========================================');
  console.log(' 勘定科目・BS/PLチェックレポート');
  console.log('===========================================');
  console.log(`事業所: ${COMPANY_NAME}`);
  console.log(`対象期間: ${PERIOD_START} ~ ${PERIOD_END}`);
  console.log('');
  console.log('【チェック結果サマリー】');
  console.log(`  🔴 要修正: ${redCount}件`);
  console.log(`  🟡 要確認: ${yellowCount}件`);
  console.log(`  🔵 参考情報: ${blueCount}件`);
  console.log(`  合計: ${redCount + yellowCount + blueCount}件`);
  console.log('');
  console.log('【🔴 要修正項目】');
  findings.filter(f => f.severity === '🔴').forEach(f => {
    console.log(`  ■ ${f.category}: ${f.item}`);
    console.log(`    ${f.issue}`);
  });
  console.log('');
  console.log(`レポート出力: ${filePath}`);
}

generateReport().catch(console.error);
