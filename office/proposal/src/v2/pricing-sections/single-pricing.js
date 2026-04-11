// pricing-sections/single-pricing.js
// セクション4: 料金プラン（proposal_single モード）

const { Table, TableRow, Paragraph, PageBreak, WidthType, AlignmentType } = require("docx");
const S = require("../styles/docx-styles");
const calc = require("../pricing-calculator");

const PRICING_COL_WIDTHS = [3000, 3026, 3000];
const PRICING_TABLE_WIDTH = 9026;

/**
 * 金額を「XX,XXX円」形式にフォーマット
 */
function formatAmount(amount) {
  if (amount < 0) return `-${Math.abs(amount).toLocaleString()}円`;
  return `${amount.toLocaleString()}円`;
}

/**
 * 納品頻度のラベル
 */
function frequencyLabel(freq) {
  const labels = {
    monthly: "毎月納品",
    every2months: "2ヶ月に1回納品",
    every3months: "3ヶ月に1回納品",
    every4months: "4ヶ月に1回納品",
    every6months: "6ヶ月に1回納品",
  };
  return labels[freq] || freq;
}

/**
 * 月次料金テーブルの行データを構築（manualPricing / 自動計算 共通）
 */
function buildMonthlyItems(config) {
  const pricing = config.pricing;
  const isManual = pricing.manualPricing && pricing.manualPricing.enabled;
  const items = [];

  if (isManual) {
    // manualPricing: config に書かれた基本料金を使用
    items.push({
      name: pricing.manualPricing.monthly.baseLabel || "経理サポート",
      detail: "",
      amount: pricing.manualPricing.monthly.base,
    });
  } else {
    // 自動計算
    const salesClass = config.client.salesClass;
    const txCount = config.client.monthlyTransactions;
    const table = calc.loadPricingTable();

    let moduleName;
    let moduleLabel;
    if (pricing.selectedModules.bookkeeping) {
      moduleName = "bookkeeping";
      moduleLabel = table.modules.bookkeeping.label;
    } else if (pricing.selectedModules.selfBookkeeping) {
      moduleName = "selfBookkeeping";
      moduleLabel = table.modules.selfBookkeeping.label;
    }

    const fee = calc.calculateModuleMonthlyFee({ module: moduleName, salesClass, transactionCount: txCount });
    const classLabel = table.salesClasses[salesClass].label;

    items.push({
      name: moduleLabel,
      detail: classLabel,
      amount: fee.total,
    });

    // 相談サポート
    if (pricing.selectedModules.consultation) {
      const consFee = calc.calculateConsultationMonthlyFee(salesClass);
      items.push({
        name: table.modules.consultation.label,
        detail: "ビデオ会議・電話・チャット相談",
        amount: consFee,
      });
    }

    // 納品頻度値引き（記帳代行のみ）
    if (moduleName === "bookkeeping" && pricing.deliveryFrequency && pricing.deliveryFrequency !== "monthly") {
      const disc = calc.getDeliveryDiscount(pricing.deliveryFrequency);
      if (disc !== 0) {
        items.push({
          name: "納品頻度値引き",
          detail: frequencyLabel(pricing.deliveryFrequency),
          amount: disc,
          isDiscount: true,
        });
      }
    }
  }

  // 手動値引き（紹介）
  const introM = pricing.manualDiscounts?.introduction?.monthly || 0;
  if (introM !== 0) {
    items.push({
      name: "ご紹介値引き",
      detail: pricing.manualDiscounts.introduction.monthlyReason || "",
      amount: introM,
      isDiscount: true,
    });
  }

  // 手動値引き（出精）
  const volM = pricing.manualDiscounts?.volume?.monthly || 0;
  if (volM !== 0) {
    items.push({
      name: "出精値引き",
      detail: pricing.manualDiscounts.volume.monthlyReason || "",
      amount: volM,
      isDiscount: true,
    });
  }

  // 合計
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  items.push({ isTotal: true, detail: "月次料金 合計", amount: total });

  return items;
}

/**
 * 年次料金テーブルの行データを構築
 */
function buildAnnualItems(config) {
  const pricing = config.pricing;
  const isManual = pricing.manualPricing && pricing.manualPricing.enabled;
  const items = [];

  if (isManual) {
    // manualPricing: config に書かれた年次料金を使用
    const mp = pricing.manualPricing;
    if (mp.annual.corporateTax) {
      items.push({ name: "法人税・事業税等申告報酬", detail: "個別見積り", amount: mp.annual.corporateTax });
    }
    if (mp.annual.consumptionTax) {
      const method = pricing.consumptionTaxMethod === "principle" ? "原則課税" : "簡易課税";
      items.push({ name: "消費税等申告報酬", detail: method, amount: mp.annual.consumptionTax });
    }
  } else {
    // 自動計算
    const annualResult = calc.calculateAnnualFees({
      salesClass: config.client.salesClass,
      entityType: "corporate",
      consumptionTaxMethod: pricing.consumptionTaxMethod,
      options: pricing.annualOptions,
    });
    annualResult.items.forEach(item => {
      items.push({ name: item.label, detail: item.detail, amount: item.amount });
    });
  }

  // manualPricing の場合もオプション費用を追加
  if (isManual) {
    const opts = pricing.annualOptions || {};
    const table = calc.loadPricingTable();
    const annual = table.annualFees;

    if (opts.yearEndAdjustment && opts.yearEndAdjustment.enabled) {
      const people = opts.yearEndAdjustment.people || 0;
      const basePeople = parseInt(annual.yearEndAdjustment.base.covers.match(/\d+/)[0]);
      const baseAmt = annual.yearEndAdjustment.base.amount;
      const extra = Math.max(0, people - basePeople) * annual.yearEndAdjustment.additional.amount;
      items.push({
        name: annual.yearEndAdjustment.label,
        detail: people <= basePeople ? `基本（${basePeople}名まで）` : `${basePeople}名まで + 追加${people - basePeople}名`,
        amount: baseAmt + extra,
      });
    }
    if (opts.statutoryReports && opts.statutoryReports.enabled) {
      const sheets = opts.statutoryReports.sheets || 0;
      const baseSheets = parseInt(annual.statutoryReports.base.covers.match(/\d+/)[0]);
      const baseAmt = annual.statutoryReports.base.amount;
      const extra = Math.max(0, sheets - baseSheets) * annual.statutoryReports.additional.amount;
      items.push({
        name: annual.statutoryReports.label,
        detail: sheets <= baseSheets ? `基本（${baseSheets}枚まで）` : `${baseSheets}枚まで + 追加${sheets - baseSheets}枚`,
        amount: baseAmt + extra,
      });
    }
    if (opts.salaryReport && opts.salaryReport.enabled && opts.salaryReport.municipalities > 0) {
      items.push({
        name: annual.salaryReport.label,
        detail: `${opts.salaryReport.municipalities}自治体`,
        amount: annual.salaryReport.amount * opts.salaryReport.municipalities,
      });
    }
    if (opts.fixedAssetReport && opts.fixedAssetReport.enabled) {
      items.push({ name: annual.fixedAssetReport.label, detail: "", amount: annual.fixedAssetReport.amount });
    }
    if (opts.englishFS && opts.englishFS.enabled) {
      items.push({ name: annual.englishFS.label, detail: "", amount: annual.englishFS.amount });
    }
    if (opts.auditSupport && opts.auditSupport.enabled) {
      items.push({ name: annual.auditSupport.label, detail: annual.auditSupport.note, amount: annual.auditSupport.amount });
    }
  }

  // 年次手動値引き
  const introA = pricing.manualDiscounts?.introduction?.annual || 0;
  if (introA !== 0) {
    items.push({
      name: "ご紹介値引き",
      detail: pricing.manualDiscounts.introduction.annualReason || "",
      amount: introA,
      isDiscount: true,
    });
  }
  const volA = pricing.manualDiscounts?.volume?.annual || 0;
  if (volA !== 0) {
    items.push({
      name: "出精値引き",
      detail: pricing.manualDiscounts.volume.annualReason || "",
      amount: volA,
      isDiscount: true,
    });
  }

  // 合計
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  items.push({ isTotal: true, detail: "年次料金 合計", amount: total });

  return items;
}

/**
 * 料金テーブルを docx Table として生成
 */
function pricingTable(items, theme) {
  const [c1, c2, c3] = PRICING_COL_WIDTHS;

  const rows = [
    new TableRow({
      children: [S.headerCell("項目", c1, theme), S.headerCell("内訳", c2, theme), S.headerCell("料金（税別）", c3, theme)],
    }),
  ];

  items.forEach((item, i) => {
    if (item.isTotal) {
      rows.push(new TableRow({
        children: [
          S.highlightCell("", c1, theme),
          S.highlightCell(item.detail, c2, theme, { align: AlignmentType.RIGHT }),
          S.highlightCell(formatAmount(item.amount), c3, theme, { align: AlignmentType.RIGHT }),
        ],
      }));
    } else {
      const fill = S.alternatingFill(i, theme);
      rows.push(new TableRow({
        children: [
          S.dataCell(item.name, c1, theme, { bold: !!item.name, fill }),
          S.dataCell(item.detail || "", c2, theme, { fill }),
          S.priceCell(formatAmount(item.amount), c3, theme, { fill, isDiscount: item.isDiscount }),
        ],
      }));
    }
  });

  return new Table({
    width: { size: PRICING_TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: PRICING_COL_WIDTHS,
    rows,
  });
}

/**
 * 年間費用サマリーテーブル（単一プラン）
 */
function annualSummaryTable(monthlyTotal, annualTotal, theme) {
  const colWidths = [4500, 4500];
  const grandTotal = monthlyTotal * 12 + annualTotal;

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: [S.headerCell("", 4500, theme), S.headerCell("金額（税別）", 4500, theme)],
      }),
      new TableRow({
        children: [
          S.dataCell("月次料金 × 12ヶ月", 4500, theme, { bold: true, fill: S.alternatingFill(0, theme) }),
          S.priceCell(formatAmount(monthlyTotal * 12), 4500, theme, { fill: S.alternatingFill(0, theme) }),
        ],
      }),
      new TableRow({
        children: [
          S.dataCell("年次料金", 4500, theme, { bold: true, fill: S.alternatingFill(1, theme) }),
          S.priceCell(formatAmount(annualTotal), 4500, theme, { fill: S.alternatingFill(1, theme) }),
        ],
      }),
      new TableRow({
        children: [
          S.highlightCell("年間合計（税別）", 4500, theme),
          S.highlightCell(formatAmount(grandTotal), 4500, theme, { align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  });
}

/**
 * proposal_single の料金プランセクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph/Table 配列
 */
module.exports = function buildSinglePricingSection(config, theme) {
  const children = [
    S.sectionNumber(4, "料金プラン", theme),
    S.bodyText("貴社の事業規模およびご要望を踏まえ、以下の料金プランをご提案申し上げます。", theme),
  ];

  // プラン名の決定
  const mods = config.pricing.selectedModules;
  let planLabel;
  if (mods.bookkeeping) {
    planLabel = mods.consultation
      ? "経理サポート（記帳代行）＋ 相談サポートプラン"
      : "経理サポート（記帳代行）プラン";
  } else if (mods.selfBookkeeping) {
    planLabel = mods.consultation
      ? "経理サポート（自計化）＋ 相談サポートプラン"
      : "経理サポート（自計化）プラン";
  }

  children.push(S.subHeading(`プランA ｜ ${planLabel}`, theme));

  // 月次料金
  const monthlyItems = buildMonthlyItems(config);
  const monthlyTotal = monthlyItems[monthlyItems.length - 1].amount;
  children.push(
    S.bodyText("■ 月次料金", theme),
    pricingTable(monthlyItems, theme),
    S.spacer(200),
  );

  // 年次料金
  const annualItems = buildAnnualItems(config);
  const annualTotal = annualItems[annualItems.length - 1].amount;
  children.push(
    S.bodyText("■ 年次料金", theme),
    pricingTable(annualItems, theme),
    S.spacer(300),
  );

  // 年間サマリー
  children.push(
    S.bodyText("■ 年間費用サマリー（税別）", theme),
    annualSummaryTable(monthlyTotal, annualTotal, theme),
    S.spacer(100),
  );

  // 注記
  children.push(S.bodyText("※ 上記金額に別途消費税がかかります。", theme));
  if (config.pricing.notes && config.pricing.notes.length > 0) {
    config.pricing.notes.forEach(n => children.push(S.bodyText(`※ ${n}`, theme)));
  }

  return children;
};
