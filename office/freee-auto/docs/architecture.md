# freee自動仕訳 アーキテクチャ設計

## 業務フロー概要

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   INPUT段階   │───▶│ CLASSIFY段階  │───▶│  VERIFY段階   │
│  書類取込     │    │  仕訳判定     │    │  月次チェック  │
└──────────────┘    └──────────────┘    └──────────────┘
       │                    │                    │
  Gmail MCP            freee MCP           Notion MCP
  Drive MCP            ルールファイル      レポート出力
```

## INPUT段階: 書類取込・変換

### gmail-watcher.js
- Gmail MCPで受信トレイを監視
- 請求書・領収書の添付ファイルを検知
- freeeファイルボックスへ自動アップロード

### drive-watcher.js
- Google Drive MCPで指定フォルダを監視
- 新規ファイルを検知しfreeeへアップロード

### excel-parser.js
- Excelの経費精算フォーマットを解析
- freee未処理明細として変換

### filebox-uploader.js
- freee MCPでファイルボックスにアップロード
- OCR結果と明細の紐づけ

## CLASSIFY段階: 仕訳判定

### unprocessed-fetcher.js
- freee MCPで未処理明細を一括取得
- フィルタリング（日付範囲、ステータス等）

### tax-classifier.js
- `rules/tax-classification.md` のR01〜R12を適用
- 消費税区分の候補を判定
- 異常検知（不適切な税区分の指摘）

### account-matcher.js
- `rules/account-keywords.md` の16科目辞書でマッチング
- freeeの過去仕訳パターンも参照（freee MCP経由）
- 複数候補がある場合はスコア順で返す

### confidence-scorer.js
- 5要素（キーワード30pt + 過去パターン30pt + 金額妥当性15pt + 税ルール明確さ15pt + 情報量10pt）で算出
- 閾値: High(75+), Medium(45-74), Low(0-44)

### invoice-checker.js
- `rules/invoice-rules.md` の判定フローを適用
- 取引先マスタのインボイス登録番号を参照
- 経過措置の適用判定

## VERIFY段階: 月次チェック

### monthly-checker.js
- `rules/bookkeeping-checklist.md` の15分野チェック
- BS/PL残高の異常検知
- 前月比・前年同月比の変動確認

### report-generator.js
- チェック結果をExcelレポートに出力
- Notionダッシュボードへの結果反映

## 共通ユーティリティ

### freee-client.js
- freee MCP経由のAPI操作をラップ
- レート制限・リトライ処理

### notion-client.js
- Notion MCP経由のDB操作をラップ
- レビューダッシュボードへの登録・更新

### logger.js
- 構造化ログ出力（logs/配下）
- 処理結果のトレーサビリティ確保
