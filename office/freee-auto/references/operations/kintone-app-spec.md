# Kintone 2アプリ フィールド仕様

## 設計方針

- freeeが正本。Kintoneは例外管理のみ
- 口座マスタ・明細全件・取引全件・証憑全件はfreeeで管理（Kintoneに同期しない）
- 顧客リストアプリの `freee_company_id` でルックアップ連携

## App① 未処理明細・証憑確認（31フィールド）

Claude Codeが自動処理できなかった明細を管理。

### 登録条件

信頼度が閾値未満、除外8条件に該当、キーワード辞書マッチなし、
高額取引、初出取引先、インボイス判定絡み、固定資産可能性、
役員貸借・仮払仮受・交際費の論点、既存ルール矛盾

### フィールド一覧

基本情報: record_type, company_id, company_name, target_date, wallet_txn_id(重複禁止), walletable_name, entry_side, amount
明細情報: description, related_receipt_ids
AI判定: ai_status, ai_confidence, ai_guess_account, ai_guess_tax
要確認: issue_type(13選択肢), issue_detail, freee_link
顧客連携: customer_lookup(ルックアップ), customer_name, service_type, account_manager, bookkeeping_checker, bookkeeper
対応管理: reviewer, senior_reviewer, review_status, review_comment, resolved_action, resolved_freee_deal_id
システム: created_by_batch, sync_datetime

### issue_type 選択肢（13個）

勘定科目不明 / 税区分不明 / 証憑不足 / 摘要不明 / 取引先不明 /
高額取引 / ルール外取引 / 固定資産判定要 / インボイス判定要 /
役員貸借確認要 / 仮払仮受確認要 / 初出取引先 / 人手確認必須

## App② 帳簿チェック指摘事項（28フィールド）

帳簿チェックで検出した🔴🟡の指摘事項を管理。

### フィールド一覧

基本情報: record_type, company_id, company_name, fiscal_year, target_month
指摘内容: issue_category(14選択肢), issue_title, issue_detail, priority
freee連携: related_freee_type, related_freee_id, related_receipt_ids, freee_link
顧客連携: customer_lookup(ルックアップ), customer_name, service_type, account_manager, bookkeeping_checker, bookkeeper
対応管理: assigned_to, senior_reviewer, due_date, status, fix_policy, result_comment, closed_at
システム: checked_by, checked_at

### issue_category 選択肢（14個）

残高不一致 / 補助科目不備 / 税区分誤り / 勘定科目誤り / 証憑不足 /
重複計上疑い / 取引漏れ疑い / 消込不備 / 固定資産判定要 /
役員貸借確認要 / 仮払仮受確認要 / 月次推移異常 / 源泉徴収漏れ / インボイス不備

## 環境変数

KINTONE_SUBDOMAIN=
KINTONE_APP_ID_PENDING=（App①）
KINTONE_API_TOKEN_PENDING=
KINTONE_APP_ID_FINDINGS=（App②）
KINTONE_API_TOKEN_FINDINGS=
KINTONE_APP_ID_CUSTOMERS=（顧客リスト、freee事業所ID一括入力用）
KINTONE_API_TOKEN_CUSTOMERS=
