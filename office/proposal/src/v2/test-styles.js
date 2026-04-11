// test-styles.js
// docx-styles.js のテーマ対応をテスト — 3テーマ分のdocxを生成

const fs = require("fs");
const path = require("path");
const { Document, Packer, Table, TableRow, Paragraph, TextRun, BorderStyle, AlignmentType, WidthType } = require("docx");

const S = require("./styles/docx-styles");
const { getTheme, listThemes } = require("./styles/themes");

const OUTPUT_DIR = path.join(__dirname, "test-output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function generateTestDoc(theme) {
  const c = theme.colors;
  const CW = S.CONTENT_WIDTH;

  // ── 表紙ページ ──
  const coverChildren = [
    S.spacer(2400),
    new Paragraph({
      spacing: { after: 400 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: c.secondary, space: 8 } },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "税務顧問サービスのご提案", font: S.FONTS.default, size: S.SIZES.coverTitle, bold: true, color: c.primary })],
    }),
    S.spacer(100),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: "Tax Advisory Service Proposal", font: S.FONTS.default, size: S.SIZES.heading2, color: c.secondary })],
    }),
    new Paragraph({
      spacing: { after: 800 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: c.secondary, space: 8 } },
      children: [],
    }),
    S.spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `【テスト株式会社】 御中`, font: S.FONTS.default, size: S.SIZES.heading1, bold: true, color: c.primary })],
    }),
    S.spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `2026年4月8日 — テーマ: ${theme.displayName}`, font: S.FONTS.default, size: S.SIZES.heading2, color: c.bodyTextLight })],
    }),
    S.spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "あしたの会計事務所 税理士法人", font: S.FONTS.default, size: S.SIZES.officeName, bold: true, color: c.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "つながりを大切にする 次世代型の会計事務所", font: S.FONTS.default, size: S.SIZES.body, color: c.bodyTextLight })],
    }),
  ];

  // ── コンテンツページ ──
  const content = [];

  // セクション見出し・本文
  content.push(
    S.sectionNumber(1, "はじめに", theme),
    S.bodyText("これはテーマ対応テストの本文です。", theme),
    S.bodyText(`テーマ: ${theme.displayName}`, theme),
    S.spacer(200),
  );

  // サブ見出し・箇条書き
  content.push(
    S.subHeading("サブ見出しテスト", theme),
    S.bulletItem("箇条書き項目1", theme),
    S.bulletItem("箇条書き項目2", theme),
    S.spacer(200),
  );

  // 課題テーブル
  content.push(
    S.sectionNumber(2, "テーブルテスト", theme),
    S.spacer(100),
  );

  const chalCols = [2200, CW - 2200];
  content.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: chalCols,
    rows: [
      new TableRow({
        children: [S.headerCell("課題", 2200, theme), S.headerCell("詳細", CW - 2200, theme)],
      }),
      ...["設立届出の提出", "外貨建取引処理", "消費税還付対応"].map((title, i) =>
        new TableRow({
          children: [
            S.dataCell(title, 2200, theme, { bold: true, fill: S.alternatingFill(i, theme) }),
            S.dataCell(`${title}に関する詳細説明。`, CW - 2200, theme, { fill: S.alternatingFill(i, theme) }),
          ],
        })
      ),
    ],
  }));
  content.push(S.spacer(400));

  // 料金テーブル
  content.push(
    S.sectionNumber(3, "料金プラン", theme),
    S.subHeading("プランA ｜ 経理サポート（記帳代行）プラン", theme),
    S.bodyText("■ 月次料金", theme),
  );

  const pCols = [3000, 3026, 3000];
  content.push(new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: pCols,
    rows: [
      new TableRow({
        children: [S.headerCell("項目", 3000, theme), S.headerCell("内訳", 3026, theme), S.headerCell("料金（税別）", 3000, theme)],
      }),
      new TableRow({
        children: [
          S.dataCell("経理サポート（記帳代行）", 3000, theme, { bold: true, fill: S.alternatingFill(0, theme) }),
          S.dataCell("〜100仕訳まで（売上1億未満）", 3026, theme, { fill: S.alternatingFill(0, theme) }),
          S.priceCell("35,000円", 3000, theme, { fill: S.alternatingFill(0, theme) }),
        ],
      }),
      new TableRow({
        children: [
          S.dataCell("出精値引き", 3000, theme, { bold: true, fill: S.alternatingFill(1, theme) }),
          S.dataCell("仕訳数が少量のため", 3026, theme, { fill: S.alternatingFill(1, theme) }),
          S.priceCell("-5,000円", 3000, theme, { fill: S.alternatingFill(1, theme) }),
        ],
      }),
      new TableRow({
        children: [
          S.highlightCell("", 3000, theme),
          S.highlightCell("月次料金 合計", 3026, theme, { align: AlignmentType.RIGHT }),
          S.highlightCell("30,000円", 3000, theme, { align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  }));
  content.push(S.spacer(300));

  // 契約フロー
  content.push(
    S.sectionNumber(4, "ご契約後の流れ", theme),
    S.spacer(100),
  );
  const sCols = [900, 3600, CW - 4500];
  content.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: sCols,
    rows: [
      new TableRow({
        children: [S.headerCell("STEP", 900, theme), S.headerCell("内容", 3600, theme), S.headerCell("備考", CW - 4500, theme)],
      }),
      ...["提案書確認", "契約締結", "記帳開始"].map((s, i) =>
        new TableRow({
          children: [
            S.dataCell(String(i + 1), 900, theme, { align: AlignmentType.CENTER, bold: true, fill: S.alternatingFill(i, theme) }),
            S.dataCell(s, 3600, theme, { fill: S.alternatingFill(i, theme) }),
            S.dataCell("備考テキスト", CW - 4500, theme, { fill: S.alternatingFill(i, theme) }),
          ],
        })
      ),
    ],
  }));

  return new Document({
    styles: S.documentStyles(theme),
    numbering: { config: S.NUMBERING_CONFIG },
    sections: [
      { properties: S.coverPageProperties(), children: coverChildren },
      {
        properties: S.contentPageProperties(),
        headers: { default: S.createContentHeader(theme) },
        footers: { default: S.createContentFooter(theme) },
        children: content,
      },
    ],
  });
}

// ── メイン: 3テーマ分生成 ──
async function main() {
  const themes = listThemes();
  console.log(`テーマ一覧: ${themes.map(t => t.name).join(", ")}`);

  for (const { name } of themes) {
    const theme = getTheme(name);
    const doc = generateTestDoc(theme);
    const buffer = await Packer.toBuffer(doc);
    const outPath = path.join(OUTPUT_DIR, `test-styles-${name}.docx`);
    fs.writeFileSync(outPath, buffer);
    console.log(`  ${name}: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
  console.log("全テーマのテストdocx生成完了");
}

main().catch(err => { console.error(err); process.exit(1); });
