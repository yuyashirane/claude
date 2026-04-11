// sections/cover.js
// 表紙ページ — 完全な section オブジェクトを返す

const { Paragraph, TextRun, BorderStyle, AlignmentType } = require("docx");
const S = require("../styles/docx-styles");

/**
 * 表紙セクションを生成
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Object} docx section オブジェクト { properties, children }
 */
module.exports = function buildCoverSection(config, theme) {
  const c = theme.colors;
  const clientName = config.client.name;
  const honorific = config.client.honorific || "御中";

  // 日付フォーマット: "2026-04-08" → "2026年4月8日"
  let dateStr = config.proposal.date;
  if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split("-");
    dateStr = `${y}年${parseInt(m)}月${parseInt(d)}日`;
  }

  return {
    properties: S.coverPageProperties(),
    children: [
      S.spacer(2400),
      // 上部アクセント線
      new Paragraph({
        spacing: { after: 400 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: c.secondary, space: 8 } },
        children: [],
      }),
      // タイトル
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: "税務顧問サービスのご提案", font: S.FONTS.default, size: S.SIZES.coverTitle, bold: true, color: c.primary })],
      }),
      S.spacer(100),
      // 英語サブタイトル
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "Tax Advisory Service Proposal", font: S.FONTS.default, size: S.SIZES.heading2, color: c.secondary })],
      }),
      // 下部アクセント線
      new Paragraph({
        spacing: { after: 800 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: c.secondary, space: 8 } },
        children: [],
      }),
      S.spacer(200),
      // 宛先
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: `【${clientName}】 ${honorific}`, font: S.FONTS.default, size: S.SIZES.heading1, bold: true, color: c.primary })],
      }),
      S.spacer(200),
      // 日付
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: dateStr, font: S.FONTS.default, size: S.SIZES.heading2, color: c.bodyTextLight })],
      }),
      S.spacer(200),
      // 事務所名
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: "あしたの会計事務所 税理士法人", font: S.FONTS.default, size: S.SIZES.officeName, bold: true, color: c.primary })],
      }),
      // コンセプト
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "つながりを大切にする 次世代型の会計事務所", font: S.FONTS.default, size: S.SIZES.body, color: c.bodyTextLight })],
      }),
    ],
  };
};
