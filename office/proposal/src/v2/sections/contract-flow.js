// sections/contract-flow.js
// セクション6: ご契約後の流れ

const { Table, TableRow, WidthType } = require("docx");
const { AlignmentType } = require("docx");
const S = require("../styles/docx-styles");

const DEFAULT_STEPS = [
  { step: 1, content: "本提案書のご確認・ご契約", note: "内容にご同意いただければ契約へ。" },
  { step: 2, content: "顧問契約書の締結", note: "当事務所よりドラフトをお送りします。" },
  { step: 3, content: "履歴事項全部証明書PDFのご提供", note: "貴社にてご手配をお願いいたします。" },
  { step: 4, content: "設立届出・青色申告承認申請書提出", note: "当事務所にて対応いたします。" },
  { step: 5, content: "freeeアカウント設定・連携", note: "口座連携・勘定科目マッピングを設定。" },
  { step: 6, content: "役員報酬額の決定", note: "設立3ヶ月以内に事業計画を踏まえて決定。" },
  { step: 7, content: "月次記帳開始", note: "継続的な記帳・月次レビューを開始。" },
];

/**
 * 「ご契約後の流れ」セクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph/Table 配列
 */
module.exports = function buildContractFlowSection(config, theme) {
  const CW = S.CONTENT_WIDTH;
  const colWidths = [900, 3600, CW - 4500];

  const children = [
    S.sectionNumber(6, "ご契約後の流れ", theme),
    S.bodyText("ご契約後は、以下のステップで円滑に業務を開始いたします。", theme),
    S.spacer(100),
  ];

  // カスタムステップ or デフォルト
  const flow = config.contractFlow;
  let steps;
  if (flow && !flow.useDefault && flow.customSteps && flow.customSteps.length > 0) {
    steps = flow.customSteps;
  } else {
    steps = DEFAULT_STEPS;
  }

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: [S.headerCell("STEP", 900, theme), S.headerCell("内容", 3600, theme), S.headerCell("備考", CW - 4500, theme)],
      }),
      ...steps.map((s, i) => new TableRow({
        children: [
          S.dataCell(String(s.step), 900, theme, { align: AlignmentType.CENTER, bold: true, fill: S.alternatingFill(i, theme) }),
          S.dataCell(s.content, 3600, theme, { fill: S.alternatingFill(i, theme) }),
          S.dataCell(s.note || "", CW - 4500, theme, { fill: S.alternatingFill(i, theme) }),
        ],
      })),
    ],
  }));

  return children;
};
