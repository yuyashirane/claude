// sections/office-info.js
// セクション7: 当事務所の概要

const { Paragraph, TextRun, Table, TableRow, WidthType, BorderStyle, AlignmentType } = require("docx");
const S = require("../styles/docx-styles");

const OFFICE_DATA = [
  ["事務所名", "あしたの会計事務所 税理士法人"],
  ["所在地", "〒110-0016 東京都台東区台東4-13-20 ハクセンビル4階"],
  ["e-mail", "[mail@ashitak.com]"],
  ["コンセプト", "つながりを大切にする 次世代型の会計事務所"],
];

/**
 * 「当事務所の概要」セクション + フッター署名の children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph/Table 配列
 */
module.exports = function buildOfficeInfoSection(config, theme) {
  const CW = S.CONTENT_WIDTH;
  const c = theme.colors;
  const colWidths = [2500, CW - 2500];

  const children = [
    S.sectionNumber(7, "当事務所の概要", theme),
    S.spacer(100),
  ];

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: OFFICE_DATA.map((row, i) => new TableRow({
      children: [
        S.dataCell(row[0], 2500, theme, { bold: true, fill: S.alternatingFill(i, theme) }),
        S.dataCell(row[1], CW - 2500, theme, { fill: S.alternatingFill(i, theme) }),
      ],
    })),
  }));

  // フッター署名
  children.push(
    S.spacer(600),
    new Paragraph({
      spacing: { after: 100 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: c.secondary, space: 8 } },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "本提案書の内容についてご不明な点がございましたら、お気軽にご連絡ください。", font: S.FONTS.default, size: S.SIZES.body, color: c.bodyText })],
    }),
    S.spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "あしたの会計事務所 税理士法人", font: S.FONTS.default, size: S.SIZES.heading2, bold: true, color: c.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
      children: [new TextRun({ text: "〒110-0016 東京都台東区台東4-13-20 ハクセンビル4階", font: S.FONTS.default, size: S.SIZES.footerAddr, color: c.bodyTextLight })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "E-mail: mail@ashitak.com", font: S.FONTS.default, size: S.SIZES.footerAddr, color: c.bodyTextLight })],
    }),
  );

  return children;
};
