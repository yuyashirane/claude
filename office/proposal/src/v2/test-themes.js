// test-themes.js
// 同じ config を3テーマで生成し、テーマカラーの適用を確認する
// 追加: 全 proposal_single サンプルも blue テーマで生成し動作確認

const fs = require("fs");
const path = require("path");
const { Packer } = require("docx");
const { getTheme, listThemes } = require("./styles/themes");
const buildProposalSingle = require("./modes/proposal-single");

const SAMPLES_DIR = path.join(__dirname, "..", "..", ".claude", "skills", "proposal-generator-v2", "samples");
const OUTPUT_DIR = path.join(__dirname, "test-output");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  // ── Part 1: MegaSolar を 3テーマで生成 ──
  console.log("=== Part 1: MegaSolar × 3テーマ ===");
  const megaConfig = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "config-v2-megasolar.json"), "utf8"));

  for (const { name } of listThemes()) {
    const theme = getTheme(name);
    const doc = buildProposalSingle(megaConfig, theme);
    const buffer = await Packer.toBuffer(doc);
    const outPath = path.join(OUTPUT_DIR, `proposal-megasolar-${name}.docx`);
    fs.writeFileSync(outPath, buffer);
    console.log(`  ${name}: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  // ── Part 2: 全 proposal_single サンプルを blue で生成 ──
  console.log("\n=== Part 2: 全 proposal_single サンプル (blue) ===");
  const theme = getTheme("blue");
  const singleFiles = fs.readdirSync(SAMPLES_DIR)
    .filter(f => f.startsWith("config-v2-") && !f.includes("backup-multi"));

  let ok = 0;
  let fail = 0;

  for (const file of singleFiles) {
    const config = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), "utf8"));
    const shortName = file.replace("config-v2-", "").replace(".json", "");
    try {
      const doc = buildProposalSingle(config, theme);
      const buffer = await Packer.toBuffer(doc);
      const outPath = path.join(OUTPUT_DIR, `proposal-${shortName}-blue.docx`);
      fs.writeFileSync(outPath, buffer);
      console.log(`  ✓ ${shortName}: ${(buffer.length / 1024).toFixed(1)} KB`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${shortName}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n結果: ${ok} OK / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
