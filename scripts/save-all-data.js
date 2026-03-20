// Save all API response data to JSON files
// Run: node scripts/save-all-data.js
const fs = require('fs');
const path = require('path');

const baseDir = 'data/474381/2026-03-20/raw';

// Read tool-results files and extract JSON
function readToolResult(filename) {
  const toolResultDir = path.join(
    'C:/Users/yuya_/.claude/projects/C--Users-yuya--claude/31102227-026f-424c-a213-20258e83a67e/tool-results',
    filename
  );
  if (!fs.existsSync(toolResultDir)) return null;
  const raw = fs.readFileSync(toolResultDir, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return JSON.parse(parsed[0].text);
  return parsed;
}

function saveJson(filename, data) {
  const filepath = path.join(baseDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Saved: ${filename} (${fs.statSync(filepath).size} bytes)`);
}

// Save income deals p3 from tool results
const toolResultFiles = fs.readdirSync(
  'C:/Users/yuya_/.claude/projects/C--Users-yuya--claude/31102227-026f-424c-a213-20258e83a67e/tool-results'
);
console.log('Available tool result files:', toolResultFiles);

// Extract income p3 (the most recent one)
const p3File = 'toolu_01PJS16yaQ9LRFbCimbgTZuX.json';
if (fs.existsSync(path.join('C:/Users/yuya_/.claude/projects/C--Users-yuya--claude/31102227-026f-424c-a213-20258e83a67e/tool-results', p3File))) {
  const p3Data = readToolResult(p3File);
  if (p3Data && p3Data.deals) {
    saveJson('deals_income_p3.json', p3Data);
    console.log(`  Income p3 deals: ${p3Data.deals.length}, total: ${p3Data.meta?.total_count}`);
  }
}

console.log('\nDone saving tool results.');
console.log('\nNow need to save BS/PL/manual_journals via stdin pipe approach.');
