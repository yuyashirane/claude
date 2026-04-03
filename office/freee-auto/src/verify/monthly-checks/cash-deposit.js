'use strict';

/**
 * cash-deposit.js — GA-1: 現金・預金チェック
 *
 * チェック一覧:
 *   CD-01 🔴 現金残高がマイナス
 *   CD-02 🔴 預金残高がマイナス（口座別）
 *   CD-03 🟡 現金残高が100万円超（実地棚卸との乖離リスク）
 *   CD-04 🟡 預金残高の前月比50%超変動
 *
 * データソース: data.trialBs（試算表BS）
 *   - account_category_name === '現金・預金' の科目を対象
 *   - 現金: account_item_name === '現金'
 *   - 預金: account_category_name === '現金・預金' かつ name !== '現金'
 */

const { getAllBalances } = require('./trial-helpers');

// ============================================================
// 現金・預金科目を抽出するヘルパー
// ============================================================

function getCashDeposits(trialBs) {
  return getAllBalances(trialBs).filter((b) => b.category === '現金・預金');
}

// ============================================================
// CD-01: 現金マイナスチェック
// ============================================================

function checkCashMinus(accounts, targetMonth, findings) {
  const cash = accounts.find((a) => a.name === '現金');
  if (!cash || cash.balance >= 0) return;

  findings.push({
    severity: '🔴',
    category: 'cash_deposit',
    checkCode: 'CD-01',
    description: `現金残高がマイナス（${cash.balance.toLocaleString()}円）です。記帳漏れまたは現金実査との不一致が考えられます。`,
    currentValue: `${cash.balance.toLocaleString()}円`,
    suggestedValue: '現金出納帳と照合し、入金/出金の記帳漏れを確認してください',
    confidence: 98,
    targetMonth,
  });
}

// ============================================================
// CD-02: 預金マイナスチェック
// ============================================================

function checkDepositMinus(accounts, targetMonth, findings) {
  // 「現金」以外の現金・預金科目が対象（銀行口座・クレジットカード等）
  const deposits = accounts.filter((a) => a.name !== '現金' && a.balance < 0);

  for (const dep of deposits) {
    findings.push({
      severity: '🔴',
      category: 'cash_deposit',
      checkCode: 'CD-02',
      description: `「${dep.name}」の残高がマイナス（${dep.balance.toLocaleString()}円）です。当座借越契約がない限り異常です。`,
      currentValue: `${dep.balance.toLocaleString()}円`,
      suggestedValue: '記帳漏れ、入金未処理、または口座間振替ミスを確認してください',
      confidence: 95,
      targetMonth,
    });
  }
}

// ============================================================
// CD-03: 現金100万円超チェック
// ============================================================

function checkCashOver1M(accounts, targetMonth, findings) {
  const THRESHOLD = 1_000_000;
  const cash = accounts.find((a) => a.name === '現金');
  if (!cash || cash.balance <= THRESHOLD) return;

  findings.push({
    severity: '🟡',
    category: 'cash_deposit',
    checkCode: 'CD-03',
    description: `現金残高が${cash.balance.toLocaleString()}円と高額です（100万円超）。現金実地棚卸との照合を確認してください。`,
    currentValue: `${cash.balance.toLocaleString()}円`,
    suggestedValue: '現金実査を実施し、帳簿残高と一致するか確認してください',
    confidence: 75,
    targetMonth,
  });
}

// ============================================================
// CD-04: 前月比50%超変動チェック
// ============================================================

function checkDepositFluctuation(accounts, prevMonthTrialBs, targetMonth, findings) {
  if (!prevMonthTrialBs) return;

  const prevAccounts = getAllBalances(prevMonthTrialBs).filter((b) => b.category === '現金・預金');

  for (const curr of accounts) {
    const prev = prevAccounts.find((p) => p.name === curr.name);
    if (!prev || prev.balance === 0) continue;

    const changeRate = Math.abs((curr.balance - prev.balance) / Math.abs(prev.balance));
    if (changeRate <= 0.5) continue;

    // 変動額が10万円未満は無視（ノイズ回避）
    const changeAmt = Math.abs(curr.balance - prev.balance);
    if (changeAmt < 100_000) continue;

    const direction = curr.balance > prev.balance ? '増加' : '減少';
    findings.push({
      severity: '🟡',
      category: 'cash_deposit',
      checkCode: 'CD-04',
      description: `「${curr.name}」の残高が前月比${(changeRate * 100).toFixed(0)}%${direction}しています（前月: ${prev.balance.toLocaleString()}円 → 当月: ${curr.balance.toLocaleString()}円）。`,
      currentValue: `${curr.balance.toLocaleString()}円`,
      suggestedValue: '大型入出金の内容を確認してください',
      confidence: 70,
      targetMonth,
    });
  }
}

// ============================================================
// メインエクスポート
// ============================================================

/**
 * 現金・預金チェック（GA-1）
 *
 * @param {import('../monthly-data-fetcher').MonthlyData} data
 * @returns {Array<import('../monthly-checker').Finding>}
 */
function cashDepositCheck(data) {
  const findings = [];
  const { trialBs, prevMonth, targetMonth } = data;

  if (!trialBs) return findings;

  const accounts = getCashDeposits(trialBs);
  if (accounts.length === 0) return findings;

  checkCashMinus(accounts, targetMonth, findings);
  checkDepositMinus(accounts, targetMonth, findings);
  checkCashOver1M(accounts, targetMonth, findings);
  checkDepositFluctuation(accounts, prevMonth?.trialBs ?? null, targetMonth, findings);

  return findings;
}

module.exports = { cashDepositCheck };
