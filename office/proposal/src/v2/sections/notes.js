// sections/notes.js
// セクション5: 備考・補足事項

const S = require("../styles/docx-styles");

/**
 * 「備考・補足事項」セクションの children 配列を返す
 * @param {Object} config - v2 config
 * @param {Object} theme - テーマオブジェクト
 * @returns {Array} Paragraph 配列
 */
module.exports = function buildNotesSection(config, theme) {
  const children = [S.sectionNumber(5, "備考・補足事項", theme)];

  // config に notes セクションがある場合（v1互換: config.notes）
  if (config.notes && config.notes.length > 0) {
    config.notes.forEach(section => {
      children.push(S.subHeading(section.title, theme));
      if (section.paragraphs) {
        section.paragraphs.forEach(p => children.push(S.bodyText(p, theme)));
      }
      if (section.bullets) {
        section.bullets.forEach(b => children.push(S.bulletItem(b, theme)));
      }
    });
  } else {
    // デフォルト備考
    children.push(
      S.subHeading("（1）経理サポートについて", theme),
      S.bodyText("事業を行うにあたって絶対に必要となる帳簿作成支援業務、決算申告業務、税務手続業務を、弊社が責任をもって実施させていただきます。経理顧問が含まれますので、経理に関するご質問はいつでも受付しております。", theme),
      S.bulletItem("記帳代行プランの場合：▲6,000円/月（税別）で4か月に1回、▲5,000円/月で3か月に1回、▲4,000円/月で2か月に1回の納品に変更可能です。", theme),
      S.bulletItem("自計化プランの場合：記帳チェックは概ね3か月ごとに実施いたします（ご連絡いただいたタイミングでも対応可）。", theme),
      S.bulletItem("消費税等申告報酬は簡易課税を前提にお見積りしています。原則課税の場合は50,000円〜＋税となります。", theme),
      S.bulletItem("消費税の計算方法が原則課税となる場合は、証憑管理及び記帳方針について大幅な変更が予想されます。その際、顧問料等について別途ご相談させていただく可能性がございます。", theme),
      S.bulletItem("スポットで面談を実施する場合は、30分 8,000円（税別）で実施可能です。", theme),

      S.subHeading("（2）相談サポートについて", theme),
      S.bodyText("会計・経理・税務、その他の分野に関する各種のご質問事項やお困り・お悩み事項のご相談に対応させていただきます。面談、ビデオ会議、電話、チャットなどの方法で対応いたします。", theme),
      S.bodyText("定例会議は年に2回（期首・期末）としてお見積りしております。2,000円/月（税別）で定例会議の回数を1回増やすことが可能です。", theme),
      S.bodyText("複雑な事項など対面での説明を要する以下の事項については面談にて実施させていただきます。", theme),
      S.bulletItem("役員報酬の設定", theme),
      S.bulletItem("決算前ミーティング（期末着地見込み、納税額予測、消費税シミュレーション、節税提案）", theme),
      S.bulletItem("半期の業績推移、各種論点のレクチャーなど", theme),

      S.subHeading("（3）コミュニケーション体制", theme),
      S.bodyText("「いつでも相談できる安心感」を重視し、専用チャットグループを通じていつでも投稿可能な環境を整備します。回答は基本的に平日業務時間内での対応となりますが、緊急時は柔軟に対応させていただきます。", theme),
      S.bodyText("お打ち合わせは原則としてオンラインで実施いたします。必要に応じてご訪問も承ります（交通費別途）。", theme),

      S.subHeading("（4）有効期限・お支払条件", theme),
      S.bodyText("本お見積書の有効期限は発効日から2週間です。お支払いは当月分を当月28日支払（銀行引落）とさせていただいております。", theme),
    );
  }

  children.push(S.spacer(200));
  return children;
};
