// sections/services.js
// セクション3: サービス内容

const { Table, TableRow, WidthType } = require("docx");
const S = require("../styles/docx-styles");

/**
 * 「サービス内容」セクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph/Table 配列
 */
module.exports = function buildServicesSection(config, theme) {
  const CW = S.CONTENT_WIDTH;
  const colWidths = [2800, CW - 2800];

  const children = [
    S.sectionNumber(3, "サービス内容", theme),
    S.bodyText("以下のサービスをワンストップでご提供いたします。", theme),
    S.spacer(100),
  ];

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: [S.headerCell("サービス項目", 2800, theme), S.headerCell("内容", CW - 2800, theme)],
      }),
      ...config.services.map((s, i) => new TableRow({
        children: [
          S.dataCell(s.name, 2800, theme, { bold: true, fill: S.alternatingFill(i, theme) }),
          S.dataCell(s.detail, CW - 2800, theme, { fill: S.alternatingFill(i, theme) }),
        ],
      })),
    ],
  }));

  return children;
};
