// 提案書生成スクリプト
// 使い方: node create_proposal.js <config.json> [output.docx]
// config.json のスキーマは CLAUDE.md を参照

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition,
} = require("docx");

// ── 設定ファイル読み込み ──
const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node create_proposal.js <config.json> [output.docx]");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// 出力先
const outputPath = process.argv[3] || config.outputPath || path.join(
  "G:\\共有ドライブ\\06_見込み客",
  config.clientName,
  `税務顧問サービスのご提案_あしたの会計事務所_${config.clientName}.docx`
);

// ── カラーパレット ──
const NAVY = "1B3A5C";
const ACCENT = "2E75B6";
const LIGHT_BG = "EDF3F8";
const MEDIUM_BG = "D5E8F0";
const WHITE = "FFFFFF";
const TEXT_DARK = "333333";
const TEXT_LIGHT = "666666";
const BORDER_COLOR = "B0C4DE";

// ── ヘルパー関数 ──
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
      children: [new TextRun({ text, bold: true, font: "Yu Gothic", size: 20, color: WHITE })],
    })],
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: { fill: opts.fill || WHITE, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan || undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text,
        font: "Yu Gothic",
        size: 20,
        color: opts.color || TEXT_DARK,
        bold: opts.bold || false,
      })],
    })],
  });
}

function highlightCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: { fill: MEDIUM_BG, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.columnSpan || undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, font: "Yu Gothic", size: 22, bold: true, color: NAVY })],
    })],
  });
}

// ── ページ設定 (A4) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_LR = 1440;
const CONTENT_W = PAGE_W - MARGIN_LR * 2; // 9026

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    children: [new TextRun({ text, font: "Yu Gothic", size: 28, bold: true, color: NAVY })],
  });
}

function sectionNumber(num, text) {
  return sectionHeading(`${num}. ${text}`);
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.afterSpacing || 160 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [new TextRun({ text, font: "Yu Gothic", size: 20, color: TEXT_DARK })],
  });
}

function bulletItem(text, reference = "bullets") {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: "Yu Gothic", size: 20, color: TEXT_DARK })],
  });
}

function spacer(h = 200) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

function subHeading(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "Yu Gothic", size: 22, bold: true, color: NAVY })],
  });
}

// ── 料金テーブル生成 ──
function pricingTable(items, colWidths) {
  // items: [{ name, detail, amount }] where amount is string like "32,000円" or "-3,000円"
  // colWidths: [nameW, detailW, amountW]
  const [c1, c2, c3] = colWidths;
  const totalW = c1 + c2 + c3;

  const rows = [
    new TableRow({
      children: [headerCell("項目", c1), headerCell("内訳", c2), headerCell("料金（税別）", c3)],
    }),
  ];

  items.forEach((item, i) => {
    const fill = i % 2 === 0 ? LIGHT_BG : WHITE;
    if (item.isTotal) {
      rows.push(new TableRow({
        children: [
          highlightCell("", c1),
          highlightCell(item.detail, c2, { align: AlignmentType.RIGHT }),
          highlightCell(item.amount, c3, { align: AlignmentType.RIGHT }),
        ],
      }));
    } else {
      rows.push(new TableRow({
        children: [
          dataCell(item.name, c1, { bold: !!item.name, fill }),
          dataCell(item.detail || "", c2, { fill }),
          dataCell(item.amount, c3, { align: AlignmentType.RIGHT, fill }),
        ],
      }));
    }
  });

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows,
  });
}

// ── 年間サマリーテーブル ──
function annualSummaryTable(plans) {
  // plans: { planA?: { label, monthlyTotal, annualTotal, grandTotal }, planB?: { ... } }
  const hasBoth = plans.planA && plans.planB;
  if (hasBoth) {
    const colWidths = [3000, 3000, 3000];
    return new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({
          children: [
            headerCell("", 3000),
            headerCell(plans.planA.label, 3000),
            headerCell(plans.planB.label, 3000),
          ],
        }),
        new TableRow({
          children: [
            dataCell("月次料金 × 12ヶ月", 3000, { bold: true, fill: LIGHT_BG }),
            dataCell(plans.planA.monthlyTotal, 3000, { align: AlignmentType.RIGHT, fill: LIGHT_BG }),
            dataCell(plans.planB.monthlyTotal, 3000, { align: AlignmentType.RIGHT, fill: LIGHT_BG }),
          ],
        }),
        new TableRow({
          children: [
            dataCell("年次料金", 3000, { bold: true }),
            dataCell(plans.planA.annualTotal, 3000, { align: AlignmentType.RIGHT }),
            dataCell(plans.planB.annualTotal, 3000, { align: AlignmentType.RIGHT }),
          ],
        }),
        new TableRow({
          children: [
            highlightCell("年間合計（税別）", 3000),
            highlightCell(plans.planA.grandTotal, 3000, { align: AlignmentType.RIGHT }),
            highlightCell(plans.planB.grandTotal, 3000, { align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    });
  } else {
    // 単一プラン
    const plan = plans.planA || plans.planB;
    const colWidths = [4500, 4500];
    return new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({
          children: [headerCell("", 4500), headerCell("金額（税別）", 4500)],
        }),
        new TableRow({
          children: [
            dataCell("月次料金 × 12ヶ月", 4500, { bold: true, fill: LIGHT_BG }),
            dataCell(plan.monthlyTotal, 4500, { align: AlignmentType.RIGHT, fill: LIGHT_BG }),
          ],
        }),
        new TableRow({
          children: [
            dataCell("年次料金", 4500, { bold: true }),
            dataCell(plan.annualTotal, 4500, { align: AlignmentType.RIGHT }),
          ],
        }),
        new TableRow({
          children: [
            highlightCell("年間合計（税別）", 4500),
            highlightCell(plan.grandTotal, 4500, { align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    });
  }
}

// ══════ ドキュメント生成 ══════

// --- 表紙ページ ---
const coverPage = {
  properties: {
    page: {
      size: { width: PAGE_W, height: PAGE_H },
      margin: { top: 1440, right: MARGIN_LR, bottom: 1440, left: MARGIN_LR },
    },
  },
  children: [
    spacer(2400),
    new Paragraph({
      spacing: { after: 400 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "税務顧問サービスのご提案", font: "Yu Gothic", size: 52, bold: true, color: NAVY })],
    }),
    spacer(100),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: "Tax Advisory Service Proposal", font: "Yu Gothic", size: 24, color: ACCENT })],
    }),
    new Paragraph({
      spacing: { after: 800 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
      children: [],
    }),
    spacer(200),
    // 宛先（クライアント名）
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `【${config.clientName}】 御中`, font: "Yu Gothic", size: 28, bold: true, color: NAVY })],
    }),
    spacer(200),
    // 日付
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: config.date, font: "Yu Gothic", size: 24, color: TEXT_LIGHT })],
    }),
    spacer(200),
    // 事務所名
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "あしたの会計事務所 税理士法人", font: "Yu Gothic", size: 32, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "つながりを大切にする 次世代型の会計事務所", font: "Yu Gothic", size: 20, color: TEXT_LIGHT })],
    }),
  ],
};

// --- コンテンツページ ---
const contentChildren = [];

// 1. はじめに
contentChildren.push(
  sectionNumber(1, "はじめに"),
  bodyText("拝啓 時下ますますご清栄のこととお慶び申し上げます。平素は格別のご高配を賜り、厚く御礼申し上げます。"),
);
// カスタム挨拶文（議事録から生成）
if (config.introduction && config.introduction.length > 0) {
  config.introduction.forEach(line => contentChildren.push(bodyText(line)));
} else {
  contentChildren.push(
    bodyText("先日は顧問契約に関するご相談を賜り、誠にありがとうございました。お打ち合わせの内容を踏まえ、貴社の事業フェーズ・ビジネスモデルに最適化した税務顧問サービスをご提案いたします。"),
    bodyText("スタートアップの貴重なリソースを本業に集中いただけるよう、バックオフィス業務を全面的にサポートいたします。"),
  );
}
contentChildren.push(spacer(200));

// 2. 貴社の課題認識
contentChildren.push(
  sectionNumber(2, "貴社の課題認識"),
  bodyText("お打ち合わせでお伺いした内容をもとに、以下の課題を認識しております。"),
  spacer(100),
);

const challengeColWidths = [2200, CONTENT_W - 2200];
contentChildren.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: challengeColWidths,
  rows: [
    new TableRow({
      children: [headerCell("課題", 2200), headerCell("詳細", CONTENT_W - 2200)],
    }),
    ...config.challenges.map((c, i) => new TableRow({
      children: [
        dataCell(c.title, 2200, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
        dataCell(c.detail, CONTENT_W - 2200, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
      ],
    })),
  ],
}));
contentChildren.push(spacer(400));

// 3. サービス内容
contentChildren.push(
  sectionNumber(3, "サービス内容"),
  bodyText("以下のサービスをワンストップでご提供いたします。"),
  spacer(100),
);

const serviceColWidths = [2800, CONTENT_W - 2800];
contentChildren.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: serviceColWidths,
  rows: [
    new TableRow({
      children: [headerCell("サービス項目", 2800), headerCell("内容", CONTENT_W - 2800)],
    }),
    ...config.services.map((s, i) => new TableRow({
      children: [
        dataCell(s.name, 2800, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
        dataCell(s.detail, CONTENT_W - 2800, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
      ],
    })),
  ],
}));

contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

// 4. 料金プラン
contentChildren.push(
  sectionNumber(4, "料金プラン"),
  bodyText("貴社の事業規模およびご要望を踏まえ、以下の料金プランをご提案申し上げます。"),
);

const pricingColWidths = [3000, 3026, 3000];

// プランA
if (config.pricing.planA) {
  const pA = config.pricing.planA;
  contentChildren.push(
    subHeading(`プランA ｜ ${pA.planName || "経理サポート（記帳代行）プラン"}`),
    bodyText("■ 月次料金"),
    pricingTable(pA.monthly, pricingColWidths),
    spacer(200),
    bodyText("■ 年次料金"),
    pricingTable(pA.annual, pricingColWidths),
    spacer(300),
  );
}

// プランB
if (config.pricing.planB) {
  const pB = config.pricing.planB;
  contentChildren.push(
    subHeading(`プランB ｜ ${pB.planName || "経理サポート（自計化）＋ 相談サポートプラン"}`),
    bodyText("■ 月次料金"),
    pricingTable(pB.monthly, pricingColWidths),
    spacer(200),
    bodyText("■ 年次料金"),
    pricingTable(pB.annual, pricingColWidths),
    spacer(300),
  );
}

// 年間サマリー
contentChildren.push(
  bodyText("■ 年間費用サマリー（税別）"),
  annualSummaryTable(config.pricing.summary),
  spacer(100),
  bodyText("※ 上記金額に別途消費税がかかります。"),
);

// 追加注記
if (config.pricing.notes && config.pricing.notes.length > 0) {
  config.pricing.notes.forEach(n => contentChildren.push(bodyText(`※ ${n}`)));
}

contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

// 5. 備考・補足事項
contentChildren.push(sectionNumber(5, "備考・補足事項"));

if (config.notes && config.notes.length > 0) {
  config.notes.forEach(section => {
    contentChildren.push(subHeading(section.title));
    if (section.paragraphs) {
      section.paragraphs.forEach(p => contentChildren.push(bodyText(p)));
    }
    if (section.bullets) {
      section.bullets.forEach(b => contentChildren.push(bulletItem(b)));
    }
  });
} else {
  // デフォルト備考
  contentChildren.push(
    subHeading("（1）経理サポートについて"),
    bodyText("事業を行うにあたって絶対に必要となる帳簿作成支援業務、決算申告業務、税務手続業務を、弊社が責任をもって実施させていただきます。経理顧問が含まれますので、経理に関するご質問はいつでも受付しております。"),
    bulletItem("記帳代行プランの場合：▲6,000円/月（税別）で4か月に1回、▲5,000円/月で3か月に1回、▲4,000円/月で2か月に1回の納品に変更可能です。"),
    bulletItem("自計化プランの場合：記帳チェックは概ね3か月ごとに実施いたします（ご連絡いただいたタイミングでも対応可）。"),
    bulletItem("消費税等申告報酬は簡易課税を前提にお見積りしています。原則課税の場合は50,000円〜＋税となります。"),
    bulletItem("消費税の計算方法が原則課税となる場合は、証憑管理及び記帳方針について大幅な変更が予想されます。その際、顧問料等について別途ご相談させていただく可能性がございます。"),
    bulletItem("スポットで面談を実施する場合は、30分 8,000円（税別）で実施可能です。"),

    subHeading("（2）相談サポートについて（プランBの場合）"),
    bodyText("会計・経理・税務、その他の分野に関する各種のご質問事項やお困り・お悩み事項のご相談に対応させていただきます。面談、ビデオ会議、電話、チャットなどの方法で対応いたします。"),
    bodyText("定例会議は年に2回（期首・期末）としてお見積りしております。2,000円/月（税別）で定例会議の回数を1回増やすことが可能です。"),
    bodyText("複雑な事項など対面での説明を要する以下の事項については面談にて実施させていただきます。"),
    bulletItem("役員報酬の設定"),
    bulletItem("決算前ミーティング（期末着地見込み、納税額予測、消費税シミュレーション、節税提案）"),
    bulletItem("半期の業績推移、各種論点のレクチャーなど"),

    subHeading("（3）コミュニケーション体制"),
    bodyText("「いつでも相談できる安心感」を重視し、専用チャットグループを通じていつでも投稿可能な環境を整備します。回答は基本的に平日業務時間内での対応となりますが、緊急時は柔軟に対応させていただきます。"),
    bodyText("お打ち合わせは原則としてオンラインで実施いたします。必要に応じてご訪問も承ります（交通費別途）。"),

    subHeading("（4）有効期限・お支払条件"),
    bodyText("本お見積書の有効期限は発効日から2週間です。お支払いは当月分を当月28日支払（銀行引落）とさせていただいております。"),
  );
}

contentChildren.push(spacer(200));

// 6. ご契約後の流れ
contentChildren.push(
  sectionNumber(6, "ご契約後の流れ"),
  bodyText("ご契約後は、以下のステップで円滑に業務を開始いたします。"),
  spacer(100),
);

const defaultSteps = [
  ["1", "本提案書のご確認・ご契約", "内容にご同意いただければ契約へ。"],
  ["2", "顧問契約書の締結", "当事務所よりドラフトをお送りします。"],
  ["3", "履歴事項全部証明書PDFのご提供", "貴社にてご手配をお願いいたします。"],
  ["4", "設立届出・青色申告承認申請書提出", "当事務所にて対応いたします。"],
  ["5", "freeeアカウント設定・連携", "口座連携・勘定科目マッピングを設定。"],
  ["6", "役員報酬額の決定", "設立3ヶ月以内に事業計画を踏まえて決定。"],
  ["7", "月次記帳開始", "継続的な記帳・月次レビューを開始。"],
];
const steps = config.steps || defaultSteps;
const stepColWidths = [900, 3600, CONTENT_W - 4500];

contentChildren.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: stepColWidths,
  rows: [
    new TableRow({
      children: [headerCell("STEP", 900), headerCell("内容", 3600), headerCell("備考", CONTENT_W - 4500)],
    }),
    ...steps.map((s, i) => new TableRow({
      children: [
        dataCell(s[0], 900, { align: AlignmentType.CENTER, bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
        dataCell(s[1], 3600, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
        dataCell(s[2], CONTENT_W - 4500, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
      ],
    })),
  ],
}));

contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

// 7. 当事務所の概要
contentChildren.push(
  sectionNumber(7, "当事務所の概要"),
  spacer(100),
);

const officeInfo = [
  ["事務所名", "あしたの会計事務所 税理士法人"],
  ["所在地", "〒110-0016 東京都台東区台東4-13-20 ハクセンビル4階"],
  ["e-mail", "[mail@ashitak.com]"],
  ["コンセプト", "つながりを大切にする 次世代型の会計事務所"],
];
const officeColWidths = [2500, CONTENT_W - 2500];

contentChildren.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: officeColWidths,
  rows: officeInfo.map((row, i) => new TableRow({
    children: [
      dataCell(row[0], 2500, { bold: true, fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
      dataCell(row[1], CONTENT_W - 2500, { fill: i % 2 === 0 ? LIGHT_BG : WHITE }),
    ],
  })),
}));

contentChildren.push(
  spacer(600),
  new Paragraph({
    spacing: { after: 100 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 8 } },
    children: [],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "本提案書の内容についてご不明な点がございましたら、お気軽にご連絡ください。", font: "Yu Gothic", size: 20, color: TEXT_DARK })],
  }),
  spacer(200),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "あしたの会計事務所 税理士法人", font: "Yu Gothic", size: 24, bold: true, color: NAVY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 50 },
    children: [new TextRun({ text: "〒110-0016 東京都台東区台東4-13-20 ハクセンビル4階", font: "Yu Gothic", size: 18, color: TEXT_LIGHT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "E-mail: mail@ashitak.com", font: "Yu Gothic", size: 18, color: TEXT_LIGHT })],
  }),
);

// ── ドキュメント組み立て ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Yu Gothic", size: 20 } } },
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
    coverPage,
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
      children: contentChildren,
    },
  ],
});

// ── 出力 ──
// 出力先ディレクトリを作成
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log("提案書を作成しました:", outputPath);
});
