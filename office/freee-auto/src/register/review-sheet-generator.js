/**
 * review-sheet-generator.js
 * レビュー用Excel生成モジュール（Phase D）
 *
 * 多段階推測の結果を、修正用空列付きのExcelファイルに出力する。
 * 悠皓さんやスタッフが直接書き込みで修正できる形式。
 *
 * 列構成（A-AF = 32列）:
 *   [A] 基本情報（灰色）: # / 元明細 / 正規化後明細 / ノイズ除去後明細 / 口座名 / 入出金 / 金額
 *   [B] AI推測結果（薄青）: 取引類型 / 勘定科目 / 税区分 / 取引先候補 / 正式取引先名候補 /
 *       品目タグ / マッチ条件 / マッチテキスト / アクション / 推測ソース / 推測根拠 / 信頼度総合 / 信頼度内訳
 *   [C] 修正用（薄黄）: 修正後科目 / 修正後税区分 / 修正後取引先 / 修正後品目 /
 *       修正後マッチ条件 / 修正後マッチテキスト / 修正後アクション / 修正コメント
 *   [D] 判断（薄緑）: 確定フラグ / ルール化可否 / 自動確定可否 / 要レビュー理由
 *
 * ヘッダー:
 *   1行目: グループ名（マージセル）
 *   2行目: 各列名
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// --------------------------------------------------
// 列定義（A-AF = 32列）
// --------------------------------------------------

const COLUMNS = [
  // グループA: 基本情報（A-G = 7列）
  { header: '#', key: 'rowNum', width: 5 },
  { header: '元明細', key: 'description', width: 35 },
  { header: '正規化後明細', key: 'normalizedDesc', width: 30 },
  { header: 'ノイズ除去後明細', key: 'displayDesc', width: 30 },
  { header: '口座名', key: 'walletName', width: 20 },
  { header: '入出金', key: 'entrySide', width: 8 },
  { header: '金額', key: 'amount', width: 12 },

  // グループB: AI推測結果（H-T = 13列）
  { header: '取引類型', key: 'transactionType', width: 14 },
  { header: '勘定科目', key: 'account', width: 14 },
  { header: '税区分', key: 'taxClass', width: 14 },
  { header: '取引先候補', key: 'candidatePartner', width: 18 },
  { header: '正式取引先名候補', key: 'displayPartner', width: 20 },
  { header: '品目タグ', key: 'item', width: 14 },
  { header: 'マッチ条件', key: 'matchCondition', width: 10 },
  { header: 'マッチテキスト', key: 'matchText', width: 20 },
  { header: 'アクション', key: 'action', width: 16 },
  { header: '推測ソース', key: 'source', width: 14 },
  { header: '推測根拠', key: 'note', width: 30 },
  { header: '信頼度総合', key: 'totalConfidence', width: 10 },
  { header: '信頼度内訳', key: 'subScoreText', width: 28 },

  // グループC: 修正用（U-AB = 8列）
  { header: '修正後科目', key: 'fixAccount', width: 14 },
  { header: '修正後税区分', key: 'fixTaxClass', width: 14 },
  { header: '修正後取引先', key: 'fixPartner', width: 18 },
  { header: '修正後品目', key: 'fixItem', width: 14 },
  { header: '修正後マッチ条件', key: 'fixMatchCond', width: 10 },
  { header: '修正後マッチテキスト', key: 'fixMatchText', width: 20 },
  { header: '修正後アクション', key: 'fixAction', width: 16 },
  { header: '修正コメント', key: 'fixComment', width: 25 },

  // グループD: 判断（AC-AF = 4列）
  { header: '確定フラグ', key: 'confirmed', width: 10 },
  { header: 'ルール化可否', key: 'ruleCandidate', width: 10 },
  { header: '自動確定可否', key: 'autoConfirmable', width: 12 },
  { header: '要レビュー理由', key: 'reviewReason', width: 30 },
];

// グループ定義（マージセル用）
const GROUPS = [
  { label: '基本情報', from: 1, to: 7, color: 'EEEEEE' },          // 灰色
  { label: 'AI推測結果', from: 8, to: 20, color: 'E3F2FD' },       // 薄青
  { label: '修正用（ここに書き込んでください）', from: 21, to: 28, color: 'FFF8E1' }, // 薄黄
  { label: '判断', from: 29, to: 32, color: 'E8F5E9' },            // 薄緑
];

// 信頼度別の行背景色（仕様書準拠）
const CONFIDENCE_COLORS = {
  high: 'E8F5E9',     // 薄緑（70-100: 推測候補・軽い確認）
  medium: 'FFF8E1',   // 薄黄（30-69: 低信頼度・要確認）
  low: 'FFEBEE',      // 薄赤（0-29: 未判定・人手判断が必要）
  excluded: 'E0E0E0', // グレー（除外: 複合仕訳等）
};

// ソース名の日本語変換
const SOURCE_LABELS = {
  existing_rule: '既存ルール',
  past_pattern: '過去パターン',
  client_dict: '顧問先辞書',
  general_keywords: '一般KW辞書',
  type_rule: '類型ルール',
  unmatched: '未判定',
};

// 取引類型の日本語ラベル
const TYPE_LABELS = {
  LOAN_REPAY: '借入返済',
  ATM: 'ATM引出・預入',
  SOCIAL_INSURANCE: '社会保険料',
  CREDIT_PULL: 'クレカ引落',
  TRANSFER: '口座間振替',
  SALES_IN: '売上入金',
  PERSONAL_PAYMENT: '個人宛支払',
  EXPENSE: '通常経費',
};

// --------------------------------------------------
// ヘルパー: 信頼度内訳テキスト生成
// --------------------------------------------------

/**
 * サブスコアを1セルに収まる形式でフォーマット
 * 例: "類15/取25/履0/金8/口10/安10/補3=71"
 * @param {Object} subScores
 * @param {number} total
 * @returns {string}
 */
function formatSubScores(subScores, total) {
  if (!subScores) return '';
  return [
    `類${subScores.type_match || 0}`,
    `取${subScores.partner_match || 0}`,
    `履${subScores.history_match || 0}`,
    `金${subScores.amount_pattern || 0}`,
    `口${subScores.account_match || 0}`,
    `安${subScores.stability || 0}`,
    `補${subScores.auxiliary || 0}`,
  ].join('/') + `=${total || 0}`;
}

// --------------------------------------------------
// ヘルパー: 要レビュー理由の自動生成
// --------------------------------------------------

/**
 * autoConfirmBlocked や信頼度低下の理由をテキスト化
 * @param {Object} r - classifyMultiStage()の結果
 * @returns {string}
 */
function generateReviewReason(r) {
  const reasons = [];
  const type = r.transactionType;

  // 類型由来の理由
  if (type === 'ATM') {
    reasons.push('ATM取引のため自動確定対象外');
  } else if (type === 'LOAN_REPAY') {
    reasons.push('借入返済（複合仕訳）のため要確認');
  } else if (type === 'SOCIAL_INSURANCE') {
    reasons.push('社会保険料（複合仕訳）のため要確認');
  } else if (type === 'PERSONAL_PAYMENT') {
    reasons.push('個人宛支払（給与/外注/立替の判別が必要）');
  } else if (type === 'CREDIT_PULL') {
    reasons.push('クレカ引落（振替先の確認が必要）');
  } else if (type === 'TRANSFER') {
    reasons.push('口座間振替（振替先の確認が必要）');
  }

  // 取引先未確定
  if (!r.partner_source || r.partner_source === 'name_only') {
    reasons.push('取引先未確定（候補のみ）');
  }

  // 科目未判定
  if (!r.account) {
    reasons.push('科目未判定');
  }

  // 信頼度不足
  const conf = r.totalConfidence || r.overallConfidence || 0;
  if (conf < 50 && reasons.length === 0) {
    reasons.push(`信頼度不足（${conf}点）`);
  }

  // 源泉徴収可能性
  if (r.withholdingPossible) {
    reasons.push('源泉徴収対象の可能性');
  }

  return reasons.join(' / ');
}

// --------------------------------------------------
// メイン: レビュー用Excel生成
// --------------------------------------------------

/**
 * 多段階推測の結果をレビュー用Excelに出力
 *
 * @param {Object[]} results - classifyMultiStage()の結果配列
 *   各要素: { ...multiStageResult, _original: { description, walletable_name, amount, entry_side } }
 * @param {Object} options
 * @param {string} options.companyId - freee事業所ID
 * @param {string} [options.companyName] - 事業所名
 * @param {string} [options.targetMonth] - 'YYYY-MM' 対象月
 * @param {string} [options.outputDir] - 出力先ディレクトリ
 * @returns {Promise<{ filePath: string, stats: Object }>}
 */
async function generateReviewSheet(results, options = {}) {
  const {
    companyId,
    companyName = '',
    targetMonth = '',
    outputDir = path.join(__dirname, '..', '..', 'reports'),
  } = options;

  if (!companyId) throw new Error('options.companyId は必須です');

  // 出力ディレクトリ作成
  const outDir = path.join(outputDir, String(companyId));
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'freee-auto review-sheet-generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('レビュー', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }], // ヘッダー2行を固定
  });

  // 列幅の設定
  COLUMNS.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  // --------------------------------------------------
  // ヘッダー1行目: グループ名（マージセル）
  // --------------------------------------------------
  const groupRow = ws.getRow(1);
  groupRow.height = 22;

  for (const group of GROUPS) {
    // マージセル
    ws.mergeCells(1, group.from, 1, group.to);
    const cell = ws.getCell(1, group.from);
    cell.value = group.label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: group.color } };
    // マージ範囲全体に背景色
    for (let c = group.from; c <= group.to; c++) {
      ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: group.color } };
    }
  }

  // --------------------------------------------------
  // ヘッダー2行目: 各列名
  // --------------------------------------------------
  const headerRow = ws.getRow(2);
  headerRow.height = 28;
  COLUMNS.forEach((col, idx) => {
    const cell = ws.getCell(2, idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    // グループごとの背景色
    const group = GROUPS.find(g => (idx + 1) >= g.from && (idx + 1) <= g.to);
    if (group) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: group.color } };
    }
  });

  // --------------------------------------------------
  // 統計情報
  // --------------------------------------------------
  const stats = {
    total: results.length,
    suggest: 0,
    review: 0,
    excluded: 0,
    byType: {},
    bySource: {},
  };

  // --------------------------------------------------
  // データ行（3行目〜）
  // --------------------------------------------------
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const orig = r._original || {};
    const rowNum = i + 3; // ヘッダー2行分オフセット

    const isExcluded = ['LOAN_REPAY', 'ATM', 'CREDIT_PULL', 'TRANSFER', 'SOCIAL_INSURANCE'].includes(r.transactionType);
    const typeName = TYPE_LABELS[r.transactionType] || r.transactionType;
    const sourceName = SOURCE_LABELS[r.accountSource] || r.accountSource;

    // 統計
    if (isExcluded) {
      stats.excluded++;
    } else if (r.action === null || r.action === '要確認') {
      stats.review++;
    } else {
      stats.suggest++;
    }
    stats.byType[r.transactionType] = (stats.byType[r.transactionType] || 0) + 1;
    stats.bySource[r.accountSource] = (stats.bySource[r.accountSource] || 0) + 1;

    // 正規化結果の取得
    const normResult = r.normResult || {};
    const normalizedDesc = normResult.normalized || '';
    const displayDesc = normResult.display || '';

    // 信頼度内訳テキスト
    const subScoreText = formatSubScores(r.subScores, r.totalConfidence || r.overallConfidence);

    // 自動確定可否
    const autoConfirmable = r.autoConfirmBlocked ? '不可' : '可';

    // 要レビュー理由
    const reviewReason = generateReviewReason(r);

    // 行データ
    const row = ws.getRow(rowNum);
    const values = [
      // グループA: 基本情報（7列）
      i + 1,                                            // # (A)
      orig.description || '',                            // 元明細 (B)
      normalizedDesc,                                    // 正規化後明細 (C)
      displayDesc,                                       // ノイズ除去後明細 (D)
      orig.walletable_name || '',                        // 口座名 (E)
      (orig.entry_side === 'income') ? '収入' : '支出',  // 入出金 (F)
      Math.abs(orig.amount || 0),                        // 金額 (G)

      // グループB: AI推測結果（13列）
      typeName,                                          // 取引類型 (H)
      r.account || '要確認',                              // 勘定科目 (I)
      r.taxClass || '要確認',                              // 税区分 (J)
      r.candidate_partner_name || r.partner || '',       // 取引先候補 (K)
      r.display_partner_name || '',                      // 正式取引先名候補 (L)
      r.item || r.itemTag || '',                         // 品目タグ (M)
      r.matchCondition || '',                            // マッチ条件 (N)
      r.matchText || '',                                 // マッチテキスト (O)
      r.action || '',                                    // アクション (P)
      sourceName,                                        // 推測ソース (Q)
      r.note || r.reasoning || '',                       // 推測根拠 (R)
      r.totalConfidence || r.overallConfidence || 0,     // 信頼度総合 (S)
      subScoreText,                                      // 信頼度内訳 (T)

      // グループC: 修正用（8列）
      '', '', '', '', '', '', '', '',                    // 修正用 (U-AB) 空

      // グループD: 判断（4列）
      '', '',                                            // 確定フラグ, ルール化可否 (AC-AD) 空
      autoConfirmable,                                   // 自動確定可否 (AE)
      reviewReason,                                      // 要レビュー理由 (AF)
    ];
    values.forEach((val, idx) => {
      row.getCell(idx + 1).value = val;
    });

    // 行の書式設定
    row.font = { size: 9 };
    row.alignment = { vertical: 'top', wrapText: true };

    // 金額列のフォーマット (G列 = 7)
    ws.getCell(rowNum, 7).numFmt = '#,##0';

    // 信頼度別の行背景色（仕様書: 70-100/30-69/0-29）
    const conf = r.totalConfidence || r.overallConfidence || 0;
    let bgColor;
    if (isExcluded) {
      bgColor = CONFIDENCE_COLORS.excluded;
    } else if (conf >= 70) {
      bgColor = CONFIDENCE_COLORS.high;
    } else if (conf >= 30) {
      bgColor = CONFIDENCE_COLORS.medium;
    } else {
      bgColor = CONFIDENCE_COLORS.low;
    }

    // グループA+B列（基本情報+推測結果: 1-20）に信頼度色
    for (let col = 1; col <= 20; col++) {
      ws.getCell(rowNum, col).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: bgColor },
      };
    }

    // グループC列（修正用: 21-28）に薄黄色背景
    for (let col = 21; col <= 28; col++) {
      ws.getCell(rowNum, col).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FFF8E1' },
      };
    }

    // グループD列（判断: 29-32）に薄緑背景
    for (let col = 29; col <= 32; col++) {
      ws.getCell(rowNum, col).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'E8F5E9' },
      };
    }
  }

  // --------------------------------------------------
  // オートフィルタ（2行目ヘッダー基準）
  // --------------------------------------------------
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: results.length + 2, column: COLUMNS.length },
  };

  // --------------------------------------------------
  // フッター（凡例）
  // --------------------------------------------------
  const footerStartRow = results.length + 4; // データの2行下から
  const legendRows = [
    ['【凡例】'],
    ['確定フラグ: ✅=確定、❌=除外、空欄=未確認'],
    ['ルール化可否: ○=今後もルールとして登録、×=一時的、空欄=未判断'],
    ['修正用列が空の場合はAI推測結果をそのまま採用します'],
    [''],
    ['行の色: 薄緑=推測候補(70+点)、薄黄=要確認(30-69点)、薄赤=未判定(0-29点)、灰=除外(複合仕訳等)'],
  ];
  legendRows.forEach((row, idx) => {
    const cell = ws.getCell(footerStartRow + idx, 1);
    cell.value = row[0];
    cell.font = { size: 8, italic: true, color: { argb: '666666' } };
  });

  // --------------------------------------------------
  // サマリーシート
  // --------------------------------------------------
  const summaryWs = wb.addWorksheet('サマリー');
  summaryWs.columns = [
    { header: '項目', key: 'label', width: 30 },
    { header: '件数', key: 'count', width: 12 },
  ];
  summaryWs.getRow(1).font = { bold: true };

  summaryWs.addRow({ label: '合計', count: stats.total });
  summaryWs.addRow({ label: '推測する', count: stats.suggest });
  summaryWs.addRow({ label: '要確認', count: stats.review });
  summaryWs.addRow({ label: '除外（複合仕訳等）', count: stats.excluded });
  summaryWs.addRow({ label: '', count: '' });
  summaryWs.addRow({ label: '--- 取引類型別 ---', count: '' });
  for (const [type, count] of Object.entries(stats.byType)) {
    summaryWs.addRow({ label: TYPE_LABELS[type] || type, count });
  }
  summaryWs.addRow({ label: '', count: '' });
  summaryWs.addRow({ label: '--- 推測ソース別 ---', count: '' });
  for (const [source, count] of Object.entries(stats.bySource)) {
    summaryWs.addRow({ label: SOURCE_LABELS[source] || source, count });
  }

  // ファイル出力
  const timestamp = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 14);
  const monthSuffix = targetMonth ? `_${targetMonth}` : '';
  const fileName = `${companyName || companyId}_レビュー${monthSuffix}_${timestamp}.xlsx`;
  const filePath = path.join(outDir, fileName);
  await wb.xlsx.writeFile(filePath);

  return { filePath, stats };
}

module.exports = {
  generateReviewSheet,
  formatSubScores,
  generateReviewReason,
  COLUMNS,
  GROUPS,
  TYPE_LABELS,
  SOURCE_LABELS,
  CONFIDENCE_COLORS,
};
