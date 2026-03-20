# 勘定科目・BS/PLチェッカー (accounting-audit)

freee APIからデータを取得し、取引レベルの勘定科目チェック、BS/PL 3期比較、月次推移分析を行い、Excelレポートを生成する。

## 使い方

```
/accounting-audit [会社名またはcompany_id] [対象期間: 例 2024/10~2025/12]
```

引数が省略された場合は、ユーザーに確認する。

## 実行パイプライン

### Step 1: パラメータの確認と設定

ユーザーから以下を確認（引数で指定されていない場合）：
- **対象事業所**: company_idまたは会社名
- **対象期間**: 開始年月と終了年月（例: 2024/10~2025/12）

期間から以下を自動計算：
- 当期: ユーザー指定期間
- 前期同期: 1年前の同じ月数
- 前々期同期: 2年前の同じ月数
- BSは各期の末日残高を比較、PLは同じ月数で比較

データ保存先を作成：
```bash
mkdir -p data/{company_id}/{YYYY-MM-DD}/raw
mkdir -p data/{company_id}/{YYYY-MM-DD}/analysis
```

config.jsonを生成してdata/{company_id}/{YYYY-MM-DD}/に保存：
```json
{
  "company_id": 474381,
  "company_name": "会社名",
  "period_start": "2024-10-01",
  "period_end": "2025-12-31",
  "period_months": 15,
  "fiscal_year_end_month": 9,
  "periods": {
    "current": { "start": "2024-10-01", "end": "2025-12-31", "label": "当期(2024/10~2025/12)" },
    "prior1": { "start": "2023-10-01", "end": "2024-12-31", "label": "前期(2023/10~2024/12)" },
    "prior2": { "start": "2022-10-01", "end": "2023-12-31", "label": "前々期(2022/10~2023/12)" }
  }
}
```

### Step 2: freee APIからデータ取得

**重要**: freee-mcp MCPサーバーを使用すること。データは取得後すぐにJSONファイルに保存する。

#### 2-1. 勘定科目一覧
```
freee_api_get { service: "accounting", path: "/api/1/account_items", query: { company_id: <ID> } }
→ data/{company_id}/{date}/raw/account_items.json に保存
```

#### 2-2. 取引データ（支出）- ページネーション対応
```
freee_api_get { service: "accounting", path: "/api/1/deals", query: { company_id: <ID>, limit: 100, offset: 0, start_issue_date: "YYYY-MM-DD", end_issue_date: "YYYY-MM-DD", type: "expense" } }
→ data/.../raw/deals_expense.json に保存
```
- meta.total_countを確認し、100件ずつoffsetを増やして全件取得
- 2ページ目以降はdeals_expense_p2.json, deals_expense_p3.json... として保存
- または全ページのdealsを結合して1つのdeals_expense.jsonに保存

#### 2-3. 取引データ（収入）- 同様にページネーション
```
→ data/.../raw/deals_income.json
```

#### 2-4. 振替伝票
```
freee_api_get { service: "accounting", path: "/api/1/manual_journals", query: { company_id: <ID>, start_issue_date: "YYYY-MM-DD", end_issue_date: "YYYY-MM-DD" } }
→ data/.../raw/manual_journals.json
```

#### 2-5. 試算表（BS）- 3期分

freee APIのtrial_bsは会計年度(fiscal_year)と月(start_month, end_month)で指定する。

**重要**: 年度をまたぐ月の指定はできない。会計年度の決算月に注意すること。

例（9月決算の場合）:
- 2024/10~2025/3のBS → fiscal_year=2025, start_month=10, end_month=3
- 2024/10~2025/9のBS → fiscal_year=2025, start_month=10, end_month=9

当期・前期・前々期それぞれ取得：
```
→ data/.../raw/trial_bs_current.json
→ data/.../raw/trial_bs_prior1.json
→ data/.../raw/trial_bs_prior2.json
```

ただし、チェック対象期間が会計年度をまたぐ場合（例: 2024/10~2025/12で9月決算の場合、2024/10~2025/9と2025/10~2025/12の2つの年度にまたがる）は、各年度ごとに取得して結合するか、終了月のBS残高を取得する。

#### 2-6. 試算表（PL）- 3期分
同様に取得：
```
→ data/.../raw/trial_pl_current.json
→ data/.../raw/trial_pl_prior1.json
→ data/.../raw/trial_pl_prior2.json
```

#### 2-7. 月次PL（月ごとに取得）
各月のPLを個別に取得：
```
freee_api_get { service: "accounting", path: "/api/1/reports/trial_pl", query: { company_id: <ID>, fiscal_year: YYYY, start_month: M, end_month: M } }
→ data/.../raw/trial_pl_month_1.json, trial_pl_month_2.json, ...
```
各ファイルに year, month プロパティを追加して保存。

#### 2-8. 固定資産台帳
```
freee_api_get { service: "accounting", path: "/api/1/fixed_assets", query: { company_id: <ID> } }
→ data/.../raw/fixed_assets.json
```

### Step 3: 分析スクリプトの実行

取得完了後、Node.jsスクリプトで分析を実行：

```bash
cd C:/Users/yuya_/claude
node scripts/02-analyze-transactions.js data/{company_id}/{date}
node scripts/03-analyze-financials.js data/{company_id}/{date}
```

これにより以下のファイルが生成される：
- `analysis/flagged_transactions.json` - 取引レベルのチェック結果
- `analysis/financial_findings.json` - BS/PL変動等の指摘
- `analysis/bs_comparison.json` - BS 3期比較データ
- `analysis/pl_comparison.json` - PL 3期比較データ
- `analysis/monthly_analysis.json` - 月次推移・異常値データ
- `analysis/ratio_analysis.json` - 財務指標3期比較データ

### Step 4: レポート生成

```bash
node scripts/04-generate-report.js data/{company_id}/{date}
```

Excelファイルが `reports/` ディレクトリに出力される。

### Step 5: 結果の報告

ユーザーに以下を報告：
1. チェック結果のサマリー（🔴🟡🔵の件数）
2. 特に重要な🔴要修正項目の内容
3. 主要な財務指標
4. 出力ファイルのパス

## チェックルール一覧

### 取引レベルチェック
1. **固定資産化チェック**: 費用科目で10万円以上 → 固定資産計上の要否
2. **修繕費/資本的支出チェック**: 修繕費で20万円以上 → 資本的支出の判定
3. **外注費チェック**: 毎月同額 → 給与認定リスク、高額 → 期間按分
4. **ソフトウェア計上漏れ**: 支払手数料等にソフトウェア関連
5. **Amazon書籍チェック**: 消耗品費にAmazon購入の書籍
6. **役員報酬定期同額**: 月次の役員報酬変動
7. **雑勘定使いすぎ**: 雑費等の構成比チェック
8. **摘要・取引先チェック**: 勘定科目と摘要の整合性

### BS残高チェック
- マイナス残高（預金、未払金等）
- ゼロであるべき科目（諸口等）
- 3期比較での大幅変動

### PL分析
- 3期比較での大幅変動（前期同期比30%超）
- 月次推移の異常値（平均±2σ超）

## 注意事項
- freee APIのレートリミット（300回/5分）に注意
- 大量の取引がある場合は月単位でページネーション
- チェック結果はあくまで自動チェック。最終判断は専門家が行う
