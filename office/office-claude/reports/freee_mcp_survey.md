# freee-MCP 事前調査レポート

**調査日**: 2026-04-16
**対象会社**: アントレッド株式会社（company_id: 3525430）
**調査者**: Claude Code（Sonnet 4.6）
**調査対象期間**: FY2025（2025-04-01〜2026-03-31）

---

## 1. 会社基本情報

| 項目 | 値 |
|---|---|
| 会社名 | アントレッド株式会社 |
| company_id | **3525430** |
| display_name | アントレッド株式会社 |
| company_number | 3550770189 |
| 決算月 | 3月（年度：4月〜翌3月） |
| 現在の fiscal_year_id | **9842248** |
| 期首年月 | 2025-04-01 |
| 期末年月 | 2026-03-31 |
| fiscal_year パラメータ（API用）| **2025**（期首年を使用） |

### 補足

- `freee_list_companies` は name=null のエラーが発生（既知の癖 §1-4）
- `/api/1/companies` 直接呼び出しで `display_name` = "アントレッド株式会社" を確認済み
- `/api/1/companies/3525430` 個別取得で `fiscal_years` 配列を確認

---

## 2. 記帳完了月の特定

### 直近6ヶ月の月次取引（deals）件数

| 月 | 仕訳件数（deals） | 前月比 | 評価 |
|---|---|---|---|
| 2025年10月 | 204件 | — | 安定 |
| 2025年11月 | 207件 | +1.5% | 安定 |
| 2025年12月 | 207件 | 0.0% | 安定 |
| 2026年1月 | 222件 | +7.2% | やや増加 |
| 2026年2月 | 235件 | +5.9% | やや増加 |
| 2026年3月 | 254件 | +8.1% | 増加傾向あり（決算月） |

> 調査方法: `GET /api/1/deals?limit=1&start_issue_date=YYYY-MM-DD&end_issue_date=YYYY-MM-DD` で `meta.total_count` のみ確認。

### 推奨月・代替候補

```
【推奨月】2025年12月
理由:
- 仕訳件数 207件、前月比0%（11月と同数）で最安定
- 調査日（2026-04-16）から約4ヶ月前。決算処理・修正仕訳が確定済みの可能性が高い
- wallet_txns も100件取得できており記帳充足度の確認が取れた
- freee 請求書・自動経理の両方のdeal_origin_nameが混在しており多様なデータを含む

【代替候補1】2025年11月（207件）
理由: 推奨月と同件数。12月が何らかの理由で使えない場合の第一候補。

【代替候補2】2025年10月（204件）
理由: 推奨月・代替1から±2%以内。十分に安定。

【避けたい月】2026年3月（254件）
理由: 決算月のため決算修正仕訳が3月末に集中。4月時点でまだ調整が入る可能性あり。
```

---

## 3. 取得可能 API 経路の棚卸し

freee-MCP で利用可能な会計系 API のうち、仕訳データ取得に関係する4経路を確認した。

### 3-1. `GET /api/1/deals`（取引一覧）

| 項目 | 確認結果 |
|---|---|
| freee-MCP ツール | `mcp__freee-mcp__freee_api_get`（service="accounting", path="/api/1/deals"）|
| 1回の取得上限 | 100件（limit パラメータで指定） |
| ページネーション | **あり**（`offset` / `limit` で制御） |
| total_count | **あり**（`meta.total_count`） |
| 2025年12月実測件数 | **207件**（3ページ必要） |
| データ粒度 | 取引単位（1取引 N行の details[] 配列） |

**レスポンス構造（実確認済みフィールド）**

- `deal` レベル: `id`, `company_id`, `issue_date`, `due_date`, `amount`, `due_amount`, `type`（"income"/"expense"）, `partner_id`, `partner_code`, `ref_number`, `status`, `deal_origin_name`, `details`, `payments`, `receipts`
- `details[]` レベル: `id`, `account_item_id`, `tax_code`, `item_id`, `section_id`, `tag_ids`, `amount`, `vat`, `description`, `entry_side`（"debit"/"credit"）

**実レスポンス断片（1件・2025年12月）**

```json
{
  "id": 3287963184,
  "company_id": 3525430,
  "issue_date": "2025-12-31",
  "due_date": "2026-01-31",
  "amount": "XXXXX",
  "type": "income",
  "partner_id": 108913954,
  "status": "settled",
  "deal_origin_name": "freee請求書",
  "details": [
    {
      "id": 8958398833,
      "account_item_id": 564840709,
      "tax_code": 129,
      "amount": "XXXXX",
      "vat": "XXXX",
      "description": "【売上報酬】〇〇〇〇 12月分",
      "entry_side": "credit"
    }
  ],
  "payments": [
    {
      "id": 8958413477,
      "date": "2026-01-15",
      "from_walletable_type": "bank_account",
      "from_walletable_id": 3234334,
      "amount": "XXXXX"
    }
  ]
}
```

---

### 3-2. `GET /api/1/manual_journals`（振替伝票）

| 項目 | 確認結果 |
|---|---|
| freee-MCP ツール | `mcp__freee-mcp__freee_api_get`（service="accounting", path="/api/1/manual_journals"）|
| 1回の取得上限 | 100件（limit パラメータで指定） |
| ページネーション | **あり**（`offset` / `limit`） |
| 2025年12月実測件数 | **0件** |
| FY2025年間件数 | **4件のみ**（定常取引の記録には使われていない） |
| データ粒度 | 仕訳単位（1仕訳 N行の details[] 配列） |
| **特記事項** | `details[]` に **`partner_name`が直接含まれる**（deals と異なる重要な差異） |

**実レスポンス断片（FY2025内サンプル）**

```json
{
  "id": 3469492299,
  "company_id": 3525430,
  "issue_date": "2026-03-31",
  "adjustment": true,
  "details": [
    {
      "id": 9416917118,
      "entry_side": "credit",
      "account_item_id": 564840662,
      "tax_code": 2,
      "amount": "XXXXX",
      "vat": 0,
      "partner_id": 111325415,
      "partner_name": "㈱〇〇〇",
      "partner_code": null,
      "partner_long_name": "",
      "item_id": null,
      "item_name": null,
      "section_id": null,
      "section_name": null,
      "description": ""
    }
  ]
}
```

---

### 3-3. `GET /api/1/wallet_txns`（口座・カード明細）

| 項目 | 確認結果 |
|---|---|
| freee-MCP ツール | `mcp__freee-mcp__freee_api_get`（service="accounting", path="/api/1/wallet_txns"）|
| 1回の取得上限 | **100件（固定上限）** |
| ページネーション | **なし** |
| total_count | **なし**（件数確認不可） |
| 2025年12月実測件数 | 100件取得（ただし100件でカット。実際の月間総数不明） |
| **仕訳チェック適性** | **× 不適**（account_name・tax_code・partner情報がない） |

**実レスポンス断片（1件）**

```json
{
  "id": 2063345124,
  "company_id": 3525430,
  "amount": "XXXX",
  "balance": null,
  "description": "〇〇サービス名",
  "due_amount": 0,
  "date": "2025-12-31",
  "entry_side": "expense",
  "walletable_type": "credit_card",
  "walletable_id": 1784714,
  "status": 2,
  "rule_matched": true
}
```

---

### 3-4. `GET /api/1/journals`（仕訳帳）

| 項目 | 確認結果 |
|---|---|
| freee-MCP ツール | `mcp__freee-mcp__freee_api_get`（service="accounting", path="/api/1/journals"）|
| 動作方式 | **非同期ファイルダウンロード（リアルタイム取得不可）** |
| download_type | "generic", "generic_v2", "csv", "pdf" のみ |
| encoding | sjis（文字コード変換が必要） |
| 取得フロー | ①GETでジョブ作成 → ②status_url をポーリング → ③ダウンロードURL取得 |
| **adapter適性** | **× 不適**（ポーリング実装が必要かつ sjis 変換が必要） |

---

### 3-5. 補助 API（勘定科目・取引先マスタ）

#### `GET /api/1/account_items`（勘定科目マスタ）

| 項目 | 確認結果 |
|---|---|
| 総件数 | **201件** |
| 取得方法 | 1リクエストで全件取得可能（limit 指定不要でも全件返却） |
| 主要フィールド | `id`, `name`, `tax_code`, `account_category`, `categories`, `shortcut`, `shortcut_num`, `available` |

**実レスポンス断片（アカウントID: 564840709）**

```json
{
  "id": 564840709,
  "name": "売上高",
  "tax_code": 21,
  "account_category_id": 81,
  "shortcut": "URIAGE",
  "shortcut_num": "700",
  "default_tax_code": 129,
  "account_category": "売上高",
  "available": true,
  "walletable_id": null
}
```

#### `GET /api/1/partners`（取引先マスタ）

| 項目 | 確認結果 |
|---|---|
| 総件数 | **255件**（page1: 100, page2: 100, page3: 55） |
| ページネーション | あり（`offset` / `limit`）。ただし **total_count なし** |
| 全件取得方法 | 100件ずつ3回リクエスト（空レスポンスが返るまでループ） |
| 主要フィールド | `id`, `name`, `long_name`, `name_kana`, `code`, `available`, `qualified_invoice_issuer` |

---

## 4. 必須フィールド取得可否マトリクス

TC-01〜07 が参照する 11 フィールドについて、各 API 経路での取得可否を実確認した。

**判定記号**: ○=直接取得 △=追加処理が必要 ×=取得不可

| # | フィールド | `/api/1/deals` | `/api/1/manual_journals` | `/api/1/wallet_txns` | `/api/1/journals` | 備考 |
|---|---|---|---|---|---|---|
| 1 | account_name | △ | △ | × | — | deals/manual_journals とも `account_item_id` のみ。`/api/1/account_items` で解決（全201件キャッシュ） |
| 2 | description | ○ | ○ | ○ | — | `details[].description` / `description` |
| 3 | amount | ○ | ○ | ○ | — | `details[].amount` / `amount` |
| 4 | debit_amount | △ | △ | △ | — | `details[].entry_side == "debit"` → amount（deals/manual_journals）/ `entry_side == "expense"` → amount（wallet_txns）|
| 5 | credit_amount | △ | △ | △ | — | `details[].entry_side == "credit"` → amount（deals/manual_journals）/ `entry_side == "income"` → amount（wallet_txns）|
| 6 | tax_code | ○ | ○ | × | — | `details[].tax_code`。wallet_txns にはなし |
| 7 | date | ○ | ○ | ○ | — | `issue_date`（deal/journal レベル）/ `date`（wallet_txns）|
| 8 | partner_id | ○ | ○ | × | — | `deal.partner_id`（deal レベル、null の場合あり）/ `details[].partner_id`（manual_journals）|
| 9 | partner_name | △ | **○** | × | — | deals: `partner_id` → `/api/1/partners` で解決（255件キャッシュ）/ **manual_journals は `details[].partner_name` を直接返す** |
| 10 | row_id / deal_id | ○ | ○ | ○ | — | `details[].id`（行ID）+ `deal.id` or `manual_journal.id`（取引ID）|
| 11 | account_item_id | ○ | ○ | × | — | `details[].account_item_id` |

> **wallet_txns の取扱い**: tax_code・account_item_id・partner情報がすべてなく、TC-01〜07 の判定主キーが欠落するため **adapter のメイン経路として採用不可**。
>
> **journals の取扱い**: 非同期ダウンロードのため、リアルタイムな仕訳取得経路として **採用不可**。

### マトリクス補足（deals と manual_journals の差異）

| 比較点 | `deals` | `manual_journals` |
|---|---|---|
| 月次件数（2025年12月） | 207件 | 0件 |
| 年間件数（FY2025） | 1,329件 ※ | 4件 |
| partner_name | × 直接取得不可（partner_id のみ） | **○ 直接取得可能** |
| partner_id の位置 | deal レベル（1取引で1つ） | details[] レベル（行ごとに設定可能） |
| 定常取引の記録 | ○ ほぼすべて | × ほとんどなし（振替伝票のみ） |

※ 年間件数は各月 total_count の合計: 204+207+207+222+235+254 ＋ 前半6ヶ月分（調査対象外）の推定値は含まず。後半6ヶ月合計: 1,329件。

---

## 5. 推奨取得経路

### 結論

```
【推奨取得経路】

メイン: GET /api/1/deals
  - 取引単位で取得、details[] 配列で明細行を展開
  - limit=100, offset=N でページネーション（207件 → 3ページ）
  - meta.total_count で全件数確認可能

補助1: GET /api/1/partners
  - partner_id → partner_name 名前解決用
  - E2E 開始時に全255件を3ページで一括取得してキャッシュ
  - キャッシュ形式: {partner_id: partner_name}
  - ※ total_count がないため、空レスポンスが返るまでループ

補助2: GET /api/1/account_items
  - account_item_id → account_name 名前解決用
  - E2E 開始時に全201件を1リクエストで一括取得してキャッシュ
  - キャッシュ形式: {account_item_id: account_name}

補助3: GET /api/1/manual_journals（必要に応じて）
  - FY2025 では年間4件のみ
  - 振替伝票が含まれる月のみ補完取得する形でも可
  - partner_name が直接取れる唯一の API（deals と異なる）
  - ただし TC-01〜07 の主要チェック対象が deals であれば優先度は低い

【取れないフィールドの扱い】

- account_name:
    deals/manual_journals は account_item_id のみ返す
    → /api/1/account_items の全件キャッシュ（起動時）で名前解決
    → account_items[].name が account_name に対応

- partner_name:
    deals は partner_id のみ返す（deal レベル、null の場合あり）
    → /api/1/partners の全件キャッシュ（起動時）で名前解決
    → partner_id=null の場合は空文字扱い

- debit_amount / credit_amount:
    deals/manual_journals の details[].entry_side（"debit"/"credit"）と details[].amount から計算可能
    → entry_side=="debit" → debit_amount=amount, credit_amount=0
    → entry_side=="credit" → debit_amount=0, credit_amount=amount

- freee 取引 URL（Phase 7）:
    deal_id と company_id から生成可能（実装時に確認）

【想定される中間 JSON サイズ（推奨月: 2025年12月）】

- deals: 207件（3ページ取得）× 平均2〜3明細行 ≈ 400〜620行
- manual_journals: 0件
- account_items キャッシュ: 201件
- partners キャッシュ: 255件
- 合計取得リクエスト数: deals 3 + partners 3 + account_items 1 = 7リクエスト
```

---

## 6. 調査中に気づいた追加論点

### 論点1: `deals` の `partner_id` は deal レベルにしか存在しない

- `deals[].partner_id` は取引（deal）単位の取引先。details[] の行レベルには partner_id がない
- つまり「1取引の全明細行が同じ取引先」という設計
- **一方 `manual_journals` の `details[].partner_id` は行レベル**で設定可能（行ごとに異なる取引先が設定される）
- adapter 実装時は deals 用と manual_journals 用で partner_id の取得ロジックを分ける必要がある

### 論点2: `partners` API に `total_count` がない

- deals API は `meta.total_count` を返すが、partners は返さない
- 全件取得には「空レスポンスが返ってくるまでページネーションを繰り返す」実装が必要
- 255件固定かどうかは不明（顧問先管理システムで増減する可能性あり）

### 論点3: `deals` の `partner_id` が null になるケースがある

- wallet_txns から自動経理された取引（deal_origin_name="自動で経理"）でも、partner_id が設定されているケースと null のケースが混在
- null の場合は partner_name を空文字として扱うか、description や deal_origin_name から推定する必要がある
- TC-07 等、取引先情報を判断に使う場合は注意が必要

### 論点4: `wallet_txns` はペアリング確認には使えるが仕訳チェックには使えない

- wallet_txns は「口座・カード明細」であり、freee が deals と対応付け（rule_matched）している
- ただし tax_code・account_item_id がないため、TC-01〜07 の消費税区分チェックには使えない
- deals の `payments[]` に walletable_id が含まれるため、deals → wallet_txns の対応は取れる

### 論点5: `journals` API は sjis エンコードで非同期

- freee の仕訳帳ダウンロードは sjis。Python 側で encoding="sjis" のデコードが必要
- さらに非同期ジョブのため polling 実装が必要
- adapter に組み込むコストが高い → 採用しない判断を推奨

### 論点6: `account_items` の `default_tax_code` と `tax_code` の使い分け

- `account_items[].default_tax_code`: 科目のデフォルト税区分（例: 売上高は 129）
- `account_items[].tax_code`: 科目の基本税区分（例: 売上高は 21）
- 実際の仕訳行の税区分は `deals[].details[].tax_code` が正（科目デフォルトと異なる場合がある）
- adapter では deals の details[].tax_code を正として使用すること

### 論点7: `manual_journals` の `adjustment` フラグ

- `adjustment: true` の場合は決算修正仕訳（期末調整）
- TC チェック対象に含めるかどうかはビジネス要件による
- FY2025 の4件中1件が `adjustment: true`（2026-03-31 付け）

---

## 7. 次ステップへの申し送り

adapter 実装指示書を書く戦略Claude への注意事項:

### 確定事項（実API確認済み）

1. **メイン API は `deals`**。月次207件、3ページ取得が必要。`meta.total_count` で進捗管理可能
2. **partners キャッシュ必須**。255件、3ページ（total_count なし、空レスポンスまでループ）
3. **account_items キャッシュ必須**。201件、1リクエスト全件取得
4. **debit_amount / credit_amount は計算値**。`details[].entry_side`（"debit"/"credit"）× `details[].amount` で算出
5. **partner_id は deal レベル**（details[] レベルではない）。null の場合あり（空文字扱い推奨）
6. **fiscal_year パラメータ = 2025**（期首年）。期末年2026は使わない

### 未確認事項（adapter 実装時に要確認）

1. **deals API の `type` フィールド**（"income"/"expense"）が TC 判定に影響するか？
   - 借方・貸方の対称性を type で確認できる可能性あり
2. **deal_id → freee 取引 URL の生成方法**（Phase 7 用。company_id と deal_id から生成するURL形式）
3. **partners API の total_count 代替手段**（例: metadata API があるか）
4. **manual_journals を deals と合算する必要があるか**（年間4件のみだが、決算期の振替伝票は重要）

### adapter 設計上の推奨

- キャッシュは2種類（partners_cache, account_items_cache）をアダプタ初期化時に生成
- deals はページネーションループで全件取得後、details を展開して行レベルの DataFrame を作成
- partner_id=null の行は partner_name="" で扱う（エラーにしない）
- CheckContext の `date` フィールド = `deal.issue_date`（details 共通）
