# 事業所ID解決スキル

## このスキルが発動する場面
- 顧問先名だけが分かっていて、freee company IDが不明な場合
- 「○○の月次処理をして」「○○のチェックをお願い」等で、company IDが指定されていない場合
- 新しい顧問先の処理を初めて行う場合

## 解決フロー

### Step 1: ローカルマッピングを確認
data/company-map.json を部分一致検索する。
ヒットすれば、そのIDを使用。

### Step 2: Kintone顧客カルテから検索（2回目以降はここでヒット）
Kintone顧客カルテ（App ID: 206）で顧客名を部分一致検索し、
freee_company_id フィールドの値を取得する。

値が登録されていれば、そのIDを使用。
company-map.json にも自動追加して、次回以降はStep 1で即解決。

### Step 3: freee-MCPで事業所一覧から検索（初回はここ）
freee-MCPの freee_get_companies で全事業所一覧を取得し、
事業所名で部分一致検索する。

見つかったら:
1. そのcompany IDを使用
2. Kintone顧客カルテの freee_company_id フィールドに書き込み（次回以降Step 2で解決）
3. company-map.json にも追加（次回以降Step 1で解決）

### Step 4: ユーザーに確認
上記すべてでヒットしない場合、ユーザーにcompany IDを確認する。

## コマンド
node src/shared/company-resolver.js --search "顧問先名"

## 注意事項
- Kintone API接続には .env の KINTONE_BASE_URL と KINTONE_API_TOKEN_CUSTOMERS が必要
- Kintone顧客カルテの顧客名フィールドで部分一致検索
- freee_company_id フィールドが空の顧客は、freee-MCPで解決後にKintoneに書き込む
- freee-MCPの freee_get_companies は認可済みの全事業所を返す

## Kintone顧客カルテ（App 206）フィールドマッピング

| 用途 | フィールドコード | ラベル | 型 |
|------|----------------|--------|-----|
| 顧客名（検索用） | `顧客名` | 顧客検索キー | SINGLE_LINE_TEXT |
| 顧客名（表示用） | `顧客名_重複可` | 顧客名 | SINGLE_LINE_TEXT |
| freee事業所ID | `company_id` | freee 事業所ID | SINGLE_LINE_TEXT |
| レコード番号 | `レコード番号` | レコード番号 | RECORD_NUMBER |
