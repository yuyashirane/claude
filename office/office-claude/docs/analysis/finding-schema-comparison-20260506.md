# Finding スキーマ統合調査レポート

**作成日**: 2026-05-06
**ブランチ**: `feature/define-common-finding`
**目的**: V1-3-10 と V1-3-20 で使う共通の Finding スキーマ定義に向けた現状把握と統合案提示
**ステータス**: 調査のみ(読み取り専用)。ファイル変更なし。

---

## 0. 調査対象

| ファイル | 役割 |
|---|---|
| `docs/design/skills/V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md` §13.4.2 | Finding スキーマ v0.2(実装時の正本、30 属性) |
| `skills/verify/V1-3-rule/check-tax-classification/schema.py` | V1-3-10 の現行実装 |
| `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` | V1-3-20 の現行実装(独自スキーマ) |
| `reports/schema_gap_report.md` (2026-04-16) | V1-3-10 と仕様書の差分分析 |

---

## 1. 比較表

### 1.1 Finding 属性 30 件 × 3 スキーマ対照

| # | §13.4.2 (仕様書) | 型 | V1-3-10 `Finding` | V1-3-20 `InvoiceFinding` |
|---|---|---|---|---|
| 1 | skill_code | str | ❌ なし | ❌ なし (rule_code = "V1-3-20" で代替) |
| 2 | check_code | str | 🟡 `tc_code` (名称違い) | 🟡 `rule_code` (名称違い・粒度違い) |
| 3 | sub_code | str | ✅ あり | ❌ なし |
| 4 | finding_id | str | ❌ なし | ❌ なし |
| 5 | severity | Literal["🔴","🟡","🟠","🟢"] | 🟡 Literal["🔴 High",…] (ラベル付き) | 🟡 `str` (型制約なし) |
| 6 | review_level | Literal["必修",…] | 🟡 Literal["🔴必修",…] (絵文字付き) | ❌ なし |
| 7 | error_type | Literal[…] | ✅ あり | ❌ なし |
| 8 | area_tags | list[str] | 🟡 `area: str` (単数) | ❌ なし |
| 9 | subarea | Optional[str] | ✅ あり | ❌ なし |
| 10 | account_name | str | ❌ なし | ❌ なし (raw に逃がす) |
| 11 | count | int | ❌ なし | ❌ なし (FindingGroup.findings_count で代替) |
| 12 | total_amount | int | ❌ なし | ❌ なし |
| 13 | target_month | str | ❌ なし | ❌ なし |
| 14 | title | str | ❌ なし | ❌ なし |
| 15 | description | str | 🟡 `message` (名称違い) | 🟡 `message` (名称違い) |
| 16 | current_value | str | ✅ あり | ❌ なし |
| 17 | suggested_value | str | ✅ あり | ❌ なし |
| 18 | confidence | int | ✅ あり | ❌ なし |
| 19 | matched_keywords | list[str] | ❌ なし (message に文字列結合) | ❌ なし |
| 20 | rule_basis | list[str] | ❌ なし | ❌ なし |
| 21 | show_by_default | bool | ✅ あり | ❌ なし |
| 22 | sort_priority | int | ✅ あり (必須化済) | ❌ なし |
| 23 | notes | list[str] | 🟡 `note: Optional[str]` (単数) | ❌ なし |
| 24 | link_hints | LinkHints (必須) | 🟡 Optional[LinkHints] | ❌ なし |
| 25 | freee_general_ledger_url | Optional[str] | ❌ なし | ❌ なし |
| 26 | freee_journal_url | Optional[str] | ❌ なし | ❌ なし |
| 27 | details | list[FindingDetail] | 🟡 `detail: Optional[FindingDetail]` (単数) | ❌ なし |
| 28 | wallet_txn_id | Optional[str] | 🟡 `str = ""` (空文字デフォルト) | ✅ str (必須) |
| 29 | deal_id | Optional[int] | 🟡 Optional[str] (型違い) | ❌ なし (raw に格納) |
| 30 | row_data | Optional[dict] | ❌ なし (代替: `debit_amount`/`credit_amount` Phase 6.11b 追加) | 🟡 `raw: dict` (8 フィールド) |

凡例: ✅ 一致 / 🟡 名称・型違い / ❌ 未実装

---

## 2. V1-3-20 固有の概念

§13.4.2 にも V1-3-10 にも存在しない、V1-3-20 独自の概念:

- **`Classification` Enum**: 5 分類 + NONE の 6 値
  - `QUALIFIED_BUT_TRANSITIONAL_TAX` / `NONQUALIFIED_BUT_FULL_DEDUCTION_TAX` / `PARTNER_UNKNOWN` (Finding 化対象)
  - `EXPECTED_TRANSITIONAL_TAX` / `EXPECTED_FULL_DEDUCTION_TAX` (観察用、Finding 化しない)
  - `NONE` (分類対象外)
- **`InvoiceFinding.classification: Optional[Classification]`**
- **`FindingGroup`**: classification 単位で findings を束ねる(`classification` / `findings_count` / `findings`)
- **`raw` dict** (8 フィールド): tax_label / tax_code / debit_amount / partner / description / transaction_date / source / is_qualified_invoice

---

## 3. LinkHints / FindingDetail / CheckContext 構造比較

| dataclass | §13.4.2 | V1-3-10 | V1-3-20 |
|---|---|---|---|
| LinkHints | account_item_id, account_name, **date_range: tuple[str,str]**, tax_code, **tax_group_code: int** (単数), link_type(4値: incl. `general_ledger_with_tax`) | target(3値: `deal_detail`), account_name, **period_start/period_end: date**, **tax_group_codes: list[str]** (複数), deal_id, fiscal_year_id, company_id | ❌ なし |
| FindingDetail | **仕訳明細**: deal_id, issue_date, amount, counter_account, description, tax_code, tax_label | **判定根拠**: matched_rules, evidence, confidence_breakdown, recommended_actions, related_law, related_docs | ❌ なし |
| CheckContext | (定義あり、共通) | 完全実装: company_id, fiscal_year_id, period_start/end, transactions, account_master, tax_code_master, partner_master, references, company_name, skill_name, debug_mode | `InvoiceCheckContext` 最小: company_id(int), period_start/end, target_month, single_month |

**重要な構造的差異**:
- LinkHints の **`date_range: tuple[str,str]`** ↔ **`period_start/period_end: date`** (型・構造ともに違う)
- LinkHints の **`tax_group_code: int` 単数** ↔ **`tax_group_codes: list[str]` 複数** (粒度違い)
- LinkHints の `link_type` 4値 ↔ V1-3-10 の `target` 3値 (仕様書の `general_ledger_with_tax` が未実装、V1-3-10 の `deal_detail` は仕様書 `deal` に相当)
- FindingDetail は **概念が完全に別物** (仕訳明細 vs 判定根拠)。統合は実質的な作り直し
- CheckContext は V1-3-10 が豊富、V1-3-20 が最小限。V1-3-20 は `transactions` を持たず、`company_id` の型も `int`

---

## 4. schema_gap_report.md (2026-04-16) との整合性

- gap report 時点の差分分析(30 属性中 11 未実装 / 9 名称・型違い / 10 一致)は**現状でも概ね同じ**。
- **例外**: Phase 6.11b で `debit_amount`/`credit_amount` が V1-3-10 Finding に追加されており、gap report §6.2「金額が書き写されていない」状態は部分解消済み。
- それ以外の `total_amount`/`count`/`account_name`/`matched_keywords`/`rule_basis`/`freee_*_url`/`row_data` 等は未実装のまま。
- gap report は V1-3-20 を扱っていない(V1-3-20 schema は当時存在しないか言及対象外)。
- gap report §7.4 の推奨アクション(段階的導入、案A = 必須 6 属性追加)は本レポートの統合案と独立に評価する必要あり。

---

## 5. 統合案 3 パターン

### 5.1 案 A: §13.4.2 に完全準拠 (理想形、変更大)

**内容**:
- Finding を 30 属性で再定義し、`skills/_common/schema.py` に共通化
- LinkHints は仕様書通り (`date_range: tuple[str,str]`、`tax_group_code: int` 単数、`link_type` 4 値)
- FindingDetail は **仕訳明細** スタイル (deal_id/amount/counter_account/...) に再設計し、現 V1-3-10 の「判定根拠」概念は `rule_basis: list[str]` + `matched_keywords` + (新)`evidence` 系として独立させる
- V1-3-20 固有の `Classification` / `FindingGroup` / `raw` は Finding の拡張として共存させる(notes マーカー or 拡張 dataclass)。仕様書外の概念のため設計判断必要
- Severity を絵文字単体 Literal、ReviewLevel をラベル単体 Literal に統一

**メリット**:
- 設計の正本(仕様書)に一致、Phase 6 "-" 固定 4 列 + Phase 7 URL 2 列が実データで埋まる
- 将来の他 Skill (V1-3-30 等) 追加時に同スキーマ流用可
- Excel 層・URL 組み立て層が Skill ごとに分岐不要になる

**デメリット**:
- V1-3-10 既存の `create_finding()`、全 7 TC、Excel 層、checker.py、テスト全件への波及
- V1-3-20 β2-C の 119 tests も全件影響
- LinkHints の `date_range tuple` ↔ `period_start/end date` 変換、`tax_group_code 単数 int` ↔ `tax_group_codes 複数 str` の縮小変換が必要(情報損失の可能性)
- FindingDetail の概念衝突(仕訳明細 vs 判定根拠)の解消設計が要る
- V1-3-20 の Classification/FindingGroup を仕様書スキーマにどう接続するかは仕様書側に記載なし → 別途設計合意が必要

**所要時間**: 大(体感 3〜5 営業日、テスト書き直し含む)

**既存テスト影響**: V1-3-20 119 件は全件影響。V1-3-10 は件数未確認だが全 TC × 全テスト影響想定

---

### 5.2 案 B: 現状の V1-3-10 を基準に、V1-3-20 を寄せる (変更中)

**内容**:
- 共通スキーマ = 現 V1-3-10 `schema.py` をほぼそのまま `_common/schema.py` に昇格
- Severity/ReviewLevel は V1-3-10 の Literal (絵文字+ラベル付き) を共通採用
- V1-3-20 `InvoiceFinding` を廃止し、共通 `Finding` を使う
  - V1-3-20 の `classification` は Finding に Optional 追加 or `note` マーカーで表現
  - V1-3-20 の `raw` 8 フィールドは Finding 直下属性 (partner/transaction_date/is_qualified_invoice/tax_code 等) として吸収
- V1-3-20 の必須でない属性 (sort_priority, area, error_type, review_level) はデフォルト値で埋める
- FindingGroup は V1-3-20 専用に残す or 廃止して area+classification に置換

**メリット**:
- V1-3-10 既存テスト・Excel 層・create_finding() への影響ほぼゼロ
- 修正範囲は V1-3-20 側に集約
- 短期完了可能

**デメリット**:
- §13.4.2 の未実装 11 属性 (skill_code/finding_id/count/total_amount/account_name/matched_keywords/rule_basis/freee_*_url/row_data 等) はそのまま残る → 設計の正本から離れる
- V1-3-20 に area/sort_priority/error_type/review_level を強制的に持たせる必要があり、概念上の不自然さが残る (V1-3-20 は classification ベースで area 概念がない)
- Phase 6 "-" 固定問題は別途対応必要

**所要時間**: 中(体感 1〜2 営業日)

**既存テスト影響**: V1-3-10 影響ほぼなし。V1-3-20 の 119 tests は属性追加・classification 移行で要修正(構造変更の規模により大半)

---

### 5.3 案 C: 最小限の追加で両方を共通化 (変更小)

**内容**:
- 共通最小 BaseFinding (severity / message / wallet_txn_id / deal_id のみ) を `_common/schema.py` に新設
- V1-3-10 `Finding` と V1-3-20 `InvoiceFinding` は BaseFinding を継承(または `@dataclass(frozen=True)` の合成) して、それぞれ独自属性は各 Skill 配下に残す
- 共通シリアライザは BaseFinding に対して定義し、Skill 固有属性は extra として扱う

**メリット**:
- 既存コードへの影響最小、半日〜1 日で完了
- 各 Skill の進化を阻害しない (V1-3-20 β2-D/β2-E が並行進行可能)
- 後で案 A/B へ進化する余地を残す

**デメリット**:
- 「共通スキーマ」と呼ぶには弱く、実質的に V1-3-10/V1-3-20 が独立したまま
- 仕様書 §13.4.2 30 属性とは大きく乖離(仕様書準拠は放棄)
- Excel 出力層・URL 組み立て層は引き続き Skill ごとの分岐ロジックが必要
- Phase 6 "-" 固定問題は未解決のまま
- frozen=True の dataclass 継承は Python の仕様上注意が必要(子クラスでの追加属性順序、kw_only 制約)

**所要時間**: 小(体感半日〜1 日)

**既存テスト影響**: V1-3-10/V1-3-20 とも import 経路の変更のみ。テストロジック自体への影響は小

---

### 5.4 案比較サマリ

| 観点 | 案 A | 案 B | 案 C |
|---|---|---|---|
| 仕様書 §13.4.2 準拠度 | ◎ 完全準拠 | △ 部分準拠 | ✕ 準拠せず |
| V1-3-10 テスト影響 | 大 | 極小 | 極小 |
| V1-3-20 テスト影響 | 大 (119/119) | 大 (構造変更分) | 小 (import のみ) |
| Phase 6 "-" 固定問題解消 | ◎ | ✕ | ✕ |
| Phase 7 freee URL 列実装 | ◎ | ✕ | ✕ |
| 所要時間 | 大 (3〜5 営業日) | 中 (1〜2 営業日) | 小 (半日〜1 日) |
| 将来の他 Skill 追加耐性 | ◎ | ○ | △ |

---

## 6. 不明点(判断前に解消すべきリスト)

1. **V1-3-10 の総テスト件数が未確認**
   - memory にある 119 tests は V1-3-20 β2-C の数値であり、V1-3-10 の規模は別途確認が必要
   - 案 A の所要時間見積りに直結する

2. **案 A で Classification/FindingGroup を仕様書スキーマにどう統合するかの設計判断未済**
   - 仕様書 §13.4.2 には Classification/FindingGroup の概念がなく、追加属性 / notes マーカー / 拡張 dataclass のいずれで吸収するか合意が必要

3. **案 A の LinkHints 構造変更で freee URL 生成側 (Phase 7 想定) に縮小変換の情報損失が起きうるかの検証未済**
   - `tax_group_code 単数 int` ↔ `tax_group_codes 複数 str` の縮小で URL 組み立てに支障が出るか
   - `date_range tuple[str,str]` ↔ `period_start/end date` の双方向変換で精度が落ちないか

4. **V1-3-20 β2-D / β2-E の予定スコープが共通スキーマの方向性を縛るか未確認**
   - memory `project_v1_3_20_invoice_check.md` の引き継ぎ論点を再読の上、共通化が β2-D/β2-E のブロッカーになるか / β2-D/β2-E 完了を待ってから共通化するかの判断材料を集める必要

5. **(参考)Phase 6 / Phase 7 の現在の進捗状況**
   - 改修着手済みかどうかにより、案 A の優先度が変わりうる
   - 4 つの主要不明点とは別に、判断材料として確認推奨

---

## 7. 結論

**結論未定。後日判断**。

本レポートは 2026-05-06 時点の現状把握と統合案 3 パターンの整理にとどまる。判断は不明点 4 項目(必要に応じて 5 項目)を解消したうえで実施する。
