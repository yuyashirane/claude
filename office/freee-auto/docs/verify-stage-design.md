# VERIFY ステージ設計書

作成日: 2026-04-02
対象プロジェクト: freee-auto（`C:\Users\yuya_\claude\office\freee-auto\`）
前提: REGISTERパラダイムシフト完了、「大胆に登録 → 事後チェックで修正」方針

---

## 1. VERIFYステージの位置づけ

### パイプライン全体像

```
INPUT → NORMALIZE → CLASSIFY → REVIEW → REGISTER → VERIFY → LEARN
                                                      ↑ ここ
```

### なぜVERIFYが生命線か

「大胆登録方針」により、除外条件を2つ（複合仕訳・10万円以上）に絞り、それ以外は積極的に自動登録する。
この方針は登録率84.6%という成果を生んだが、誤登録リスクを事後チェックで担保する必要がある。

VERIFYの役割:
- 自動登録された取引の品質保証（科目・税区分・取引先の正しさ）
- 帳簿全体の整合性チェック（月次チェックリスト F-1〜HC-4 の自動実行）
- 異常・例外の早期発見と人への適切なエスカレーション

### 既存資産との関係

| 既存モジュール | 状態 | VERIFYでの位置づけ |
|---------------|------|-------------------|
| `src/verify/processing-report.js` | ✅ 稼働中 | パイプライン処理結果レポート（4シートExcel）。そのまま活用 |
| `src/verify/generate-audit-report.js` | ✅ 稼働中 | 帳簿チェックレポート（BS/PL分析）。拡張して活用 |
| `references/accounting/monthly-check-rules.md` | ✅ 整備済 | 15分野のチェック知識ベース。チェッカーの判断基準として参照 |
| `references/accounting/finance-analyzer.md` | ✅ 整備済 | 財務分析・異常値検出の知識ベース |
| Kintone App②（ID:448） | ✅ 稼働中 | 指摘事項の送付先。🔴🟡をKintoneに送付済みの実績あり |

---

## 2. VERIFY の2つのモード

VERIFYは以下の2モードで動作する。

### モード A: パイプライン直後チェック（post-register-checker）

**タイミング**: REGISTER完了直後に自動実行
**対象**: 今回のパイプライン実行で登録/推測された取引
**目的**: 登録直後の品質チェック（科目・税区分・タグの妥当性）

### モード B: 月次帳簿チェック（monthly-checker）

**タイミング**: 月次で手動実行（`node src/verify/monthly-checker.js --company {id} --month YYYY-MM`）
**対象**: 対象月の全取引・BS/PL残高
**目的**: 帳簿全体の整合性確認（月次チェックリスト F-1〜HC-4）

```
┌─────────────────────────────────────────────────────────┐
│  REGISTER完了                                            │
│    ↓                                                     │
│  モードA: post-register-checker                          │
│    ├── 科目チェック（雑費率、科目の妥当性）              │
│    ├── 税区分チェック（R01〜R12ルール適用）              │
│    ├── タグチェック（取引先・品目の必須タグ漏れ）        │
│    ├── 金額チェック（前回パターンとの乖離）              │
│    └── 新規取引先チェック（インボイス登録確認）          │
│    ↓                                                     │
│  指摘事項 → Kintone App② / Excelレポート                │
│                                                          │
│  ──── 月末 ────                                          │
│                                                          │
│  モードB: monthly-checker                                │
│    ├── F-1〜F-4: データ品質                              │
│    ├── GA-1: 現金・預金残高                              │
│    ├── HB1-1: 借入金残高                                 │
│    ├── GD-1/JC1-1: 固定資産                              │
│    ├── HD-1/HD-2: 家賃支払                               │
│    ├── JC2-1/JC2-2: 人件費・預り金                       │
│    ├── HB2-1/JA-1: 士業・外注支払                        │
│    ├── JB-1: 役員・株主関係                              │
│    ├── HA-1/GC-1: 売上・売掛金                           │
│    ├── JC3-1〜JC3-4: 仕入・経費                         │
│    └── HC-1〜HC-4: 営業外・税金                          │
│    ↓                                                     │
│  指摘事項 → Kintone App② / Excelレポート                │
└─────────────────────────────────────────────────────────┘
```

---

## 3. モードA: パイプライン直後チェック

### 3.1 ファイル構成

```
src/verify/
├── post-register-checker.js   ← 新規作成（メインオーケストレーター）
├── checkers/
│   ├── account-checker.js     ← 新規作成（科目チェック）
│   ├── tax-checker.js         ← 新規作成（税区分チェック）
│   ├── tag-checker.js         ← 新規作成（タグチェック）
│   ├── amount-checker.js      ← 新規作成（金額チェック）
│   └── new-partner-checker.js ← 新規作成（新規取引先チェック）
├── processing-report.js       ← 既存（変更なし）
└── generate-audit-report.js   ← 既存（変更なし）
```

### 3.2 post-register-checker.js（オーケストレーター）

```javascript
/**
 * パイプライン直後チェック
 * 
 * 入力: パイプライン処理結果（classifiedItems配列）
 * 出力: { findings: Finding[], summary: Summary }
 * 
 * Finding = {
 *   severity: '🔴' | '🟡' | '🔵',
 *   category: string,        // 'account' | 'tax' | 'tag' | 'amount' | 'new_partner'
 *   checkCode: string,       // 'A-01' | 'T-03' 等
 *   walletTxnId: number,
 *   description: string,     // 人が読む指摘文
 *   currentValue: string,    // 現在の値（例: '雑費'）
 *   suggestedValue: string,  // 推奨値（例: '消耗品費'）
 *   confidence: number,      // 指摘の確信度 0-100
 *   freeeLink: string,       // freee Web画面へのリンク
 * }
 */

async function postRegisterCheck(classifiedItems, companyId, options = {}) {
  const findings = [];
  
  // 各チェッカーを順次実行
  findings.push(...await accountChecker(classifiedItems, companyId));
  findings.push(...await taxChecker(classifiedItems, companyId));
  findings.push(...await tagChecker(classifiedItems, companyId));
  findings.push(...await amountChecker(classifiedItems, companyId));
  findings.push(...await newPartnerChecker(classifiedItems, companyId));
  
  // サマリー生成
  const summary = buildSummary(findings, classifiedItems);
  
  // Kintone App②へ送付（🔴🟡のみ）
  if (!options.dryRun) {
    await sendToKintone(findings.filter(f => f.severity !== '🔵'), companyId);
  }
  
  return { findings, summary };
}
```

### 3.3 各チェッカーの仕様

#### A. account-checker.js（科目チェック）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| A-01 | 🔴 | 雑費率が高い | register+suggest全体の20%以上が雑費 |
| A-02 | 🟡 | 雑費が個別に使われている | 金額1万円以上の雑費 → より適切な科目がないか |
| A-03 | 🔴 | 利息の方向間違い | 入金なのに支払利息、出金なのに受取利息 |
| A-04 | 🟡 | 売上高に出金がある | entry_side=expense なのに売上高 |
| A-05 | 🟡 | 仕入高に入金がある | entry_side=income なのに仕入高（返品除く） |
| A-06 | 🔵 | 消耗品費10万円以上 | 固定資産計上の可能性（※除外条件で弾いているはずだが念のため） |
| A-07 | 🔵 | 修繕費20万円以上 | 資本的支出の可能性 |

```javascript
/**
 * 科目チェッカー
 * 
 * 依存: なし（classifiedItemsの情報のみで判定）
 * 参照: references/accounting/account-dictionary.md
 */
function accountChecker(items, companyId) {
  const findings = [];
  const registeredItems = items.filter(i => 
    ['register', 'suggest'].includes(normalizeRoute(i))
  );
  
  // A-01: 雑費率チェック
  const miscCount = registeredItems.filter(i => 
    normalizeAccount(i) === '雑費'
  ).length;
  const miscRate = miscCount / registeredItems.length;
  if (miscRate >= 0.20) {
    findings.push({
      severity: '🔴',
      category: 'account',
      checkCode: 'A-01',
      description: `雑費率が${(miscRate*100).toFixed(1)}%（${miscCount}/${registeredItems.length}件）です。辞書の改善を検討してください。`,
      currentValue: `${miscCount}件`,
      suggestedValue: '辞書追加で削減',
    });
  }
  
  // A-03: 利息の方向チェック
  for (const item of registeredItems) {
    const account = normalizeAccount(item);
    const side = normalizeEntrySide(item);
    if (account === '支払利息' && side === 'income') {
      findings.push({
        severity: '🔴',
        checkCode: 'A-03',
        description: '入金取引に支払利息が割り当てられています。受取利息の可能性があります。',
        walletTxnId: item._freee?.id,
        currentValue: '支払利息',
        suggestedValue: '受取利息',
      });
    }
    // 逆方向も同様にチェック
  }
  
  return findings;
}
```

#### B. tax-checker.js（税区分チェック）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| T-01 | 🔴 | 海外サービスの課税区分ミス | overseas-services.jsに該当するのに「課対仕入」 |
| T-02 | 🔴 | 軽減税率の誤適用 | 非食品に軽減8%、食品に標準10% |
| T-03 | 🟡 | 非課税判定漏れの可能性 | 保険料・地代家賃（居住用）等で課対仕入 |
| T-04 | 🟡 | 不課税判定漏れの可能性 | 給与・社会保険料・税金等で課対仕入 |
| T-05 | 🔵 | 課税区分の確認推奨 | 信頼度スコアの税区分要素が10pt未満 |

```javascript
/**
 * 税区分チェッカー
 * 
 * 依存: src/shared/overseas-services.js（海外サービスDB）
 * 参照: references/tax/tax-classification-rules.md（R01〜R12）
 */
function taxChecker(items, companyId) {
  const findings = [];
  
  // T-01: 海外サービスチェック
  // overseas-services.jsのリストと照合し、
  // 該当するのに税区分が「課対仕入」のままのものを検出
  for (const item of items) {
    const desc = normalizeDescription(item);
    const overseasMatch = findOverseasService(desc);
    if (overseasMatch && normalizeeTaxLabel(item) === '課対仕入') {
      findings.push({
        severity: '🔴',
        checkCode: 'T-01',
        description: `海外サービス「${overseasMatch.name}」ですが課対仕入になっています。`,
        currentValue: '課対仕入',
        suggestedValue: overseasMatch.invoiceRegistered ? '課対仕入（適格）' : '対象外',
      });
    }
  }
  
  // T-02: 軽減税率チェック
  // account-matcher.jsのreducedRateKeywords / nonFoodKeywordsと同じロジック
  // → CLASSIFYで判定済みの結果を二重チェック
  
  return findings;
}
```

#### C. tag-checker.js（タグチェック）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| G-01 | 🔴 | 売上高の取引先タグ漏れ | 売上高・売掛金に取引先タグなし |
| G-02 | 🔴 | 外注費の取引先タグ漏れ | 外注費・支払報酬に取引先タグなし |
| G-03 | 🟡 | 預り金の品目タグ漏れ | 預り金に品目タグ（源泉/住民税等）なし |
| G-04 | 🟡 | 借入金の品目タグ漏れ | 借入金に品目タグ（契約別）なし |
| G-05 | 🔵 | 地代家賃の取引先タグ漏れ | 地代家賃に取引先タグなし（物件特定不可） |

```javascript
/**
 * タグチェッカー
 * 
 * 参照: references/rules/partner-tag-rules.md
 * 参照: references/rules/item-tag-rules.md
 */

// 取引先タグ必須科目
const PARTNER_TAG_REQUIRED = [
  '売上高', '売掛金', '買掛金', '外注費', '支払手数料',
  '支払報酬料', '地代家賃', '役員貸付金', '役員借入金'
];

// 品目タグ必須科目
const ITEM_TAG_REQUIRED = [
  '預り金', '借入金', '長期借入金', 'リース債務',
  '長期前払費用', '敷金・保証金'
];
```

#### D. amount-checker.js（金額チェック）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| M-01 | 🟡 | 過去パターンとの金額乖離 | 同じ取引先・科目で過去平均の3倍以上 |
| M-02 | 🔵 | 端数のない大額取引 | 10万円単位のきりのいい金額（資金移動の可能性） |
| M-03 | 🟡 | 同日同額の重複疑い | 同日・同額・同取引先の取引が2件以上 |

```javascript
/**
 * 金額チェッカー
 * 
 * 依存: data/{companyId}/past-deals.json（過去パターン）
 */
function amountChecker(items, companyId) {
  // past-deals.jsonから取引先×科目の平均金額を算出
  // 今回の取引と比較して乖離を検出
}
```

#### E. new-partner-checker.js（新規取引先チェック）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| N-01 | 🟡 | 新規取引先（過去12ヶ月で初出） | インボイス登録番号の確認を促す |
| N-02 | 🔵 | 新規取引先のインボイス区分 | 「取引先情報に準拠」が設定されているか |

```javascript
/**
 * 新規取引先チェッカー
 * 
 * 依存: data/{companyId}/partners-master.json
 * 依存: data/{companyId}/past-deals.json
 */
function newPartnerChecker(items, companyId) {
  // past-deals.jsonの取引先リストと比較
  // 過去12ヶ月に登場していない取引先を「新規」として検出
  // → インボイス登録番号の確認を促す
}
```

### 3.4 normalizeItem対応

各チェッカーは設計書のフラット構造と実装のネスト構造の両方に対応するため、
既存の `normalizeItem()` パターンを踏襲するヘルパー関数を使う。

```javascript
// src/verify/checkers/normalize-helpers.js（新規作成）

function normalizeRoute(item) {
  return item.routeDestination 
    || item.routing?.decision 
    || item._routing?.decision 
    || 'unknown';
}

function normalizeAccount(item) {
  return item.accountName 
    || item.classification?.accountName 
    || item._classification?.accountName 
    || '';
}

function normalizeEntrySide(item) {
  return item.entrySide 
    || item.classification?.entrySide 
    || item._freee?.entry_side 
    || '';
}

function normalizeTaxLabel(item) {
  return item.taxLabel 
    || item.classification?.taxLabel 
    || '';
}

function normalizeDescription(item) {
  return item.description 
    || item._freee?.description 
    || '';
}

function normalizePartnerName(item) {
  return item.partnerName 
    || item.classification?.partnerName 
    || '';
}

function normalizeAmount(item) {
  return item.amount 
    || item._freee?.amount 
    || 0;
}

module.exports = {
  normalizeRoute, normalizeAccount, normalizeEntrySide,
  normalizeTaxLabel, normalizeDescription, normalizePartnerName,
  normalizeAmount,
};
```

---

## 4. モードB: 月次帳簿チェック

### 4.1 ファイル構成

```
src/verify/
├── monthly-checker.js         ← 新規作成（メインオーケストレーター）
├── monthly-checks/
│   ├── data-quality.js        ← F-1〜F-4: データ品質
│   ├── cash-deposit.js        ← GA-1: 現金・預金
│   ├── loan-lease.js          ← HB1-1: 借入金・リース
│   ├── fixed-asset.js         ← GD-1, JC1-1: 固定資産
│   ├── rent.js                ← HD-1, HD-2: 家賃支払
│   ├── payroll.js             ← JC2-1, JC2-2: 人件費・預り金
│   ├── outsource.js           ← HB2-1, JA-1: 士業・外注
│   ├── officer-loan.js        ← JB-1: 役員・株主関係
│   ├── revenue-receivable.js  ← HA-1, GC-1: 売上・売掛金
│   ├── purchase-payable.js    ← JC3-1〜JC3-4: 仕入・経費
│   └── extraordinary-tax.js   ← HC-1〜HC-4, JC3-5〜JC3-8: 営業外・税金
├── generate-audit-report.js   ← 既存（拡張して新チェック結果を統合）
└── processing-report.js       ← 既存（変更なし）
```

### 4.2 monthly-checker.js（オーケストレーター）

```javascript
/**
 * 月次帳簿チェック
 * 
 * 実行コマンド:
 *   node src/verify/monthly-checker.js --company 474381 --month 2026-03
 * 
 * 処理フロー:
 *   1. freee-MCPでBS/PL/取引データを取得
 *   2. 11個のチェックモジュールを順次実行
 *   3. Excelレポート生成（reports/{companyId}/）
 *   4. 🔴🟡をKintone App②に送付
 * 
 * 入力: companyId, targetMonth (YYYY-MM)
 * 出力: { findings: Finding[], report: string(ファイルパス) }
 */

async function monthlyCheck(companyId, targetMonth, options = {}) {
  // 1. データ取得（freee-MCP経由）
  const data = await fetchMonthlyData(companyId, targetMonth);
  // data = {
  //   trialBs: {},        // 試算表BS（月次、品目別、取引先別）
  //   trialPl: {},        // 試算表PL（月次、品目別、取引先別）
  //   deals: [],          // 対象月の取引一覧
  //   walletTxns: [],     // 対象月の明細一覧
  //   accountItems: [],   // 勘定科目マスタ
  //   partners: [],       // 取引先マスタ
  //   fixedAssets: [],    // 固定資産台帳（取得可能なら）
  // }
  
  // 2. 前月・前年同月のデータも取得（比較用）
  const prevMonth = await fetchMonthlyData(companyId, getPrevMonth(targetMonth));
  const prevYearMonth = await fetchMonthlyData(companyId, getPrevYearMonth(targetMonth));
  
  const context = { data, prevMonth, prevYearMonth, companyId, targetMonth };
  
  // 3. 各チェックモジュールを実行
  const findings = [];
  findings.push(...await dataQualityCheck(context));
  findings.push(...await cashDepositCheck(context));
  findings.push(...await loanLeaseCheck(context));
  findings.push(...await fixedAssetCheck(context));
  findings.push(...await rentCheck(context));
  findings.push(...await payrollCheck(context));
  findings.push(...await outsourceCheck(context));
  findings.push(...await officerLoanCheck(context));
  findings.push(...await revenueReceivableCheck(context));
  findings.push(...await purchasePayableCheck(context));
  findings.push(...await extraordinaryTaxCheck(context));
  
  // 4. レポート生成
  const reportPath = await generateMonthlyReport(findings, context);
  
  // 5. Kintone App②送付
  if (!options.dryRun) {
    await sendToKintone(
      findings.filter(f => f.severity !== '🔵'),
      companyId
    );
  }
  
  return { findings, reportPath };
}
```

### 4.3 freee-MCP データ取得仕様

```javascript
/**
 * fetchMonthlyData() で取得するfreeeデータ一覧
 * 
 * freee-MCPの14ツールのうち、VERIFYで使用するもの:
 */

async function fetchMonthlyData(companyId, targetMonth) {
  const [year, month] = targetMonth.split('-').map(Number);
  
  // 事業所の会計年度を取得して期首月を特定
  // freee_api_get /api/1/companies/{id}
  
  return {
    // 試算表BS（月次残高）
    // freee_api_get /api/1/reports/trial_bs
    //   params: fiscal_year, start_month, end_month
    trialBs: await getTrialBs(companyId, year, month),
    
    // 試算表BS（品目別）— 借入金・預り金の品目タグ確認用
    // freee_api_get /api/1/reports/trial_bs
    //   params: breakdown_display_type=item
    trialBsByItem: await getTrialBsByItem(companyId, year, month),
    
    // 試算表BS（取引先別）— 売掛金・買掛金の滞留確認用
    // freee_api_get /api/1/reports/trial_bs
    //   params: breakdown_display_type=partner
    trialBsByPartner: await getTrialBsByPartner(companyId, year, month),
    
    // 試算表PL（月次）
    // freee_api_get /api/1/reports/trial_pl
    trialPl: await getTrialPl(companyId, year, month),
    
    // 試算表PL（取引先別）— 売上・家賃の取引先別確認用
    // freee_api_get /api/1/reports/trial_pl
    //   params: breakdown_display_type=partner
    trialPlByPartner: await getTrialPlByPartner(companyId, year, month),
    
    // 取引一覧（対象月）
    // freee_api_get /api/1/deals
    //   params: start_date, end_date, limit=100, offset=0
    //   ※ ページネーション必要
    deals: await getDeals(companyId, year, month),
    
    // 未処理明細
    // freee_api_get /api/1/wallet_txns
    //   params: status=unregistered
    unregisteredTxns: await getUnregisteredTxns(companyId),
    
    // 勘定科目マスタ（キャッシュあり）
    // data/{companyId}/account-items-master.json
    accountItems: await loadMaster(companyId, 'account-items-master'),
    
    // 取引先マスタ（キャッシュあり）
    // data/{companyId}/partners-master.json
    partners: await loadMaster(companyId, 'partners-master'),
  };
}
```

### 4.4 各チェックモジュールの仕様

#### data-quality.js（F-1〜F-4）

| チェックコード | 元手続 | 重要度 | チェック内容 | freeeデータ源 |
|---------------|--------|--------|-------------|--------------|
| DQ-01 | F-2 | 🔴 | 未登録取引が残っている | wallet_txns (unregistered) |
| DQ-02 | F-3 | 🟡 | 重複計上の疑い | deals（同日・同額・同取引先） |
| DQ-03 | F-4 | 🔵 | 自動登録ルールの最適化提案 | suggest件数が多い場合 |

#### cash-deposit.js（GA-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| CD-01 | 🔴 | 現金残高マイナス | trial_bs 現金 < 0 |
| CD-02 | 🔴 | 預金残高マイナス | trial_bs 普通預金 < 0（当座借越除く） |
| CD-03 | 🟡 | 現金残高が100万円超 | trial_bs 現金 > 1,000,000 |
| CD-04 | 🟡 | 預金残高の前月比50%超変動 | abs(当月-前月)/前月 > 0.5 |

#### loan-lease.js（HB1-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| LL-01 | 🔴 | 借入金残高マイナス | trial_bs 借入金 < 0 |
| LL-02 | 🟡 | 借入金の品目タグ漏れ | trial_bs(品目別)で品目なしの借入金残高あり |
| LL-03 | 🟡 | 借入金の非定額減少 | 品目別に前月差が一定でない（±1,000円超の変動） |

#### fixed-asset.js（GD-1, JC1-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| FA-01 | 🔴 | 消耗品費10万円以上の単一取引 | deals 消耗品費 ≥ 100,000 |
| FA-02 | 🟡 | 修繕費20万円以上の単一取引 | deals 修繕費 ≥ 200,000 |
| FA-03 | 🔵 | 固定資産台帳との残高不一致 | trial_bs 有形固定資産 ≠ 台帳合計（取得可能時） |

#### rent.js（HD-1, HD-2）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| RT-01 | 🟡 | 地代家賃の金額変動 | 取引先別PLで前月と異なる金額 |
| RT-02 | 🟡 | 更新料・礼金20万円以上 | deals 地代家賃 ≥ 200,000 の非定期取引 |
| RT-03 | 🔵 | 地代家賃の取引先タグ漏れ | 取引先別PLで取引先「未設定」の地代家賃 |

#### payroll.js（JC2-1, JC2-2）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| PY-01 | 🔴 | 役員報酬の期中変動 | 月次PLで役員報酬が前月と異なる（±100円超） |
| PY-02 | 🟡 | 法定福利費の異常 | 給与合計の14-15%から大きく乖離（±30%超） |
| PY-03 | 🟡 | 源泉税・住民税の滞留 | 預り金(品目:源泉/住民税)が2ヶ月以上残高あり |
| PY-04 | 🔵 | 給与手当の前月比異常 | 前月比30%超の変動 |

#### outsource.js（HB2-1, JA-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| OS-01 | 🟡 | 士業報酬の源泉徴収確認 | 外注費・支払報酬で士業取引先への支払いに源泉がない |
| OS-02 | 🟡 | 外注の源泉税滞留 | 士業以外の外注源泉 → 納期特例なし、翌月10日 |

#### officer-loan.js（JB-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| OL-01 | 🔴 | 役員貸付金・借入金のマイナス残高 | trial_bs < 0 |
| OL-02 | 🟡 | 役員貸付金の増加 | 前月比で増加 → 認定利息リスク |
| OL-03 | 🟡 | 立替経費のマイナス残高 | trial_bs 立替経費 < 0 |

#### revenue-receivable.js（HA-1, GC-1）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| RR-01 | 🟡 | 売上の月次推移異常 | 前月比50%超 or 前年同月比30%超の変動 |
| RR-02 | 🟡 | 売掛金の滞留 | 取引先別BSで2ヶ月以上残高が変動していない |
| RR-03 | 🔵 | 売上の取引先タグ漏れ | 取引先別PLで取引先「未設定」の売上 |

#### purchase-payable.js（JC3-1〜JC3-4）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| PP-01 | 🟡 | 仕入の月次推移異常 | 前月比50%超の変動 |
| PP-02 | 🟡 | 買掛金・未払金の滞留 | 取引先別BSで2ヶ月以上残高が変動していない |
| PP-03 | 🟡 | クレジットカード未払金の滞留 | 先月以前の利用分が未決済 |
| PP-04 | 🔵 | その他経費の異常 | 前月比50%超、未出現科目の発生 |

#### extraordinary-tax.js（HC-1〜HC-4, JC3-5〜JC3-8）

| チェックコード | 重要度 | チェック内容 | 判定基準 |
|---------------|--------|-------------|---------|
| ET-01 | 🔴 | 未確定損益・仮払金に残高あり | trial_bs ≠ 0 |
| ET-02 | 🔴 | 資金諸口に残高あり | trial_bs ≠ 0 |
| ET-03 | 🟡 | 仮受金・仮払金に残高あり | trial_bs ≠ 0（内容説明要） |
| ET-04 | 🟡 | 未払法人税等がゼロでない | 期首+2ヶ月以降で残高あり |
| ET-05 | 🟡 | 未払消費税等がゼロでない | 期首+2ヶ月以降で残高あり |
| ET-06 | 🔵 | 雑収入・雑損失の内容確認 | 残高あり → 内容説明できるか |
| ET-07 | 🔵 | 受取利息の源泉税確認 | 法人で6円以上の受取利息 → 源泉税処理 |

---

## 5. Kintone App② 送付仕様

### 送付対象

- モードA: 🔴🟡 の指摘のみ
- モードB: 🔴🟡 の指摘のみ
- 🔵 はExcelレポートにのみ記載（Kintoneには送付しない）

### フィールドマッピング

```javascript
// Kintone App②（ID:448）へのレコード変換
function toKintoneRecord(finding, companyId, mode) {
  return {
    顧客コード: { value: getCustomerCode(companyId) },   // 顧客カルテとルックアップ
    record_type: { value: mode === 'A' ? 'post_register' : 'monthly_check' },
    fiscal_year: { value: getFiscalYear(companyId) },
    target_month: { value: finding.targetMonth || '' },
    severity: { value: finding.severity },                 // 🔴 or 🟡
    check_code: { value: finding.checkCode },              // 'A-01', 'CD-01' 等
    category: { value: finding.category },                 // 'account', 'tax' 等
    description: { value: finding.description },           // 人が読む指摘文
    current_value: { value: finding.currentValue || '' },
    suggested_value: { value: finding.suggestedValue || '' },
    freee_link: { value: finding.freeeLink || '' },
    checked_by: { value: 'Claude Code' },
    checked_at: { value: new Date().toISOString() },
  };
}
```

### App②のフィールド追加（必要に応じて）

現在のApp②に以下のフィールドが未設定の場合は追加が必要:

| フィールドコード | 型 | 用途 |
|-----------------|-----|------|
| check_code | 文字列（1行） | チェックコード（A-01等） |
| category | ドロップダウン | カテゴリ（account/tax/tag/amount等） |
| current_value | 文字列（1行） | 現在の値 |
| suggested_value | 文字列（1行） | 推奨値 |
| freee_link | リンク | freee画面へのリンク |

---

## 6. Excelレポート仕様

### モードA: パイプライン直後チェックレポート

既存の `processing-report.js` の4シートExcelに**5枚目のシート「事後チェック結果」を追加**。

```
シート5: 事後チェック結果
├── 列A: 重要度（🔴🟡🔵）
├── 列B: チェックコード
├── 列C: カテゴリ
├── 列D: 対象取引ID
├── 列E: 指摘内容
├── 列F: 現在の値
├── 列G: 推奨値
├── 列H: freeeリンク
└── 列I: 確信度
```

出力先: `reports/{companyId}/processing_report_{timestamp}.xlsx`

### モードB: 月次チェックレポート

既存の `generate-audit-report.js` を拡張し、**新チェック結果を統合**。

```
シート1: サマリー
├── 対象事業所・対象月
├── チェック実行日時
├── 指摘件数（🔴/🟡/🔵の内訳）
└── 前月との比較（改善/悪化/新規）

シート2: 指摘一覧（全件）
├── 重要度/チェックコード/カテゴリ/指摘内容/現在値/推奨値/freeeリンク
└── フィルター・ソート可能な表形式

シート3: BS残高チェック
├── 科目別の当月残高・前月残高・前月差・判定結果
└── マイナス残高・異常増減にハイライト

シート4: PL月次推移
├── 科目別の月次金額推移（6ヶ月分）
└── 異常変動にハイライト

シート5: 取引先別残高
├── 売掛金・買掛金の取引先別残高
└── 滞留にハイライト
```

出力先: `reports/{companyId}/monthly_check_{targetMonth}_{timestamp}.xlsx`

---

## 7. 異常値検出の基準

`references/accounting/monthly-check-rules.md` および `finance-analyzer.md` に基づく統一基準。

### 金額基準

| 基準 | 閾値 | 重要度 |
|------|------|--------|
| 売上の月次変動 | 前月比50%超 or 前年同月比30%超 | 🟡 |
| 経費の月次変動 | 前月比50%超 | 🟡 |
| 残高の急変 | 前月比50%超変動 | 🟡 |
| マイナス残高 | < 0（資産科目） | 🔴 |
| ゼロであるべき科目に残高 | ≠ 0（資金諸口、未確定損益等） | 🔴 |
| 高額取引 | 10万円以上（消耗品費）、20万円以上（修繕費） | 🔴 or 🟡 |
| 滞留債権・債務 | 2ヶ月以上同額残高 | 🟡 |

### 比率基準

| 基準 | 閾値 | 重要度 |
|------|------|--------|
| 雑費率 | 全体の20%以上 | 🔴 |
| 法定福利費 / 給与 | 14-15%から±30%超乖離 | 🟡 |
| 原価率 | 業種平均から±20%超乖離 | 🔵 |

### 定額性基準

| 基準 | 閾値 | 重要度 |
|------|------|--------|
| 役員報酬の変動 | ±100円超 | 🔴 |
| 借入金の返済額変動 | ±1,000円超 | 🟡 |
| 家賃の変動 | 前月と異なる | 🟡 |

---

## 8. 実装計画

### Phase 1: モードA（パイプライン直後チェック）

**優先度: 最高**
**見積もり: 2-3日**

```
実装順序:
1. normalize-helpers.js（チェッカー共通ヘルパー）
2. account-checker.js（A-01〜A-07）
3. tax-checker.js（T-01〜T-05）
4. tag-checker.js（G-01〜G-05）
5. amount-checker.js（M-01〜M-03）
6. new-partner-checker.js（N-01〜N-02）
7. post-register-checker.js（オーケストレーター）
8. processing-report.js にシート5追加
9. テスト作成（tests/test-post-register-checker.js）
```

テスト方針:
- 各チェッカーは単体テストで検証（モックデータ使用）
- 統合テストは474381（自社）の実データで実行
- 既存テスト（148件）に影響ゼロ

### Phase 2: モードB（月次帳簿チェック）

**優先度: 高**
**見積もり: 3-5日**

```
実装順序:
1. fetchMonthlyData()（freee-MCPデータ取得）
2. data-quality.js（DQ-01〜DQ-03）
3. cash-deposit.js（CD-01〜CD-04）
4. payroll.js（PY-01〜PY-04）← 役員報酬は最重要
5. extraordinary-tax.js（ET-01〜ET-07）← 残高ゼロ確認は基本
6. loan-lease.js（LL-01〜LL-03）
7. officer-loan.js（OL-01〜OL-03）
8. fixed-asset.js（FA-01〜FA-03）
9. rent.js（RT-01〜RT-03）
10. revenue-receivable.js（RR-01〜RR-03）
11. purchase-payable.js（PP-01〜PP-04）
12. outsource.js（OS-01〜OS-02）
13. monthly-checker.js（オーケストレーター）
14. Excelレポート（5シート）
15. テスト作成
```

### Phase 3: 拡張

- 前年同月比較の精度向上
- 業種別パラメータ（飲食・IT・小売で閾値を変える）
- Kintone App②からの「対応済み」フィードバックの取り込み
- LEARNステージとの連携（誤検知の学習による閾値自動調整）

---

## 9. 設計上の原則

### 既存コード変更ゼロの原則

- `post-register-checker.js` は新規ファイル。既存の `unprocessed-processor.js` や `rule-csv-generator.js` に変更を加えない
- `processing-report.js` へのシート追加は、既存4シートに影響しない形で5枚目を追加するのみ
- `generate-audit-report.js` の拡張も、既存ロジックを壊さない追加のみ

### DRY_RUN原則

- Kintone App②への送付は `--dry-run` オプションでスキップ可能
- ドライラン時は指摘内容をコンソールに出力して確認

### テスト保護

- 既存テスト（148件 + past-pattern-store 53件）に影響を与えない
- 新規テストファイルを追加: `tests/test-post-register-checker.js`, `tests/test-monthly-checker.js`

### normalizeItem()パターンの踏襲

- 設計書のフラット構造と実装のネスト構造の差異は `normalize-helpers.js` で吸収
- 各チェッカーは `normalizeXxx()` 関数経由でデータにアクセスし、構造に依存しない

---

## 10. Claude Code への指示テンプレート

### Phase 1 実装開始時の指示

```
freee-autoプロジェクトで、VERIFYステージのPhase 1（パイプライン直後チェック）を実装してください。

設計書: docs/verify-stage-design.md のセクション3を参照

実装順序:
1. src/verify/checkers/normalize-helpers.js を作成
   - normalizeRoute, normalizeAccount, normalizeEntrySide, normalizeTaxLabel,
     normalizeDescription, normalizePartnerName, normalizeAmount の7関数
   - 設計書のフラット構造と実装のネスト構造の両方に対応

2. src/verify/checkers/account-checker.js を作成
   - A-01〜A-07 の7チェック
   - accountChecker(classifiedItems, companyId) → Finding[]

3. src/verify/checkers/tax-checker.js を作成
   - T-01〜T-05 の5チェック
   - src/shared/overseas-services.js を使用

4. src/verify/checkers/tag-checker.js を作成
   - G-01〜G-05 の5チェック
   - references/rules/partner-tag-rules.md, item-tag-rules.md を参照

5. src/verify/checkers/amount-checker.js を作成
   - M-01〜M-03 の3チェック
   - data/{companyId}/past-deals.json を使用

6. src/verify/checkers/new-partner-checker.js を作成
   - N-01〜N-02 の2チェック

7. src/verify/post-register-checker.js を作成
   - 上記5チェッカーを統合するオーケストレーター
   - Kintone App②送付（dryRunオプション付き）

8. tests/test-post-register-checker.js を作成
   - 各チェッカーの単体テスト + 統合テスト
   - モックデータを使用

注意事項:
- 既存ファイルへの変更はゼロにしてください
- Finding型は設計書セクション3.2のJSDocに従ってください
- テスト完了後、npm test で既存148件が通ることを確認してください
```

---

## 付録: チェックコード一覧

| コード | カテゴリ | モード | 重要度 | 内容 |
|--------|---------|--------|--------|------|
| A-01 | 科目 | A | 🔴 | 雑費率20%超 |
| A-02 | 科目 | A | 🟡 | 雑費1万円以上 |
| A-03 | 科目 | A | 🔴 | 利息の方向間違い |
| A-04 | 科目 | A | 🟡 | 売上高に出金 |
| A-05 | 科目 | A | 🟡 | 仕入高に入金 |
| A-06 | 科目 | A | 🔵 | 消耗品費10万円以上 |
| A-07 | 科目 | A | 🔵 | 修繕費20万円以上 |
| T-01 | 税区分 | A | 🔴 | 海外サービスの課税区分ミス |
| T-02 | 税区分 | A | 🔴 | 軽減税率の誤適用 |
| T-03 | 税区分 | A | 🟡 | 非課税判定漏れ |
| T-04 | 税区分 | A | 🟡 | 不課税判定漏れ |
| T-05 | 税区分 | A | 🔵 | 課税区分の確認推奨 |
| G-01 | タグ | A | 🔴 | 売上高の取引先タグ漏れ |
| G-02 | タグ | A | 🔴 | 外注費の取引先タグ漏れ |
| G-03 | タグ | A | 🟡 | 預り金の品目タグ漏れ |
| G-04 | タグ | A | 🟡 | 借入金の品目タグ漏れ |
| G-05 | タグ | A | 🔵 | 地代家賃の取引先タグ漏れ |
| M-01 | 金額 | A | 🟡 | 過去パターンとの金額乖離 |
| M-02 | 金額 | A | 🔵 | 端数のない大額取引 |
| M-03 | 金額 | A | 🟡 | 同日同額の重複疑い |
| N-01 | 新規取引先 | A | 🟡 | 新規取引先（インボイス確認） |
| N-02 | 新規取引先 | A | 🔵 | インボイス区分確認 |
| DQ-01 | データ品質 | B | 🔴 | 未登録取引が残っている |
| DQ-02 | データ品質 | B | 🟡 | 重複計上の疑い |
| DQ-03 | データ品質 | B | 🔵 | 自動登録ルール最適化提案 |
| CD-01 | 現金・預金 | B | 🔴 | 現金残高マイナス |
| CD-02 | 現金・預金 | B | 🔴 | 預金残高マイナス |
| CD-03 | 現金・預金 | B | 🟡 | 現金残高100万円超 |
| CD-04 | 現金・預金 | B | 🟡 | 預金残高の前月比50%超変動 |
| LL-01 | 借入金 | B | 🔴 | 借入金残高マイナス |
| LL-02 | 借入金 | B | 🟡 | 借入金の品目タグ漏れ |
| LL-03 | 借入金 | B | 🟡 | 借入金の非定額減少 |
| FA-01 | 固定資産 | B | 🔴 | 消耗品費10万円以上の単一取引 |
| FA-02 | 固定資産 | B | 🟡 | 修繕費20万円以上の単一取引 |
| FA-03 | 固定資産 | B | 🔵 | 固定資産台帳との残高不一致 |
| RT-01 | 家賃 | B | 🟡 | 地代家賃の金額変動 |
| RT-02 | 家賃 | B | 🟡 | 更新料・礼金20万円以上 |
| RT-03 | 家賃 | B | 🔵 | 地代家賃の取引先タグ漏れ |
| PY-01 | 人件費 | B | 🔴 | 役員報酬の期中変動 |
| PY-02 | 人件費 | B | 🟡 | 法定福利費の異常 |
| PY-03 | 人件費 | B | 🟡 | 源泉税・住民税の滞留 |
| PY-04 | 人件費 | B | 🔵 | 給与手当の前月比異常 |
| OS-01 | 外注 | B | 🟡 | 士業報酬の源泉徴収確認 |
| OS-02 | 外注 | B | 🟡 | 外注の源泉税滞留 |
| OL-01 | 役員関係 | B | 🔴 | 役員貸付金・借入金のマイナス残高 |
| OL-02 | 役員関係 | B | 🟡 | 役員貸付金の増加 |
| OL-03 | 役員関係 | B | 🟡 | 立替経費のマイナス残高 |
| RR-01 | 売上 | B | 🟡 | 売上の月次推移異常 |
| RR-02 | 売上 | B | 🟡 | 売掛金の滞留 |
| RR-03 | 売上 | B | 🔵 | 売上の取引先タグ漏れ |
| PP-01 | 仕入 | B | 🟡 | 仕入の月次推移異常 |
| PP-02 | 仕入 | B | 🟡 | 買掛金・未払金の滞留 |
| PP-03 | 仕入 | B | 🟡 | クレジットカード未払金の滞留 |
| PP-04 | 仕入 | B | 🔵 | その他経費の異常 |
| ET-01 | 営業外・税金 | B | 🔴 | 未確定損益・仮払金に残高 |
| ET-02 | 営業外・税金 | B | 🔴 | 資金諸口に残高 |
| ET-03 | 営業外・税金 | B | 🟡 | 仮受金・仮払金に残高 |
| ET-04 | 営業外・税金 | B | 🟡 | 未払法人税等がゼロでない |
| ET-05 | 営業外・税金 | B | 🟡 | 未払消費税等がゼロでない |
| ET-06 | 営業外・税金 | B | 🔵 | 雑収入・雑損失の内容確認 |
| ET-07 | 営業外・税金 | B | 🔵 | 受取利息の源泉税確認 |

**合計: 57チェック（🔴 15件、🟡 28件、🔵 14件）**
