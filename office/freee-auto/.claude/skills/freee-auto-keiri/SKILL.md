---
name: "freee-auto-keiri"
description: "freee会計の経理チェックスキル。freee APIからデータ取得→消費税区分判定→取引レベルチェック→財務分析→レポート出力を一気通貫で実行する。"
---

# freee経理チェックスキル

freee APIからデータを取得し、消費税区分判定・取引レベルの勘定科目チェック・BS/PL 3期比較・月次推移分析を行い、結果を報告する。

## 使い方

```
/freee-auto-keiri [会社名またはcompany_id] [対象期間: 例 2024/10~2025/12] [課税売上割合: 例 95]
```

引数が省略された場合は、ユーザーに確認する。

---

## Step 1: パラメータの確認と設定

ユーザーから以下を確認（引数で指定されていない場合）：
- **対象事業所**: company_idまたは会社名
- **対象期間**: 開始年月と終了年月（例: 2024/10~2025/12）
- **課税売上割合**: パーセント（例: 95）
  - 95%以上か未満かで事業者向けサービスの消費税処理が変わる（Step 2で使用）
  - 不明な場合は95%以上と仮定して実行し、結果に注記を付ける

### 1-1. 期間の自動計算

期間から以下を自動計算（`src/shared/period-utils.js` のロジック）：
- 当期: ユーザー指定期間
- 前期同期: 1年前の同じ月数
- 前々期同期: 2年前の同じ月数
- BSは各期の末日残高を比較、PLは同じ月数で比較

### 1-2. データ保存先の作成

```bash
mkdir -p data/{company_id}/{YYYY-MM-DD}/raw
mkdir -p data/{company_id}/{YYYY-MM-DD}/analysis
```

### 1-3. config.jsonの生成

`data/{company_id}/{YYYY-MM-DD}/config.json` に保存：
```json
{
  "company_id": 474381,
  "company_name": "会社名",
  "period_start": "2024-10-01",
  "period_end": "2025-12-31",
  "period_months": 15,
  "fiscal_year_end_month": 9,
  "taxable_sales_ratio": 95,
  "periods": {
    "current": { "start": "2024-10-01", "end": "2025-12-31", "label": "当期(2024/10~2025/12)" },
    "prior1": { "start": "2023-10-01", "end": "2024-12-31", "label": "前期(2023/10~2024/12)" },
    "prior2": { "start": "2022-10-01", "end": "2023-12-31", "label": "前々期(2022/10~2023/12)" }
  }
}
```

---

## Step 2: freee APIからデータ取得

**重要**: freee-mcp MCPサーバーを使用すること。データは取得後すぐにJSONファイルに保存する。
**レートリミット**: 300回/5分。大量取得時は注意。

### 2-1. 勘定科目一覧
```
freee_api_get { service: "accounting", path: "/api/1/account_items", query: { company_id: <ID> } }
→ data/{company_id}/{date}/raw/account_items.json に保存
```

### 2-2. 取引データ（支出）- ページネーション対応
```
freee_api_get { service: "accounting", path: "/api/1/deals", query: { company_id: <ID>, limit: 100, offset: 0, start_issue_date: "YYYY-MM-DD", end_issue_date: "YYYY-MM-DD", type: "expense" } }
→ data/.../raw/deals_expense.json に保存
```
- `meta.total_count` を確認し、100件ずつoffsetを増やして全件取得
- 2ページ目以降は `deals_expense_p2.json`, `deals_expense_p3.json`... として保存

### 2-3. 取引データ（収入）- 同様にページネーション
```
→ data/.../raw/deals_income.json
```

### 2-4. 振替伝票
```
freee_api_get { service: "accounting", path: "/api/1/manual_journals", query: { company_id: <ID>, start_issue_date: "YYYY-MM-DD", end_issue_date: "YYYY-MM-DD" } }
→ data/.../raw/manual_journals.json
```

### 2-5. 試算表（BS）- 3期分

freee APIの `trial_bs` は会計年度(`fiscal_year`)と月(`start_month`, `end_month`)で指定する。

**重要**: 年度をまたぐ月の指定はできない。会計年度の決算月に注意すること。

例（9月決算の場合）:
- 2024/10~2025/3のBS → `fiscal_year=2025, start_month=10, end_month=3`
- 2024/10~2025/9のBS → `fiscal_year=2025, start_month=10, end_month=9`

当期・前期・前々期それぞれ取得：
```
→ data/.../raw/trial_bs_current.json
→ data/.../raw/trial_bs_prior1.json
→ data/.../raw/trial_bs_prior2.json
```

チェック対象期間が会計年度をまたぐ場合は、各年度ごとに取得して結合するか、終了月のBS残高を取得する。

### 2-6. 試算表（PL）- 3期分
同様に取得：
```
→ data/.../raw/trial_pl_current.json
→ data/.../raw/trial_pl_prior1.json
→ data/.../raw/trial_pl_prior2.json
```

### 2-7. 月次PL（月ごとに取得）
各月のPLを個別に取得：
```
freee_api_get { service: "accounting", path: "/api/1/reports/trial_pl", query: { company_id: <ID>, fiscal_year: YYYY, start_month: M, end_month: M } }
→ data/.../raw/trial_pl_month_1.json, trial_pl_month_2.json, ...
```
各ファイルに `year`, `month` プロパティを追加して保存。

### 2-8. 固定資産台帳
```
freee_api_get { service: "accounting", path: "/api/1/fixed_assets", query: { company_id: <ID> } }
→ data/.../raw/fixed_assets.json
```

---

## Step 3: 消費税区分判定

取得した取引データに対し、消費税区分の正誤をチェックする。
判定ルールの詳細は `references/tax/tax-classification-rules.md`（R01〜R12）を参照。

### 3-1. 基本チェック（R01〜R12）

分析スクリプトの実行：
```bash
node src/classify/02-analyze-transactions.js data/{company_id}/{date}
```

取引1件ずつ以下をチェック：
- **R01**: 売上高が非課税・不課税になっていないか
- **R02**: 土地・住宅関連が課税になっていないか
- **R03**: 給与・法定福利費が課税になっていないか
- **R04**: 受取利息・配当金が課税になっていないか
- **R05**: 保険金・補助金が課税になっていないか
- **R06**: 軽減税率8%の適用漏れ
- **R07**: 輸出免税の適用漏れ
- **R08**: リバースチャージの確認
- **R09**: 支払利息・保険料が課税になっていないか
- **R10**: 租税公課が課税になっていないか
- **R11**: 通勤手当の課税仕入処理漏れ
- **R12**: 福利厚生費の課税/不課税の混在

### 3-2. 海外サービス消費税区分チェック

```bash
node src/verify/05-check-overseas-services.js data/{company_id}/{date} [課税売上割合]
```

#### 電気通信利用役務の提供における判定フロー

```
① 役務の提供を受ける者の所在地は国内か？
   → 国外 → 不課税取引（対象外）
   → 国内 → ②へ

② その役務は「事業者向け」か「消費者向け」か？
   → 事業者向け → ④へ
   → 消費者向け → ③へ

③ 国外事業者は「登録国外事業者」（インボイス登録済）か？
   → 登録済 → 課対仕入10%（仕入税額控除OK）
   → 未登録（国外事業者） → 仕入税額控除不可（80%経過措置も不可）
     ※ 少額特例（税込1万円未満）は適用可能
   → 未登録（国内事業者） → 少額特例あり、80%経過措置あり

④ 課税売上割合は95%以上か？（一般課税の場合）
   → 95%以上 → 「対象外」（特定課税仕入れはなかったものとみなす）
   → 95%未満 → 「リバースチャージ方式」（仮受・仮払消費税の両建て）
```

#### 事業者向け電気通信利用役務の提供の範囲（限定的に解釈）

以下に該当するものが「事業者向け」：
- インターネット広告の配信・掲載（Google広告、Facebook広告、X広告等）
- ECプラットフォーム（Shopify等のネットショップ運営サービス）
- 個別契約に基づき事業者が事業として利用することが明らかなもの

上記以外は基本的に「消費者向け」として判定する。

#### 海外サービスチェックルール

| # | チェック内容 | 重要度 | 説明 |
|---|-------------|--------|------|
| 1 | 事業者向けサービスの税区分 | 🔴 | 広告（Facebook/X等）やECプラットフォーム（Shopify等）は事業者向け。課税売上割合95%以上なら「対象外」、95%未満なら「リバースチャージ」 |
| 2 | 消費者向け・登録済の税区分 | 🔴 | インボイス登録済の国外事業者（AWS/Adobe/Zoom等）は「課対仕入10%」 |
| 3 | 消費者向け・未登録の税区分 | 🔴 | 未登録国外事業者（Claude/Microsoft365等）を課税仕入で処理していないか |
| 4 | mixed（要プラン確認） | 🟡 | Apple/GitHub/Spotify等、プランにより区分が変わるサービスの確認 |
| 5 | 登録状況不明サービス | 🟡 | 登録状況が不確かなサービスの確認依頼 |
| 6 | 未登録の少額取引 | 🟡 | 未登録国外事業者でも税込1万円未満なら少額特例の可能性 |
| 7 | 未検出の海外広告費 | 🟡 | 広告宣伝費科目にデータベース外の海外事業者がないかチェック |
| 8 | 国内法人経由サービス | 🔵 | Google広告等、国内法人経由の取引は通常の国内課税取引 |

#### 対応サービスデータベース（`src/shared/overseas-services.js`）

| サービス | 事業者向け/消費者向け | インボイス | 税区分（95%以上） |
|---------|---------------------|-----------|-------------------|
| Adobe Creative Cloud | 消費者向け | 登録済(T3700150007275) | 課対仕入10% |
| AWS | 消費者向け | 登録済(T9700150104216) | 課対仕入10% |
| Apple | mixed | 一部登録 | 要確認 |
| Canva | 消費者向け | 登録済(T2700150107555) | 課対仕入10% |
| Claude (Anthropic) | 消費者向け | 未登録 | 対象外（控除不可） |
| Dropbox | 消費者向け | 登録済(T6700150104169) | 課対仕入10% |
| Facebook広告 | 事業者向け | 未登録 | 対象外 |
| GitHub | mixed | 登録済(T4700150079306) | 要確認 |
| Google広告 | 事業者向け(国内) | 登録済(T1010401089234) | 課対仕入10%(国内) |
| Google Workspace | 消費者向け | 登録済(T4700150006045) | 課対仕入10% |
| Microsoft 365 | mixed | 未登録 | 要確認 |
| Netflix | 消費者向け | 要確認 | 課対仕入10%（要確認） |
| OpenAI (ChatGPT) | mixed | 登録済(T4700150127989) | 課対仕入10%（要確認） |
| Shopify | 事業者向け | 未登録 | 対象外 |
| Shutterstock | 事業者向け | 未登録 | 対象外 |
| Slack | 消費者向け | 登録済 | 課対仕入10% |
| Spotify | mixed | 要確認 | 要確認 |
| X（旧Twitter）広告 | 事業者向け | 未登録 | 対象外 |
| YouTube Premium | 消費者向け | 登録済 | 課対仕入10% |
| Zoom | 消費者向け | 登録済(T6700150118763) | 課対仕入10% |

※ 新しいサービスを追加する場合は `src/shared/overseas-services.js` を編集する。
※ インボイス登録状況は変動するため、国税庁で最新情報を確認すること:
  - 登録国外事業者名簿: https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf
  - 適格請求書発行事業者公表サイト: https://www.invoice-kohyo.nta.go.jp/
  - 特定プラットフォーム事業者名簿: https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf

### 3-3. 出力ファイル

- `analysis/flagged_transactions.json` - 取引レベルのチェック結果
- `analysis/overseas_service_tax_findings.json` - 海外サービス個別チェック結果
- `analysis/overseas_service_tax_summary.json` - 海外サービスサマリー

---

## Step 4: 取引レベルチェック（勘定科目・固定資産等）

取引データを横断的にチェックする。

### チェックルール一覧

| # | チェック内容 | 説明 |
|---|-------------|------|
| 1 | 固定資産化チェック | 費用科目で10万円以上 → 固定資産計上の要否 |
| 2 | 修繕費/資本的支出チェック | 修繕費で20万円以上 → 資本的支出の判定 |
| 3 | 外注費チェック | 毎月同額 → 給与認定リスク、高額 → 期間按分 |
| 4 | ソフトウェア計上漏れ | 支払手数料等にソフトウェア関連 |
| 5 | Amazon書籍チェック | 消耗品費にAmazon購入の書籍 |
| 6 | 役員報酬定期同額 | 月次の役員報酬変動 |
| 7 | 雑勘定使いすぎ | 雑費等の構成比チェック |
| 8 | 摘要・取引先チェック | 勘定科目と摘要の整合性 |

---

## Step 5: 財務分析（BS/PL 3期比較・月次推移）

```bash
node src/classify/03-analyze-financials.js data/{company_id}/{date}
```

### BS残高チェック
- マイナス残高（預金、未払金等）
- ゼロであるべき科目（諸口等）
- 3期比較での大幅変動

### PL分析
- 3期比較での大幅変動（前期同期比30%超）
- 月次推移の異常値（平均±2σ超）
- 財務指標の3期比較

### 出力ファイル
- `analysis/financial_findings.json` - BS/PL変動等の指摘
- `analysis/bs_comparison.json` - BS 3期比較データ
- `analysis/pl_comparison.json` - PL 3期比較データ
- `analysis/monthly_analysis.json` - 月次推移・異常値データ
- `analysis/ratio_analysis.json` - 財務指標3期比較データ

---

## Step 6: 結果の報告

ユーザーに以下を報告：

1. **チェック結果のサマリー**（🔴🟡🔵の件数）
2. **特に重要な🔴要修正項目の内容**
   - 消費税区分の誤り（海外サービス含む）
   - 勘定科目の誤り
   - 固定資産化漏れ
3. **検出された海外サービスの一覧**（テーブル形式）：
   | サービス名 | 提供事業者 | 事業者向け/消費者向け | インボイス登録 | 期待される税区分 | 取引数 | 合計金額 |
4. **主要な財務指標**
5. **出力ファイルのパス**

レポート出力が必要な場合は `/monthly-verify` スキルの Step 5（レポート生成）を参照。

---

## 注意事項

- freee APIのレートリミット（300回/5分）に注意。大量の取引がある場合は月単位でページネーション
- チェック結果はあくまで自動チェック。最終判断は税理士等の専門家が行う
- mixed区分のサービス（Apple、GitHub、Microsoft 365等）はプランにより税区分が異なるため、個別確認が必要
- 消費税法の改正により取扱いが変わる可能性がある。定期的にデータベースを更新すること
- 記帳チェックの詳細な知識ベース（15分野）は `references/accounting/monthly-check-rules.md` を参照

## 参照ファイル

- `references/tax/tax-classification-rules.md` - 消費税区分ルール R01〜R12
- `references/tax/invoice-rules.md` - インボイス判定ルール
- `references/accounting/account-dictionary.md` - 勘定科目キーワード辞書
- `references/accounting/monthly-check-rules.md` - 記帳チェックリスト
- `references/accounting/finance-analyzer.md` - 財務分析ルール
- `src/shared/overseas-services.js` - 海外サービスデータベース
- `src/shared/period-utils.js` - 期間計算ユーティリティ
- `src/shared/rules.js` - 勘定科目チェックルール定義
