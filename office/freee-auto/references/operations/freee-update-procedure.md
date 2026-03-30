# freee本番更新手順

## 4ステップ

1. **ドライラン実行** — `DRY_RUN=true`（デフォルト）で結果確認
2. **レポート確認** — 4シートExcelレポートで分類結果・金額を目視確認
3. **少量テスト** — 5〜10件を `DRY_RUN=false` で本番登録し、freee画面で検証
4. **本番実行** — 問題なければバッチ実行（上限50件/バッチ）

## ドライランの出力先

- ペイロードJSON: `tmp/dryrun_deals_{timestamp}.json`
- 登録ログJSON: `tmp/registration_log_{timestamp}.json`
- Excelレポート: `reports/processing_report_{companyId}_{timestamp}.xlsx`

## 異常発生時

- 1件でもエラーが出たら残りをスキップする設計を推奨（要実装）
- エラーログは `tmp/` に全件記録

## 実装ファイル

- `src/register/deal-creator.js` — registerDeals({dryRun: true})
