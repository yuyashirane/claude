# V1-3-20 β2-C 実装指示書

**作成日**: 2026-04-28
**対象**: Claude Code
**前提**: β2-A 完結 + β2-B 完結（77 tests passed）+ β2-C 設計フェーズ完結
**位置づけ**: β2-C（Finding/FindingGroup 整備）の実装指示書。`V1-3-20_beta2_C_design_policy.md` を引用元とする。

---

## §1. このタスクの目的（最重要文）

> **β2-C は Finding スキーマ拡張 + FindingGroup 新設 + observations 追加。判定ロジック（classify_transaction）には触れず、Finding と出力構造のみを整備する。**

完成版（β2-D 観察 / β2-E Excel 統合直前 / β3 Excel 本体）は本タスクの対象外です。スコープ膨張を起こさないでください。

### β2-C 確定スコープ（やること）

- Finding スキーマ拡張（`classification: Optional` 追加）
- raw 8 フィールド化（`tax_code` + `is_qualified_invoice` 追加、`to_findings` 内で組み立て）
- message テンプレート方式への切替（3 分類別文言、partner 空時「取引先不明」）
- `to_findings` の引数変更（`(rows, classifications)` ペア受け取り）
- FindingGroup 新設（classification 単位、最小実装）
- `find_groups` 関数実装（findings → groups 変換）
- `_calculate_partner_unknown_breakdown` 集計
- main() 結線（JSON 出力に `groups` + `observations` 追加）
- 既存テスト 23 件の書き換え + 新規テスト追加
- 実データ検証：**3525430 / 2025-12** で β2-C 完結時 JSON 構造が出力される

### β2-C やらないこと（明示的にスコープ外）

- ❌ `classify_transaction` / 5 分類ロジックの変更（β2-B で確定、不変）
- ❌ `classification_counts` の構造変更（β2-B 確定、6 値）
- ❌ manual_journals 対応（β2-D で判断）
- ❌ Excel exporter 本体（β3 以降）
- ❌ FindingGroup の親子行レイアウト / severity 4 色帯（β2-E / β3）
- ❌ V1-3-10 との統合（持ち越し）
- ❌ 件数妥当性の議論（β2-D 観察フェーズ）
- ❌ 3 社検証（β2-D で実施、β2-C では 3525430 のみ）
- ❌ T 番号妥当性 / 少額特例 / 公共交通費特例（β2 全体スコープ外）
- ❌ SKILL.md 改訂（β2-D / β2-E で判断）

---

## §2. 前提条件と参照先

### 必読ドキュメント

1. **β2-C 設計メモ**（`V1-3-20_beta2_C_design_policy.md`）
   - §1 の 6 論点確定内容（特に方針文）
   - §2 β2-C 完結時の JSON 出力構造（最終形）
   - §3 β2 設計思想（**DRY 原則 / テンプレート一貫性 / classification 中心主義**）
   - §5 β2-B → β2-C 変更点まとめ
   - §6 テスト戦略（書き換え対象 23 件 + 新規 6 クラス）
   - §8 β2-C 実装指示書への申し送り事項
   - §9 想定論点（実装フェーズで観察）
   - §10 論理不可分性の観察軸

2. **β2-A データ構造方針メモ**（`V1-3-20_beta2_A_data_structure_policy.md`）
   - §3 β2 設計思想の根本（判定は止めない / 推定して前に進める / 修正アクションを出す）

3. **β2-B 完結状態**
   - 77 tests passed
   - 3525430 / 2025-12 で classification_counts 6 値出力
   - findings_count = 2（nonqualified_but_full_deduction_tax のみ）
   - β1 削除済み（find_candidates / TAXABLE_PURCHASE_PREFIXES / is_taxable_purchase）

### 参照しないもの

- V1-3-10 完成形（V1-3-20 は独立で進める。V1-3-10 統合判断は β2 全体で保留）

### 配置先

```
skills/verify/V1-3-rule/check-invoice-registration-status/
├── run.py              # ← 改変（main() 結線、find_groups、observations）
├── schema.py           # ← 改変（Finding に classification 追加、FindingGroup 新設）
├── checker.py          # ← 改変（MESSAGE_TEMPLATES、_format_message_v2、to_findings 改修）
└── 既存 SKILL.md       # ← 不変（β2-D / β2-E で判断）

tests/unit/
└── test_invoice_registration_status.py  # ← 改変（書き換え 23 件 + 新規 6 クラス）
```

---

## §3. クラスタ分割（実装順序）

設計メモ §10 の論理不可分性観察軸に基づき、3 クラスタ + 事前調査のクラスタ 0：

| クラスタ | 内容 | 主な変更ファイル |
|---|---|---|
| **0**（事前確認） | テスト影響 / message 文言 / raw 影響範囲 | （調査のみ、コード変更なし） |
| **A** | Finding 単体の拡張（schema + checker.py） | `schema.py`, `checker.py` |
| **B** | FindingGroup の最小実装（schema + run.py 結線） | `schema.py`, `run.py` |
| **C** | observations + テスト書き換え + 実データ検証 | `run.py`, `tests/` |

**実装順序**: 0 → A → B → C

各クラスタ完了ごとに**完了報告**を挟み、GO を待ってから次クラスタに進む。

---

## §4. クラスタ 0（事前確認）

### §4.1 目的

クラスタ A 着手前に、以下 3 点を確認・確定して報告する。**この事前確認により、クラスタ A の事故（書き換え漏れ、文言の手戻り、影響範囲の見落とし）を減らす**。

### §4.2 (a) 既存テスト 23 件の書き換え方針

#### 対象テスト（設計メモ §6.1 確定）

| テストクラス | 件数 | 書き換え理由 |
|---|---|---|
| TestNormalizeDeals | 11 | raw 拡張で `_normalize_deals` 出力期待値が変わる可能性あり |
| TestFindingConversion | 9 | classification + message テンプレート対応 |
| TestExitZeroEndToEnd | 3 | groups + observations 追加対応 |

#### 確認内容

各テストクラスの**個別テスト関数**について、**書き換え範囲を表化**する：

| テスト関数 | 現在の assert 内容 | β2-C で書き換える箇所 | 書き換え方針 |
|---|---|---|---|
| `TestNormalizeDeals.test_xxx` | ... | ... | 不変 / 軽微改修 / 全面書き換え |
| `TestFindingConversion.test_xxx` | ... | ... | message テンプレート対応 等 |
| `TestExitZeroEndToEnd.test_xxx` | ... | ... | groups / observations キー追加対応 |

**重要**: 「書き換え不要」のテストもこの段階で明示する。実装中に「これは書き換え不要だった」と判明するパターンを事前に潰す。

##### 想定確認ポイント

- `TestNormalizeDeals` は β2-B で raw 拡張の対象外（raw は `to_findings` で組み立てる方針＝案 1）。**書き換えが必要なケースが本当にあるか**を実コードで確認する。**書き換え不要なら「不変」と明示**。
- `TestFindingConversion` は message 文言が変わるため、assert 文の比較対象が現在のリテラル文字列なら全面書き換え。
- `TestExitZeroEndToEnd` は出力 JSON の主要キー検証で、`groups` / `observations` キー追加への対応。

### §4.3 (b) message テンプレート文言の最終確定

設計メモ §1 論点 3 の草稿を、**実装に投入できる最終形**として確定する。

#### 草稿（設計メモから）

```python
MESSAGE_TEMPLATES = {
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX: {
        "headline": "適格事業者ですが経過措置コード（{tax_label}）が使用されています",
        "action": "通常の課税仕入コードへの修正をご検討ください",
    },
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: {
        "headline": "非適格事業者ですが通常課税仕入（{tax_label}）として処理されています",
        "action": "経過措置コード（控80/控50）への修正をご検討ください",
    },
    Classification.PARTNER_UNKNOWN: {
        "headline": "取引先がマスタに登録されていない経過措置取引です",
        "action": "取引先マスタの整備と税区分の妥当性確認をお願いします",
    },
}
```

#### 共通構造

```
{見出し}: {取引先} / {税区分} / 借方 {金額} 円。{修正アクション}
```

#### 確認内容

- 上記草稿のまま実装するか、微調整するか（漢字 / かな、敬体 / 常体、句読点）
- partner が空の場合は **「取引先不明」** で差し込む（設計メモ §1 論点 3、X2-α）
- 金額表記：3 桁カンマ区切り（`f"{int(amount):,}"`）+ 「円」
- 末尾の句点（。）の有無

#### 報告必須項目

3 分類各 1 件のサンプル文言を**実際の出力例**として書き出す：

```
qualified_but_transitional_tax のサンプル:
「適格事業者ですが経過措置コード（課対仕入（控80）10%）が使用されています: 桟原知穂 / 課対仕入（控80）10% / 借方 207,000 円。通常の課税仕入コードへの修正をご検討ください。」

nonqualified_but_full_deduction_tax のサンプル:
「非適格事業者ですが通常課税仕入（課対仕入10%）として処理されています: 取引先不明 / 課対仕入10% / 借方 258,500 円。経過措置コード（控80/控50）への修正をご検討ください。」

partner_unknown のサンプル:
「取引先がマスタに登録されていない経過措置取引です: 取引先不明 / 課対仕入（控80）10% / 借方 250,000 円。取引先マスタの整備と税区分の妥当性確認をお願いします。」
```

これを戦略 Claude / 悠皓さんがレビューして GO / 微修正指示を出す。

### §4.4 (c) raw 8 フィールド化の影響範囲確認

**raw の組み立てを `to_findings`（checker.py）側で行う**方針（案 1 確定）に基づき、影響範囲を確認する。

#### 確認内容

##### 1. `is_qualified_invoice` の取得経路

- β2-B 時点で `InvoiceCheckRow.is_qualified_invoice` フィールドは**既に存在する**ことを確認
- `_normalize_deals` で適切に取得されていることを確認
- 取得元（partners API レスポンスのどのフィールドか）

##### 2. `tax_code` の取得経路

- β2-B クラスタ B で `_normalize_deals` に追加済み（`detail.get("tax_code")`）
- `InvoiceCheckRow.tax_code` フィールドが既に存在
- 取得経路は β2-B から不変（再確認のみ）

##### 3. raw 構築の現在位置

- 現状の `to_findings` で raw 6 フィールドをどう組み立てているか
- β2-C で 8 フィールド化する際の最小差分

#### 報告必須項目

```
1. is_qualified_invoice 取得確認:
   - InvoiceCheckRow.is_qualified_invoice: 存在する / しない
   - _normalize_deals での設定箇所: （ファイル名:行番号）
   - 取得元: （deals API のフィールド名）

2. tax_code 取得確認:
   - β2-B から不変であることの再確認
   - _normalize_deals での設定箇所: （ファイル名:行番号）

3. raw 構築の現在位置:
   - to_findings 内の raw 構築箇所: （ファイル名:行番号）
   - β1 6 フィールドの組み立て方法
   - β2-C で 8 フィールド化する最小差分の方針
```

### §4.5 クラスタ 0 完了条件

- [ ] (a) 既存テスト 23 件の書き換え方針が表形式で明示
- [ ] (a) 「書き換え不要」のテストも明示
- [ ] (b) 3 分類の message サンプル文言が実例として書き出される
- [ ] (b) partner 空時の表示確認
- [ ] (c) `is_qualified_invoice` の取得経路確認
- [ ] (c) `tax_code` の取得経路再確認（β2-B から不変）
- [ ] (c) raw 構築の現在位置と β2-C での最小差分方針
- [ ] 想定外論点があれば報告

**クラスタ 0 完了 + GO まで、クラスタ A には進まない。**

---

## §5. クラスタ A（Finding 単体の拡張）

### §5.1 schema.py の拡張

#### A-1. InvoiceFinding に `classification: Optional` 追加

設計メモ §1 論点 1 確定：**Optional フィールド追加（案 B）**。

```python
from typing import Any
from dataclasses import dataclass, field

# 既存の Classification Enum は β2-B で追加済み（再利用）

@dataclass(frozen=True)
class InvoiceFinding:
    severity: str
    message: str
    wallet_txn_id: str
    classification: Classification | None = None  # ← β2-C で追加
    rule_code: str = "V1-3-20"
    raw: dict[str, Any] = field(default_factory=dict)
```

##### 設計判断（重要）

- **Optional（None 許容）にする**理由：V1-3-10 などの他 Skill との将来統合時に None で扱える（必須化しない）
- V1-3-20 では **Finding 化対象 3 分類について必ず classification を設定**する
- 必須化（案 A）は V1-3-10 改修を強制するため不採用
- raw のみ案（案 C）は β2-D / β2-E での実務利用が弱いため不採用

#### A-2. `__all__` の更新

`schema.py` の `__all__` に `InvoiceFinding` が既にあれば追加不要（変更なし）。
`Classification` は β2-B で既に追加済み。

### §5.2 checker.py の改修（核心）

#### A-3. MESSAGE_TEMPLATES 定義

設計メモ §1 論点 3 確定：**テンプレートベース（案 X2 + X2-α）**。

```python
from .schema import Classification

MESSAGE_TEMPLATES = {
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX: {
        "headline": "適格事業者ですが経過措置コード（{tax_label}）が使用されています",
        "action": "通常の課税仕入コードへの修正をご検討ください",
    },
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: {
        "headline": "非適格事業者ですが通常課税仕入（{tax_label}）として処理されています",
        "action": "経過措置コード（控80/控50）への修正をご検討ください",
    },
    Classification.PARTNER_UNKNOWN: {
        "headline": "取引先がマスタに登録されていない経過措置取引です",
        "action": "取引先マスタの整備と税区分の妥当性確認をお願いします",
    },
}
"""β2-C 確定の message テンプレート（設計メモ §1 論点 3）。

3 分類のみ定義する：
  - QUALIFIED_BUT_TRANSITIONAL_TAX
  - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
  - PARTNER_UNKNOWN

EXPECTED_TRANSITIONAL_TAX / EXPECTED_FULL_DEDUCTION_TAX / NONE は
Finding 化しないため定義不要（KeyError で「設計違反を検知」）。
"""
```

##### 文言の最終形

クラスタ 0 (b) で確定したものをここに反映。**草稿のまま採用となった場合は上記そのまま**、微修正された場合は修正後の文言で実装。

#### A-4. `_format_message_v2` 実装

##### 命名方針（設計メモ §9.2 で確定）

**`_format_message` を β2-C 用に書き換える**（既存名維持、案 1）。

理由：

- β1 / β2-B の `_format_message` は β2-C で全面置き換えとなる
- 別名追加（案 2）は段階的移行が必要なケースだが、β2-C ではクリーンに切り替える
- 明示的な接尾辞（案 3 の `_format_message_by_classification`）は冗長

##### 実装

```python
def _format_message(
    row: InvoiceCheckRow,
    classification: Classification,
) -> str:
    """β2-C: classification ベースのテンプレート文言生成。

    共通構造：
        {見出し}: {取引先} / {税区分} / 借方 {金額} 円。{修正アクション}

    partner が空の場合は全分類で「取引先不明」と表示する（設計メモ §1 論点 3、X2-α）。
    例外処理は入れない（テンプレート構造を統一）。

    Args:
        row: InvoiceCheckRow（β2 拡張版）
        classification: 分類結果（3 分類のいずれか）

    Returns:
        テンプレート差し込み済みの message 文字列。

    Raises:
        KeyError: classification が MESSAGE_TEMPLATES に定義されていない分類の場合。
                  これは設計違反（EXPECTED_* / NONE が誤って渡された）を検知する。
    """
    template = MESSAGE_TEMPLATES[classification]  # KeyError は設計違反
    headline = template["headline"].format(tax_label=row.tax_label)
    action = template["action"]
    partner_display = row.partner if row.partner else "取引先不明"
    amount_display = f"{int(row.debit_amount):,}"
    return (
        f"{headline}: {partner_display} / {row.tax_label} / "
        f"借方 {amount_display} 円。{action}"
    )
```

##### 設計判断

- **partner 空時の例外処理を入れない**（設計メモ §1 論点 3）
  - 全分類で「取引先不明」と差し込み
  - partner_unknown 分類だけ特殊扱いしない（テンプレート構造の一貫性）
- **MESSAGE_TEMPLATES に存在しない classification は KeyError**
  - EXPECTED_* / NONE は Finding 化対象外なので、`to_findings` で事前フィルタ済みの想定
  - 万が一渡された場合は KeyError で設計違反を検知（防御コードを書かない）

#### A-5. `to_findings` の改修（**論理不可分性事例 3 候補**）

##### 引数変更

β2-B まで：

```python
def to_findings(rows: list[InvoiceCheckRow]) -> list[InvoiceFinding]: ...
```

β2-C：

```python
def to_findings(
    rows: list[InvoiceCheckRow],
    classifications: list[Classification],
) -> list[InvoiceFinding]:
    """rows と classifications のペアから InvoiceFinding を生成する。

    rows と classifications は同じ長さで、対応する行ごとに 1:1 対応する前提。
    呼び出し側（run.py）で 3 分類のみフィルタ済みのリストを渡す責務を持つ。

    Args:
        rows: Finding 化対象の InvoiceCheckRow（3 分類のみ）
        classifications: 各 row に対応する Classification（3 分類のいずれか）

    Returns:
        InvoiceFinding のリスト（各 row × classification ペアから生成）。

    Raises:
        ValueError: rows と classifications の長さが一致しない場合。
        KeyError: classification が MESSAGE_TEMPLATES に未定義の場合
                  （_format_message から伝播）。
    """
    if len(rows) != len(classifications):
        raise ValueError(
            f"rows ({len(rows)}) and classifications ({len(classifications)}) "
            f"must have the same length"
        )

    findings = []
    for row, classification in zip(rows, classifications):
        message = _format_message(row, classification)
        raw = _build_raw(row)  # ← 新規ヘルパー（次で実装）
        finding = InvoiceFinding(
            severity="warning",
            message=message,
            wallet_txn_id=row.wallet_txn_id,
            classification=classification,
            rule_code="V1-3-20",
            raw=raw,
        )
        findings.append(finding)
    return findings
```

##### 論理不可分性の観察軸（K5 継続、事例 3 候補）

`to_findings` の引数を `rows` から `(rows, classifications)` に変えると、**呼び出し側 `run.py` の main() も同時に変更が必要**になる。これは設計メモ §10 の観察軸 1（Finding schema 変更 ↔ checker.py）に該当する。

→ **クラスタ A 完了時点では run.py 側の呼び出しが壊れている可能性がある**。クラスタ A の完了条件で「main() 側は一旦 skip / 破綻状態でも OK」と明示する（クラスタ B で結線）。

#### A-6. `_build_raw` ヘルパー（raw 8 フィールド化、checker.py 内）

```python
def _build_raw(row: InvoiceCheckRow) -> dict[str, Any]:
    """InvoiceCheckRow から raw dict を組み立てる（β2-C 8 フィールド化）。

    β1 6 フィールド → β2-C 8 フィールド：
      - 既存 6: tax_label, debit_amount, partner, description, transaction_date, source
      - 追加 2: tax_code, is_qualified_invoice

    Note:
        Finding.classification は判定結果（DRY 原則）のため、raw に含めない。
        判定材料 + 観察情報のみを raw に保持する（設計メモ §1 論点 2）。
    """
    return {
        "tax_label": row.tax_label,
        "tax_code": row.tax_code,
        "debit_amount": str(row.debit_amount),
        "partner": row.partner,
        "description": row.description,
        "transaction_date": (
            row.transaction_date.isoformat()
            if row.transaction_date is not None
            else ""
        ),
        "source": "deal",
        "is_qualified_invoice": row.is_qualified_invoice,
    }
```

##### 設計判断

- **raw に classification は含めない**（DRY 原則、設計メモ §1 論点 2）
  - Finding.classification = 判定結果
  - raw = 判定材料 + 観察情報
- **tax_code は int | None のまま**（JSON 化時に null になる、許容）
- **`source` は deals 限定で `"deal"` 固定**（manual_journals は β2-D）
- **`partner_id` / `account_item` / 閾値判定結果は追加しない**（設計メモ §1 論点 2、YAGNI）

### §5.3 設計思想（実装に反映）

設計メモ §3 の β2 設計思想を、クラスタ A の実装で守る：

- **DRY 原則**: Finding.classification と raw["classification"] を重複保持しない
- **テンプレート一貫性**: partner 空時の例外処理を入れない（全分類で「取引先不明」）
- **classification 中心主義**: Finding は分類結果を持つ、message も分類別

### §5.4 クラスタ A 完了条件

- [ ] schema.py の InvoiceFinding に `classification: Classification | None = None` 追加
- [ ] checker.py に `MESSAGE_TEMPLATES` 定義（3 分類）
- [ ] checker.py の `_format_message` を β2-C 用に書き換え（既存名維持）
- [ ] checker.py の `to_findings` を `(rows, classifications)` 引数に変更
- [ ] checker.py に `_build_raw` ヘルパー実装（8 フィールド化）
- [ ] 単体テスト：3 分類別 message 生成（TestMessageTemplate）
- [ ] 単体テスト：classification フィールドの基本動作（TestInvoiceFindingClassification）
- [ ] 単体テスト：raw 8 フィールドの確認（TestRawSchemaExtended）
- [ ] **既存テスト（TestFindingConversion 9 件、TestExitZeroEndToEnd 3 件）は一旦 skip / コメントアウトで OK**
- [ ] **run.py の main() は破綻していて OK**（クラスタ B で結線）

##### 完了報告に含めるべき項目

- 影響ファイル
- 新規追加されたシンボル（MESSAGE_TEMPLATES、_format_message、_build_raw、to_findings の新シグネチャ）
- 単体テストの passing 件数
- skip しているテストの一覧
- 想定外論点（あれば、レベル A or B）
- **論理不可分性の観察報告**：`to_findings` 引数変更が main() 側に波及した状況を事例 3 候補として報告

**クラスタ A 完了 + GO まで、クラスタ B には進まない。**

---

## §6. クラスタ B（FindingGroup の最小実装）

### §6.1 schema.py の拡張

#### B-1. FindingGroup dataclass 追加

設計メモ §1 論点 4 確定：**classification 単位（案 Q）+ 最小実装まで**。

```python
@dataclass(frozen=True)
class FindingGroup:
    """β2-C 確定：classification 単位の FindingGroup（最小実装）。

    V1-3-20 では Finding 化対象 3 分類のみを groups に含める：
      - QUALIFIED_BUT_TRANSITIONAL_TAX
      - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
      - PARTNER_UNKNOWN

    EXPECTED_TRANSITIONAL_TAX / EXPECTED_FULL_DEDUCTION_TAX / NONE は
    含めない（設計メモ §1 論点 5）。これらは classification_counts による
    集計対象に留める。

    Excel 表示ロジック / 親子行レイアウト / severity 色分けは β2-E / β3 で実装。
    """
    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]
```

##### 設計判断

- **dataclass のフィールドは 3 つに固定**（classification + findings_count + findings）
- **`findings_count` を冗長に持つ**理由：JSON 出力時に `findings.length` を毎回計算しなくて良い、Excel 集計（β2-E / β3）で参照しやすい
- **`frozen=True` 維持**（既存の dataclass パターンと整合）

#### B-2. `__all__` の更新

`schema.py` の `__all__` に `FindingGroup` を追加。

### §6.2 run.py の改修（FindingGroup 結線）

#### B-3. `find_groups` 関数

```python
# 順序保証：3 分類を固定順序で出力（設計メモ §6.2 TestFindGroups 確定）
GROUP_CLASSIFICATION_ORDER = (
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
    Classification.PARTNER_UNKNOWN,
)


def find_groups(findings: list[InvoiceFinding]) -> list[FindingGroup]:
    """findings を classification 単位で group 化する（β2-C 確定）。

    3 分類すべての FindingGroup を返す（findings 0 件の分類でも空配列で出力）。
    順序保証：QUALIFIED_BUT_TRANSITIONAL_TAX → NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
    → PARTNER_UNKNOWN（GROUP_CLASSIFICATION_ORDER 参照）。

    EXPECTED_* / NONE は groups に含めない（設計メモ §1 論点 5）。

    Args:
        findings: InvoiceFinding のリスト（3 分類のいずれかの classification を持つ）

    Returns:
        FindingGroup のリスト（必ず 3 件、順序固定）。
    """
    groups = []
    for cls in GROUP_CLASSIFICATION_ORDER:
        matched = [f for f in findings if f.classification == cls]
        groups.append(
            FindingGroup(
                classification=cls,
                findings_count=len(matched),
                findings=matched,
            )
        )
    return groups
```

##### 設計判断

- **必ず 3 件返す**（findings 0 件でも空配列で出力）
  - 理由：JSON スキーマの安定性（β2-E / β3 の Excel 表示で「0 件 = 行なし」と「該当なし」を区別）
- **順序保証**は `GROUP_CLASSIFICATION_ORDER` で固定（設計メモ §6.2 TestFindGroups）

#### B-4. main() の結線変更（**論理不可分性事例 4 候補**）

設計メモ §9.4 の論理不可分性候補。

##### 変更前（β2-B）

```python
# β2-B 時点（疑似コード）
classified = [(row, classify_transaction(row)) for row in normalized_rows]
classification_counts = collections.Counter(c.value for _, c in classified)

finding_target_rows = [
    row for row, c in classified
    if c in {
        Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
        Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        Classification.PARTNER_UNKNOWN,
    }
]
findings = to_findings(finding_target_rows)  # β2-B 時点
```

##### 変更後（β2-C）

```python
# β2-C
classified = [(row, classify_transaction(row)) for row in normalized_rows]
classification_counts = collections.Counter(c.value for _, c in classified)

# 3 分類のみフィルタ（rows と classifications を 1:1 対応で抽出）
finding_target_pairs = [
    (row, c) for row, c in classified
    if c in FINDING_TARGET_CLASSIFICATIONS  # 後述
]
finding_target_rows = [row for row, _ in finding_target_pairs]
finding_target_classifications = [c for _, c in finding_target_pairs]

findings = to_findings(finding_target_rows, finding_target_classifications)  # ← 引数変更
groups = find_groups(findings)

# JSON 出力に groups キー追加
output["groups"] = [
    {
        "classification": g.classification.value,
        "findings_count": g.findings_count,
        "findings": [_finding_to_dict(f) for f in g.findings],
    }
    for g in groups
]
```

##### `FINDING_TARGET_CLASSIFICATIONS` 定数

```python
FINDING_TARGET_CLASSIFICATIONS = frozenset({
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
    Classification.PARTNER_UNKNOWN,
})
"""β2-C 確定：Finding 化対象の 3 分類（設計メモ §1 論点 5）。

EXPECTED_* / NONE は含めない（FindingGroup にも groups にも含まない）。
"""
```

##### `_finding_to_dict` ヘルパー

JSON シリアライズ用のヘルパー（既存の Finding → dict 変換ロジックがあれば再利用）。

```python
def _finding_to_dict(finding: InvoiceFinding) -> dict[str, Any]:
    """InvoiceFinding を JSON 出力用の dict に変換する。"""
    return {
        "severity": finding.severity,
        "rule_code": finding.rule_code,
        "classification": (
            finding.classification.value
            if finding.classification is not None
            else None
        ),
        "message": finding.message,
        "wallet_txn_id": finding.wallet_txn_id,
        "raw": finding.raw,
    }
```

##### 設計判断

- **`findings` キーと `groups` キーの両方を出力するか**：

  設計メモ §2 の最終 JSON では **`groups` 内に `findings` が入る**構造。トップレベルの `findings` キーは廃止する方針。

  ただし、**既存の TestExitZeroEndToEnd で `findings_count` のキーをトップレベルで参照している**ため、`findings_count` のみトップレベル維持（合計値）。

  ```json
  {
    "classification_counts": { ... },
    "groups": [ ... ],
    "findings_count": 2,
    "observations": { ... }
  }
  ```

  → トップレベルの `"findings": [...]` は **削除**（破壊的変更、TestExitZeroEndToEnd の書き換えで対応）。

  ※ もしトップレベル `findings` も必要との判断が実装中に出た場合は、レベル A で報告。

### §6.3 クラスタ B 完了条件

- [ ] schema.py に FindingGroup 追加
- [ ] schema.py の `__all__` に FindingGroup 追加
- [ ] run.py に `GROUP_CLASSIFICATION_ORDER` 定数定義
- [ ] run.py に `FINDING_TARGET_CLASSIFICATIONS` 定数定義
- [ ] run.py に `find_groups` 関数実装
- [ ] run.py の main() で `to_findings` 呼び出しを `(rows, classifications)` ペアに変更
- [ ] run.py の main() で `find_groups` 呼び出し → JSON 出力に `groups` キー追加
- [ ] run.py の main() でトップレベル `findings` キー削除（`findings_count` は維持）
- [ ] 単体テスト：FindingGroup の基本動作（TestFindingGroup）
- [ ] 単体テスト：find_groups 変換（TestFindGroups）
- [ ] **クラスタ A で skip した既存テストはまだ skip のままで OK**（クラスタ C で書き換え）
- [ ] **observations はまだ未実装で OK**（クラスタ C で実装）

##### 完了報告に含めるべき項目

- 影響ファイル
- 新規追加されたシンボル（FindingGroup、GROUP_CLASSIFICATION_ORDER、FINDING_TARGET_CLASSIFICATIONS、find_groups、_finding_to_dict）
- 単体テストの passing 件数
- main() の動作確認（実データで run しなくても、クラスタ A の単体テストレベルで動くか）
- 想定外論点（あれば）
- **論理不可分性の観察報告**：main() の出力構造変更（`findings` トップレベル削除 + `groups` 追加）の波及範囲を事例 4 候補として報告

**クラスタ B 完了 + GO まで、クラスタ C には進まない。**

---

## §7. クラスタ C（observations + テスト書き換え + 実データ検証）

### §7.1 observations 実装

設計メモ §1 論点 6 確定：**partner_unknown_breakdown のみ（案 R3 + 最小）**。

#### C-1. `_calculate_partner_unknown_breakdown` 関数

```python
def _calculate_partner_unknown_breakdown(
    classified: list[tuple[InvoiceCheckRow, Classification]],
) -> dict[str, int]:
    """partner_unknown 周辺の集計（β2-C observations）。

    解釈 X（partner 空 × 通常課税仕入 × 20 万以上を nonqualified に推定吸収）の
    影響を可視化する。設計メモ §1 論点 6 確定。

    集計の定義：
      - absorbed_into_nonqualified:
          partner 空文字 × 通常課税仕入 × 20 万以上 →
          nonqualified_but_full_deduction_tax として分類された件数
      - remaining_partner_unknown:
          partner_unknown 分類の件数（partner 空 × 経過措置 × 20 万以上）

    Args:
        classified: (row, classification) のタプルリスト（main() で生成済み）

    Returns:
        {"absorbed_into_nonqualified": N, "remaining_partner_unknown": M}
    """
    absorbed = 0
    remaining = 0
    for row, cls in classified:
        if row.partner == "":
            if cls == Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX:
                absorbed += 1
            elif cls == Classification.PARTNER_UNKNOWN:
                remaining += 1
    return {
        "absorbed_into_nonqualified": absorbed,
        "remaining_partner_unknown": remaining,
    }
```

##### 設計判断

- **`partner == ""` の条件で絞り込んだ上での内訳**
  - `absorbed_into_nonqualified`: 解釈 X で吸収された件数（partner 空 × full_deduction × 20 万以上）
  - `remaining_partner_unknown`: 単独の partner_unknown 件数（partner 空 × transitional × 20 万以上）
- **その他の集計（code_108_count、tax_code 分布等）は β2-D で必要に応じて追加**（YAGNI）

#### C-2. main() の JSON 出力に `observations` キー追加

```python
# β2-C main() 内
breakdown = _calculate_partner_unknown_breakdown(classified)
output["observations"] = {
    "partner_unknown_breakdown": breakdown,
}
```

### §7.2 既存テスト書き換え（23 件）

クラスタ 0 (a) で確定した書き換え方針に沿って、23 件を書き換える。

#### TestNormalizeDeals（11 件）

- **書き換え方針はクラスタ 0 で確定**
- raw は `to_findings` 側で組み立てる方針（案 1）のため、`_normalize_deals` の出力は β2-B から不変の可能性が高い
- 書き換え不要なら「不変通過」と報告

#### TestFindingConversion（9 件）

- message テンプレート対応で全面書き換え
- 既存の assert 文（`assert finding.message == "..."` のリテラル比較）を新文言に更新
- classification フィールドの assert 追加
- raw 8 フィールドの assert 追加

#### TestExitZeroEndToEnd（3 件）

- JSON 出力構造の変更対応
- トップレベル `findings` キー削除 → `groups` キー追加の検証
- `observations` キー追加の検証
- `findings_count` トップレベル維持の検証

### §7.3 新規テスト追加（6 クラス）

設計メモ §6.2 確定の 6 クラス。

#### TestInvoiceFindingClassification

- `test_classification_field_default_is_none`：デフォルト None で生成
- `test_classification_field_with_enum_value`：Classification 値で生成
- `test_classification_field_with_invalid_type`（任意）：型エラー検証

#### TestRawSchemaExtended

- `test_raw_includes_tax_code`
- `test_raw_includes_is_qualified_invoice`
- `test_raw_preserves_existing_six_fields`：β1 6 フィールドが維持
- `test_raw_does_not_include_classification`：DRY 原則の確認

#### TestMessageTemplate

- `test_message_for_qualified_but_transitional_tax`：見出し + アクションの確認
- `test_message_for_nonqualified_but_full_deduction_tax`
- `test_message_for_partner_unknown`
- `test_message_with_empty_partner_displays_torihikisaki_fumei`：partner 空時「取引先不明」
- `test_message_includes_amount_with_comma`：3 桁カンマ区切り
- `test_message_for_undefined_classification_raises_keyerror`：EXPECTED_* / NONE が誤って渡されたケース

#### TestFindingGroup

- `test_finding_group_creation`：3 フィールドで生成
- `test_finding_group_findings_count_matches_findings_length`
- `test_finding_group_classification_field_is_classification_enum`
- `test_finding_group_is_frozen`：immutable 確認

#### TestFindGroups

- `test_find_groups_returns_three_groups`：常に 3 件
- `test_find_groups_order_is_fixed`：QUALIFIED → NONQUALIFIED → PARTNER_UNKNOWN
- `test_find_groups_with_empty_findings_returns_empty_groups`：findings 0 件でも 3 group
- `test_find_groups_does_not_include_expected_or_none`
- `test_find_groups_findings_count_matches`：各 group の findings_count が findings.length と一致

#### TestObservations

- `test_observations_partner_unknown_breakdown_keys`：absorbed / remaining の 2 キー
- `test_observations_absorbed_into_nonqualified_count`
- `test_observations_remaining_partner_unknown_count`
- `test_observations_with_no_partner_unknown_returns_zero`：partner 空が 1 件もないケース

### §7.4 実データ検証（K4 案 Z 継承）

#### 検証対象

**3525430 / 2025-12 のみ**。3 社観察は β2-D で実施。

#### 検証コマンド

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id 3525430 --target-month 2025-12
```

#### 検証観点

- **exit 0 で正常終了**
- **stdout に `"status": "ok"` の JSON**
- **classification_counts の 6 キー**（β2-B から不変）：
  - qualified_but_transitional_tax: 0
  - nonqualified_but_full_deduction_tax: 2
  - partner_unknown: 0
  - expected_transitional_tax: 95
  - expected_full_deduction_tax: 818
  - none: 1149
  - 合計: 2064
- **groups の 3 件**：
  - 順序：QUALIFIED → NONQUALIFIED → PARTNER_UNKNOWN
  - findings_count：0, 2, 0
- **findings_count トップレベル**：2（3 group の合計）
- **各 finding の構造**：
  - severity / rule_code / classification / message / wallet_txn_id / raw（8 フィールド）
- **observations.partner_unknown_breakdown**：
  - absorbed_into_nonqualified：2（β1 で観察された 2 件）
  - remaining_partner_unknown：0（partner_unknown 分類が 0 件のため）
- **不変条件**：
  - `sum(classification_counts.values()) == total_rows`（β2-B から維持、方針 3）
  - `sum(group.findings_count for group in groups) == findings_count`（β2-C 新規）
  - `findings_count == nonqualified_but_full_deduction_tax + qualified_but_transitional_tax + partner_unknown`

→ 不変条件に違反した場合は方針 3 違反 / 設計違反。即報告レベル A。

#### 重要

件数の妥当性は β2-D で評価する。β2-C では **「正しく動いているか」のみ** 確認。0 件でも多すぎてもエラーにしない（ただし不変条件は必ずチェック）。

### §7.5 クラスタ C 完了条件

- [ ] `_calculate_partner_unknown_breakdown` 実装
- [ ] main() の JSON 出力に observations キー追加
- [ ] TestNormalizeDeals 11 件の処理（書き換え or 不変通過の確認）
- [ ] TestFindingConversion 9 件の書き換え
- [ ] TestExitZeroEndToEnd 3 件の書き換え
- [ ] TestInvoiceFindingClassification 追加
- [ ] TestRawSchemaExtended 追加
- [ ] TestMessageTemplate 追加
- [ ] TestFindingGroup 追加
- [ ] TestFindGroups 追加
- [ ] TestObservations 追加
- [ ] **全テスト通過**（β2-B 77 件 + 増分 + 書き換え）
- [ ] 実データ検証（3525430 / 2025-12）で β2-C 完結時 JSON 構造が出力される
- [ ] 不変条件チェック（2 つとも成立）
- [ ] 完了報告に分類別 message サンプル + observations サンプルを含める（後述 §8）

---

## §8. 完了報告フォーマット（クラスタ C）

クラスタ C 完了時の報告には**実データの主要 JSON + 分類別 message サンプル + observations サンプル**を必須で含める。

### §8.1 報告必須項目

```md
## クラスタ C 完了（β2-C 完結）

### 影響ファイル
| ファイル | 種別 |
|---|---|
| schema.py | 改変（InvoiceFinding に classification 追加 + FindingGroup 新設） |
| checker.py | 改変（MESSAGE_TEMPLATES + _format_message + _build_raw + to_findings 改修） |
| run.py | 改変（find_groups + _calculate_partner_unknown_breakdown + main() 結線） |
| tests/unit/test_invoice_registration_status.py | 改変（書き換え 23 件 + 新規 6 クラス） |
| .claude/skills/.../SKILL.md | 不変（β2-D / β2-E で改修判断） |

### テスト結果
全 {N} tests passed
- 書き換え: TestNormalizeDeals 11 件、TestFindingConversion 9 件、TestExitZeroEndToEnd 3 件 = 23 件
- 新規追加: TestInvoiceFindingClassification、TestRawSchemaExtended、TestMessageTemplate、TestFindingGroup、TestFindGroups、TestObservations = {M} 件
- 不変通過: TestInvoiceCheckContext 4 件、TestCliArgValidation 9 件、TestMissingFiles 1 件、TestClassifyTransaction 12 件、TestTransitionalTaxBoundary 5 件、TestFullDeductionTaxBoundary 8 件、TestInvoiceCheckRowTaxCode 2 件、TestClassificationEnum 1 件、TestBeta1RemovalCheck 5 件、TestClassifyTransactionLegacyIntents 7 件 = 54 件

### 実データ検証結果（3525430 / 2025-12）

#### classification_counts（β2-B から不変）
- qualified_but_transitional_tax: 0
- nonqualified_but_full_deduction_tax: 2
- partner_unknown: 0
- expected_transitional_tax: 95
- expected_full_deduction_tax: 818
- none: 1149
- 合計: 2064 件 = deals details 件数 2064 と一致 ✅

#### findings_count
- 2 件（3 group の合計）

#### groups（順序保証）
1. qualified_but_transitional_tax: findings_count=0, findings=[]
2. nonqualified_but_full_deduction_tax: findings_count=2, findings=[...]
3. partner_unknown: findings_count=0, findings=[]

#### observations
- partner_unknown_breakdown:
  - absorbed_into_nonqualified: 2
  - remaining_partner_unknown: 0

#### 不変条件（β2-C 新規 + β2-B 維持）
- sum(classification_counts.values()) == total_rows: 2064 == 2064 ✅（β2-B から維持）
- sum(group.findings_count for group in groups) == findings_count: 2 == 2 ✅（β2-C 新規）

#### 分類別 message サンプル（実データ、各 1 件）

##### nonqualified_but_full_deduction_tax（実データ 2 件中 1 件）
```json
{
  "severity": "warning",
  "rule_code": "V1-3-20",
  "classification": "nonqualified_but_full_deduction_tax",
  "message": "非適格事業者ですが通常課税仕入（課対仕入10%）として処理されています: 取引先不明 / 課対仕入10% / 借方 258,500 円。経過措置コード（控80/控50）への修正をご検討ください。",
  "wallet_txn_id": "...",
  "raw": {
    "tax_label": "課対仕入10%",
    "tax_code": 136,
    "debit_amount": "258500",
    "partner": "",
    "description": "...",
    "transaction_date": "2025-11-03",
    "source": "deal",
    "is_qualified_invoice": false
  }
}
```

##### qualified_but_transitional_tax（実データ 0 件、テストフィクスチャでサンプル提示）
##### partner_unknown（実データ 0 件、テストフィクスチャでサンプル提示）

### 確認事項
- β2-C 設計メモ §1〜§6 の方針との整合
- DRY 原則：raw に classification を重複保持していないことの確認
- テンプレート一貫性：partner 空時の例外処理が入っていないことの確認
- classification 中心主義：FindingGroup が classification 単位であることの確認
- スコープ外不変対象（classify_transaction、classification_counts、SKILL.md、checker.py の to_findings 以外）の保持確認

### 想定外論点（あれば）
- {内容、レベル A 即時報告 / レベル B 後で相談}

### 論理不可分性の観察報告（K5 継続、事例 2/3/4 候補）
- 事例 3 候補: to_findings 引数変更が main() 側に波及した状況
- 事例 4 候補: main() の出力構造変更（findings → groups）の波及範囲
- その他、クラスタ実装中に発見された論理不可分性
```

---

## §9. 禁止事項（β2-C で守ること）

### 禁止リスト

1. **`classify_transaction` / 5 分類ロジックの変更禁止**（β2-B で確定、不変）
2. **`classification_counts` の構造変更禁止**（β2-B 確定、6 値）
3. **raw に classification を重複保持しない**（DRY 原則、設計メモ §1 論点 2）
4. **partner 空時のテンプレート例外処理を入れない**（一貫性、設計メモ §1 論点 3）
5. **`expected_*` を groups に含めない**（設計メモ §1 論点 5）
6. **observations を肥大化させない**（partner_unknown_breakdown のみ、設計メモ §1 論点 6）
7. **manual_journals に手を出さない**（β2-D で判断）
8. **Excel exporter / 親子行レイアウト / severity 色分けに手を出さない**（β2-E / β3）
9. **SKILL.md を改訂しない**（β2-D / β2-E で判断）
10. **推測で文言を変えない**（クラスタ 0 で確定したものを使う）
11. **想定外論点を独断で進めない**（運用原則 12）
12. **β2-C 設計メモの方針を変更しない**（変更したい場合はレベル A で報告）
13. **`_format_message` の旧シグネチャ（row のみ受け取る）を残さない**（β2-C で全面置き換え）
14. **トップレベル `findings` キーを残さない**（β2-C で削除、`findings_count` のみ維持）
15. **PROJECT_ROOT 環境変数機構を壊さない**（β1 クラスタ B で導入、テスト都合）

### β2-C で削除明示

```md
削除：
- _format_message の β1 / β2-B 旧シグネチャ（row のみ）
- main() の JSON 出力トップレベル "findings" キー

残す：
- _format_message の名前（中身は β2-C 用に書き換え）
- main() の JSON 出力トップレベル "findings_count" キー
- AMOUNT_THRESHOLD
- TRANSITIONAL_TAX_CODES, FULL_DEDUCTION_TAX_CODES
- Classification（β2-B で追加、不変）
- classify_transaction（β2-B で追加、不変）
- is_transitional_tax / is_full_deduction_tax（β2-B で追加、不変）
- _normalize_deals（β2-B で改修済み、不変）
```

---

## §10. 段階的進行ルール（最重要）

### 各クラスタ完了ごとに停止して報告

- クラスタ 0 完了 → 報告 → 戦略 Claude のレビュー → 「GO」が出てから次へ
- クラスタ A 完了 → 報告 → レビュー → 「GO」
- クラスタ B 完了 → 報告 → レビュー → 「GO」
- クラスタ C 完了 → 報告 → レビュー → β2-C 完了確認

**勝手に次のクラスタに進まない**。各クラスタの完了報告で必ず一旦停止する。

### 想定外論点が出たとき

実装中に以下のような事象に遭遇したら、独断で進めず即時報告（レベル A）：

- β2-C 設計メモの方針と実コードが食い違う
- `to_findings` 引数変更が想定以上に波及（事例 3 候補の深刻化）
- 既存テストの書き換えが「クラスタ 0 (a) の方針」では不十分
- 不変条件（`sum(classification_counts) == total_rows` 等）が成立しない
- スコープ外の処理を入れたくなる気持ちが湧いた
- raw 構造が JSON シリアライズで失敗する（tax_code int | None の null 化 等）

→ 独断で進めず、報告して指示を仰ぐ。

### 軽微な独自判断（レベル B 報告）

以下は独自判断で進めて、完了報告に記載する：

- ヘルパー関数の細かいリファクタリング（`_finding_to_dict` の置き場所等）
- テスト関数名の細部（`test_xxx_returns_yyy` の語順等）
- docstring / コメントの追記
- 型ヒントの強化（`Optional[X]` → `X | None` 等）

---

## §11. 既存ファイルと変更点まとめ

### 新設ファイル

なし（β2-C では新設なし）

### 改変ファイル

| ファイル | 改変内容 |
|---|---|
| `schema.py` | InvoiceFinding に `classification: Classification \| None = None` 追加、FindingGroup 新設、`__all__` 更新 |
| `checker.py` | MESSAGE_TEMPLATES 定義、`_format_message` 全面書き換え、`_build_raw` 新規、`to_findings` 引数変更（rows + classifications） |
| `run.py` | GROUP_CLASSIFICATION_ORDER / FINDING_TARGET_CLASSIFICATIONS 定数、`find_groups` / `_calculate_partner_unknown_breakdown` / `_finding_to_dict` 新規、main() 結線変更（JSON 出力に groups + observations 追加、トップレベル findings 削除） |
| `tests/unit/test_invoice_registration_status.py` | 書き換え 23 件（TestNormalizeDeals 11 + TestFindingConversion 9 + TestExitZeroEndToEnd 3）+ 新規 6 クラス |

### 不変ファイル

| ファイル | 理由 |
|---|---|
| `.claude/skills/check-invoice-registration-status/SKILL.md` | β2-D / β2-E で改修判断 |
| 既存テストの一部（TestInvoiceCheckContext, TestCliArgValidation, TestMissingFiles, TestClassifyTransaction, TestTransitionalTaxBoundary, TestFullDeductionTaxBoundary, TestInvoiceCheckRowTaxCode, TestClassificationEnum, TestBeta1RemovalCheck, TestClassifyTransactionLegacyIntents） | β2-C で構造変更がない領域 |
| classify_transaction / 5 分類ロジック | β2-B で確定、β2-C では不変 |

---

## §12. 論理不可分性の観察軸（K5 継続）

設計メモ §10 の観察軸を、クラスタ別に追跡する：

| 観察軸 | 該当クラスタ | 想定される論理不可分性 |
|---|---|---|
| **Finding schema 変更 ↔ checker.py** | A | classification 追加で `to_findings` の引数変更が必要 |
| **FindingGroup 新設 ↔ run.py 出力** | B | groups を JSON に含めるには main() 改修が必要 |
| **観察用出力 ↔ CLI JSON 構造** | C | observations 追加で TestExitZeroEndToEnd が壊れる |

### β2-B からの継続観察

- **事例 1（β2-B クラスタ A）**：main() 5 分類化の踏み込み
- **事例 2 候補**：β2-C で発生するか観察対象
- **事例 3 候補**：`to_findings` 引数変更の波及（クラスタ A）
- **事例 4 候補**：main() 出力構造変更の波及（クラスタ B）

### Claude Code への指示

実装中に**論理不可分性を発見した場合**、レベル B で報告する：

- 「指示書のクラスタ X の範囲内で完結すると思われたが、クラスタ Y にも影響が及んだ」
- 「事例 N 候補として観察した」と明記
- 戦略 Claude / 悠皓さんが事例 2 が成立したかを判断する

**論理不可分性は「事故」ではなく「観察対象」**。発見しても焦らず、報告に整理する。

---

## §13. β2-C から β2-D への申し送り

β2-C 完了報告を受けて、β2-D で必要な作業の予測：

1. **3 社観察**（12243357 / 10794380）の実施
2. **manual_journals 必要性の判断**
3. **observations の追加項目検討**（code_108_count、tax_code 分布、partner 分布等）
4. **474381 のデータ整備**
5. **件数妥当性の評価**（β2-A メモ §4.3 持ち越し）

これらは **β2-C 完了報告時のサンプル**を見て判断する。

---

## §14. 末尾強調（最重要事項の再掲）

> **β2-C は Finding スキーマ拡張 + FindingGroup 新設 + observations 追加。判定ロジックには触れない。最小経路で出力構造を整備する。**

- `classify_transaction` / 5 分類ロジックは β2-B で確定、β2-C では不変
- manual_journals は β2-D / β2-E、Excel は β3 以降
- 件数判断は β2-D、β2-C では「正しく動いているか」だけ見る
- 3 社検証は β2-D、β2-C では 3525430 のみ
- 想定外論点が出たら独断で進めない（運用原則 12）
- 困ったら戦略 Claude / 悠皓さんに確認（運用原則 15: GO フロー × 原則 6）
- 各クラスタ完了で必ず停止して報告
- 論理不可分性は観察対象、発見したら報告（K5 継続）

---

## §15. では、クラスタ 0 から開始してください

### 最初のアクション

1. **β2-C 設計メモ**（`V1-3-20_beta2_C_design_policy.md`）を view で確認（必須）
2. **β2-A メモ**（`V1-3-20_beta2_A_data_structure_policy.md`）の §3 設計思想を再確認（思想の根本）
3. **β2-B 完結状態**を確認（77 tests passed、3525430 / 2025-12 で classification_counts 6 値）
4. **クラスタ 0**：(a) テスト 23 件の書き換え方針 + (b) message 文言の最終化 + (c) raw 影響範囲確認
5. §4.5 の完了条件チェックリストに沿って報告

**クラスタ 0 完了 + GO 取得まで、クラスタ A の実装には着手しないでください。**

完了報告をお待ちしています。
