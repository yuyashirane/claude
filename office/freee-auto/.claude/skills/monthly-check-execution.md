# 月次チェック実行スキル

## このスキルが発動する場面
- 「○○（顧問先名）の○月のチェックをして」
- 「月次チェックを実行して」
- 「帳簿チェックをお願い」
- 「○○のレポートを作って」

## 必要情報の確認

ユーザーに以下を確認する（不足している場合のみ）:
- **顧問先名** または **freee company ID**
- **対象月**（YYYY-MM形式）

## 実行手順

### 1. 顧問先名で実行する場合

```bash
node src/verify/monthly-checker.js --company-name "{顧問先名}" --month {YYYY-MM} --no-dry-run
```

### 2. company IDで実行する場合

```bash
node src/verify/monthly-checker.js --company {companyId} --month {YYYY-MM} --no-dry-run
```

### 3. company IDが不明な場合

以下の順で解決を試みる:
1. `data/company-map.json` を確認
2. Kintone顧客カルテ（App ID: 206）で顧問先名を検索
3. ユーザーにfreee company IDを確認

### 4. 結果の報告

実行後、以下を報告する:

```
■ {顧問先名}（{companyId}）の月次チェック結果（{対象月}）

🔴 要修正: X件
🟡 要確認: X件
🔵 情報:   X件
合計: X件

Excelレポート: reports/{companyId}/{ファイル名}.xlsx
```

### 5. フォローアップ

ユーザーが「詳しく教えて」と言った場合:
- 🔴の指摘を優先的にカテゴリ別に要約
- 各指摘について具体的な対応方法を提案
- freeeの該当画面へのリンクを案内（Excelレポート内にリンクあり）

ユーザーが特定のカテゴリ（「消費税区分だけ見せて」等）を指定した場合:
- 該当カテゴリの指摘のみを表示

## 既知の制限

- deals取得上限は500件/月。大規模事業所では不足の可能性あり
- freee APIの deals.partner_name は全件undefined。resolvePartnerName()で代替取得済み
- 前期税額データは取得不可。予定納税チェック（AT系）は注意喚起レベル

## 登録済み事業所

`data/company-map.json` を参照。新規事業所を追加する場合はこのファイルにエントリを追加する。
