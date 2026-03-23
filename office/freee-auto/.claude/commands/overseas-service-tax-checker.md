# 海外インターネットサービス消費税区分チェッカー (overseas-service-tax-checker)

freee APIから取引データを取得し、海外インターネットサービス（電気通信利用役務の提供）の消費税区分が正しく処理されているかをチェックする。

## 使い方

```
/overseas-service-tax-checker [会社名またはcompany_id] [対象期間: 例 2024/10~2025/12] [課税売上割合: 例 95]
```

引数が省略された場合は、ユーザーに確認する。

## 前提知識: 電気通信利用役務の提供における消費税判定フロー

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

### 事業者向け電気通信利用役務の提供の範囲（限定的に解釈）

以下に該当するものが「事業者向け」：
- インターネット広告の配信・掲載（Google広告、Facebook広告、X広告等）
- ECプラットフォーム（Shopify等のネットショップ運営サービス）
- 個別契約に基づき事業者が事業として利用することが明らかなもの

上記以外は基本的に「消費者向け」として判定する。

### 特定プラットフォーム事業者名簿
事業者向けの判定は、国税庁の特定プラットフォーム事業者名簿も参考にする：
https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf

## 実行パイプライン

### Step 1: パラメータの確認と設定

ユーザーから以下を確認（引数で指定されていない場合）：
- **対象事業所**: company_idまたは会社名
- **対象期間**: 開始年月と終了年月（例: 2024/10~2025/12）
- **課税売上割合**: パーセント（例: 95）
  - 95%以上か未満かで事業者向けサービスの消費税処理が変わる
  - 不明な場合は95%以上と仮定して実行し、結果に注記を付ける

### Step 2: データの準備

既にaccounting-auditで取得済みのデータがある場合はそれを使用する。
なければ以下をfreee-mcp MCPサーバーで取得：

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

#### 2-3. 取引データ（収入）
```
→ data/.../raw/deals_income.json
```

#### 2-4. 振替伝票
```
freee_api_get { service: "accounting", path: "/api/1/manual_journals", query: { company_id: <ID>, start_issue_date: "YYYY-MM-DD", end_issue_date: "YYYY-MM-DD" } }
→ data/.../raw/manual_journals.json
```

データ保存先が存在しない場合は作成：
```bash
mkdir -p data/{company_id}/{YYYY-MM-DD}/raw
mkdir -p data/{company_id}/{YYYY-MM-DD}/analysis
```

config.jsonが存在しない場合は生成してdata/{company_id}/{YYYY-MM-DD}/に保存：
```json
{
  "company_id": 474381,
  "company_name": "会社名",
  "period_start": "2024-10-01",
  "period_end": "2025-12-31"
}
```

### Step 3: 分析スクリプトの実行

```bash
cd C:/Users/yuya_/claude
node scripts/05-check-overseas-services.js data/{company_id}/{date} [課税売上割合]
```

例:
```bash
node scripts/05-check-overseas-services.js data/474381/2025-03-20 95
node scripts/05-check-overseas-services.js data/474381/2025-03-20 80
```

これにより以下のファイルが生成される：
- `analysis/overseas_service_tax_findings.json` - 個別取引のチェック結果
- `analysis/overseas_service_tax_summary.json` - サマリー（検出サービス一覧等）

### Step 4: 結果の報告

ユーザーに以下を報告：

1. **チェック結果のサマリー**（🔴🟡🔵の件数）
2. **検出された海外サービスの一覧**（テーブル形式）：
   | サービス名 | 提供事業者 | 所在地 | 事業者向け/消費者向け | インボイス登録 | 期待される税区分 | 取引数 | 合計金額 |
3. **🔴 要修正項目の詳細**
4. **🟡 要確認項目の詳細**
5. **出力ファイルのパス**

### Step 5: レポート出力（オプション）

ユーザーが希望する場合、`/report-exporter` スキルを使ってExcelまたはGoogleスプレッドシートに出力する。

## チェックルール一覧

### 海外サービス消費税区分チェック

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

## 対応サービスデータベース

スクリプト `scripts/lib/overseas-services.js` に以下のサービスを登録済み：

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

※ 新しいサービスを追加する場合は `scripts/lib/overseas-services.js` を編集する。

## 注意事項

- **ファクトチェック必須**: インボイス登録状況は変動するため、国税庁の登録国外事業者名簿で最新情報を確認すること
  - 登録国外事業者名簿: https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf
  - 適格請求書発行事業者公表サイト: https://www.invoice-kohyo.nta.go.jp/
- **課税売上割合の重要性**: 事業者向けサービスの処理が95%を境に大きく異なる
- **mixed区分のサービス**: Apple、GitHub、Microsoft 365等はプランにより税区分が異なるため、個別確認が必要
- freee APIのレートリミット（300回/5分）に注意
- チェック結果はあくまで自動チェック。最終判断は税理士等の専門家が行うこと
- 消費税法の改正により取扱いが変わる可能性がある。定期的にデータベースを更新すること
