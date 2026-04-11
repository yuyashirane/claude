// docx-styles.js
// v2 共通スタイル定義 — テーマ対応版
// 全ファクトリ関数は theme オブジェクト (theme.colors) を受け取る

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, TabStopType, TabStopPosition,
  Header, Footer, PageNumber,
} = require("docx");

// ══════ テーマ非依存の定数 ══════

// フォント
const FONTS = {
  default: "Yu Gothic",
};

// フォントサイズ (half-points)
const SIZES = {
  body: 20,          // 10pt — 本文・テーブルデータ
  subHeading: 22,    // 11pt — サブ見出し・テーブル合計行
  heading2: 24,      // 12pt — Heading2・日付
  heading1: 28,      // 14pt — セクション見出し
  officeName: 32,    // 16pt — 事務所名
  coverTitle: 52,    // 26pt — 表紙タイトル
  small: 16,         // 8pt  — ヘッダー・フッター
  footerAddr: 18,    // 9pt  — フッター住所
};

// ページ設定 (A4, twips)
const PAGE = {
  width: 11906,
  height: 16838,
};

const MARGINS = {
  cover: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
  content: { top: 1800, bottom: 1440, left: 1440, right: 1440 },
};

const CONTENT_WIDTH = PAGE.width - MARGINS.content.left - MARGINS.content.right; // 9026

// セル内側余白
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };

// ══════ テーマ依存のヘルパー ══════

/**
 * テーマからテーブル罫線スタイルを生成
 */
function thinBorders(theme) {
  const b = { style: BorderStyle.SINGLE, size: 1, color: theme.colors.tableBorder };
  return { top: b, bottom: b, left: b, right: b };
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

/**
 * テーマからドキュメントスタイル定義を生成
 */
function documentStyles(theme) {
  return {
    default: {
      document: {
        run: { font: FONTS.default, size: SIZES.body },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: SIZES.heading1, bold: true, font: FONTS.default, color: theme.colors.sectionTitle },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: SIZES.heading2, bold: true, font: FONTS.default, color: theme.colors.secondary },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
      },
    ],
  };
}

// 箇条書き定義（テーマ非依存）
const NUMBERING_CONFIG = [
  {
    reference: "bullets",
    levels: [{
      level: 0,
      format: LevelFormat.BULLET,
      text: "\u25CF",
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }],
  },
];

// ══════════════════════════════════════════════
// ファクトリ関数（全て theme を受け取る）
// ══════════════════════════════════════════════

// --- 見出し ---

function sectionHeading(text, theme) {
  return new Paragraph({
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.colors.sectionBorder, space: 4 } },
    children: [new TextRun({ text, font: FONTS.default, size: SIZES.heading1, bold: true, color: theme.colors.sectionTitle })],
  });
}

function sectionNumber(num, text, theme) {
  return sectionHeading(`${num}. ${text}`, theme);
}

function subHeading(text, theme) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: FONTS.default, size: SIZES.subHeading, bold: true, color: theme.colors.sectionTitle })],
  });
}

// --- 本文 ---

function bodyText(text, theme, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.afterSpacing || 160 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [new TextRun({ text, font: FONTS.default, size: SIZES.body, color: theme.colors.bodyText })],
  });
}

function bulletItem(text, theme, reference = "bullets") {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONTS.default, size: SIZES.body, color: theme.colors.bodyText })],
  });
}

function spacer(h = 200) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

// --- テーブルセル ---

function headerCell(text, width, theme) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders(theme),
    shading: { fill: theme.colors.tableHeaderBg, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, font: FONTS.default, size: SIZES.body, color: theme.colors.tableHeaderText })],
    })],
  });
}

function dataCell(text, width, theme, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders(theme),
    shading: { fill: opts.fill || theme.colors.white, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan || undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text,
        font: FONTS.default,
        size: SIZES.body,
        color: opts.color || theme.colors.bodyText,
        bold: opts.bold || false,
      })],
    })],
  });
}

function highlightCell(text, width, theme, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders(theme),
    shading: { fill: theme.colors.tableTotalBg, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan || undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, font: FONTS.default, size: SIZES.subHeading, bold: true, color: theme.colors.tableTotalText })],
    })],
  });
}

/**
 * 金額表示用セル（右寄せ、値引き時はdiscount色）
 * @param {string} text - 金額文字列（例: "35,000円", "-5,000円"）
 * @param {number} width - セル幅 (DXA)
 * @param {Object} theme - テーマオブジェクト
 * @param {Object} [opts] - オプション（fill, isDiscount, bold, columnSpan）
 */
function priceCell(text, width, theme, opts = {}) {
  const isDiscount = opts.isDiscount || (typeof text === "string" && text.startsWith("-"));
  const color = isDiscount ? theme.colors.discount : (opts.color || theme.colors.bodyText);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders(theme),
    shading: { fill: opts.fill || theme.colors.white, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan || undefined,
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({
        text,
        font: FONTS.default,
        size: SIZES.body,
        color,
        bold: opts.bold || false,
      })],
    })],
  });
}

/**
 * 交互色を返す（テーブル行インデックスから）
 */
function alternatingFill(index, theme) {
  return index % 2 === 0 ? theme.colors.tableAltBg : theme.colors.white;
}

/**
 * テーマから罫線スタイルセットを取得
 */
function getBorders(theme) {
  return {
    thin: { style: BorderStyle.SINGLE, size: 4, color: theme.colors.tableBorder },
    medium: { style: BorderStyle.SINGLE, size: 8, color: theme.colors.tableBorder },
  };
}

// --- ヘッダー・フッター ---

function createContentHeader(theme) {
  return new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.colors.secondary, space: 4 } },
        children: [
          new TextRun({ text: "あしたの会計事務所", font: FONTS.default, size: SIZES.small, color: theme.colors.secondary, bold: true }),
          new TextRun({ text: "\t税務顧問サービスのご提案", font: FONTS.default, size: SIZES.small, color: theme.colors.bodyTextLight }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      }),
    ],
  });
}

function createContentFooter(theme) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: theme.colors.tableBorder, space: 4 } },
        children: [
          new TextRun({ text: "Confidential  |  ", font: FONTS.default, size: SIZES.small, color: theme.colors.bodyTextLight }),
          new TextRun({ text: "Page ", font: FONTS.default, size: SIZES.small, color: theme.colors.bodyTextLight }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONTS.default, size: SIZES.small, color: theme.colors.bodyTextLight }),
        ],
      }),
    ],
  });
}

// --- ページセクション設定 ---

function coverPageProperties() {
  return {
    page: {
      size: { width: PAGE.width, height: PAGE.height },
      margin: MARGINS.cover,
    },
  };
}

function contentPageProperties() {
  return {
    page: {
      size: { width: PAGE.width, height: PAGE.height },
      margin: MARGINS.content,
    },
  };
}

module.exports = {
  // テーマ非依存の定数
  FONTS,
  SIZES,
  PAGE,
  MARGINS,
  CONTENT_WIDTH,
  NO_BORDERS,
  CELL_MARGINS,
  NUMBERING_CONFIG,

  // テーマ依存の定数生成
  thinBorders,
  documentStyles,

  // ファクトリ関数 — 見出し・本文
  sectionHeading,
  sectionNumber,
  subHeading,
  bodyText,
  bulletItem,
  spacer,

  // ファクトリ関数 — テーブルセル
  headerCell,
  dataCell,
  highlightCell,
  priceCell,
  alternatingFill,
  getBorders,

  // ファクトリ関数 — ヘッダー・フッター・ページ設定
  createContentHeader,
  createContentFooter,
  coverPageProperties,
  contentPageProperties,
};
