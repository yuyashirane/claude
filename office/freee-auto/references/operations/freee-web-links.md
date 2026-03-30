# freee Webリンク生成

Kintoneレビューアプリ・Excelレポートからfreee画面に直接アクセスするためのURL。

## URLパターン

| 対象 | URLパターン |
|------|-------------|
| 明細画面 | `https://secure.freee.co.jp/wallet_txns#walletable={walletable_id}&start_date={date}` |
| 証憑画面 | `https://secure.freee.co.jp/receipts/{receipt_id}` |
| 仕訳帳（取引） | `https://secure.freee.co.jp/reports/journals?deal_id={deal_id}` |

## 注意

- URL構造はfreeeのUI変更で変わる可能性がある
- APIレスポンス由来のID（walletable_id, receipt_id, deal_id）を保持しておけば再生成可能
- freee_company_id ごとにURLは同じ構造（事業所切替はfreee側のセッションで管理）

## 実装予定

- `src/kintone-apps/freee-links.js` — URL生成ヘルパー関数
