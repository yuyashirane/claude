'use strict';

const fs = require('fs');
const path = require('path');

const {
  normalizeRoute,
  normalizePartnerName,
  normalizeDescription,
  normalizeWalletTxnId,
} = require('./normalize-helpers');

// overseas-services.js のimport（失敗しても既存動作に影響しない）
let detectOverseasService = null;
try {
  ({ detectOverseasService } = require('../../shared/overseas-services'));
} catch (e) {
  // overseas-services.js が利用できない環境ではスキップ
}

function loadPastDeals(companyId) {
  const filePath = path.join(__dirname, '..', '..', '..', 'data', companyId, 'past-deals.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function loadPartnersMaster(companyId) {
  const filePath = path.join(__dirname, '..', '..', '..', 'data', companyId, 'partners-master.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * @param {Array}  items     - classifiedItems配列
 * @param {string} companyId - 事業所ID
 * @param {Object} [opts={}]
 * @param {Set|null} [opts.knownPartners] - テスト用注入（省略時はファイルから読み込む）
 */
function newPartnerChecker(items, companyId, { knownPartners: injectedPartners } = {}) {
  const findings = [];
  const targets = items.filter(i => ['register', 'suggest'].includes(normalizeRoute(i)));

  const pastDeals = injectedPartners === undefined ? loadPastDeals(companyId) : null;
  const partnersMaster = loadPartnersMaster(companyId);

  // 過去の取引先名セットを構築
  // past-deals.json が存在しない場合は全件が「新規」になるためスキップ
  let knownPartners;
  if (injectedPartners !== undefined) {
    // テスト用注入値（null も有効: ファイルなしシミュレート）
    knownPartners = injectedPartners;
  } else if (pastDeals && pastDeals.patterns) {
    knownPartners = new Set(
      Object.values(pastDeals.patterns)
        .map(p => p.partnerName)
        .filter(Boolean)
    );
  } else {
    knownPartners = null;
  }

  // N-01: 新規取引先（過去データがある場合のみ実行）
  // alreadyReported で同一取引先の重複報告を防止
  if (knownPartners !== null) {
    const alreadyReported = new Set();
    for (const item of targets) {
      const partnerName = normalizePartnerName(item);
      const desc        = normalizeDescription(item);
      const id          = normalizeWalletTxnId(item);
      if (!partnerName) continue;
      if (alreadyReported.has(partnerName)) continue;

      // overseas-services.js に登録されているサービスは既知として除外
      // 取引先名・摘要の両方でマッチ確認（いずれか一方でヒットすれば除外）
      if (detectOverseasService) {
        const matched = detectOverseasService(partnerName) || detectOverseasService(desc);
        if (matched) continue;
      }

      if (!knownPartners.has(partnerName)) {
        alreadyReported.add(partnerName);
        findings.push({
          severity: '🟡',
          category: 'new_partner',
          checkCode: 'N-01',
          walletTxnId: id,
          description: `新規取引先「${partnerName}」が検出されました。インボイス登録番号の確認を推奨します。`,
          currentValue: partnerName,
          suggestedValue: 'インボイス登録番号を確認・登録',
          confidence: 80,
        });
      }
    }
  }

  // N-02: partners-masterにインボイス番号なし
  if (partnersMaster) {
    const masterArray = Array.isArray(partnersMaster) ? partnersMaster : partnersMaster.partners || [];
    for (const item of targets) {
      const partnerName = normalizePartnerName(item);
      const id = normalizeWalletTxnId(item);
      if (!partnerName) continue;

      const masterEntry = masterArray.find(p =>
        p.name === partnerName || p.partnerName === partnerName
      );
      if (masterEntry && !masterEntry.invoice_registration_number) {
        findings.push({
          severity: '🔵',
          category: 'new_partner',
          checkCode: 'N-02',
          walletTxnId: id,
          description: `取引先「${partnerName}」はマスタに登録済みですが、インボイス登録番号が未設定です。`,
          currentValue: 'インボイス番号: 未設定',
          suggestedValue: 'インボイス登録番号を取引先マスタに登録',
          confidence: 70,
        });
      }
    }
  }

  return findings;
}

module.exports = { newPartnerChecker };
