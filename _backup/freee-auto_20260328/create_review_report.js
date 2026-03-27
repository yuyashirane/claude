const ExcelJS = require('exceljs');

const wb = new ExcelJS.Workbook();

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
const SUBHEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const WARN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const ERR_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
const OK_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };

const HEADER_FONT = { name: 'Meiryo UI', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
const SUBHEADER_FONT = { name: 'Meiryo UI', bold: true, size: 10 };
const NORMAL_FONT = { name: 'Meiryo UI', size: 10 };
const BOLD_FONT = { name: 'Meiryo UI', bold: true, size: 10 };
const RED_FONT = { name: 'Meiryo UI', size: 10, color: { argb: 'FFFF0000' } };
const RED_BOLD = { name: 'Meiryo UI', bold: true, size: 10, color: { argb: 'FFFF0000' } };
const TITLE_FONT = { name: 'Meiryo UI', bold: true, size: 14, color: { argb: 'FF2F5496' } };

const THIN_BORDER = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' }
};
const NUM_FMT = '#,##0';
const PCT_FMT = '0.0%';

function styleHeaderRow(ws, rowNum, maxCol) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= maxCol; c++) {
    const cell = row.getCell(c);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  }
}

function setColWidths(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ============================================================
// Sheet 1: 概況
// ============================================================
const ws1 = wb.addWorksheet('概況');
setColWidths(ws1, [20, 18, 18, 18, 14]);

ws1.getCell('A1').value = '㈱デイリーユニフォーム 期中レビュー結果';
ws1.getCell('A1').font = TITLE_FONT;
ws1.mergeCells('A1:E1');

ws1.getCell('A3').value = '基本情報';
ws1.getCell('A3').font = SUBHEADER_FONT;
ws1.getCell('A3').fill = SUBHEADER_FILL;
ws1.mergeCells('A3:E3');

const info = [
  ['決算月', '5月（期首6/1〜期末5/31）'],
  ['対象期間', '2025年6月〜12月（7ヶ月）'],
  ['会計年度', '2026年5月期'],
  ['業種', '衣料卸売・繊維'],
  ['税務方式', '税抜経理'],
  ['freee事業所ID', '10794380'],
];
info.forEach(([k, v], i) => {
  const r = i + 5;
  ws1.getCell(r, 1).value = k; ws1.getCell(r, 1).font = BOLD_FONT;
  ws1.getCell(r, 2).value = v; ws1.getCell(r, 2).font = NORMAL_FONT;
});

let r = 13;
ws1.getCell(r, 1).value = '概況サマリー（前年同期比較）';
ws1.getCell(r, 1).font = SUBHEADER_FONT;
ws1.getCell(r, 1).fill = SUBHEADER_FILL;
ws1.mergeCells(`A${r}:E${r}`);
r++;
['指標', '当期(7ヶ月)', '前年同期(7ヶ月)', '増減額', '増減率'].forEach((h, i) => {
  ws1.getCell(r, i + 1).value = h;
});
styleHeaderRow(ws1, r, 5);
r++;

const summary = [
  ['売上高', 27137652, 40478000],
  ['売上総利益', 14550441, 21229875],
  ['営業利益', -2810516, 3035250],
  ['経常利益', -2699601, 5398328],
  ['当期純利益', -2785047, 4591956],
  ['総資産', 21502435, 35632328],
  ['純資産', 7212264, 10591560],
];
summary.forEach(([name, cur, prev], i) => {
  const row = r + i;
  ws1.getCell(row, 1).value = name; ws1.getCell(row, 1).font = BOLD_FONT;
  ws1.getCell(row, 2).value = cur; ws1.getCell(row, 2).numFmt = NUM_FMT;
  ws1.getCell(row, 3).value = prev; ws1.getCell(row, 3).numFmt = NUM_FMT;
  ws1.getCell(row, 4).value = { formula: `B${row}-C${row}` }; ws1.getCell(row, 4).numFmt = NUM_FMT;
  ws1.getCell(row, 5).value = { formula: `IF(C${row}=0,"-",B${row}/C${row}-1)` }; ws1.getCell(row, 5).numFmt = PCT_FMT;
  if (cur < 0) ws1.getCell(row, 2).font = RED_BOLD;
  for (let c = 1; c <= 5; c++) {
    ws1.getCell(row, c).border = THIN_BORDER;
    if (!ws1.getCell(row, c).font) ws1.getCell(row, c).font = NORMAL_FONT;
  }
});

// ============================================================
// Sheet 2: PL比較
// ============================================================
const ws2 = wb.addWorksheet('PL前年同期比較');
setColWidths(ws2, [22, 16, 16, 16, 12, 12, 12]);
['項目', '当期(A)', '前年同期(B)', '増減(A-B)', '増減率', '売上比(当期)', '売上比(前年)'].forEach((h, i) => {
  ws2.getCell(1, i + 1).value = h;
});
styleHeaderRow(ws2, 1, 7);

const plData = [
  ['売上高', 27137652, 40478000, true],
  ['売上原価', 12587211, 19248125, false],
  ['　期首商品棚卸高', 338580, 2542830, false],
  ['　仕入高', 12248631, 16705295, false],
  ['売上総利益', 14550441, 21229875, true],
  ['販売管理費計', 17360957, 18194625, true],
  ['　役員報酬', 8600000, 11200000, false],
  ['　旅費交通費', 1543125, 348915, false],
  ['　法定福利費', 1395912, 1505784, false],
  ['　消耗品費', 1326203, 784237, false],
  ['　会議費', 1032318, 722434, false],
  ['　外注費', 790571, 577299, false],
  ['　地代家賃', 463640, 649096, false],
  ['　交際費', 416565, 109625, false],
  ['　支払報酬料', 368000, 435000, false],
  ['　支払手数料', 328198, 371437, false],
  ['　減価償却費', 328706, 478054, false],
  ['　その他', 767719, 1013344, false],
  ['営業利益', -2810516, 3035250, true],
  ['営業外収益', 177124, 2401792, false],
  ['　雑収入', 154201, 2400000, false],
  ['　受取利息', 22923, 1792, false],
  ['営業外費用', 66209, 38714, false],
  ['経常利益', -2699601, 5398328, true],
  ['税引前当期純利益', -2699601, 5398328, true],
  ['法人税等', 85446, 806372, false],
  ['当期純利益', -2785047, 4591956, true],
];
plData.forEach(([name, cur, prev, isBold], i) => {
  const row = i + 2;
  ws2.getCell(row, 1).value = name; ws2.getCell(row, 1).font = isBold ? BOLD_FONT : NORMAL_FONT;
  ws2.getCell(row, 2).value = cur; ws2.getCell(row, 2).numFmt = NUM_FMT;
  ws2.getCell(row, 3).value = prev; ws2.getCell(row, 3).numFmt = NUM_FMT;
  ws2.getCell(row, 4).value = { formula: `B${row}-C${row}` }; ws2.getCell(row, 4).numFmt = NUM_FMT;
  ws2.getCell(row, 5).value = { formula: `IF(C${row}=0,"-",B${row}/C${row}-1)` }; ws2.getCell(row, 5).numFmt = PCT_FMT;
  ws2.getCell(row, 6).value = { formula: `IF(B$2=0,"-",B${row}/B$2)` }; ws2.getCell(row, 6).numFmt = PCT_FMT;
  ws2.getCell(row, 7).value = { formula: `IF(C$2=0,"-",C${row}/C$2)` }; ws2.getCell(row, 7).numFmt = PCT_FMT;
  if (cur < 0) ws2.getCell(row, 2).font = RED_FONT;
  for (let c = 1; c <= 7; c++) {
    ws2.getCell(row, c).border = THIN_BORDER;
  }
});

// ============================================================
// Sheet 3: BS比較
// ============================================================
const ws3 = wb.addWorksheet('BS比較');
setColWidths(ws3, [24, 16, 16, 16, 16, 16]);
['項目', '当期12月末(A)', '前期末5月末(B)', '増減(A-B)', '前年12月末(C)', '増減(A-C)'].forEach((h, i) => {
  ws3.getCell(1, i + 1).value = h;
});
styleHeaderRow(ws3, 1, 6);

const bsData = [
  ['【流動資産】', null, null, null, true],
  ['現金', -4290, 0, 0, false],
  ['三菱UFJ', 9071379, 13237113, 15506246, false],
  ['GMOあおぞら', 8906103, 11728603, 1700756, false],
  ['売掛金', 1585525, 2773588, 12033387, false],
  ['商品', 0, 338580, 0, false],
  ['役員貸付金', -5003540, 0, 0, false],
  ['未収還付法人税等', 155000, 510500, 0, false],
  ['仮払消費税', 1732601, 0, 2569543, false],
  ['その他流動', 59424, 1298, 1298, false],
  ['流動資産計', 16502202, 28589682, 31811230, true],
  ['【固定資産】', null, null, null, true],
  ['有形固定資産', 993427, 1027496, 1406129, false],
  ['保険積立金', 4000000, 2600000, 2400000, false],
  ['長期前払費用', 6806, 11566, 14969, false],
  ['固定資産計', 5000233, 3639062, 3821098, true],
  ['資産合計', 21502435, 32228744, 35632328, true],
  ['【負債】', null, null, null, true],
  ['買掛金', 0, 3735666, 4108096, false],
  ['立替経費（佐藤）', 855279, 2252699, 930485, false],
  ['未払金', -3105511, 579153, 580817, false],
  ['JAL CARD', 214010, 429415, 455422, false],
  ['未払法人税等', 0, 35000, 0, false],
  ['未払消費税等', 0, 712700, 0, false],
  ['預り金', 706934, 611800, 44500, false],
  ['仮受消費税', 2669459, 0, 4000448, false],
  ['流動負債計', 1340171, 8356433, 10240768, true],
  ['長期借入金', 12950000, 13875000, 14800000, false],
  ['負債合計', 14290171, 22231433, 25040768, true],
  ['【純資産】', null, null, null, true],
  ['資本金', 1000000, 1000000, 1000000, false],
  ['繰越利益剰余金', 8997311, 8997311, 4999604, false],
  ['当期純損益', -2785047, null, 4591956, false],
  ['純資産合計', 7212264, 9997311, 10591560, true],
];
bsData.forEach(([name, a, b, cVal, isHeader], i) => {
  const row = i + 2;
  ws3.getCell(row, 1).value = name; ws3.getCell(row, 1).font = isHeader ? BOLD_FONT : NORMAL_FONT;
  if (a !== null) {
    ws3.getCell(row, 2).value = a; ws3.getCell(row, 2).numFmt = NUM_FMT;
    if (a < 0) { ws3.getCell(row, 2).font = RED_FONT; ws3.getCell(row, 2).fill = ERR_FILL; }
  }
  if (b !== null) {
    ws3.getCell(row, 3).value = b; ws3.getCell(row, 3).numFmt = NUM_FMT;
  }
  if (a !== null && b !== null) {
    ws3.getCell(row, 4).value = { formula: `B${row}-C${row}` }; ws3.getCell(row, 4).numFmt = NUM_FMT;
  }
  if (cVal !== null) {
    ws3.getCell(row, 5).value = cVal; ws3.getCell(row, 5).numFmt = NUM_FMT;
  }
  if (a !== null && cVal !== null) {
    ws3.getCell(row, 6).value = { formula: `B${row}-E${row}` }; ws3.getCell(row, 6).numFmt = NUM_FMT;
  }
  for (let c = 1; c <= 6; c++) ws3.getCell(row, c).border = THIN_BORDER;
});

// ============================================================
// Sheet 4: 15分野記帳チェック
// ============================================================
const ws4 = wb.addWorksheet('記帳チェック');
setColWidths(ws4, [6, 28, 12, 55]);
['#', '分野', '判定', '詳細'].forEach((h, i) => { ws4.getCell(1, i + 1).value = h; });
styleHeaderRow(ws4, 1, 4);

const checks = [
  [1, '現金・預金【GA-1】', 'NG', '現金 -4,290円（マイナス）。預金は正常。'],
  [2, '借入金【HB1-1】', '要確認', '長期借入金12,950千円。7ヶ月で925千円返済。返済予定表との照合が必要。支払利息65千円（利率確認要）。'],
  [3, '固定資産【GD-1】', '要確認', '消耗品費に106,366円（三越）あり。税抜96,696円で10万未満だが内容確認要。一括償却資産294,637円新規取得→台帳登録確認。'],
  [4, '家賃支払【HD-1】', 'OK', '地代家賃463,640円/7ヶ月=月66,234円。ただし前年月93千円から減額→契約変更確認。'],
  [5, '人件費【JC2-1】', '要確認', '役員報酬: 6-7月160万、8月以降108万に減額。期首3ヶ月以内の改定で適法だが議事録確認要。法定福利費比率16.2%（目安14-15%よりやや高）。'],
  [6, '士業・外注【HB2-1】', 'NG', '支払報酬料（税理士）に源泉徴収の記載なし→確認必須。外注費に個人外注先あり（佐藤壽久・久保布紀等）→源泉徴収の要否と役員との関係確認。'],
  [7, 'TPS9100/給与', 'OK', 'freee人事労務連携のため対象外。'],
  [8, '役員関係【JB-1】', 'NG', '役員貸付金 -5,003,540円（マイナス=実質役員借入金）。前期は「役員借入金」科目あり→科目修正要。立替経費（佐藤）855千円は精算進行中。'],
  [9, '売上・売掛金【HA-1】', '要確認', '売上高27,138千円（前年比-33%）。売掛金1,586千円は売上規模に対し妥当だが、売上減の原因確認要。'],
  [10, '仕入・買掛金【JC3-1】', 'OK', '原価率46.4%（卸売業平均と乖離→ブランド付加価値型事業と推定）。買掛金0円（全件決済済み確認）。'],
  [11, '在庫【JC3-3】', 'NG', '期首商品338,580円→原価振替後ゼロ。期末棚卸未計上。衣料卸売で在庫ゼロは通常ありえない。'],
  [12, 'その他経費【JC3-4】', '要確認', '会議費103万（月15万）・交際費42万→区分確認。旅費交通費154万（前年比+342%）→内容確認。未払金 -3,106千円→異常（給与unsettledが原因の可能性）。'],
  [13, '営業外損益【HC-1】', '要確認', '雑収入154千円の内訳確認要。前年の雑収入240万の内容も確認。'],
  [14, '税金【JC3-5】', 'OK', '未払法人税等・未払消費税等とも期首から納付済みでゼロ。受取利息の源泉所得税（15.315%）計上済み。予定納税85,446円計上済み。'],
  [15, 'その他の気付事項', '要確認', '給与取引7件がすべてunsettled（未決済）→未払金マイナスの原因の可能性大。決済登録のマッチング確認要。'],
];
checks.forEach(([num, area, result, detail], i) => {
  const row = i + 2;
  ws4.getCell(row, 1).value = num; ws4.getCell(row, 1).font = NORMAL_FONT; ws4.getCell(row, 1).alignment = { horizontal: 'center' };
  ws4.getCell(row, 2).value = area; ws4.getCell(row, 2).font = BOLD_FONT;
  ws4.getCell(row, 3).value = result; ws4.getCell(row, 3).alignment = { horizontal: 'center' };
  ws4.getCell(row, 4).value = detail; ws4.getCell(row, 4).font = NORMAL_FONT; ws4.getCell(row, 4).alignment = { wrapText: true };
  if (result === 'NG') { ws4.getCell(row, 3).fill = ERR_FILL; ws4.getCell(row, 3).font = RED_BOLD; }
  else if (result === '要確認') { ws4.getCell(row, 3).fill = WARN_FILL; ws4.getCell(row, 3).font = BOLD_FONT; }
  else { ws4.getCell(row, 3).fill = OK_FILL; ws4.getCell(row, 3).font = BOLD_FONT; }
  for (let c = 1; c <= 4; c++) ws4.getCell(row, c).border = THIN_BORDER;
});

// ============================================================
// Sheet 5: 消費税区分チェック
// ============================================================
const ws5 = wb.addWorksheet('消費税チェック');
setColWidths(ws5, [22, 14, 28, 12, 45]);
['科目', 'tax_code', '区分', '判定', '備考'].forEach((h, i) => { ws5.getCell(1, i + 1).value = h; });
styleHeaderRow(ws5, 1, 5);

const taxData = [
  ['役員報酬', '2', '不課税', 'OK', ''],
  ['法定福利費', '-', '不課税', 'OK', '推定'],
  ['外注費（インボイス登録済）', '136', '課税仕入10%（適格）', 'OK', '田原耕平'],
  ['外注費（インボイス非登録）', '189', '課税仕入10%（経過措置80%）', 'OK', '佐藤壽久、久保布紀、福岡洋平、高木洋平。2026/10以降は50%控除に変更要。'],
  ['支払報酬料（税理士）', '136', '課税仕入10%（適格）', 'OK', 'あしたの会計事務所税理士法人'],
  ['消耗品費（一般）', '136', '課税仕入10%（適格）', 'OK', ''],
  ['消耗品費（軽減税率）', '108', '課税仕入8%', 'OK', '407円のみ。飲食料品と推定。'],
  ['消耗品費（tax_code163）', '163', '要確認', '要確認', '8件2,703円。特定課税仕入等の定義確認要。金額僅少。'],
  ['受取利息', '23', '非課税売上', 'OK', ''],
  ['雑収入（保険返戻等）', '129', '課税売上10%', '要確認', '98,000円+36,200円。保険配当・返戻金なら不課税(2)が正しい。内容確認要。'],
  ['雑収入（前納減額金）', '23', '非課税', '要確認', '倒産防止共済9,900円。不課税(2)が適切では。少額。'],
  ['雑収入（予中間分）', '2', '不課税', 'OK', '22,300円。税の還付相当。'],
  ['支払利息', '-', '非課税仕入', 'OK', '推定'],
  ['保険料', '-', '非課税仕入', 'OK', '推定'],
  ['減価償却費', '-', '対象外', 'OK', ''],
  ['租税公課', '-', '不課税', 'OK', ''],
];
taxData.forEach(([name, tc, cat, result, note], i) => {
  const row = i + 2;
  ws5.getCell(row, 1).value = name; ws5.getCell(row, 1).font = NORMAL_FONT;
  ws5.getCell(row, 2).value = tc; ws5.getCell(row, 2).font = NORMAL_FONT; ws5.getCell(row, 2).alignment = { horizontal: 'center' };
  ws5.getCell(row, 3).value = cat; ws5.getCell(row, 3).font = NORMAL_FONT;
  ws5.getCell(row, 4).value = result; ws5.getCell(row, 4).font = BOLD_FONT; ws5.getCell(row, 4).alignment = { horizontal: 'center' };
  ws5.getCell(row, 5).value = note; ws5.getCell(row, 5).font = NORMAL_FONT; ws5.getCell(row, 5).alignment = { wrapText: true };
  ws5.getCell(row, 4).fill = result === '要確認' ? WARN_FILL : OK_FILL;
  for (let c = 1; c <= 5; c++) ws5.getCell(row, c).border = THIN_BORDER;
});

const r2 = taxData.length + 4;
ws5.getCell(r2, 1).value = '消費税試算'; ws5.getCell(r2, 1).font = SUBHEADER_FONT; ws5.getCell(r2, 1).fill = SUBHEADER_FILL;
ws5.mergeCells(`A${r2}:C${r2}`);
ws5.getCell(r2+1, 1).value = '仮受消費税'; ws5.getCell(r2+1, 1).font = NORMAL_FONT;
ws5.getCell(r2+1, 2).value = 2669459; ws5.getCell(r2+1, 2).numFmt = NUM_FMT;
ws5.getCell(r2+2, 1).value = '仮払消費税'; ws5.getCell(r2+2, 1).font = NORMAL_FONT;
ws5.getCell(r2+2, 2).value = 1732601; ws5.getCell(r2+2, 2).numFmt = NUM_FMT;
ws5.getCell(r2+3, 1).value = '差額（納付見込）'; ws5.getCell(r2+3, 1).font = BOLD_FONT;
ws5.getCell(r2+3, 2).value = { formula: `B${r2+1}-B${r2+2}` }; ws5.getCell(r2+3, 2).numFmt = NUM_FMT; ws5.getCell(r2+3, 2).font = BOLD_FONT;
for (let rr = r2+1; rr <= r2+3; rr++) {
  for (let cc = 1; cc <= 2; cc++) ws5.getCell(rr, cc).border = THIN_BORDER;
}

// ============================================================
// Sheet 6: 確認事項一覧
// ============================================================
const ws6 = wb.addWorksheet('確認事項一覧');
setColWidths(ws6, [5, 10, 30, 60]);
['#', '重要度', '項目', '内容・質問'].forEach((h, i) => { ws6.getCell(1, i + 1).value = h; });
styleHeaderRow(ws6, 1, 4);

const issues = [
  [1, '高', '未払金マイナス -311万', '給与がすべて未決済(unsettled)。振込の決済登録と未払金取引のマッチングが未了。仕訳の修正が必要。'],
  [2, '高', '役員貸付金マイナス -500万', '「役員借入金」科目に修正。立替経費（佐藤）85万円との相殺も決算時に検討。'],
  [3, '高', '支払報酬料の源泉徴収', '税理士報酬（月24千円税抜）に源泉10.21%が控除されているか確認。未控除なら是正必要。'],
  [4, '高', '外注費の源泉徴収・実態確認', '個人外注先への支払いに源泉徴収が必要か。「佐藤壽久」が役員と同一人物でないか確認。'],
  [5, '高', '売上33%減の原因', '月平均578万→388万と大幅減収。取引先別の分析と今後の見通し。'],
  [6, '中', '役員報酬改定の議事録', '160万→108万の減額。定時株主総会決議で行っているか確認。'],
  [7, '中', '期末棚卸高の計上', '12月末の在庫はゼロで正しいか。月次棚卸の実施を推奨。'],
  [8, '中', '雑収入の消費税区分', '98,000円+36,200円が課税売上10%。保険関連なら不課税に修正要。'],
  [9, '中', '旅費交通費+342%', '月22万円の出張費用の内容確認。'],
  [10, '中', '現金マイナス -4,290', '少額だが修正必要。'],
  [11, '低', '地代家賃の減額理由', '月93千→66千に減。契約変更の確認。'],
  [12, '低', '前年雑収入240万の内容', '当期に同様の収入がないため、一時的収入であれば当期の赤字が実力値。'],
];
issues.forEach(([num, level, item, content], i) => {
  const row = i + 2;
  ws6.getCell(row, 1).value = num; ws6.getCell(row, 1).font = NORMAL_FONT; ws6.getCell(row, 1).alignment = { horizontal: 'center' };
  ws6.getCell(row, 2).value = level; ws6.getCell(row, 2).alignment = { horizontal: 'center' };
  ws6.getCell(row, 3).value = item; ws6.getCell(row, 3).font = BOLD_FONT;
  ws6.getCell(row, 4).value = content; ws6.getCell(row, 4).font = NORMAL_FONT; ws6.getCell(row, 4).alignment = { wrapText: true };
  if (level === '高') { ws6.getCell(row, 2).fill = ERR_FILL; ws6.getCell(row, 2).font = RED_BOLD; }
  else if (level === '中') { ws6.getCell(row, 2).fill = WARN_FILL; ws6.getCell(row, 2).font = BOLD_FONT; }
  else { ws6.getCell(row, 2).fill = OK_FILL; ws6.getCell(row, 2).font = BOLD_FONT; }
  for (let c = 1; c <= 4; c++) ws6.getCell(row, c).border = THIN_BORDER;
});

// ============================================================
// Sheet 7: 役員報酬月次
// ============================================================
const ws7 = wb.addWorksheet('役員報酬月次');
setColWidths(ws7, [10, 16, 16, 16, 16, 16, 16]);
['月', '役員報酬', '健保（預り）', '介護（預り）', '厚年（預り）', '源泉所得税', '住民税'].forEach((h, i) => {
  ws7.getCell(1, i + 1).value = h;
});
styleHeaderRow(ws7, 1, 7);

const salaryData = [
  ['6月', 1600000, 78290, 12560, 118950, 123020, 44500],
  ['7月', 1600000, 78290, 12560, 118950, 123020, 44500],
  ['8月', 1080000, 78290, 12560, 118950, 35660, 0],
  ['9月', 1080000, 78290, 12560, 118950, 35660, 0],
  ['10月', 1080000, 78290, 12560, 118950, 35660, 0],
  ['11月', 1080000, 52524, 8426, 96990, 41940, 0],
  ['12月', 1080000, 52524, 8426, 96990, 41940, 82000],
];
salaryData.forEach((rowData, i) => {
  const row = i + 2;
  ws7.getCell(row, 1).value = rowData[0]; ws7.getCell(row, 1).font = NORMAL_FONT; ws7.getCell(row, 1).alignment = { horizontal: 'center' };
  for (let c = 1; c <= 6; c++) {
    ws7.getCell(row, c + 1).value = rowData[c]; ws7.getCell(row, c + 1).numFmt = NUM_FMT; ws7.getCell(row, c + 1).font = NORMAL_FONT;
  }
  for (let c = 1; c <= 7; c++) ws7.getCell(row, c).border = THIN_BORDER;
  if (rowData[1] !== salaryData[0][1]) ws7.getCell(row, 2).fill = WARN_FILL;
});

const rowTotal = salaryData.length + 2;
ws7.getCell(rowTotal, 1).value = '合計'; ws7.getCell(rowTotal, 1).font = BOLD_FONT; ws7.getCell(rowTotal, 1).alignment = { horizontal: 'center' };
ws7.getCell(rowTotal, 1).border = THIN_BORDER;
const colLetters = ['B','C','D','E','F','G'];
for (let c = 0; c < 6; c++) {
  const col = c + 2;
  const letter = colLetters[c];
  ws7.getCell(rowTotal, col).value = { formula: `SUM(${letter}2:${letter}${rowTotal-1})` };
  ws7.getCell(rowTotal, col).numFmt = NUM_FMT;
  ws7.getCell(rowTotal, col).font = BOLD_FONT;
  ws7.getCell(rowTotal, col).border = THIN_BORDER;
}

const outPath = 'C:/Users/yuya_/claude/office/freee-auto/デイリーユニフォーム_期中レビュー_202506-12.xlsx';
wb.xlsx.writeFile(outPath).then(() => {
  console.log('Saved: ' + outPath);
}).catch(err => {
  console.error('Error:', err.message);
});
