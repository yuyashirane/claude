// sections/challenges.js
// セクション2: 貴社の課題認識

const { Table, TableRow, WidthType } = require("docx");
const S = require("../styles/docx-styles");

/**
 * 「貴社の課題認識」セクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph/Table 配列
 */
module.exports = function buildChallengesSection(config, theme) {
  const CW = S.CONTENT_WIDTH;
  const colWidths = [2200, CW - 2200];

  const children = [
    S.sectionNumber(2, "貴社の課題認識", theme),
    S.bodyText("お打ち合わせでお伺いした内容をもとに、以下の課題を認識しております。", theme),
    S.spacer(100),
  ];

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: [S.headerCell("課題", 2200, theme), S.headerCell("詳細", CW - 2200, theme)],
      }),
      ...config.challenges.map((c, i) => new TableRow({
        children: [
          S.dataCell(c.title, 2200, theme, { bold: true, fill: S.alternatingFill(i, theme) }),
          S.dataCell(c.detail, CW - 2200, theme, { fill: S.alternatingFill(i, theme) }),
        ],
      })),
    ],
  }));

  children.push(S.spacer(400));
  return children;
};
