# レポート改善スキル

## このスキルが発動する場面
- ユーザーが「レポートの○○を修正して」「シートの色を変えて」「新しい列を追加して」
  「ラベルを変更して」「freeeリンクのマッピングを追加して」等と依頼した場合

## 対象ファイル構成

月次チェックのExcelレポートは以下のファイルで構成されている:

| 変更したい内容 | 対象ファイル |
|--------------|------------|
| 色・フォント・罫線 | `src/verify/report-config/styles.js` |
| カテゴリ名・チェックコード名・グループ定義 | `src/verify/report-config/labels.js` |
| freeeリンクの科目マッピング・推定ロジック | `src/verify/report-config/link-mappings.js` |
| シートの列構成・列幅・ヘッダー名 | `src/verify/monthly-report-generator.js`（シート生成関数内） |
| シート生成ロジック・データ加工 | `src/verify/monthly-report-generator.js` |
| チェックロジック本体 | `src/verify/monthly-checks/[モジュール名].js` |

## 手順

### 1. 変更対象の特定
ユーザーの依頼内容から、上記の対象ファイルを特定する。
迷ったら対象ファイルを `cat` して中身を確認する。

### 2. 変更の実施
- 対象ファイルを読み、変更箇所を特定して修正
- **既存テストを壊さないこと**が絶対条件

### 3. テスト実行
```bash
node tests/test-monthly-report.js     # レポートテスト
node tests/test-report-details.js     # 子行テスト
npm test                              # 全テスト回帰確認
```

### 4. 実データ確認
```bash
node src/verify/monthly-checker.js --company 474381 --month 2026-03 --no-dry-run
```
生成されたExcelファイルを開いて変更箇所を目視確認する。
ファイルパス: `reports/474381/{事業所名}_帳簿チェック_{targetMonth}_{timestamp}.xlsx`

## 変更パターン別ガイド

### 色の変更
`report-config/styles.js` の `COLORS` オブジェクトを修正。
ARGB形式（例: `'FF2B5797'`）。先頭FFは不透明度。

### チェックコード名の変更
`report-config/labels.js` の `CHECK_CODE_LABELS` を修正。
キーはチェックコード（例: `'TC-06'`）、値は日本語表示名。

### 新しいチェックコードの追加時
1. チェックモジュール（`monthly-checks/xxx.js`）に実装
2. `report-config/labels.js` の `CHECK_CODE_LABELS` に追加
3. 必要に応じて `CHECK_GROUPS` の categories にカテゴリを追加

### freeeリンクマッピングの追加
`report-config/link-mappings.js` の `CODE_TO_ACCOUNT` にチェックコードと科目名の対応を追加。

### 列の追加・変更
`monthly-report-generator.js` の該当シート生成関数内の列定義（`ws.columns` や `cols`）を修正。
データ行生成ロジックも合わせて修正が必要な場合がある。
