'use strict';

const fs   = require('fs');
const path = require('path');

const {
  normalizeRoute,
  normalizeAccount,
  normalizePartnerName,
  normalizeAmount,
  normalizeWalletTxnId,
} = require('./normalize-helpers');

/**
 * past-deals.json から「取引先名 × 勘定科目名 → 平均金額」マップを構築
 *
 * past-deals.json の実際の構造:
 *   { cachedAt: string, patterns: { [partnerName]: { accountName, partnerName, count, lastDate } } }
 *
 * 注意: 現時点の past-deals.json には金額フィールド（avgAmount等）が存在しないため、
 * このマップは空 Map を返す。将来 avgAmount が追加された場合に備えて構造は維持する。
 *
 * @param {string} companyId
 * @returns {Map<string, number>}  key: "partnerName\taccount"  value: avgAmount
 */
function loadPastAmountMap(companyId) {
  const filePath = path.join(__dirname, '..', '..', '..', 'data', companyId, 'past-deals.json');
  if (!fs.existsSync(filePath)) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return new Map();
  }

  const patterns = parsed.patterns;
  if (!patterns || typeof patterns !== 'object') return new Map();

  const map = new Map();
  for (const p of Object.values(patterns)) {
    // avgAmount が付与された場合に対応（現時点は存在しないためスキップ）
    if (p.partnerName && p.accountName && typeof p.avgAmount === 'number' && p.avgAmount > 0) {
      const key = `${p.partnerName}\t${p.accountName}`;
      map.set(key, p.avgAmount);
    }
  }
  return map;
}

/**
 * 日付フィールドを複数パスから取得
 * - パイプライン形式: item.transaction?.date
 * - フラット形式:     item.date
 * - freee形式:        item._freee?.date
 */
function normalizeDate(item) {
  return item.date
    || item.transaction?.date
    || item._freee?.date
    || '';
}

/**
 * 金額の妥当性チェッカー
 * @param {Array}  items          - classifiedItems配列
 * @param {string} companyId      - 事業所ID
 * @param {Object} [opts={}]
 * @param {Map}    [opts.pastAmountMap] - テスト用注入（省略時はファイルから読み込む）
 * @returns {Array} Finding配列
 */
function amountChecker(items, companyId, { pastAmountMap: injectedMap } = {}) {
  const findings = [];
  const targets = items.filter(i => ['register', 'suggest'].includes(normalizeRoute(i)));

  // M-01: 過去パターンとの金額乖離
  // past-deals.json に avgAmount が存在する場合のみ動作（現時点は空 Map）
  const pastAmountMap = injectedMap !== undefined ? injectedMap : loadPastAmountMap(companyId);
  if (pastAmountMap.size > 0) {
    for (const item of targets) {
      const partnerName = normalizePartnerName(item);
      if (!partnerName) continue;

      const account    = normalizeAccount(item);
      const amount     = normalizeAmount(item);
      const id         = normalizeWalletTxnId(item);
      const key        = `${partnerName}\t${account}`;
      const avgAmount  = pastAmountMap.get(key);

      if (avgAmount && avgAmount > 0) {
        const ratio = amount / avgAmount;
        if (ratio >= 3) {
          findings.push({
            severity: '🟡',
            category: 'amount',
            checkCode: 'M-01',
            walletTxnId: id,
            description: `「${partnerName}」の${account}が過去平均（${Math.round(avgAmount).toLocaleString()}円）の${ratio.toFixed(1)}倍です（${amount.toLocaleString()}円）。`,
            currentValue: `${amount.toLocaleString()}円`,
            suggestedValue: `過去平均: ${Math.round(avgAmount).toLocaleString()}円`,
            confidence: 75,
          });
        }
      }
    }
  }

  // M-02: 端数のない大額取引（資金移動・立替等の可能性）
  for (const item of targets) {
    const amount = normalizeAmount(item);
    const id     = normalizeWalletTxnId(item);
    if (amount >= 100000 && amount % 10000 === 0) {
      findings.push({
        severity: '🔵',
        category: 'amount',
        checkCode: 'M-02',
        walletTxnId: id,
        description: `${amount.toLocaleString()}円（端数なし大額）: 資金移動・立替等の可能性があります。`,
        currentValue: `${amount.toLocaleString()}円`,
        suggestedValue: '資金移動・貸付等の場合は適切な科目に変更',
        confidence: 30,
      });
    }
  }

  // M-03: 同日同額の重複疑い
  // キー: "date|amount|partnerName"（区切り文字を | にしてパース問題を回避）
  const groups = new Map();
  for (const item of targets) {
    const date        = normalizeDate(item);
    const amount      = normalizeAmount(item);
    const partnerName = normalizePartnerName(item);
    const key         = `${date}|${amount}|${partnerName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [date, amountStr, partnerName] = key.split('|');
    const amount = Number(amountStr);
    const firstId = normalizeWalletTxnId(group[0]);
    findings.push({
      severity: '🟡',
      category: 'amount',
      checkCode: 'M-03',
      walletTxnId: firstId,
      description: `同日（${date}）・同額（${amount.toLocaleString()}円）・同取引先「${partnerName}」の取引が${group.length}件あります。重複計上の可能性があります。`,
      currentValue: `${group.length}件`,
      suggestedValue: '重複を確認し不要な取引を削除',
      confidence: 80,
    });
  }

  return findings;
}

module.exports = { amountChecker };
