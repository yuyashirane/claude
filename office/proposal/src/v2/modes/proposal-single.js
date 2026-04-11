// modes/proposal-single.js
// proposal_single モード（お任せ型）の docx Document を組み立てる

const { Document, Paragraph, PageBreak } = require("docx");
const S = require("../styles/docx-styles");

// セクション
const buildCoverSection = require("../sections/cover");
const buildIntroductionSection = require("../sections/introduction");
const buildChallengesSection = require("../sections/challenges");
const buildServicesSection = require("../sections/services");
const buildSinglePricingSection = require("../pricing-sections/single-pricing");
const buildNotesSection = require("../sections/notes");
const buildContractFlowSection = require("../sections/contract-flow");
const buildOfficeInfoSection = require("../sections/office-info");

/**
 * proposal_single モードの Document を生成
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Document} docx Document
 */
module.exports = function buildProposalSingle(config, theme) {
  // 表紙（独立セクション）
  const coverSection = buildCoverSection(config, theme);

  // コンテンツ（全セクションの children を結合）
  const contentChildren = [];

  // 1. はじめに
  contentChildren.push(...buildIntroductionSection(config, theme));

  // 2. 貴社の課題認識
  contentChildren.push(...buildChallengesSection(config, theme));

  // 3. サービス内容
  contentChildren.push(...buildServicesSection(config, theme));

  // ページ区切り
  contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // 4. 料金プラン
  contentChildren.push(...buildSinglePricingSection(config, theme));

  // ページ区切り
  contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // 5. 備考・補足事項
  contentChildren.push(...buildNotesSection(config, theme));

  // 6. ご契約後の流れ
  contentChildren.push(...buildContractFlowSection(config, theme));

  // ページ区切り
  contentChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // 7. 当事務所の概要
  contentChildren.push(...buildOfficeInfoSection(config, theme));

  // Document 組み立て
  return new Document({
    styles: S.documentStyles(theme),
    numbering: { config: S.NUMBERING_CONFIG },
    sections: [
      coverSection,
      {
        properties: S.contentPageProperties(),
        headers: { default: S.createContentHeader(theme) },
        footers: { default: S.createContentFooter(theme) },
        children: contentChildren,
      },
    ],
  });
};
