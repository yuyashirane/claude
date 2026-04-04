# VERIFY ステージ設計書 v2

作成日: 2026-04-02（初版）
更新日: 2026-04-04（v2.1: TC/WT/AT追加 + report-config分離 + スキル定義）
対象プロジェクト: freee-auto（`C:\Users\yuya_\claude\office\freee-auto\`）
前提: REGISTERパラダイムシフト完了、「大胆に登録 → 事後チェックで修正」方針

---

## 1. VERIFYステージの位置づけ

### パイプライン全体像

```
INPUT → NORMALIZE → CLASSIFY → REVIEW → REGISTER → VERIFY → LEARN
                                                      ✅完了     次フェーズ
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
| `src/verify/generate-audit-report.js` | ✅ 残存（B案） | 帳簿チェックレポート（BS/PL分析）。monthly-checker.js に機能的に置き換え済み |
| `references/accounting/monthly-check-rules.md` | ✅ 整備済 | 15分野のチェック知識ベース。チェッカーの判断基準として参照 |
| `references/accounting/finance-analyzer.md` | ✅ 整備済 | 財務分析・異常値検出の知識ベース |
| Kintone App②（ID:448） | ✅ 稼働中 | 指摘事項の送付先。🔴🟡をKintoneに送付済みの実績あり |

---

## 2. VERIFY の2つのモード

### モード A: パイプライン直後チェック（post-register-checker） ✅ 実装済み

**タイミング**: REGISTER完了直後に自動実行
**対象**: 今回のパイプライン実行で登録/推測された取引
**目的**: 登録直後の品質チェック（科目・税区分・タグの妥当性）
**チェック数**: 22チェック（A-01〜N-02）

### モード B: 月次帳簿チェック（monthly-checker） ✅ 実装済み

**タイミング**: 月次で手動実行（`node src/verify/monthly-checker.js --company {id} --month YYYY-MM`）
**対象**: 対象月の全取引・BS/PL残高
**目的**: 帳簿全体の整合性確認（月次チェックリスト F-1〜HC-4）
**チェック数**: 70チェックコード（DQ-01〜AT-03、17モジュール）

```
┌─────────────────────────────────────────────────────────┐
│  REGISTER完了                                            │
│    ↓                                                     │
│  モードA: post-register-checker ✅                       │
│    ├── 科目チェック（A-01〜A-07）                         │
│    ├── 税区分チェック（T-01〜T-05）                       │
│    ├── タグチェック（G-01〜G-05）                         │
│    ├── 金額チェック（M-01〜M-03）                         │
│    └── 新規取引先チェック（N-01〜N-02）                   │
│    ↓                                                     │
│  指摘事項 → Kintone App② / Excelレポート                │
│                                                          │
│  ──── 月末 ────                                          │
│                                                          │
│  モードB: monthly-checker ✅                             │
│    ├── F-1〜F-4: データ品質（DQ-01〜03）                 │
│    ├── GA-1: 現金・預金残高（CD-01〜04）                 │
│    ├── HB1-1: 借入金（LL-01〜03）                        │
│    ├── GD-1/JC1-1: 固定資産（FA-01〜03）                 │
│    ├── HD-1/HD-2: 家賃支払（RT-01〜03）                  │
│    ├── JC2-1/JC2-2: 人件費・預り金（PY-01〜04）          │
│    ├── HB2-1/JA-1: 士業・外注（OS-01〜02）              │
│    ├── JB-1: 役員・株主関係（OL-01〜04）                 │
│    ├── HA-1/GC-1: 売上・売掛金（RR-01〜03）             │
│    ├── JC3-1〜JC3-4: 仕入・経費（PP-01〜04）            │
│    ├── HC-1〜HC-4: 営業外・税金（ET-01〜07）             │
│    ├── BS残高異常（BA-01〜05）★v2で追加                  │
│    ├── 期間配分（PA-01〜08）★v2で追加                    │
│    ├── 消費税区分（TC-01〜08）★v2.1で追加                │
│    ├── 源泉所得税（WT-01〜06）★v2.1で追加                │
│    └── 予定納税（AT-01〜03）★v2.1で追加                  │
│    ↓                                                     │
│  指摘事項 → Kintone App② / Excelレポート（11シート）    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. モードA: パイプライン直後チェック ✅ 実装済み

### 3.1 ファイル構成

```
src/verify/
├── post-register-checker.js   ✅ オーケストレーター
├── checkers/
│   ├── normalize-helpers.js   ✅ 共通ヘルパー
│   ├── account-checker.js     ✅ A-01〜A-07: 科目チェック
│   ├── tax-checker.js         ✅ T-01〜T-05: 税区分チェック
│   ├── tag-checker.js         ✅ G-01〜G-05: タグチェック
│   ├── amount-checker.js      ✅ M-01〜M-03: 金額チェック
│   └── new-partner-checker.js ✅ N-01〜N-02: 新規取引先
├── processing-report.js       ✅ 既存（変更なし）
└── generate-audit-report.js   ✅ 既存（B案で残存）
```

### 3.2 Finding 型（拡張版）

```javascript
/**
 * Finding = {
 *   severity: '🔴' | '🟡' | '🔵',
 *   category: string,
 *   checkCode: string,
 *   description: string,
 *   currentValue: string,
 *   suggestedValue: string,
 *   confidence: number,        // 0-100
 *   targetMonth: string,       // 'YYYY-MM'
 *   freeeLink: string,         // freee Web画面へのリンク
 *   // ── v2で追加 ──
 *   details: [{                // ドリルダウン明細（BA系・PA系で使用）
 *     date: string,
 *     amount: number,
 *     counterAccount: string,
 *     description: string,
 *     dealId: number,
 *     freeeLink: string,
 *     partnerId: number,       // 取引先ID（取引先別内訳の場合）
 *   }],
 * }
 */
```

### 3.3 各チェッカーの仕様

（v1と同じ — A-01〜A-07, T-01〜T-05, G-01〜G-05, M-01〜M-03, N-01〜N-02）
※ 詳細は v1 セクション3.3 を参照

---

## 4. モードB: 月次帳簿チェック ✅ 実装済み

### 4.1 ファイル構成（実装完了状態）

```
src/verify/
├── monthly-checker.js              ✅ オーケストレーター（17モジュール統合、--company-name対応）
├── monthly-data-fetcher.js         ✅ freee-MCPデータ取得
│                                      fetchMonthlyData() — 当月・前月のBS/PL/deals/walletTxns
│                                      fetchMonthlyPlTrend() — 期首〜対象月の月別PL
│                                      fetchHistoricalBs() — 過去5期分のBS残高
├── monthly-report-generator.js     ✅ Excelレポート生成（11シート、951行）
├── report-config/                  ★v2.1で分離
│   ├── styles.js                   ✅ 色・フォント・罫線定数（87行）
│   ├── labels.js                   ✅ カテゴリ名・チェックコード名・グループ定義（198行）
│   └── link-mappings.js            ✅ freeeリンク科目マッピング・推定ロジック（133行）
├── monthly-checks/
│   ├── trial-helpers.js            ✅ BS/PL残高取得ユーティリティ
│   ├── data-quality.js             ✅ DQ-01〜03: データ品質
│   ├── cash-deposit.js             ✅ CD-01〜04: 現金・預金
│   ├── loan-lease.js               ✅ LL-01〜03: 借入金・リース
│   ├── fixed-asset.js              ✅ FA-01〜03: 固定資産
│   ├── rent.js                     ✅ RT-01〜03: 家賃支払
│   ├── payroll.js                  ✅ PY-01〜04: 人件費・預り金
│   ├── outsource.js                ✅ OS-01〜02: 士業・外注
│   ├── officer-loan.js             ✅ OL-01〜04: 役員・株主関係
│   ├── revenue-receivable.js       ✅ RR-01〜03: 売上・売掛金
│   ├── purchase-payable.js         ✅ PP-01〜04: 仕入・経費
│   ├── extraordinary-tax.js        ✅ ET-01〜07: 営業外・税金
│   ├── balance-anomaly.js          ✅ BA-01〜05: BS残高異常 ★v2
│   ├── period-allocation.js        ✅ PA-01〜08: 期間配分 ★v2
│   ├── tax-classification.js       ✅ TC-01〜08: 消費税区分 ★v2.1（801行）
│   ├── withholding-tax.js          ✅ WT-01〜06: 源泉所得税 ★v2.1（526行）
│   └── advance-tax-payment.js      ✅ AT-01〜03: 予定納税 ★v2.1（279行）
├── post-register-checker.js        ✅ モードA
├── checkers/                       ✅ モードA用チェッカー群
├── processing-report.js            ✅ 既存
└── generate-audit-report.js        ✅ 既存（B案で残存）

src/shared/
├── freee-links.js                  ✅ freeeリンク生成（TAX_CODE_TO_URL_PARAMS追加）
├── company-resolver.js             ✅ 顧問先名→ID解決 ★v2.1
└── ...

data/
├── company-map.json                ✅ 顧問先名⇔freee ID マッピング ★v2.1
└── ...

.claude/skills/
├── monthly-check-execution.md      ✅ 月次チェック実行スキル ★v2.1
└── report-improvement.md           ✅ レポート改善スキル ★v2.1
```

### 4.2 monthly-checker.js（オーケストレーター）— 実装済みの構成

```javascript
async function runMonthlyCheck(companyId, targetMonth, options = {}) {
  // 1. データ取得（freee-MCP経由）
  const data = await fetchMonthlyData(companyId, targetMonth);
  // data = {
  //   trialBs, trialBsByItem, trialBsByPartner,
  //   trialPl, trialPlByPartner,
  //   deals, walletTxns,
  //   prevMonth: { trialBs, trialPl, trialPlByPartner, ... },
  //   fiscalYear, startMonth, fiscalYearId,
  //   companyId, targetMonth,
  // }
  
  // 2. 過去期BS取得（動的start_date判定用）
  data.historicalBs = await fetchHistoricalBs(companyId, data.fiscalYear, data.startMonth, 5);
  
  // 3. 17チェックモジュールを順次実行
  const findings = [];
  findings.push(...dataQualityCheck(data));
  findings.push(...cashDepositCheck(data));
  findings.push(...loanLeaseCheck(data));
  findings.push(...fixedAssetCheck(data));
  findings.push(...rentCheck(data));
  findings.push(...payrollCheck(data));
  findings.push(...outsourceCheck(data));
  findings.push(...officerLoanCheck(data));
  findings.push(...revenueReceivableCheck(data));
  findings.push(...purchasePayableCheck(data));
  findings.push(...extraordinaryTaxCheck(data));
  findings.push(...balanceAnomalyCheck(data));      // ★v2
  findings.push(...periodAllocationCheck(data));     // ★v2
  findings.push(...taxClassificationCheck(data));    // ★v2.1
  findings.push(...withholdingTaxCheck(data));       // ★v2.1
  findings.push(...advanceTaxPaymentCheck(data));    // ★v2.1
  
  // 4. PL月次推移取得（レポート用）
  const plTrend = await fetchMonthlyPlTrend(companyId, ...);
  
  // 5. Excelレポート生成
  const reportPath = await generateMonthlyReport({ findings, data, plTrend });
  
  // 6. Kintone App②送付（dryRunでなければ）
  if (!options.dryRun) {
    await sendToKintone(findings.filter(f => f.severity !== '🔵'), companyId);
  }
  
  return { findings, reportPath };
}
```

### 4.3 freee-MCPデータ取得仕様（実装済み）

```javascript
// fetchMonthlyData() が返すオブジェクト
{
  trialBs,              // BS試算表（全科目の残高）
  trialBsByItem,        // 品目別BS残高
  trialBsByPartner,     // 取引先別BS残高
  trialPl,              // PL試算表（YTD累計）
  trialPlByPartner,     // 取引先別PL（YTD累計）
  deals,                // 当月の取引一覧（最大500件）
  walletTxns,           // 未処理明細
  prevMonth: {          // 前月データ
    trialBs, trialPl, trialPlByPartner, ...
  },
  fiscalYear,           // freee fiscal_year（期首年。例: 2025）
  startMonth,           // 期首月（例: 10）
  fiscalYearId,         // freee内部の fiscal_year_id（例: 10840688）
  targetMonth,          // 'YYYY-MM'
  companyId,
}

// fetchMonthlyPlTrend() — PL月次推移用
// 期首〜対象月の各月YTD累計を取得し、差分で単月を算出
// API呼び出し: 月数分（474381で6回）
// キャッシュ: data/{companyId}/monthly/{targetMonth}/pl-trend.json

// fetchHistoricalBs() — 過去期BS（動的start_date判定用）
// 過去最大5期分のBS試算表の opening/closing を取得
// キャッシュ: data/{companyId}/monthly/{targetMonth}/historical-bs.json
```

**freee API の重要な仕様:**
- `fiscal_year` パラメータは「期首年」を使用する（10月決算で2026-03の場合 → fiscal_year=2025）
- trial_pl はYTD累計を返す。単月金額は「当月累計 - 前月累計」で算出
- `breakdown_display_type=partner` で取引先別のBS/PLを取得

### 4.4 各チェックモジュールの仕様

#### 既存11モジュール（v1から変更なし）

DQ-01〜03, CD-01〜04, LL-01〜03, FA-01〜03, RT-01〜03,
PY-01〜04, OS-01〜02, OL-01〜04, RR-01〜03, PP-01〜04, ET-01〜07

※ 詳細は v1 セクション4.4 を参照

#### ★ balance-anomaly.js（BA-01〜BA-05）— v2で追加

BS残高の異常検知 + ドリルダウン。Finding型に `details` 配列を初導入。

| コード | 重要度 | 検知内容 | データソース | ドリルダウン |
|--------|--------|---------|-------------|-------------|
| BA-01 | 🔴 | BS科目のマイナス残高 | trialBs | deals明細 + 取引先別内訳 |
| BA-02 | 🟡 | 滞留残高（2ヶ月以上変動なし） | trialBs + prevTrialBs | 取引先別滞留先特定 |
| BA-03 | 🟡 | 仮勘定の未解消 | trialBs | 品目別内訳 + deals明細 |
| BA-04 | 🟡 | 前月比50%超変動 | trialBs + prevTrialBs | 変動原因の上位取引 |
| BA-05 | 🔵 | 本来ゼロであるべき科目に残高 | trialBs | 原因仕訳一覧 |

**除外ルール（チューニング済み）:**
- BA-01: 現預金科目（CD-01/02で検出済み）、評価勘定（貸倒引当金・減価償却累計額）を除外
- BA-02: 資本金・資本準備金・利益準備金・自己株式・敷金・保証金・繰越利益剰余金を除外。残高10,000円未満を除外
- BA-04: 現預金科目（CD-04で検出済み）、前月残高100,000円未満、仮払消費税・仮受消費税を除外

**既存チェックとの重複制御:**

| 既存チェック | BA系 | 住み分け |
|-------------|------|---------|
| CD-01/02（現預金マイナス） | BA-01 | BA-01は現預金を除外 |
| ET-01/02/03 | BA-03/05 | ET系は検知のみ。BA系はドリルダウン詳細を補完 |
| OL-04（未払金マイナス） | BA-01 | 両方出力。checkCodeで識別 |
| CD-04（預金前月比変動） | BA-04 | BA-04は現預金を除外 |

#### ★ period-allocation.js（PA-01〜PA-08）— v2で追加

期間配分チェック。3カテゴリ:

**カテゴリ1: 前払費用の償却チェック**

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| PA-01 | 🟡 | 前払費用の残高停滞 | 前月と同額かつ残高 > 10,000 |
| PA-02 | 🟡 | 長期前払費用の残高停滞 | 同上（※固定資産台帳突合はTODO） |
| PA-03 | 🟡 | 前払費用の急減（50%超） | 一括取崩しの妥当性確認 |

**カテゴリ2: 定期発生費用の欠損検知（取引先単位）**

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| PA-04 | 🟡 | 前月にあった取引先×科目が当月にない | trialPlByPartner の差分 |
| PA-05 | 🔵 | 定期費用の金額が前月比50%超変動 | 同上 |

対象科目: 地代家賃、賃借料、支払手数料、通信費、水道光熱費、支払報酬料、リース料、保険料、支払利息
前月金額5,000円未満の取引先は除外（ノイズ抑制）

**カテゴリ3: 決算整理仕訳の洗い替え確認**

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| PA-06 | 🔴 | 未払法人税等の洗い替え未実施 | 期首月〜期首+1ヶ月のみ実行 |
| PA-07 | 🔴 | 未払消費税等の洗い替え未実施 | 同上 |
| PA-08 | 🔵 | 賞与引当金等の期首残高確認 | 期首月のみ |

#### ★ tax-classification.js（TC-01〜TC-08）— v2.1で追加

消費税区分の妥当性チェック。科目×税区分の組み合わせ検証。

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| TC-01 | 🔴 | 交際費・福利厚生費の対象外仕入 | 課対仕入であるべき科目に対象外が存在 |
| TC-02 | 🔴 | 消耗品費・通信費の対象外仕入 | 同上 |
| TC-03 | 🟡 | 地代家賃の住居用判定 | 住居系キーワードを含む課税仕入 |
| TC-04 | 🔴 | 海外サービスの税区分ミス | overseas-services.js のDBと照合 |
| TC-05 | 🟡 | 軽減税率の適用判定 | 食品系・新聞定期購読の税率確認 |
| TC-06 | 🟡 | 同一科目内の税区分混在 | 1科目に3種以上の税区分 |
| TC-07 | 🟡 | 売上の非課税・不課税混在 | 売上科目に対象外/非課税が存在 |
| TC-08 | 🔵 | 高額課税仕入の確認 | 100万円以上の課税仕入取引 |

**TC-06の details 子行:** 税区分ごとの件数・金額・税区分フィルタ付きfreeeリンクを生成。
`TAX_CODE_TO_URL_PARAMS` マッピングで freee 総勘定元帳の `tax_group_codes` / `tax_rate` / `tax_reduced` パラメータを付与。

**TC-01/02/03/07のリンク:** `generalLedgerLinkWithTaxFilter` で税区分フィルタ付きリンクを生成（対象外/課税仕入のみ表示）。

#### ★ withholding-tax.js（WT-01〜WT-06）— v2.1で追加

源泉所得税の徴収漏れ・計算誤り・納付漏れの検知。

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| WT-01 | 🔴 | 士業報酬の源泉徴収漏れ | 支払報酬料の取引先に預り金計上なし |
| WT-02 | 🟡 | デザイン・翻訳等の源泉対象報酬 | 外注費のキーワードマッチング |
| WT-03 | 🟡 | 源泉税額の計算誤り | 10.21%基準との乖離チェック |
| WT-04 | 🟡 | 預り金残高の異常増加 | 前月比で大幅増加（納付漏れ疑い） |
| WT-05 | 🔵 | 納期の特例リマインダー | 6月・12月に特例納付を注意喚起 |
| WT-06 | 🟡 | 非居住者への支払い | 海外事業者への20.42%源泉確認 |

#### ★ advance-tax-payment.js（AT-01〜AT-03）— v2.1で追加

法人税・消費税の中間納付（予定納税）タイミングチェック。

| コード | 重要度 | 内容 | 判定基準 |
|--------|--------|------|---------|
| AT-01 | 🟡 | 法人税の中間納付漏れ | 期首6ヶ月後の中間申告期限チェック |
| AT-02 | 🟡 | 消費税の中間納付漏れ | 同上 |
| AT-03 | 🔵 | 予定納税残高の停滞 | 仮払法人税・仮払消費税の残高不変 |

**制約:** 前期税額データは freee API から取得不可。中間申告の要否判定は注意喚起レベル（前期税額の閾値判定は人間が確認）。

---

## 5. freeeリンク生成システム ★v2で新規追加

### 5.1 リンク先の使い分け

| 指摘の種類 | リンク先 | URL |
|-----------|---------|-----|
| 仕訳（取引）単位 | 仕訳帳（特定取引） | `/reports/journals?deal_id=XXXXXXXX` |
| 残高（科目）単位・当期内 | 総勘定元帳 | `/reports/general_ledgers/show?name=科目名&fiscal_year_id=XXX&start_date=...&end_date=...&adjustment=all` |
| 残高（科目）単位・年度またぎ | 仕訳帳（科目×期間） | `/reports/journals?account_item_id=XXX&start_date=...&end_date=...` |

**freee総勘定元帳の制約:**
- 1会計年度内の日付しか指定できない（年度をまたぐとエラー）
- 科目指定は `account_item_id`（数値ID）ではなく `name`（科目名のURLエンコード）
- `fiscal_year` ではなく `fiscal_year_id`（freee内部ID）が必要
- `adjustment=all` パラメータ必須

### 5.2 動的 start_date 判定（determineLinkStartDate）

残高の推移状況に応じて、リンクの検索開始日を動的に決定する。

```
当期: opening ≠ closing → 当期首（例: 2025-10-01）
当期: opening === closing → 過去期のBSを遡って探索
  前期: opening ≠ closing → 前期首（例: 2024-10-01）
  前期: opening === closing → さらに前の期を確認
    → 最大5期前まで遡り、変動した期の期首を start_date にする
    → 5期遡っても不変 or データなし → 最も古い取得可能期の期首
```

**過去期BSデータ:** `fetchHistoricalBs()` で最大5期分を一括取得。
キャッシュ: `data/{companyId}/monthly/{targetMonth}/historical-bs.json`（14KB、24時間TTL）

### 5.3 共通関数（src/shared/freee-links.js）

```
FREEE_BASE                    — 'https://secure.freee.co.jp'
walletTxnLink()               — 口座明細リンク
receiptLink()                 — 証憑リンク
dealLink()                    — 取引リンク
dealDetailLink()              — 取引詳細リンク
trialBsDetailLink()           — 試算表BS科目明細リンク
journalsByAccountLink()       — 仕訳帳（科目×期間）リンク
generalLedgerLink()           — 総勘定元帳（科目名×期間）リンク ★v2
journalDealLink()             — 仕訳帳（特定取引）リンク ★v2
buildBalanceLink()            — 残高系指摘の最適リンク自動選択 ★v2
determineLinkStartDate()      — 動的start_date判定 ★v2
formatFiscalStartDate()       — 期首日フォーマット ★v2
TAX_CODE_TO_URL_PARAMS        — freee税区分コード→URLパラメータマッピング ★v2.1
generalLedgerLinkWithTaxFilter() — 税区分フィルタ付き総勘定元帳リンク ★v2.1
```

### 5.4 税区分フィルタ付きリンク（★v2.1で追加）

freee総勘定元帳は税区分でのフィルタリングをサポート。URLパラメータ:
- `tax_group_codes` — 税区分グループ（0: 対象外、34: 課税仕入、37: 非課税仕入 等）
- `tax_rate` — 税率（8 or 10）
- `tax_deduction_rate` — 控除率（80 or 50、経過措置用）
- `tax_reduced` — 軽減税率フラグ（true/false）

`TAX_CODE_TO_URL_PARAMS` で freee API の tax_code 整数値からURLパラメータへ変換。
TC-01〜TC-07 の freeeリンクに税区分フィルタを付与し、該当税区分の仕訳のみ表示。

---

## 6. Excelレポート仕様 ✅ 実装済み（v2.1: 11シート + report-config分離）

### 出力先

`reports/{companyId}/{事業所名}_帳簿チェック_{targetMonth}_{timestamp}.xlsx`

### 実装構成

```
src/verify/
├── monthly-report-generator.js     951行（シート生成ロジック本体）
└── report-config/                  ★v2.1で分離（旧: generator内にインライン）
    ├── styles.js                   87行 — COLORS, FONTS, BORDER_THIN, 重要度ソート順等
    ├── labels.js                   198行 — CATEGORY_LABELS(16), CATEGORY_ORDER, CHECK_GROUPS(6), CHECK_CODE_LABELS(~70)
    └── link-mappings.js            133行 — CODE_TO_ACCOUNT(7), inferFreeeLink(), getMonthRange() 等
```

分離前は monthly-report-generator.js が約1,254行。定数~310行を3ファイルに抽出し951行に。
後方互換のため `inferFreeeLink` / `isValidFreeeLink` は generator から re-export。

### デザイン基準

源泉チェックレポートをベンチマーク。クライアント提出可能なクオリティ。
- ヘッダー色: `FF2F5496`（紺色）、白文字
- フォント: Meiryo UI 10pt
- 数値: #,##0（3桁区切り）
- 長文セル: wrapText有効

### シート構成（11シート）

#### シート1: サマリーダッシュボード
- タイトル: 「{事業所名} 月次チェックレポート」14pt bold
- サブタイトル: 「対象月: YYYY年MM月 / チェック実行日: YYYY年MM月DD日」
- 判定凡例: 🔴🟡🔵のインライン凡例（背景色付き）
- 指摘サマリー: 重要度別件数
- カテゴリ別内訳: 動的生成テーブル

#### シート2: 指摘一覧
- 列: 重要度(8) / コード(10) / カテゴリ(18) / 指摘内容(60,wrapText) / 現在の値(18) / 推奨値(40,wrapText) / freeeリンク(14)
- ソート: 🔴→🟡→🔵
- autoFilter設定
- フリーズ: A2
- **details子行展開:** Finding に details 配列がある場合、親行の直下に薄グレー背景（FFF5F5F5）の子行を展開
  - 子行: 日付 / 金額 / 相手科目 / 摘要 / freeeリンク
  - TC-06の子行: 税区分名（件数・金額）/ freeeリンク（税区分フィルタ付き元帳）
- **freeeリンク表示テキスト:** リンク種別に応じて自動出し分け
  - deal_id含む → 「仕訳を開く」
  - general_ledgers含む → 「元帳を開く」
  - journals含む → 「仕訳帳を開く」

#### シート3〜8: カテゴリ別指摘シート（6グループ）
CHECK_GROUPS定義に基づき、カテゴリをグループ化してシート分割:
- 現金・預金・借入金
- 固定資産・家賃
- 人件費・外注
- 売上・仕入
- 営業外・税金・役員関係
- 残高異常・期間配分・消費税・源泉税・予定納税

#### シート9: BS残高チェック
- 列: 科目名(30) / 当月残高(16) / 前月残高(16) / 前月差(16) / 変動率(10) / 判定(10) / 元帳リンク(14)
- マイナス残高: 薄赤背景（FFFFE0E0）
- 元帳リンク: `buildBalanceLink` 使用（動的start_date + 年度判定）

#### シート10: PL月次推移
- 期首〜対象月の月別単月金額を横に並べる（freee月次推移レポートに準拠）
- 列: 科目名 / 10月 / 11月 / ... / 対象月 / 累計（SUM式）/ 元帳リンク
- 対象月の列: ハイライト（薄青背景）
- 各月の金額セル: その月の仕訳帳へのハイパーリンク埋め込み
- 異常値: 前月比50%超変動セルに薄黄背景
- データ取得: `fetchMonthlyPlTrend()` で各月YTD累計→差分で単月算出

#### シート11: 取引先別残高
- 列: 科目名(22) / 取引先名(30) / 残高(16,#,##0) / 滞留判定(12)
- 滞留セル: 黄色背景（FFFFEB9C）

---

## 7. Kintone App② 送付仕様

（v1 セクション5と同じ）

---

## 8. 異常値検出の基準

（v1 セクション7と同じ）

---

## 8b. スキル定義（★v2.1で追加）

Claude Code の `.claude/skills/` にスキルファイルを配置。ユーザーの自然言語指示を特定の実行手順にマッピング。

### monthly-check-execution.md（月次チェック実行スキル）

**発動場面:** 「○○の○月のチェックをして」「帳簿チェックをお願い」等
**実行フロー:**
1. 顧問先名 or freee company ID + 対象月を特定
2. 名前指定の場合: `company-resolver.js` → `data/company-map.json` で ID 解決
3. `monthly-checker.js --company-name "{名前}" --month {YYYY-MM} --no-dry-run` 実行
4. 結果を🔴/🟡/🔵別件数 + Excelレポートパスで報告
5. フォローアップ: 🔴優先カテゴリ別要約、freeeリンク案内

**既知の制限:** deals 500件上限、partner_name undefined、前期税額データ取得不可

### report-improvement.md（レポート改善スキル）

**発動場面:** 「レポートの色を変えて」「新しいチェックコードを追加して」等
**対象ファイルマッピング:**
- 色・フォント → `report-config/styles.js`
- ラベル・グループ → `report-config/labels.js`
- freeeリンクマッピング → `report-config/link-mappings.js`
- シート構成・列定義 → `monthly-report-generator.js`
- チェックロジック → `monthly-checks/[モジュール名].js`

---

## 9. 実装状態（2026-04-04時点）

### Phase 1: モードA ✅ 完了

22チェック実装済み。

### Phase 2: モードB ✅ 完了

17モジュール・70チェックコード実装済み（既存53 + TC系8 + WT系6 + AT系3）。

### Phase 3: Excelレポート ✅ 完了

11シート構成。report-config分離済み（styles/labels/link-mappings）。

### Phase 4: CLI・スキル拡張 ✅ 完了

- `--company-name` オプション（company-resolver.js による顧問先名→ID解決）
- `.claude/skills/monthly-check-execution.md`（月次チェック実行スキル）
- `.claude/skills/report-improvement.md`（レポート改善スキル）

### Phase 5: 次フェーズ（計画中）

| 項目 | 優先度 | 概要 |
|------|--------|------|
| レポート精緻化 | 高 | ノイズ削減、description改善、閾値チューニング |
| 2422271テスト検証 | 高 | テスト事業所（無限テック）での全チェック動作確認 |
| LEARNステージ | 中 | 辞書改善フィードバック、カタカナマッピング、顧客別例外ルール |
| 喜明堂テスト | 後 | 新規顧客でのパイプライン全体通しテスト |
| Kintone App②送付 | 後 | 🔴🟡指摘のKintone自動送付（Step 14） |

---

## 10. テスト状態

### npm test（323件）

| テストファイル | 件数 |
|--------------|------|
| test-pipeline.js | 50 |
| test-deal-creator.js | 14 |
| test-processing-report.js | 9 |
| test-freee-links.js | 42 |
| test-kintone-to-freee.js | 17 |
| test-rule-csv-generator.js | 53 |
| test-post-register-checker.js | 49 |
| test-monthly-checker.js | 65 |
| test-monthly-report.js | 24 |

### 個別実行（93件）

| テストファイル | 件数 |
|--------------|------|
| test-balance-anomaly.js | 32 |
| test-report-details.js | 7 |
| test-period-allocation.js | 20 |
| test-withholding-tax.js | 24 |
| test-tax-classification.js | 29 ★v2.1 |
| test-advance-tax-payment.js | 17 ★v2.1 |

### 合計: 416件（npm test 323 + 個別 93）

---

## 11. 設計上の原則

### 既存コード変更ゼロの原則

- 新規チェックモジュールは全て新規ファイル
- monthly-checker.js への変更は require + findings.push の追加のみ
- processing-report.js、generate-audit-report.js には手を加えない

### DRY_RUN原則

- `--dry-run` でKintone送付・レポート生成をスキップ
- `--no-dry-run` で本番実行
- CLIデフォルトは dryRun=true（テスト時にファイル大量生成を防止）

### テスト保護

- 新規モジュール追加時は最低10件/モジュールのテストを作成
- npm test で全テストが通ることを必ず確認してから次工程へ

### details パターン

- Finding に `details` 配列を含める場合のガイドライン:
  - details が undefined / 空配列 → レポート側は従来通り動作（後方互換）
  - details は最大10件。超過時は金額降順で上位10件 + 「他X件」付記
  - 各 detail に freeeLink を設定（dealId あり → journalDealLink / なし → buildBalanceLink）

### freeeリンクのガイドライン

- 新規チェックモジュールでは `buildBalanceLink()` を使用する
- 仕訳単位の指摘では `journalDealLink(dealId)` を使用する
- リンク表示テキストは `getLinkDisplayText(url)` で自動出し分け
- URL仕様が不明な場合は関数を1箇所に集約し、後から修正可能にする

---

## 付録: チェックコード一覧（92チェックコード）

### モードA（22チェック）

| コード | カテゴリ | 重要度 | 内容 |
|--------|---------|--------|------|
| A-01 | 科目 | 🔴 | 雑費率20%超 |
| A-02 | 科目 | 🟡 | 雑費1万円以上 |
| A-03 | 科目 | 🔴 | 利息の方向間違い |
| A-04 | 科目 | 🟡 | 売上高に出金 |
| A-05 | 科目 | 🟡 | 仕入高に入金 |
| A-06 | 科目 | 🔵 | 消耗品費10万円以上 |
| A-07 | 科目 | 🔵 | 修繕費20万円以上 |
| T-01 | 税区分 | 🔴 | 海外サービスの課税区分ミス |
| T-02 | 税区分 | 🔴 | 軽減税率の誤適用 |
| T-03 | 税区分 | 🟡 | 非課税判定漏れ |
| T-04 | 税区分 | 🟡 | 不課税判定漏れ |
| T-05 | 税区分 | 🔵 | 課税区分の確認推奨 |
| G-01 | タグ | 🔴 | 売上高の取引先タグ漏れ |
| G-02 | タグ | 🔴 | 外注費の取引先タグ漏れ |
| G-03 | タグ | 🟡 | 預り金の品目タグ漏れ |
| G-04 | タグ | 🟡 | 借入金の品目タグ漏れ |
| G-05 | タグ | 🔵 | 地代家賃の取引先タグ漏れ |
| M-01 | 金額 | 🟡 | 過去パターンとの金額乖離 |
| M-02 | 金額 | 🔵 | 端数のない大額取引 |
| M-03 | 金額 | 🟡 | 同日同額の重複疑い |
| N-01 | 新規取引先 | 🟡 | 新規取引先（インボイス確認） |
| N-02 | 新規取引先 | 🔵 | インボイス区分確認 |

### モードB（65チェック）

| コード | カテゴリ | 重要度 | 内容 | 実装状態 |
|--------|---------|--------|------|---------|
| DQ-01 | データ品質 | 🔴 | 未登録取引が残っている | ✅ |
| DQ-02 | データ品質 | 🟡 | 重複計上の疑い | ✅ |
| DQ-03 | データ品質 | 🔵 | 自動登録ルール最適化提案 | ✅ |
| CD-01 | 現金・預金 | 🔴 | 現金残高マイナス | ✅ |
| CD-02 | 現金・預金 | 🔴 | 預金残高マイナス | ✅ |
| CD-03 | 現金・預金 | 🟡 | 現金残高100万円超 | ✅ |
| CD-04 | 現金・預金 | 🟡 | 預金残高の前月比50%超変動 | ✅ |
| LL-01 | 借入金 | 🔴 | 借入金残高マイナス | ✅ |
| LL-02 | 借入金 | 🟡 | 借入金の品目タグ漏れ | ✅ |
| LL-03 | 借入金 | 🟡 | 借入金の非定額減少 | ✅ |
| FA-01 | 固定資産 | 🔴 | 消耗品費10万円以上の単一取引 | ✅ |
| FA-02 | 固定資産 | 🟡 | 修繕費20万円以上の単一取引 | ✅ |
| FA-03 | 固定資産 | 🔵 | 固定資産台帳との残高不一致 | ✅ |
| RT-01 | 家賃 | 🟡 | 地代家賃の金額変動 | ✅ |
| RT-02 | 家賃 | 🟡 | 更新料・礼金20万円以上 | ✅ |
| RT-03 | 家賃 | 🔵 | 地代家賃の取引先タグ漏れ | ✅ |
| PY-01 | 人件費 | 🔴 | 役員報酬の期中変動 | ✅ |
| PY-02 | 人件費 | 🟡 | 法定福利費の異常 | ✅ |
| PY-03 | 人件費 | 🟡 | 源泉税・住民税の滞留 | ✅ |
| PY-04 | 人件費 | 🔵 | 給与手当の前月比異常 | ✅ |
| OS-01 | 外注 | 🟡 | 士業報酬の源泉徴収確認 | ✅ |
| OS-02 | 外注 | 🟡 | 外注の源泉税滞留 | ✅ |
| OL-01 | 役員関係 | 🔴 | 役員貸付金・借入金のマイナス残高 | ✅ |
| OL-02 | 役員関係 | 🟡 | 役員貸付金の増加 | ✅ |
| OL-03 | 役員関係 | 🟡 | 立替経費のマイナス残高 | ✅ |
| OL-04 | 役員関係 | 🟡 | 未払金（個人名義）のマイナス残高 | ✅ |
| RR-01 | 売上 | 🟡 | 売上の月次推移異常 | ✅ |
| RR-02 | 売上 | 🟡 | 売掛金の滞留 | ✅ |
| RR-03 | 売上 | 🔵 | 売上の取引先タグ漏れ | ✅ |
| PP-01 | 仕入 | 🟡 | 仕入の月次推移異常 | ✅ |
| PP-02 | 仕入 | 🟡 | 買掛金・未払金の滞留 | ✅ |
| PP-03 | 仕入 | 🟡 | クレジットカード未払金の滞留 | ✅ |
| PP-04 | 仕入 | 🔵 | その他経費の異常 | ✅ |
| ET-01 | 営業外・税金 | 🔴 | 未確定損益・仮払金に残高 | ✅ |
| ET-02 | 営業外・税金 | 🔴 | 資金諸口に残高 | ✅ |
| ET-03 | 営業外・税金 | 🟡 | 仮受金・仮払金に残高 | ✅ |
| ET-04 | 営業外・税金 | 🟡 | 未払法人税等がゼロでない | ✅ |
| ET-05 | 営業外・税金 | 🟡 | 未払消費税等がゼロでない | ✅ |
| ET-06 | 営業外・税金 | 🔵 | 雑収入・雑損失の内容確認 | ✅ |
| ET-07 | 営業外・税金 | 🔵 | 受取利息の源泉税確認 | ✅ |
| BA-01 | 残高異常 | 🔴 | BS科目のマイナス残高 | ✅ ★v2 |
| BA-02 | 残高異常 | 🟡 | 滞留残高（2ヶ月以上変動なし） | ✅ ★v2 |
| BA-03 | 残高異常 | 🟡 | 仮勘定の未解消 | ✅ ★v2 |
| BA-04 | 残高異常 | 🟡 | 前月比50%超変動 | ✅ ★v2 |
| BA-05 | 残高異常 | 🔵 | 本来ゼロであるべき科目に残高 | ✅ ★v2 |
| PA-01 | 期間配分 | 🟡 | 前払費用の残高停滞 | ✅ ★v2 |
| PA-02 | 期間配分 | 🟡 | 長期前払費用の残高停滞 | ✅ ★v2 |
| PA-03 | 期間配分 | 🟡 | 前払費用の急減 | ✅ ★v2 |
| PA-04 | 期間配分 | 🟡 | 定期費用の欠損（取引先単位） | ✅ ★v2 |
| PA-05 | 期間配分 | 🔵 | 定期費用の金額変動 | ✅ ★v2 |
| PA-06 | 期間配分 | 🔴 | 未払法人税等の洗い替え未実施 | ✅ ★v2 |
| PA-07 | 期間配分 | 🔴 | 未払消費税等の洗い替え未実施 | ✅ ★v2 |
| PA-08 | 期間配分 | 🔵 | 賞与引当金等の期首残高確認 | ✅ ★v2 |
| TC-01 | 消費税区分 | 🔴 | 交際費・福利厚生費の対象外仕入 | ✅ ★v2.1 |
| TC-02 | 消費税区分 | 🔴 | 消耗品費・通信費の対象外仕入 | ✅ ★v2.1 |
| TC-03 | 消費税区分 | 🟡 | 地代家賃の住居用判定 | ✅ ★v2.1 |
| TC-04 | 消費税区分 | 🔴 | 海外サービスの税区分ミス | ✅ ★v2.1 |
| TC-05 | 消費税区分 | 🟡 | 軽減税率の適用判定 | ✅ ★v2.1 |
| TC-06 | 消費税区分 | 🟡 | 同一科目内の税区分混在 | ✅ ★v2.1 |
| TC-07 | 消費税区分 | 🟡 | 売上の非課税・不課税混在 | ✅ ★v2.1 |
| TC-08 | 消費税区分 | 🔵 | 高額課税仕入の確認 | ✅ ★v2.1 |
| WT-01 | 源泉所得税 | 🔴 | 士業報酬の源泉徴収漏れ | ✅ ★v2.1 |
| WT-02 | 源泉所得税 | 🟡 | デザイン・翻訳等の源泉対象報酬 | ✅ ★v2.1 |
| WT-03 | 源泉所得税 | 🟡 | 源泉税額の計算誤り | ✅ ★v2.1 |
| WT-04 | 源泉所得税 | 🟡 | 預り金残高の異常増加 | ✅ ★v2.1 |
| WT-05 | 源泉所得税 | 🔵 | 納期の特例リマインダー | ✅ ★v2.1 |
| WT-06 | 源泉所得税 | 🟡 | 非居住者への支払い | ✅ ★v2.1 |
| AT-01 | 予定納税 | 🟡 | 法人税の中間納付漏れ | ✅ ★v2.1 |
| AT-02 | 予定納税 | 🟡 | 消費税の中間納付漏れ | ✅ ★v2.1 |
| AT-03 | 予定納税 | 🔵 | 予定納税残高の停滞 | ✅ ★v2.1 |

**モードB合計: 70チェックコード（🔴 16件、🟡 40件、🔵 14件）**
**モードA+B合計: 92チェックコード**

---

## 12. 既知の課題・制約

| 課題 | 状態 | 対応方針 |
|------|------|---------|
| 消費税引当金（事務所独自科目） | BA-01で検出済み | 負債科目で正が正常。マイナスは異常 |
| freee総勘定元帳の年度制約 | 対応済み | 年度またぎ→仕訳帳フォールバック |
| deals取得上限500件/月 | 現状維持 | 不足判明時にページネーション拡張 |
| 長期前払費用の固定資産台帳突合 | TODO | 固定資産台帳API取得が必要 |
| trialPlはYTD累計 | 対応済み | 差分で単月算出。PA-04/05で実装済み |
| 474381は10月決算の変則期 | 対応済み | fiscal_yearは期首年（2025）。detectFiscalYear修正済み |
| BA-02のノイズ（13件） | 許容範囲 | 保険積立金・出資金等の除外を今後検討 |
| 2422271（テスト事業所）未検証 | 未着手 | ①完了後に検証推奨 |
| TAX_CODE_TO_URL_PARAMSの網羅性 | 部分対応 | 主要10税区分を登録済み。未登録税区分はTC-06子行のfreeLinkがnull |
| 前期税額データ取得不可 | 制約 | AT系チェックは注意喚起レベル。前期税額の閾値判定は人間が確認 |
| deals.partner_nameがundefined | 対応済み | resolvePartnerName()で代替。WT系でも同様に使用 |
