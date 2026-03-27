const ExcelJS = require('exceljs');

async function main() {
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

  // ===== Sheet 1: Summary =====
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

  const h1 = ['判定','勘定科目','取引先名','個人/法人','支払合計(税込)','件数','源泉徴収額','源泉有無','摘要/業務内容','指摘事項/コメント'];
  const w1 = [12,12,30,20,16,6,14,10,38,58];
  addHeaders(ws1, 9, h1, w1);

  const data = [
    ['重大','支払報酬料','あしたの会計事務所','個人(税理士)',1817750,46,0,'なし','税理士顧問料(月額22,330円等)','税理士報酬は所得税法204条により源泉徴収必須。全期間にわたり源泉未処理。調査期間4年超分の追徴リスクあり。'],
    ['重大','外注費','須藤 一輝','個人',609000,2,0,'なし','Snapshotデザイン&動画制作費/LP制作費','デザイン料は所得税法204条1項1号対象。源泉徴収が必要。'],
    ['重大','外注費','ベトナムフリーランス','個人/非居住者?',1074750,11,0,'なし','(摘要なし)','非居住者への支払いの場合20.42%の源泉必要(所得税法212条)。居住地/役務提供地の確認要。'],
    ['要確認','外注費','星野萌音','個人',3616250,7,0,'なし','開発費','個人への高額支払い(361万円)。システム開発なら204条対象外の可能性。契約書要確認。'],
    ['要確認','外注費','齊藤晶子','個人(インボイス登録済)',3121800,14,0,'なし','システム開発','個人への高額支払い(312万円)。システム開発なら204条対象外の可能性。契約書要確認。'],
    ['要確認','外注費','タケダトキオ(デブオプワーカー)','個人',2664750,14,0,'なし','SE稼働/インフラ開発費用','SE業務なら204条対象外の可能性。契約書要確認。'],
    ['要確認','外注費','伊藤 源太(インボイス未登録)','個人',827250,10,0,'なし','システム開発作業','システム開発なら204条対象外の可能性。インボイス未登録のため経過措置確認も必要。'],
    ['要確認','外注費','Biteearth 徐基源','個人',510000,4,0,'なし','開発協力','個人への支払い。業務内容/非居住者該当性の確認要。'],
    ['要確認','外注費','満極 尚輝(インボイス未登録)','個人',172500,3,0,'なし','(摘要なし)','業務内容不明。摘要なしのため内容確認要。'],
    ['要確認','支払報酬料','東新宿総合法律事務所','法律事務所',7421,1,0,'なし','(摘要なし)','弁護士報酬なら少額でも源泉必要。実費精算の可能性もあり内容確認要。'],
    ['要確認','支払報酬料','社労士法人グランディール','法人',243150,7,0,'なし','算定基礎届手続等','社会保険労務士「法人」への支払い→源泉不要。ただし法人格の確認要。'],
    ['問題なし','支払報酬料','山下 聖志(顧問弁護士/士業)','個人',2665641,47,247419,'あり','顧問料/株主間契約書レビュー等','源泉徴収済み。税額の検算推奨。'],
    ['問題なし','支払報酬料','加藤来特許事務所(弁理士)','個人',389950,1,36194,'あり','特許出願手続き','源泉徴収済み。'],
    ['問題なし','外注費','今井友美(インボイス未登録)','個人',666050,7,61819,'あり','デザイン制作/技術支援料','デザイン料として源泉徴収済み。税額の検算推奨。'],
    ['問題なし','支払報酬料','高野経営労務事務所','個人',49500,1,4594,'あり','(摘要なし)','源泉徴収済み。'],
    ['問題なし','外注費','株式会社レイブリー','法人',2430994,12,0,'-','NNA保守対応','法人への支払い→源泉不要。'],
    ['問題なし','外注費','アイマツイフト(株)','法人',797500,1,0,'-','Snapshot for Businessアプリ開発','法人への支払い→源泉不要。'],
    ['問題なし','外注費','ペイオニアジャパン(株)','法人',384000,4,0,'-','開発協力(送金サービス経由)','法人への支払い→源泉不要。'],
    ['問題なし','外注費','齊藤憲生','個人',330000,1,0,'-','返金','返金取引のため源泉対象外。'],
  ];

  data.forEach((row, idx) => {
    const r = 10 + idx;
    row.forEach((val, col) => {
      const c = ws1.getCell(r, col+1);
      c.value = val; c.font = nFont; c.border = tBdr;
      c.alignment = { vertical: 'middle', wrapText: true };
      if (col === 4 || col === 6) c.numFmt = '#,##0';
    });
    const pc = ws1.getCell(r, 1);
    if (row[0]==='重大') { pc.font=redFont; pc.fill=redFill; }
    else if (row[0]==='要確認') { pc.font=yelFont; pc.fill=yelFill; }
    else if (row[0]==='問題なし') { pc.font=grnFont; pc.fill=grnFill; }
  });

  // ===== Sheet 2: Balance Trend =====
  const ws2 = wb.addWorksheet('預り金残高推移');
  ws2.getCell('A1').value = '預り金(源泉所得税等) 残高推移';
  ws2.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };

  const h2 = ['会計年度','期間','期首残高','借方(納付等)','貸方(計上)','期末残高','コメント'];
  addHeaders(ws2, 3, h2, [14,18,14,16,16,14,58]);

  const bd = [
    ['第5期','2021/9-2022/8',100350,2621375,2552309,31284,'期末残高31,284円。概ね適正に納付されている。'],
    ['第6期','2022/9-2023/8',31284,2967144,3038257,102397,'期末残高102,397円。やや滞留が見られる。'],
    ['第7期','2023/9-2024/8',102397,2790169,2774222,86450,'期末残高86,450円。前期とほぼ同水準。'],
    ['第8期','2024/9-2025/8',86450,2717300,2684234,53384,'期末残高53,384円。概ね適正に推移。'],
    ['第9期(途中)','2025/9-2026/3',53384,436460,499028,115952,'進行期途中(7ヶ月経過)。期末残高115,952円。'],
  ];
  bd.forEach((row, idx) => {
    row.forEach((val, col) => {
      const c = ws2.getCell(4+idx, col+1);
      c.value = val; c.font = nFont; c.border = tBdr;
      if (col >= 2 && col <= 5) { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right' }; }
    });
  });

  ws2.getCell('A10').value = '【分析】'; ws2.getCell('A10').font = bFont;
  const analysis = [
    '預り金の期末残高は各期とも概ね3万円-10万円台で推移。大幅な滞留は見られない。',
    'ただし上記は給与の源泉所得税(年末調整分)を含む残高であり、',
    '★「あしたの会計事務所」「須藤一輝」等の源泉漏れ分は含まれていない点に注意。',
    '源泉漏れ分を追加納付する場合、不納付加算税(10%/自主的5%)+延滞税が発生する可能性あり。',
  ];
  analysis.forEach((t, i) => {
    const c = ws2.getCell(11+i, 1);
    c.value = t; c.font = i === 2 ? warnFont : nFont;
  });

  // ===== Sheet 3: Action List =====
  const ws3 = wb.addWorksheet('対応アクション');
  ws3.getCell('A1').value = '源泉所得税 税務調査対応アクションリスト';
  ws3.getCell('A1').font = { name: 'Meiryo UI', size: 14, bold: true };

  addHeaders(ws3, 3, ['優先度','対象取引先','アクション内容','確認書類','担当','期限','状況'],
    [10,24,58,40,10,12,10]);

  const acts = [
    ['最優先','あしたの会計事務所','源泉徴収漏れの確認。過去の支払調書との照合。自主修正納付の検討(不納付加算税5%での対応)。','請求書/支払調書/納付書','','','未着手'],
    ['最優先','須藤 一輝','デザイン料の源泉徴収漏れ確認。自主修正納付の検討。','請求書/契約書','','','未着手'],
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
  ];
  acts.forEach((row, idx) => {
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

  const cl = [
    ['1','源泉徴収対象の報酬(所得税法204条)',''],
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
  ];
  cl.forEach(([num, item, note], i) => {
    ws4.getCell(3+i, 1).value = num; ws4.getCell(3+i, 1).font = num ? secFont : nFont;
    ws4.getCell(3+i, 2).value = item; ws4.getCell(3+i, 2).font = num ? secFont : nFont;
    ws4.getCell(3+i, 3).value = note; ws4.getCell(3+i, 3).font = nFont;
  });

  const path = 'C:/Users/yuya_/claude/office/freee-auto/connectiv_withholding_tax_check.xlsx';
  await wb.xlsx.writeFile(path);
  console.log('Saved:', path);
}

main().catch(console.error);
