// create-proposal.js v2.0
// エントリーポイント: config.json → 提案書 (.docx) 生成
// Usage: node create-proposal.js <config.json> [output.docx]

const fs = require("fs");
const path = require("path");
const { Packer } = require("docx");
const { getTheme } = require("./styles/themes");

// モード別ビルダー
const buildProposalSingle = require("./modes/proposal-single");
// const buildProposalMulti = require("./modes/proposal-multi"); // フェーズ3Bで実装

/**
 * config を簡易バリデーション
 */
function validateConfig(config) {
  const required = ["meta", "client", "proposal", "challenges", "services", "pricing", "contractFlow"];
  const missing = required.filter(k => !config[k]);
  if (missing.length > 0) {
    throw new Error(`config に必須フィールドがありません: ${missing.join(", ")}`);
  }
  if (config.meta.version !== "2.0") {
    throw new Error(`未対応の config version: ${config.meta.version}（v2.0のみ対応）`);
  }
  const validModes = ["proposal_single", "proposal_multi"];
  if (!validModes.includes(config.meta.outputMode)) {
    throw new Error(`不正な outputMode: ${config.meta.outputMode}（有効値: ${validModes.join(", ")}）`);
  }
}

/**
 * 提案書を生成
 * @param {string} configPath - config.json のパス
 * @param {string} [outputPath] - 出力先パス（省略時は config.meta.outputPath またはデフォルト）
 */
async function createProposal(configPath, outputPath) {
  // config 読み込み
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  validateConfig(config);

  // 出力先決定
  const resolvedOutput = outputPath || config.meta.outputPath || path.join(
    "G:\\共有ドライブ\\06_見込み客",
    config.client.name,
    `税務顧問サービスのご提案_あしたの会計事務所_${config.client.name}.docx`
  );

  // テーマ取得
  const theme = getTheme(config.meta.theme);
  console.log(`テーマ: ${theme.displayName}`);
  console.log(`モード: ${config.meta.outputMode}`);
  console.log(`クライアント: ${config.client.name}`);

  // モード別に Document 生成
  let doc;
  const mode = config.meta.outputMode;

  if (mode === "proposal_single") {
    doc = buildProposalSingle(config, theme);
  } else if (mode === "proposal_multi") {
    throw new Error("proposal_multi モードはフェーズ3Bで実装予定です。");
  }

  // .docx 出力
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(resolvedOutput, buffer);
  console.log(`提案書を作成しました: ${resolvedOutput}`);
  console.log(`ファイルサイズ: ${(buffer.length / 1024).toFixed(1)} KB`);

  return resolvedOutput;
}

// CLI実行
if (require.main === module) {
  const configPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!configPath) {
    console.error("Usage: node create-proposal.js <config.json> [output.docx]");
    process.exit(1);
  }

  createProposal(configPath, outputPath).catch(err => {
    console.error("エラー:", err.message);
    process.exit(1);
  });
}

module.exports = { createProposal };
