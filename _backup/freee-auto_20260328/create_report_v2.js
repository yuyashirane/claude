const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const deals = JSON.parse(fs.readFileSync('C:/Users/yuya_/claude/office/freee-auto/deal_details.json'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Claude Code';

  const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
  const hdrFont = { name: 'Meiryo UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const nFont = { name: 'Meiryo UI', size: 10 };
  const bFont = { name: 'Meiryo UI', size: 10, bold: true };
  const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
  const redFont = { name: 'Meiryo UI', size: 10, color: { argb: 'FF9C0006' } };
  const yelFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
  const yelFont = { name: 'Meiryo UI', size: 10, color: { argb: 'FF9C6500' } };
  const grnFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
  const grnFont = { name: 'Meiryo UI', size: 10, color: { argb: 'FF006100' } };
  const warnFont = { name: 'Meiryo UI', size: 10, color: { argb: 'FFFF0000' }, bold: true };
  const secFont = { name: 'Meiryo UI', size: 11, bold: true, color: { argb: 'FF2F5496' } };
  const linkFont = { name: 'Meiryo UI', size: 9, color: { argb: 'FF0563C1' }, underline: true };
  const tBdr = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  function addHeaders(ws, row, headers, widths) {
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i+1);
      c.value = h; c.font = hdrFont; c.fill = hdrFill;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = tBdr;
    });
    widths.forEach((w, i) => { ws.getColumn(i+1).width = w; });
  }

  // Partner metadata
  const meta = {
    '須藤 一輝': { type: '個人', judgment: '重大', comment: 'デザイン料は所得税法204条1項1号対象。源泉徴収が必要。' },
    'ベトナムフリーランス': { type: '個人/非居住者?', judgment: '重大', comment: '非居住者への支払いの場合20.42%の源泉必要(所得税法212条)。居住地/役務提供地の確認要。' },
    '星野萌音': { type: '個人', judgment: '要確認', comment: '個人への高額支払い。システム開発なら204条対象外の可能性。契約書要確認。' },
    '齊藤晶子': { type: '個人(インボイス登録済)', judgment: '要確認', comment: '個人への高額支払い。システム開発なら204条対象外の可能性。契約書要確認。' },
    'タケダトキオ': { type: '個人', judgment: '要確認', comment: 'SE業務なら204条対象外の可能性。契約書要確認。' },
    '伊藤 源太': { type: '個人', judgment: '要確認', comment: 'システム開発なら204条対象外の可能性。インボイス未登録のため経過措置確認も必要。' },
    'Biteearth 徐基源': { type: '個人', judgment: '要確認', comment: '個人への支払い。業務内容/非居住者該当性の確認要。' },
    '満極 尚輝': { type: '個人', judgment: '要確認', comment: '業務内容不明。摘要なしのため内容確認要。' },
    '東新宿総合法律事務所': { type: '法律事務所', judgment: '要確認', comment: '弁護士報酬なら少額でも源泉必要。実費精算の可能性もあり内容確認要。' },
    '社労士法人グランディール': { type: '法人', judgment: '要確認', comment: '社会保険労務士「法人」への支払い→源泉不要。ただし法人格の確認要。' },
    '山下 聖志': { type: '個人', judgment: '問題なし', comment: '源泉徴収済み。税額の検算推奨。' },
    '加藤来特許事務所': { type: '個人', judgment: '問題なし', comment: '源泉徴収済み。' },
    '今井友美': { type: '個人', judgment: '問題なし', comment: 'デザイン料として源泉徴収済み。税額の検算推奨。' },
    '高野経営労務事務所': { type: '個人', judgment: '問題なし', comment: '源泉徴収済み。' },
    '株式会社レイブリー': { type: '法人', judgment: '問題なし', comment: '法人への支払い→源泉不要。' },
    'アイマツイフト': { type: '法人', judgment: '問題なし', comment: '法人への支払い→源泉不要。' },
    'ペイオニアジャパン': { type: '法人', judgment: '問題なし', comment: '法人への支払い→源泉不要。' },
    '齊藤憲生': { type: '個人', judgment: '問題なし', comment: '返金取引のため源泉対象外。' },
  };

  // Judgment sort order
  const jOrder = { '重大': 0, '要確認': 1, '問題なし': 2 };

  // Sort deals by judgment, then partner, then date
  deals.sort((a, b) => {
    const ja = jOrder[meta[a.partner]?.judgment] ?? 9;
    const jb = jOrder[meta[b.partner]?.judgment] ?? 9;
    if (ja !== jb) return ja - jb;
    if (a.partner !== b.partner) return a.partner.localeCompare(b.partner);
    return a.date.localeCompare(b.date);
  });

  // ===== Sheet 1: Detail =====
  const ws1 = wb.addWorksheet('調査サマリー');
  ws1.getCell('A1').value = 'Connectiv株式会社 源泉所得税チェックレポート';
  ws1.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };
  ws1.getCell('A2').value = '対象期間: 2022年1月 - 2026年3月 / 作成日: 2026年3月25日';
  ws1.getCell('A2').font = { name: 'Meiryo UI', size: 11, color: { argb: 'FF666666' } };

  ws1.getCell('A4').value = '【判定凡例】'; ws1.getCell('A4').font = bFont;
  [['重大','源泉徴収漏れの可能性が高い',redFont,redFill],
   ['要確認','業務内容により源泉対象の可能性あり',yelFont,yelFill],
   ['問題なし','源泉処理済み or 法人への支払い',grnFont,grnFill]].forEach(([l,d,f,fi],i)=>{
    ws1.getCell(5+i,1).value=l; ws1.getCell(5+i,1).font=f; ws1.getCell(5+i,1).fill=fi;
    ws1.getCell(5+i,2).value=d; ws1.getCell(5+i,2).font=nFont;
  });

  const headers = ['判定','取引日','freeeリンク','勘定科目','取引先名','個人/法人',
    '支払金額(税込)','源泉徴収額','源泉有無','摘要/業務内容','指摘事項/コメント'];
  const widths = [10,12,14,12,28,18,16,14,10,35,55];
  addHeaders(ws1, 9, headers, widths);

  let currentRow = 10;
  let prevPartner = '';

  deals.forEach((deal) => {
    const m = meta[deal.partner] || { type: '不明', judgment: '要確認', comment: '' };
    const r = currentRow;

    // Judgment
    const jc = ws1.getCell(r, 1);
    jc.value = m.judgment; jc.border = tBdr;
    jc.alignment = { vertical: 'middle', horizontal: 'center' };
    if (m.judgment === '重大') { jc.font = redFont; jc.fill = redFill; }
    else if (m.judgment === '要確認') { jc.font = yelFont; jc.fill = yelFill; }
    else { jc.font = grnFont; jc.fill = grnFill; }

    // Date
    const dc = ws1.getCell(r, 2);
    dc.value = deal.date; dc.font = nFont; dc.border = tBdr;
    dc.alignment = { vertical: 'middle' };

    // freee link
    const lc = ws1.getCell(r, 3);
    const url = `https://secure.freee.co.jp/reports/journals?deal_id=${deal.dealId}`;
    lc.value = { text: '明細を開く', hyperlink: url };
    lc.font = linkFont; lc.border = tBdr;
    lc.alignment = { vertical: 'middle', horizontal: 'center' };

    // Account
    const ac = ws1.getCell(r, 4);
    ac.value = deal.account; ac.font = nFont; ac.border = tBdr;
    ac.alignment = { vertical: 'middle' };

    // Partner
    const pc = ws1.getCell(r, 5);
    pc.value = deal.partner; pc.font = nFont; pc.border = tBdr;
    pc.alignment = { vertical: 'middle' };

    // Type
    const tc = ws1.getCell(r, 6);
    tc.value = m.type; tc.font = nFont; tc.border = tBdr;
    tc.alignment = { vertical: 'middle' };

    // Amount
    const amc = ws1.getCell(r, 7);
    amc.value = deal.amount; amc.font = nFont; amc.border = tBdr;
    amc.numFmt = '#,##0'; amc.alignment = { vertical: 'middle', horizontal: 'right' };

    // Withholding
    const wc = ws1.getCell(r, 8);
    wc.value = deal.withholdingAmt || 0; wc.font = nFont; wc.border = tBdr;
    wc.numFmt = '#,##0'; wc.alignment = { vertical: 'middle', horizontal: 'right' };

    // Has withholding
    const hwc = ws1.getCell(r, 9);
    hwc.value = deal.hasWithholding ? 'あり' : 'なし';
    hwc.font = nFont; hwc.border = tBdr;
    hwc.alignment = { vertical: 'middle', horizontal: 'center' };

    // Description
    const dsc = ws1.getCell(r, 10);
    dsc.value = deal.description; dsc.font = nFont; dsc.border = tBdr;
    dsc.alignment = { vertical: 'middle', wrapText: true };

    // Comment
    const cc = ws1.getCell(r, 11);
    cc.value = m.comment; cc.font = nFont; cc.border = tBdr;
    cc.alignment = { vertical: 'middle', wrapText: true };

    prevPartner = deal.partner;
    currentRow++;
  });

  // Auto-filter
  ws1.autoFilter = { from: { row: 9, column: 1 }, to: { row: currentRow - 1, column: 11 } };

  // Freeze panes
  ws1.views = [{ state: 'frozen', ySplit: 9 }];

  // ===== Sheet 2: Balance Trend (same as before) =====
  const ws2 = wb.addWorksheet('預り金残高推移');
  ws2.getCell('A1').value = '預り金(源泉所得税等) 残高推移';
  ws2.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };

  addHeaders(ws2, 3, ['会計年度','期間','期首残高','借方(納付等)','貸方(計上)','期末残高','コメント'],
    [14,18,14,16,16,14,58]);

  [['第5期','2021/9-2022/8',100350,2621375,2552309,31284,'期末残高31,284円。概ね適正に納付されている。'],
   ['第6期','2022/9-2023/8',31284,2967144,3038257,102397,'期末残高102,397円。やや滞留が見られる。'],
   ['第7期','2023/9-2024/8',102397,2790169,2774222,86450,'期末残高86,450円。前期とほぼ同水準。'],
   ['第8期','2024/9-2025/8',86450,2717300,2684234,53384,'期末残高53,384円。概ね適正に推移。'],
   ['第9期(途中)','2025/9-2026/3',53384,436460,499028,115952,'進行期途中(7ヶ月経過)。期末残高115,952円。'],
  ].forEach((row, idx) => {
    row.forEach((val, col) => {
      const c = ws2.getCell(4+idx, col+1);
      c.value = val; c.font = nFont; c.border = tBdr;
      if (col >= 2 && col <= 5) { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right' }; }
    });
  });

  ws2.getCell('A10').value = '【分析】'; ws2.getCell('A10').font = bFont;
  ['預り金の期末残高は各期とも概ね3万円-10万円台で推移。大幅な滞留は見られない。',
   'ただし上記は給与の源泉所得税(年末調整分)を含む残高であり、',
   '★源泉漏れ指摘分は含まれていない点に注意。',
   '源泉漏れ分を追加納付する場合、不納付加算税(10%/自主的5%)+延滞税が発生する可能性あり。',
  ].forEach((t, i) => {
    ws2.getCell(11+i, 1).value = t;
    ws2.getCell(11+i, 1).font = i === 2 ? warnFont : nFont;
  });

  // ===== Sheet 3: Action List =====
  const ws3 = wb.addWorksheet('対応アクション');
  ws3.getCell('A1').value = '源泉所得税 税務調査対応アクションリスト';
  ws3.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };

  addHeaders(ws3, 3, ['優先度','対象取引先','アクション内容','確認書類','担当','期限','状況'],
    [10,24,58,40,10,12,10]);

  [['最優先','須藤 一輝','デザイン料の源泉徴収漏れ確認。自主修正納付の検討。','請求書/契約書','','','未着手'],
   ['最優先','ベトナムフリーランス','居住地/役務提供地の確認。非居住者該当性の判断。日越租税条約の適用可否確認。','契約書/パスポート写し/送金記録','','','未着手'],
   ['重要','星野萌音','業務内容の確認(204条該当性)。契約書/発注書の確認。','業務委託契約書/発注書','','','未着手'],
   ['重要','齊藤晶子','業務内容の確認(204条該当性)。','業務委託契約書','','','未着手'],
   ['重要','タケダトキオ','SE業務の内容確認(204条該当性)。','業務委託契約書','','','未着手'],
   ['重要','伊藤 源太','業務内容の確認。インボイス経過措置の適用確認。','業務委託契約書','','','未着手'],
   ['重要','Biteearth 徐基源','業務内容/非居住者該当性の確認。','業務委託契約書','','','未着手'],
   ['重要','東新宿総合法律事務所','支払い内容の確認(弁護士報酬 or 実費精算)。','請求書','','','未着手'],
   ['通常','今井友美','源泉税額の検算(10.21%)。','請求書','','','未着手'],
   ['通常','山下 聖志','源泉税額の検算(10.21%/20.42%)。100万円超部分の確認。','請求書','','','未着手'],
   ['通常','全般','預り金の納付状況確認(毎月10日 or 納期の特例7/10,1/20)。','納付書控え/e-Tax送信記録','','','未着手'],
   ['通常','全般','支払調書(報酬/料金/契約金及び賞金の支払調書)の提出状況確認。','支払調書控え/法定調書合計表','','','未着手'],
  ].forEach((row, idx) => {
    row.forEach((val, col) => {
      const c = ws3.getCell(4+idx, col+1);
      c.value = val; c.font = nFont; c.border = tBdr;
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    const pc = ws3.getCell(4+idx, 1);
    if (row[0]==='最優先') { pc.font=redFont; pc.fill=redFill; }
    else if (row[0]==='重要') { pc.font=yelFont; pc.fill=yelFill; }
  });

  // ===== Sheet 4: Checklist =====
  const ws4 = wb.addWorksheet('源泉徴収チェックポイント');
  ws4.getCell('A1').value = '源泉徴収 税務調査チェックポイント';
  ws4.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };
  ws4.getColumn(1).width = 5; ws4.getColumn(2).width = 58; ws4.getColumn(3).width = 55;

  [['1','源泉徴収対象の報酬(所得税法204条)',''],
   ['','  (1) 弁護士/税理士/社労士/公認会計士等の報酬','10.21%(100万円以下) / 20.42%(100万円超の部分)'],
   ['','  (2) 司法書士の報酬','(支払金額-10,000円) x 10.21%'],
   ['','  (3) デザイン料/原稿料/翻訳料/講演料','10.21% / 20.42%'],
   ['','  (4) 外交員報酬','(支払金額-12万円) x 10.21%'],
   ['','  (5) 不動産の使用料等(個人への支払い)','10.21% / 20.42%'],
   ['','  (6) 非居住者への報酬(所得税法212条)','原則 20.42%(租税条約による軽減あり)'],
   ['','',''],
   ['2','源泉徴収が不要なもの',''],
   ['','  (1) 法人(株式会社/合同会社等)への支払い',''],
   ['','  (2) システム開発/プログラミング業務','デザイン要素がなければ対象外'],
   ['','  (3) 行政書士の報酬','原則として源泉徴収不要'],
   ['','  (4) 社会保険労務士法人への支払い','法人格があれば源泉不要'],
   ['','  (5) 税理士法人への支払い','法人格があれば源泉不要'],
   ['','',''],
   ['3','消費税の取扱い',''],
   ['','  原則: 税込金額に対して源泉徴収',''],
   ['','  例外: 請求書で報酬額と消費税が明確に区分されている場合は税抜可',''],
   ['','',''],
   ['4','納付期限',''],
   ['','  原則: 翌月10日まで',''],
   ['','  納期の特例(常時10人未満): 1-6月分→7/10 / 7-12月分→翌1/20',''],
   ['','  ※士業以外の外注報酬には納期の特例は適用されない',''],
   ['','',''],
   ['5','不納付加算税/延滞税',''],
   ['','  不納付加算税: 原則10%(自主納付の場合5%)',''],
   ['','  延滞税: 納付期限の翌日から年14.6%(2ヶ月以内は年7.3%)',''],
   ['','  ※法定納期限から1年以上経過した部分の延滞税は免除される場合あり',''],
  ].forEach(([num, item, note], i) => {
    ws4.getCell(3+i, 1).value = num; ws4.getCell(3+i, 1).font = num ? secFont : nFont;
    ws4.getCell(3+i, 2).value = item; ws4.getCell(3+i, 2).font = num ? secFont : nFont;
    ws4.getCell(3+i, 3).value = note; ws4.getCell(3+i, 3).font = nFont;
  });

  const path = 'C:/Users/yuya_/claude/office/freee-auto/connectiv_withholding_tax_check.xlsx';
  await wb.xlsx.writeFile(path);
  console.log('Saved:', path, '- Total rows:', currentRow - 10);
}

main().catch(console.error);
