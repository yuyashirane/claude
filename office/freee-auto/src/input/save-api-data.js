// Save API data to files - run with: node scripts/save-api-data.js <type> <filepath>
// Reads JSON from stdin and writes to filepath
const fs = require('fs');
const path = require('path');

const filepath = process.argv[2];
if (!filepath) {
  console.error('Usage: node save-api-data.js <filepath>');
  process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, input);
  console.log(`Saved: ${filepath} (${input.length} bytes)`);
});
