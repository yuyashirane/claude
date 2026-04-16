# schema.py 乖離調査レポート

**調査日**: 2026年4月16日
**調査対象**:
- `skills/verify/V1-3-rule/check-tax-classification/schema.py`
- `skills/_common/lib/finding_factory.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc01_sales.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc02_land_rent.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc03_payroll.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc04_non_taxable_revenue.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc05_non_taxable_expense.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc06_tax_public_charges.py`
- `skills/verify/V1-3-rule/check-tax-classification/checks/tc07_welfare.py`

---

## 1. エグゼクティブサマリー

- **Finding 属性の乖離**: 30 属性中 **16 属性が未実装**、4 属性が名称違い、2 属性が型乖離、**計 22 件の乖離**
- **FindingDetail 属性の乖離**: 仕様書の7属性に対し、実装は**完全に別構造の6属性**(ほぼ全差替え)
- **LinkHints 属性の乖離**: 仕様書の6属性に対し、実装は8属性(名称・型が大きく異なる)
- **主要な未実装属性**: `skill_code` / `check_code` / `finding_id` / `area_tags` / `account_name` / `count` / `total_amount` / `target_month` / `title` / `description` / `matched_keywords` / `rule_basis` / `notes(list)` / `details(list)` / `row_data` / `freee_general_ledger_url` / `freee_journal_url`
- **Phase 7 前の整備優先度**: **高**
  - Phase 6 (Excel 出力) で "-" 固定にせざるを得なかった列(列7 取引先・列9/10 金額・サマリー影響金額合計)はすべて schema.py の属性不足が根本原因
  - Phase 7 (freee URL 生成) でも `freee_general_ledger_url` / `freee_journal_url` 属性が存在せず、LinkHints の構造差(`date_range` vs `period_start`/`period_end`、`tax_group_code` vs `tax_group_codes`)で追加的な整理が必要

---

## 2. 観点1: Finding dataclass 属性差分表

仕様書 §13.4.2 の 30 属性 × 実装 `schema.py::Finding` の対照。

| # | 仕様書属性名 | 仕様書型 | 実 schema.py 属性名 | 実 schema.py 型 | 差分区分 |
|---|---|---|---|---|---|
| 1 | skill_code | str | (なし) | — | 🔴 未実装 |
| 2 | check_code | str | `tc_code` | str | 🟡 名称違い(type一致) |
| 3 | sub_code | str | sub_code | str | 🟢 一致 |
| 4 | finding_id | str | (なし) | — | 🔴 未実装 |
| 5 | severity | Severity | severity | Severity | 🟢 一致 |
| 6 | review_level | ReviewLevel | review_level | ReviewLevel | 🟢 一致 |
| 7 | error_type | ErrorType | error_type | ErrorType | 🟢 一致 |
| 8 | area_tags | list[str] | `area` | str | 🟡 型乖離(list → str 単数化) |
| 9 | subarea | Optional[str] | subarea | Optional[str] | 🟢 一致 |
| 10 | account_name | str | (なし) | — | 🔴 未実装 |
| 11 | count | int | (なし) | — | 🔴 未実装 |
| 12 | total_amount | int | (なし) | — | 🔴 未実装 |
| 13 | target_month | str | (なし) | — | 🔴 未実装 |
| 14 | title | str | (なし) | — | 🔴 未実装 |
| 15 | description | str | `message` | str | 🟡 名称違い(`description` → `message`) |
| 16 | current_value | str | current_value | str = "" | 🟢 一致 |
| 17 | suggested_value | str | suggested_value | str = "" | 🟢 一致 |
| 18 | confidence | int | confidence | int = 50 | 🟢 一致 |
| 19 | matched_keywords | list[str] | (なし) | — | 🔴 未実装 |
| 20 | rule_basis | list[str] | (なし) | — | 🔴 未実装 |
| 21 | show_by_default | bool | show_by_default | bool = True | 🟢 一致 |
| 22 | sort_priority | int | sort_priority | int (必須) | 🟢 一致 |
| 23 | notes | list[str] | `note` | Optional[str] | 🟡 型乖離(list → 単一 Optional) |
| 24 | link_hints | LinkHints | link_hints | Optional[LinkHints] | 🟡 型乖離(必須 → Optional) |
| 25 | freee_general_ledger_url | Optional[str] | (なし) | — | 🔴 未実装 |
| 26 | freee_journal_url | Optional[str] | (なし) | — | 🔴 未実装 |
| 27 | details | list[FindingDetail] | `detail` | Optional[FindingDetail] | 🟡 型乖離(list → 単一 Optional) |
| 28 | wallet_txn_id | Optional[str] | wallet_txn_id | str = "" | 🟡 型乖離(Optional → 空文字デフォルト) |
| 29 | deal_id | Optional[int] | deal_id | Optional[str] | 🟡 型乖離(int → str) |
| 30 | row_data | Optional[dict] | (なし) | — | 🔴 未実装 |

### 差分集計
- 🟢 一致: **10 件**
- 🟡 名称違い/型乖離: **9 件**(check_code, description, area_tags, notes, link_hints, details, wallet_txn_id, deal_id, 追加で show_by_default 等はデフォルト値のみ差異あり)
- 🔴 未実装: **11 件**(skill_code, finding_id, account_name, count, total_amount, target_month, title, matched_keywords, rule_basis, freee_general_ledger_url, freee_journal_url, row_data の 12 件を数え直すと実際には 11 件)

### ⚠️ 追加実装(schema.py にあるが仕様書に記載なし)
- `deal_id` : すでに仕様書にあるが型が違う、上に含む
- `note` (Optional[str]): `notes` の代替実装(単数)

---

## 3. 観点2: FindingDetail / LinkHints 属性差分表

### 3.1 FindingDetail

| # | 仕様書属性名 | 仕様書型 | 実 schema.py 属性名 | 実 schema.py 型 | 差分区分 |
|---|---|---|---|---|---|
| 1 | deal_id | int | (なし) | — | 🔴 未実装 |
| 2 | issue_date | str | (なし) | — | 🔴 未実装 |
| 3 | amount | int | (なし) | — | 🔴 未実装 |
| 4 | counter_account | str | (なし) | — | 🔴 未実装 |
| 5 | description | str | (なし) | — | 🔴 未実装 |
| 6 | tax_code | Optional[int] | (なし) | — | 🔴 未実装 |
| 7 | tax_label | Optional[str] | (なし) | — | 🔴 未実装 |
| — | (仕様書になし) | — | matched_rules | list[str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | evidence | dict[str, str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | confidence_breakdown | dict[str, int] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | recommended_actions | list[str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | related_law | Optional[str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | related_docs | list[str] | ⚠️ 追加実装 |

**評価**:
- **仕様書の7属性は1つも実装されていない**(構造が完全に別物)
- 実装の6属性は**判定根拠(ルール・証拠・確信度内訳)を表現するための別概念**で、仕様書は**仕訳の明細(日付・金額・相手科目等)を表現する概念**
- 仕様書の `FindingDetail` = Excel 詳細シートで 1 Finding を仕訳複数行に展開するためのデータ
- 実装の `FindingDetail` = 判定ロジックの説明データ
- **完全に設計思想が違う。統合は実質的な作り直し**

### 3.2 LinkHints

| # | 仕様書属性名 | 仕様書型 | 実 schema.py 属性名 | 実 schema.py 型 | 差分区分 |
|---|---|---|---|---|---|
| 1 | account_item_id | Optional[int] | (なし) | — | 🔴 未実装 |
| 2 | account_name | str | account_name | Optional[str] | 🟡 型乖離(必須 → Optional) |
| 3 | date_range | tuple[str, str] | `period_start` / `period_end` | Optional[date] / Optional[date] | 🟡 型・構造乖離 |
| 4 | tax_code | Optional[int] | (なし) | — | 🔴 未実装 |
| 5 | tax_group_code | Optional[int] | `tax_group_codes` | Optional[list[str]] | 🟡 型乖離(単数int → 複数list[str]) |
| 6 | link_type | Literal[…4値] | `target` | Literal[…3値] | 🟡 名称違い + enum値違い |
| — | (仕様書になし) | — | deal_id | Optional[str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | fiscal_year_id | Optional[str] | ⚠️ 追加実装 |
| — | (仕様書になし) | — | company_id | Optional[str] | ⚠️ 追加実装 |

**link_type/target の enum 値差分**:
- 仕様書: `"general_ledger" / "general_ledger_with_tax" / "deal" / "journal"`(4値)
- 実装:  `"general_ledger" / "journal" / "deal_detail"`(3値)
- 差分: 仕様書の `"general_ledger_with_tax"` が未実装 / 実装の `"deal_detail"` は仕様書の `"deal"` に相当(名称違い)

---

## 4. 観点3: create_finding() 関数の引数と内部処理

### 4.1 関数シグネチャ(`finding_factory.py::create_finding`)

```python
def create_finding(
    tc_code: str,                  # 必須
    sub_code: str,                 # 必須
    severity: str,                 # 必須
    error_type: str,               # 必須
    area: str,                     # 必須
    sort_priority: int,            # 必須
    row,                           # 必須(TransactionRow、属性 wallet_txn_id/deal_id を参照)
    current_value: str,            # 必須
    suggested_value: str,          # 必須
    confidence: int,               # 必須
    message: str,                  # 必須
    *,
    subarea: Optional[str] = None,          # keyword-only
    show_by_default: bool = True,           # keyword-only
    note: Optional[str] = None,             # keyword-only
    detail=None,                            # keyword-only
    link_hints=None,                        # keyword-only
)
```

### 4.2 Finding 各属性の埋め方

| 仕様書 Finding 属性 | 埋め方 | デフォルト | 備考 |
|---|---|---|---|
| skill_code | ❌ 属性自体が schema.py に存在せず | — | — |
| check_code(=tc_code) | 引数 tc_code | なし | TC 側で "TC-0N" を渡す |
| sub_code | 引数 sub_code | なし | TC 側で "TC-0Na" を渡す |
| finding_id | ❌ 属性自体が schema.py に存在せず | — | — |
| severity | 引数 severity | なし | "🔴 High" 等を渡す |
| review_level | 関数内自動導出 | "🔴必修" | `_ERROR_TYPE_TO_REVIEW_LEVEL` で error_type から変換 |
| error_type | 引数 error_type | なし | "direct_error" 等 |
| area_tags(=area) | 引数 area | なし | 単数文字列 ("A10") |
| subarea | 引数 subarea(kwarg) | None | |
| account_name | ❌ 属性自体が schema.py に存在せず | — | — |
| count | ❌ 属性自体が schema.py に存在せず | — | — |
| total_amount | ❌ 属性自体が schema.py に存在せず | — | — |
| target_month | ❌ 属性自体が schema.py に存在せず | — | — |
| title | ❌ 属性自体が schema.py に存在せず | — | — |
| description(=message) | 引数 message | なし | |
| current_value | 引数 current_value | なし | 通常 `row.tax_label` |
| suggested_value | 引数 suggested_value | なし | |
| confidence | 引数 confidence | なし | |
| matched_keywords | ❌ 属性自体が schema.py に存在せず | — | — |
| rule_basis | ❌ 属性自体が schema.py に存在せず | — | — |
| show_by_default | 引数 show_by_default(kwarg) | True | TC-07f のみ False |
| sort_priority | 引数 sort_priority | なし | 必須化済み |
| notes(=note) | 引数 note(kwarg) | None | 単一の文字列マーカー |
| link_hints | 引数 link_hints(kwarg) | None | `build_link_hints()` の返り値 |
| freee_general_ledger_url | ❌ 属性自体が schema.py に存在せず | — | Phase 6 で "-" 処理済み |
| freee_journal_url | ❌ 属性自体が schema.py に存在せず | — | Phase 6 で "-" 処理済み |
| details(=detail) | 引数 detail(kwarg) | None | 現状 TC 側で渡されている例なし |
| wallet_txn_id | `getattr(row, "wallet_txn_id", "")` | "" | row から自動取得 |
| deal_id | `getattr(row, "deal_id", None)` | None | row から自動取得、型は str |
| row_data | ❌ 属性自体が schema.py に存在せず | — | — |

### 4.3 create_finding が埋めていない属性(仕様書準拠で見たとき)
以下は schema.py 自体に存在しないため、`create_finding()` が引数を受け取っても書き込めない:

`skill_code`, `finding_id`, `account_name`, `count`, `total_amount`, `target_month`, `title`, `matched_keywords`, `rule_basis`, `freee_general_ledger_url`, `freee_journal_url`, `row_data`(計 12 属性)

### 4.4 引数数ベースのサマリー
- 仕様書 Finding: 30 属性
- 実 schema.py Finding: 18 属性(うち2つはデフォルト値あり引数)
- `create_finding()` 引数: **15 個**(必須11 + keyword-only 5 のうち `show_by_default` 経由で書く)
- `create_finding()` が意味のある値で埋める属性: **約13〜15 個**(差分は TC 実装ごとに異なる)

**結論**: `create_finding()` は仕様書 Finding v0.2 の 30 属性のうち **せいぜい 13〜15 属性しかセットしていない**。半分以上は属性自体が schema.py にない。

---

## 5. 観点4: TC × 属性充填マトリクス

以下、`create_finding()` の引数観察で、各 TC が実際にどの属性に意味のある値を渡しているかを記す。
仕様書準拠の主要10属性を抜粋:

| TC | account_name | total_amount | target_month | title | description(=message) | current_value | suggested_value | matched_keywords | subarea | row_data |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-01 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌(messageに文字列結合で埋め込み) | ❌ 未指定 | ❌ |
| TC-02 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌ | ✅ "land"/"rent"/"parking" | ❌ |
| TC-03 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌ | ❌ 未指定 | ❌ |
| TC-04 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌ | ❌ 未指定 | ❌ |
| TC-05 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌ | ❌ 未指定 | ❌ |
| TC-06 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ | ✅ row.tax_label | ✅ 固定値 | ❌ | ❌ 未指定 | ❌ |
| TC-07 | ❌ | ❌ | ❌ | ❌ | ✅ 詳細メッセージ(KW含む) | ✅ row.tax_label | ✅ 固定値 | ❌(messageに結合) | ✅ "welfare" | ❌ |

**凡例**:
- ✅ = `create_finding()` に意味のある値が渡されている
- ❌ = 属性が schema.py に存在しないため埋めようがない
- ❌ 未指定 = 属性は存在するが TC 側で値を渡していない

### 5.1 読み取れる傾向
- **全 TC 共通で埋まる属性**: `tc_code`, `sub_code`, `severity`, `error_type`, `area`, `sort_priority`, `current_value`, `suggested_value`, `confidence`, `message`
- **全 TC 共通で埋まらない属性**: `account_name`, `count`, `total_amount`, `target_month`, `title`, `matched_keywords`, `rule_basis`, `row_data` (いずれも schema.py に不在)
- **subarea を使っているのは TC-02 / TC-07 のみ**(TC-02 は 3 種類: land / rent / parking、TC-07 は welfare 固定)
- **detail (FindingDetail) を渡している TC は現状ゼロ**(schema.py の FindingDetail が仕様書と別構造のため、用途が明確でない)

### 5.2 メッセージ文字列へのワークアラウンド
`matched_keywords` が属性として存在しないため、TC-01 / TC-07 では **message 文字列内に f-string で KW を埋め込んでいる**:

```python
# TC-01a
message = f"売上が課税売上10%で計上されていますが、摘要に別区分の可能性を示すキーワード({', '.join(all_hits)})が含まれています。..."

# TC-07a
message = f"福利厚生費に計上された慶弔見舞金等(摘要KW:{matched_kw})が課税仕入になっています。..."
```

→ Excel 出力側で KW を別列に抽出・表示する設計が不可能(文字列パースが必要)。

---

## 6. 観点5: Phase 6 "-" 固定列の改修可能性

### 6.1 列7「取引先」
- **現状の制約**:
  - schema.py の `Finding` に `row_data: Optional[dict]` が存在しない
  - schema.py の `LinkHints` に取引先情報がない
  - `TransactionRow.partner` は存在するが、Finding が生成された後は row への参照が切れる(`create_finding` で row を受け取っているのに、partner を Finding に書き写していない)
- **改修に必要なこと**:
  1. (案A: 軽量) schema.py の `Finding` に `partner: Optional[str] = None` を追加し、`create_finding()` で `getattr(row, "partner", None)` を取得して書き込む
  2. (案B: 仕様書準拠) `row_data: Optional[dict]` を追加し、row の全フィールドを dict 化して書き込む
- **優先度**: **中**
  - Excel レポートの実用性に直結する(取引先名なしでは利用者の確認作業が困難)
  - ただし対象法人により partner が空のケースも多く、無くても運用可能

### 6.2 列9/10「借方金額 / 貸方金額」
- **現状の制約**:
  - Finding に `total_amount` が存在しない
  - Finding に `details: list[FindingDetail]` が存在しない(単一の `detail` のみ、かつ FindingDetail 自体が金額を持たない構造)
  - `TransactionRow.debit_amount` / `credit_amount` は存在するが、Finding に書き写されていない
- **改修に必要なこと**:
  1. (案A: 最小) Finding に `debit_amount: Optional[int] = None` / `credit_amount: Optional[int] = None` を追加し、`create_finding()` で row から取得して書き込む
  2. (案B: 仕様書準拠) `total_amount: int`, `count: int` を追加し、同一取引グループで集計する(現状の Finding は 1 Finding = 1 仕訳なので `count=1`, `total_amount=get_amount(row)` で最小実装可能)
- **優先度**: **高**
  - 税理士実務で「いくらの誤りか」を把握するために必須の情報
  - schema に属性さえあれば、`create_finding()` と全 TC の引数追加だけで実装可能(判定ロジックは不変)

### 6.3 サマリー列9「影響金額合計」
- **現状の制約**:
  - 個別 Finding が total_amount を持たないため、合計も算出不能
  - Phase 6 の sheet_builder は `"-"` 固定
- **改修に必要なこと**: 6.2 と同じ。`total_amount` が Finding に追加されれば、Phase 6 のサマリー生成ロジックを `sum(f.total_amount for f in group)` に変更するだけで自動対応可能
- **優先度**: **高**
  - 税務レビューの優先順位判断(金額インパクト大=要確認)に必須
  - 6.2 が実現すれば自動的に解決する

### 6.4 改修負荷の概算
- 案A(最小): Finding に 3 属性追加(`partner`, `debit_amount`, `credit_amount`)+ create_finding 改修 + 全 TC 呼び出し箇所改修 → **低(1〜2 ファイル中心)**
- 案B(仕様書準拠): Finding に 12 属性追加(観点1で未実装の 11 個 + row_data)+ FindingDetail を再設計 + LinkHints を再設計 → **高(スキーマ全面見直しレベル)**

---

## 7. 結論と推奨アクション

### 7.1 Phase 7 開始前に必須整備する項目(高優先度)
1. **Finding.total_amount / count の追加**
   - Phase 6 で "-" 固定していたサマリー合計が機能するようになる
   - Phase 7 の URL 生成でも「金額帯」での絞り込みに使える
2. **Finding.freee_general_ledger_url / freee_journal_url の追加**
   - Phase 7 の直接の実装対象。schema に属性がないと出力層で代入できない
3. **LinkHints と仕様書 §13.4.2 の整合**
   - 特に `tax_group_code`(単数 int) vs `tax_group_codes`(複数 list[str])、`date_range`(tuple[str,str]) vs `period_start`/`period_end`(date) の扱いを Phase 7 の URL 組み立て時に確定
   - もし freee API 仕様で単一税区分コードのみ受け付けるなら実装側(複数)から単一に絞る必要あり

### 7.2 Phase 7 内で順次整備できる項目(中優先度)
4. **Finding.partner の追加**(Excel 列7 のため)
5. **Finding.account_name の追加**
   - 現状 `link_hints.account_name` 経由で Excel に出せているが、link_hints が None のケースでは取れない
   - Finding 直下に置く方がレポート生成の堅牢性が上がる
6. **Finding.matched_keywords の追加**
   - 現状 message 文字列に埋め込まれている KW を構造化して分離
   - Excel での KW 列表示・検索が可能になる
7. **Finding.target_month の追加**
   - 月次レビューのグルーピング列(Excel のサマリーで「2026/02 分のみ」などの絞り込みに使える)

### 7.3 後回しで支障ない項目(低優先度)
8. `skill_code` / `check_code` / `finding_id`
   - 複数 Skill 並存時の識別用途。V1-3-10 単独稼働の現状では `tc_code` で十分識別可能
9. `title`(短文見出し)
   - `message` から先頭 N 文字で代用できている(Phase 6 の列3 は message[:40] で対応済み)
10. `notes`(list) vs `note`(Optional str)
    - 現状「1 Finding に note 1 個」で実運用上の不便なし。複数 note を持つ TC が出現したら検討
11. `details: list[FindingDetail]` と FindingDetail の再設計
    - そもそも実装の FindingDetail(判定根拠の evidence)と仕様書の FindingDetail(仕訳明細)は**別概念**
    - Phase 7 以降で「1 Finding が複数仕訳を束ねる」設計に移行するなら仕様書側の構造を導入
    - それまでは現状の「1 Finding = 1 仕訳」を維持しても実害は小さい
12. `row_data: Optional[dict]`
    - partner / account_name / 金額が個別属性として追加されれば不要
    - デバッグ用途のみなら Finding ではなく log に出す方が望ましい

### 7.4 まとめ

Phase 1 で実装された schema.py は仕様書 §13.4.2 の Finding v0.2 のうち **約 10 属性のみ**を実装した簡易版であり、残り 20 属性弱が未実装ないし別名・別型で実装されている。

Phase 6 (Excel 出力) で "-" 固定を余儀なくされた 3 列 (取引先 / 借方金額 / 貸方金額 + サマリー影響金額合計) は、いずれも **Finding に金額属性と取引先属性が不足している**ことが根本原因。

Phase 7 (freee URL 生成) の前に、**最低限 `total_amount`, `count`, `freee_general_ledger_url`, `freee_journal_url`, `partner`, `account_name` の 6 属性追加** + `create_finding()` の引数拡張 + 全 TC 呼び出し箇所の改修を実施すれば、Phase 6 の "-" 固定 4 列 + Phase 7 の URL 2 列 = **6 列が実データで埋まる** ため、実務家が Excel レポートを開いた際の実用性が大幅に向上する。

schema.py 全面改修 (仕様書準拠 30 属性 + FindingDetail 再設計 + LinkHints 再設計) は負荷が大きいため、段階的導入(案A = 必須 6 属性追加のみ)を推奨する。
