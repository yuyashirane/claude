const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition,
} = require("docx");

// ── Color Palette ──
const NAVY = "1B3A5C";
const ACCENT = "2E75B6";
const LIGHT_BG = "EDF3F8";
const MEDIUM_BG = "D5E8F0";
const WHITE = "FFFFFF";
const TEXT_DARK = "333333";
const TEXT_LIGHT = "666666";
const BORDER_COLOR = "B0C4DE";

// ── Helpers ──
const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, font: "Yu Gothic", size: 20, color: WHITE })]
    })]
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: { fill: opts.fill || WHITE, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text,
        font: "Yu Gothic",
        size: 20,
        color: TEXT_DARK,
        bold: opts.bold || false,
      })]
    })]
  });
}

// ── Page dimensions (A4) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_LR = 1440;
const CONTENT_W = PAGE_W - MARGIN_LR * 2; // 9026

// ── Section heading ──
function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    children: [new TextRun({ text, font: "Yu Gothic", size: 28, bold: true, color: NAVY })],
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.afterSpacing || 160 },
    children: [new TextRun({ text, font: "Yu Gothic", size: 20, color: TEXT_DARK })],
  });
}

function spacer(h = 200) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

// ══════ BUILD DOCUMENT ══════
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Yu Gothic", size: 20 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Yu Gothic", color: NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Yu Gothic", color: ACCENT },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u25CF", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    // ══════ COVER PAGE ══════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: 1440, right: MARGIN_LR, bottom: 1440, left: MARGIN_LR },
        },
      },
      children: [
        spacer(2400),

        // Accent line
        new Paragraph({
          spacing: { after: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
          children: [],
        }),

        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "税務顧問サービスのご提案", font: "Yu Gothic", size: 52, bold: true, color: NAVY })],
        }),

        spacer(100),

        // Subtitle
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Tax Advisory Service Proposal", font: "Yu Gothic", size: 24, color: ACCENT })],
        }),

        // Accent line
        new Paragraph({
          spacing: { after: 800 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
          children: [],
        }),

        spacer(600),

        // Date
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "2026年3月", font: "Yu Gothic", size: 24, color: TEXT_LIGHT })],
        }),

        // Firm name
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "あしたの会計事務所", font: "Yu Gothic", size: 32, bold: true, color: NAVY })],
        }),

        // Tagline
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "AIを活用した次世代型の税務サービス", font: "Yu Gothic", size: 20, color: TEXT_LIGHT })],
        }),
      ],
    },

    // ══════ CONTENT PAGES ══════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: 1800, right: MARGIN_LR, bottom: 1440, left: MARGIN_LR },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
              children: [
                new TextRun({ text: "あしたの会計事務所", font: "Yu Gothic", size: 16, color: ACCENT, bold: true }),
                new TextRun({ text: "\t税務顧問サービスのご提案", font: "Yu Gothic", size: 16, color: TEXT_LIGHT }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR, space: 4 } },
              children: [
                new TextRun({ text: "Confidential  |  ", font: "Yu Gothic", size: 16, color: TEXT_LIGHT }),
                new TextRun({ text: "Page ", font: "Yu Gothic", size: 16, color: TEXT_LIGHT }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Yu Gothic", size: 16, color: TEXT_LIGHT }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ── はじめに ──
        sectionHeading("はじめに"),
        bodyText("このたびは貴社の税務顧問につきましてご相談いただき、誠にありがとうございます。"),
        bodyText("先日の打ち合わせの内容を踏まえ、貴社の事業フェーズ・ビジネスモデルに最適化した税務顧問サービスをご提案いたします。"),
        bodyText("スタートアップの貴重なリソースを本業に集中いただけるよう、バックオフィス業務を全面的にサポートいたします。", { afterSpacing: 400 }),

        // ── 貴社の課題認識 ──
        sectionHeading("貴社の課題認識"),
        bodyText("お打ち合わせでお伺いした内容をもとに、以下の課題を認識しております。"),
        spacer(100),

        // 課題テーブル
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2200, CONTENT_W - 2200],
          rows: [
            new TableRow({
              children: [
                headerCell("課題", 2200),
                headerCell("詳細", CONTENT_W - 2200),
              ],
            }),
            ...([
              ["役員報酬の決定", "設立3ヶ月以内に年間事業計画を踏まえた額の設定が必要。適正な報酬は税務リスクに関わります。"],
              ["消費税還付", "輸出免税により、国内仕入の消費税が還付対象。初年度からの課税事業者選択が有利。"],
              ["1期目の税務戦略", "役員報酬を最低限に抑え、法人名義の社宅家賃・事業経費で対応する戦略が有効。"],
              ["BPOニーズ", "オペレーションにリソースを集中するため、バックオフィス業務の外部委託が不可欠。"],
            ].map((r, i) => new TableRow({
              children: [
                dataCell(r[0], 2200, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
                dataCell(r[1], CONTENT_W - 2200, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
              ],
            }))),
          ],
        }),

        spacer(400),

        // ── サービス内容 ──
        sectionHeading("サービス内容"),
        bodyText("以下のサービスをワンストップでご提供いたします。"),
        spacer(100),

        // サービステーブル（メイン）
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2800, CONTENT_W - 2800],
          rows: [
            new TableRow({
              children: [
                headerCell("サービス項目", 2800),
                headerCell("内容", CONTENT_W - 2800),
              ],
            }),
            ...([
              ["記帳代行・月次レビュー", "freeeを活用した記帳代行。月次で試算表をレビューし異常値をチェック。"],
              ["決算申告", "法人税・消費税の確定申告書作成・提出まで一貫対応。"],
              ["設立届出・青色申告", "税務署への設立届出書・青色申告承認申請書の作成・提出。"],
              ["消費税還付対応", "輸出免税に伴う消費税還付申告の対応・課税事業者選択届出。"],
              ["freee導入支援", "アカウント設定・口座連携・勘定科目マッピングの初期設定。"],
              ["税務相談", "役員報酬・旅費規程・税務戦略等について随時相談可能。"],
            ].map((r, i) => new TableRow({
              children: [
                dataCell(r[0], 2800, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
                dataCell(r[1], CONTENT_W - 2800, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
              ],
            }))),
          ],
        }),

        // Page break before pricing
        new Paragraph({ children: [new PageBreak()] }),

        // ── 料金プラン ──
        sectionHeading("料金プラン"),
        spacer(100),

        // 料金テーブル
        new Table({
          width: { size: 6000, type: WidthType.DXA },
          columnWidths: [3000, 3000],
          rows: [
            new TableRow({
              children: [
                headerCell("項目", 3000),
                headerCell("金額（税別）", 3000),
              ],
            }),
            ...([
              ["月額顧問料", "40,000円 / 月"],
              ["決算申告料", "月額顧問料に含む"],
              ["記帳代行", "月額顧問料に含む"],
            ].map((r, i) => new TableRow({
              children: [
                dataCell(r[0], 3000, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
                dataCell(r[1], 3000, { align: AlignmentType.RIGHT, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
              ],
            }))),
            // Total row - highlighted
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 3000, type: WidthType.DXA },
                  borders: thinBorders,
                  shading: { fill: MEDIUM_BG, type: ShadingType.CLEAR },
                  margins: cellMargins,
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({
                    children: [new TextRun({ text: "年額合計", font: "Yu Gothic", size: 22, bold: true, color: NAVY })]
                  })]
                }),
                new TableCell({
                  width: { size: 3000, type: WidthType.DXA },
                  borders: thinBorders,
                  shading: { fill: MEDIUM_BG, type: ShadingType.CLEAR },
                  margins: cellMargins,
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "480,000円 / 年", font: "Yu Gothic", size: 22, bold: true, color: NAVY })]
                  })]
                }),
              ],
            }),
          ],
        }),

        spacer(100),
        bodyText("※上記金額に別途消費税がかかります。"),
        bodyText("※設立届出・青色申告承認申請書の作成は上記料金に含まれます。", { afterSpacing: 400 }),

        // ── 今後の流れ ──
        sectionHeading("今後の流れ"),
        spacer(100),

        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [900, 3600, CONTENT_W - 4500],
          rows: [
            new TableRow({
              children: [
                headerCell("STEP", 900),
                headerCell("内容", 3600),
                headerCell("備考", CONTENT_W - 4500),
              ],
            }),
            ...([
              ["1", "本提案書のご確認・ご契約", "内容にご同意いただければ契約へ。"],
              ["2", "履歴事項全部証明書PDFのご提供", "貴社にてご手配をお願いいたします。"],
              ["3", "顧問契約書の締結", "当事務所よりドラフトをお送りします。"],
              ["4", "設立届出・青色申告承認申請書提出", "当事務所にて対応いたします。"],
              ["5", "freeeアカウント設定・連携", "口座連携・勘定科目マッピングを設定。"],
              ["6", "役員報酬額の決定", "設立3ヶ月以内に事業計画を踏まえて決定。"],
              ["7", "月次記帳開始", "継続的な記帳・月次レビューを開始。"],
            ].map((r, i) => new TableRow({
              children: [
                dataCell(r[0], 900, { align: AlignmentType.CENTER, bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
                dataCell(r[1], 3600, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
                dataCell(r[2], CONTENT_W - 4500, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
              ],
            }))),
          ],
        }),

        // Page break before profile
        new Paragraph({ children: [new PageBreak()] }),

        // ── 担当者プロフィール ──
        sectionHeading("担当者プロフィール"),
        spacer(100),

        // Profile box using table
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2200, CONTENT_W - 2200],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2200, type: WidthType.DXA },
                  borders: { top: { style: BorderStyle.SINGLE, size: 2, color: ACCENT }, bottom: { style: BorderStyle.SINGLE, size: 2, color: ACCENT }, left: { style: BorderStyle.SINGLE, size: 6, color: ACCENT }, right: noBorder },
                  shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                  margins: { top: 200, bottom: 200, left: 200, right: 120 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 80 },
                      children: [new TextRun({ text: "税理士", font: "Yu Gothic", size: 18, color: ACCENT })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: "畠山 謙人", font: "Yu Gothic", size: 28, bold: true, color: NAVY })],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: CONTENT_W - 2200, type: WidthType.DXA },
                  borders: { top: { style: BorderStyle.SINGLE, size: 2, color: ACCENT }, bottom: { style: BorderStyle.SINGLE, size: 2, color: ACCENT }, left: noBorder, right: { style: BorderStyle.SINGLE, size: 2, color: ACCENT } },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [
                    new Paragraph({
                      spacing: { after: 120 },
                      children: [new TextRun({
                        text: "有限責任監査法人トーマツにて監査業務に従事後、株式会社サイバーエージェントにて経営管理部門を担当。",
                        font: "Yu Gothic", size: 20, color: TEXT_DARK,
                      })],
                    }),
                    new Paragraph({
                      children: [new TextRun({
                        text: "その後独立し、畠山謙人税理士事務所を開業。スタートアップから上場企業まで幅広いフェーズの企業を支援。AIを活用した次世代型の税務サービスを提供しています。",
                        font: "Yu Gothic", size: 20, color: TEXT_DARK,
                      })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        spacer(600),

        // ── Closing ──
        new Paragraph({
          spacing: { after: 100 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 8 } },
          children: [],
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({
            text: "本提案書の内容についてご不明な点がございましたら、お気軽にご連絡ください。",
            font: "Yu Gothic", size: 20, color: TEXT_DARK,
          })],
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({
            text: "あしたの会計事務所",
            font: "Yu Gothic", size: 24, bold: true, color: NAVY,
          })],
        }),
      ],
    },
  ],
});

// ── Output ──
const OUTPUT = "C:\\Users\\yuya_\\Downloads\\税務顧問サービスのご提案_あしたの会計事務所.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log("Created:", OUTPUT);
});
