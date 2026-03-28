# 未処理明細→取引登録スキル

freee APIから未処理明細を取得し、NORMALIZE → CLASSIFY → ROUTING → REGISTER の
一気通貫パイプラインで取引登録（または Kintone レビュー送付）まで実行する。

## 実行手順

### Step 0: 事前確認
1. freee MCP の認証状態を確認（`freee_auth_status`）
2. 対象事業所を確認（`freee_get_current_company`）
3. 事業所の決算月を確認し、正しい会計期間でデータ取得する

### Step 1: 未処理明細の取得
freee MCPで未処理明細を取得する:

```
freee_api_get:
  path: /api/1/wallet_txns
  params:
    company_id: {company_id}
    status: 1              # 未処理のみ
    limit: 100
```

取得結果を `tmp/wallet_txns_{company_id}_{date}.json` に保存する。

### Step 2: パイプライン実行
`src/classify/unprocessed-processor.js` を実行:

```bash
node src/classify/unprocessed-processor.js tmp/wallet_txns_{company_id}_{date}.json tmp/
```

出力: `tmp/processing_result_{timestamp}.json`

### Step 3: 結果の確認
処理結果JSONの内容を確認する:
- `auto_register`: 自動登録候補（高確度・フラグなし）
- `kintone_review`: Kintone確認送付（中低確度・フラグあり）
- `exclude`: 除外（口座振替等）
- `freee_rule_matched`: freeeに委譲（rule_matched=true）

### Step 4: Excelレポート出力
```bash
node src/verify/processing-report.js tmp/processing_result_{timestamp}.json reports/
```

4シート構成のExcelレポートが `reports/` に出力される。

### Step 5: freee取引登録（自動登録候補）
⚠️ まずドライランで確認:
```bash
node src/register/deal-creator.js tmp/processing_result_{timestamp}.json
```

本番登録する場合（`--no-dry-run` は十分確認してから）:
```bash
node src/register/deal-creator.js tmp/processing_result_{timestamp}.json --no-dry-run
```

もしくは、freee MCPで1件ずつ登録:
```
freee_api_post:
  path: /api/1/deals
  body:
    company_id: {company_id}
    issue_date: "2026-03-15"
    type: "expense"
    details:
      - account_item_id: 738954738  # 旅費交通費
        tax_code: 136               # 課対仕入10%
        amount: 5500
        description: "タクシー代 渋谷→新宿"
```

### Step 6: Kintone送付（要確認案件）
`kintone_review` に振り分けられた明細を Kintone 仕訳レビューアプリに送付:

```bash
node src/review/kintone-sender.js --input tmp/processing_result_{timestamp}.json
```

## 重要なルール

### freeeファースト原則
- `rule_matched === true` の明細はfreeeの自動登録ルールに任せる
- Claude Codeは `rule_matched !== true` の明細のみ処理する

### 安全設計
- freeeへの書き込みは必ず **ドライラン** で確認してから実行
- 1バッチ最大50件の制限
- 全登録結果をログに記録

### 信頼度スコアの振り分け
| ランク | スコア | 振り分け先 |
|--------|--------|-----------|
| High | 75点以上 | auto_register（フラグなしの場合） |
| Medium | 45〜74点 | kintone_review（若手レビュー） |
| Low | 0〜44点 | kintone_review（経験者レビュー） |

### 高確度でもKintone送付になる条件
- 消費税指摘フラグあり（R01〜R12）
- 特殊フラグあり（固定資産確認等）
- 10万円以上の取引
- 勘定科目が「雑費」

## 関連ファイル

### パイプラインコード
- `src/normalize/format-standardizer.js` — 明細標準化
- `src/classify/account-matcher.js` — 仕訳判定 + 信頼度スコア
- `src/classify/routing-decider.js` — 振り分け判定
- `src/classify/unprocessed-processor.js` — パイプライン統合
- `src/register/deal-creator.js` — freee取引登録
- `src/verify/processing-report.js` — Excelレポート出力

### 辞書・ルール
- `references/dictionaries/` — キーワード辞書・取引先辞書
- `references/rules/` — 信頼度閾値・除外キーワード
- `references/tax/tax-classification-rules.md` — 消費税区分ルール R01〜R12

### テスト
- `tests/test-pipeline.js` — パイプライン統合テスト（11/11 通過）
