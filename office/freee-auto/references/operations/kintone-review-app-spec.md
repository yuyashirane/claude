# Kintone仕訳レビューアプリ仕様

freee自動仕訳の判定結果をレビュー・承認・修正するためのKintoneアプリ。
1仕訳＝1レコードで管理する。

---

## アプリ概要

- アプリ名: freee仕訳レビュー
- 用途: Claude Codeが生成した仕訳候補を人間がレビュー・承認する
- 1レコード＝1取引（1仕訳候補）

---

## フィールド設計（20フィールド）

### AI判定結果（自動入力）
| # | フィールド名 | フィールドタイプ | フィールドコード | 説明 |
|---|-------------|----------------|-----------------|------|
| 1 | 取引日 | 日付 | transaction_date | 取引の発生日 |
| 2 | 金額 | 数値 | amount | 取引金額（税込） |
| 3 | 摘要 | 文字列（複数行） | description | freeeの摘要テキスト |
| 4 | 推定勘定科目 | ドロップダウン | estimated_account | 22種から選択 |
| 5 | 推定消費税区分 | ドロップダウン | estimated_tax_class | 9種から選択 |
| 6 | 信頼度スコア | 数値 | confidence_score | 0〜100 |
| 7 | 信頼度ランク | ドロップダウン | confidence_rank | High / Medium / Low |
| 8 | インボイス区分 | ドロップダウン | invoice_class | 5種から選択 |
| 9 | 消費税指摘 | チェックボックス | tax_flags | R01〜R12（該当ルールID） |
| 10 | freee明細ID | 文字列（1行） | freee_deal_id | freee上の明細ID |
| 11 | 処理日時 | 日時 | processed_at | AIが処理した日時 |
| 12 | 顧問先名 | ドロップダウン | client_name | 対象の顧問先 |

### 人間レビュー結果（手動入力）
| # | フィールド名 | フィールドタイプ | フィールドコード | 説明 |
|---|-------------|----------------|-----------------|------|
| 13 | レビューステータス | ステータス（プロセス管理） | review_status | 未レビュー→レビュー中→承認済み/修正済み/却下 |
| 14 | レビュー担当 | ユーザー選択 | reviewer | レビュー担当者 |
| 15 | 修正科目 | ドロップダウン | corrected_account | 修正後の勘定科目 |
| 16 | 修正税区分 | ドロップダウン | corrected_tax_class | 修正後の消費税区分 |
| 17 | 修正理由 | 文字列（複数行） | correction_reason | フィードバックループ用 |
| 18 | 承認者 | ユーザー選択 | approver | 最終承認した税理士 |
| 19 | 承認日時 | 日時 | approved_at | 承認した日時 |
| 20 | 備考 | 文字列（複数行） | notes | その他メモ |

---

## ドロップダウン選択肢

### 推定勘定科目（22種）
売上高、仕入高、外注費、給料手当、役員報酬、法定福利費、福利厚生費、
地代家賃、租税公課、支払利息、保険料、交際費、会議費、消耗品費、
支払手数料、旅費交通費、通信費、水道光熱費、新聞図書費、広告宣伝費、
修繕費、雑費

### 推定消費税区分（9種）
課税10%、課税8%（軽減）、非課税、不課税、免税、対象外、
課税10%（経過80%）、課税10%（経過50%）、要確認

### インボイス区分（5種）
適格、非適格（経過80%）、非適格（経過50%）、不要、要確認

### 信頼度ランク（3種）
High、Medium、Low

### 消費税指摘チェックボックス（12種）
R01〜R12（各ルールIDをチェックボックスの選択肢として設定）

---

## プロセス管理（ステータス遷移）

Kintoneのプロセス管理機能を使って以下のフローを設定：
未レビュー → レビュー中 → 承認済み
                        → 修正済み
                        → 却下

- 「未レビュー→レビュー中」: レビュー担当が実行
- 「レビュー中→承認済み」: 修正不要の場合
- 「レビュー中→修正済み」: 修正科目・修正税区分を入力後に実行
- 「レビュー中→却下」: 処理しない取引

---

## 一覧（ビュー）設定（3ビュー）

### 若手レビュー一覧
- フィルター: 信頼度ランク = High or Medium、ステータス = 未レビュー
- ソート: 信頼度スコア 降順
- 表示フィールド: 取引日、金額、摘要、推定勘定科目、推定消費税区分、信頼度スコア、インボイス区分
- 用途: Highはまとめて承認、Mediumは個別確認

### 経験者レビュー一覧
- フィルター: 信頼度ランク = Low、またはステータス = 未レビュー かつ 消費税指摘 が空でない
- ソート: 消費税指摘があるものを優先
- 表示フィールド: 取引日、金額、摘要、推定勘定科目、推定消費税区分、信頼度スコア、消費税指摘、インボイス区分
- 用途: 判断が必要な案件に集中

### 進捗管理一覧
- フィルター: なし（全件）
- グループ化: 顧問先名
- ソート: レビューステータス
- 表示フィールド: 顧問先名、レビューステータス、信頼度ランク、修正科目
- 用途: 顧問先ごとの処理状況を俯瞰

---

## Claude Code → Kintone 連携（REST API）

### 接続情報
- サブドメイン: （事務所のサブドメイン）.cybozu.com
- アプリID: （作成後に記入）
- APIトークン: 環境変数 KINTONE_API_TOKEN に設定
- 必要な権限: レコード閲覧、レコード追加、レコード編集

### レコード登録（POST）
@kintone/rest-api-client を使用：
```javascript
const { KintoneRestAPIClient } = require("@kintone/rest-api-client");

const client = new KintoneRestAPIClient({
  baseUrl: process.env.KINTONE_BASE_URL,
  auth: { apiToken: process.env.KINTONE_API_TOKEN },
});

// 1件登録
await client.record.addRecord({
  app: APP_ID,
  record: {
    transaction_date: { value: "2026-03-28" },
    amount: { value: 10000 },
    description: { value: "株式会社ABC 外注費" },
    estimated_account: { value: "外注費" },
    estimated_tax_class: { value: "課税10%" },
    confidence_score: { value: 82 },
    confidence_rank: { value: "High" },
    invoice_class: { value: "適格" },
    freee_deal_id: { value: "12345" },
    processed_at: { value: "2026-03-28T10:30:00+09:00" },
    client_name: { value: "株式会社ABC" },
  },
});

// 複数件一括登録（最大100件/回）
await client.record.addAllRecords({
  app: APP_ID,
  records: recordsArray,
});
```

### レコード取得（GET）
```javascript
// フィードバックデータ取得（修正済みレコード）
const records = await client.record.getRecords({
  app: APP_ID,
  query: 'review_status in ("修正済み")',
  fields: ["estimated_account", "corrected_account", "correction_reason"],
});
```

---

## Kintone特有の注意事項

- 1回のPOSTで登録できるのは最大100件。addAllRecords を使えば自動分割される。
- フィールドコードは英数字・アンダースコアのみ（日本語不可）
- APIトークンはアプリごとに発行。「レコード追加」の権限チェックを忘れない。
- ステータス変更はプロセス管理API経由。直接フィールド更新では変更できない。
- チェックボックスフィールドの値は配列で指定: { value: ["R01", "R03"] }
