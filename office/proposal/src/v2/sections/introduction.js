// sections/introduction.js
// セクション1: はじめに

const S = require("../styles/docx-styles");

/**
 * 「はじめに」セクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph 配列
 */
module.exports = function buildIntroductionSection(config, theme) {
  const children = [];

  children.push(
    S.sectionNumber(1, "はじめに", theme),
    S.bodyText("拝啓 時下ますますご清栄のこととお慶び申し上げます。平素は格別のご高配を賜り、厚く御礼申し上げます。", theme),
  );

  const intro = config.proposal.introduction;
  if (intro && !intro.useDefault && intro.customParagraphs && intro.customParagraphs.length > 0) {
    intro.customParagraphs.forEach(p => children.push(S.bodyText(p, theme)));
  } else {
    children.push(
      S.bodyText("先日は顧問契約に関するご相談を賜り、誠にありがとうございました。お打ち合わせの内容を踏まえ、貴社の事業フェーズ・ビジネスモデルに最適化した税務顧問サービスをご提案いたします。", theme),
      S.bodyText("スタートアップの貴重なリソースを本業に集中いただけるよう、バックオフィス業務を全面的にサポートいたします。", theme),
    );
  }

  children.push(S.spacer(200));
  return children;
};
