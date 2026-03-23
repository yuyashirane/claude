// Extract deals from tool-results file and save to raw directory
const fs = require('fs');
const path = require('path');

const sourceFile = process.argv[2];
const destFile = process.argv[3];

if (!sourceFile || !destFile) {
  console.error('Usage: node extract-and-save.js <source-tool-result> <dest-file>');
  process.exit(1);
}

const raw = fs.readFileSync(sourceFile, 'utf8');
const parsed = JSON.parse(raw);

// Tool results are [{type, text}] array - get the text
let data;
if (Array.isArray(parsed)) {
  data = JSON.parse(parsed[0].text);
} else {
  data = parsed;
}

const dir = path.dirname(destFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(destFile, JSON.stringify(data, null, 2));
console.log(`Saved: ${destFile} (${JSON.stringify(data, null, 2).length} bytes)`);
if (data.deals) console.log(`  Deals count: ${data.deals.length}`);
if (data.meta) console.log(`  Total count: ${data.meta.total_count}`);
