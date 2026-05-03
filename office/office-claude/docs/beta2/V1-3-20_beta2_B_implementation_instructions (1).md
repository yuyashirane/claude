# V1-3-20 β2-B 実装指示書

**作成日**: 2026-04-28
**対象**: Claude Code
**前提**: β1 完結（39 tests passed）+ β2 全体ロードマップ承認済 + β2-A データ構造方針メモ確定済
**位置づけ**: β2-B（経過措置ロジック実装）の実装指示書。β2-A メモを引用元とする。

---

## §1. このタスクの目的（最重要文）

> **β2-B は判定ロジックの全面置き換え。β1 の 3 条件 AND は削除し、5 分類体系で deals だけ動かす最小経路を通す。**

完成版（β2-D 観察 / β2-E Excel 統合直前 / β3 Excel 本体）は本タスクの対象外です。スコープ膨張を起こさないでください。

### β2-B 確定スコープ（やること）

- 通常課税仕入の `tax_code` 範囲を 3 社で現物確認（クラスタ 0）
- schema 拡張（Classification Enum、InvoiceCheckRow に tax_code 追加）
- 経過措置判定ヘルパー実装（`is_transitional_tax` / `is_full_deduction_tax`）
- `classify_transaction` 実装（5 分類ロジック、解釈 X 推定吸収）
- β1 の旧ロジック削除（`find_candidates` / `TAXABLE_PURCHASE_PREFIXES` / `is_taxable_purchase`）
- `_normalize_deals` 改修（tax_code 取得を追加）
- run.py CLI 出力に `classification_counts` 反映
- 既存 5 テストの意図継承書き換え + 新規テスト追加
- 実データ検証：**3525430 / 2025-12** で 5 分類別件数が出力される

### β2-B やらないこと（明示的にスコープ外）

- ❌ manual_journals 対応（β2-D で判断）
- ❌ Finding 構造の classification 組み込み（β2-C スコープ）
- ❌ Finding の message 改修（β2-C スコープ）
- ❌ FindingGroup 集約（β2-C 以降）
- ❌ Excel exporter 本体（β3 以降）
- ❌ SKILL.md 改訂（β2-C で改訂判断）
- ❌ checker.py の改修（β2-C スコープ）
- ❌ 件数妥当性の議論（β2-D 観察フェーズ）
- ❌ 3 社検証（β2-D で実施、β2-B では 3525430 のみ）
- ❌ T 番号妥当性 / 少額特例 / 公共交通費特例（β2 全体スコープ外）

---

## §2. 前提条件と参照先

### 必読ドキュメント

1. **β2-A データ構造方針メモ**（`V1-3-20_beta2_A_data_structure_policy.md`）
   - §1 の 4 論点確定内容（特に方針文）
   - §2 の 5 分類体系と判定ロジック疑似コード
   - §3 の β2 設計思想（**判定は止めない / 推定して前に進める / 修正アクションを出す**）
   - §5 の β1 → β2 変更点まとめ
   - §6 の既存 5 テストの意図継承マッピング
   - §8 の β2-B への申し送り事項

2. **β1 完結状態**
   - 39 tests passed
   - 3525430/2025-12 で 12 件抽出
   - α 公開 API 改変禁止は β1 内の安全装置として完了 → **β2-B では解除**

3. **userMemories #29 / #30**
   - β1 確定ルールと β2 要決定論点 9 件

### 参照しないもの

- V1-3-10 完成形（V1-3-20 は独立で進める。V1-3-10 統合判断は β2 全体で保留）

### 配置先

```
skills/verify/V1-3-rule/check-invoice-registration-status/
├── run.py              # ← 改変（追加 + 削除）
├── schema.py           # ← 改変（拡張）
├── checker.py          # ← 不変（β2-C で改修）
└── 既存 SKILL.md       # ← 不変（β2-C で改修判断）

tests/unit/
└── test_invoice_registration_status.py  # ← 改変（書き換え + 追加）
```

---

## §3. クラスタ分割（実装順序）

5 論点確定（K1：案 2）に基づき、3 クラスタ + 必須前提のクラスタ 0：

| クラスタ | 内容 | 主な変更ファイル | 状態 |
|---|---|---|---|
| **0**(前提) | 通常課税仕入の `tax_code` 範囲を 3 社で現物確認 | （調査のみ、コード変更なし） | ✅ **完了済み**（§4 参照） |
| **A** | schema 拡張 + classify_transaction + β1 ロジック削除 | `schema.py`, `run.py` | 🔄 **次に着手** |
| **B** | _normalize_deals 改修 + CLI 出力変更 + テスト総入れ替え + 実データ検証 | `run.py`, `tests/` | ⏳ クラスタ A 完了後 |

**Claude Code の実装順序**: **A → B**（クラスタ 0 は完了済み、§4 を参照のみ）

各クラスタ完了ごとに**完了報告**を挟み、GO を待ってから次クラスタに進む。

---

## §4. クラスタ 0（完了済み、参考記録）

> **【ステータス：✅ 完了済み】**
> クラスタ 0 は本指示書発行前に Claude Code が実施し、戦略 Claude / 悠皓さんが承認済みです。
> Claude Code はこのセクションを再実行せず、参考記録として読んだうえで **クラスタ A から開始** してください。

### §4.0.1 確定事項（クラスタ 0 の成果）

通常課税仕入の `tax_code` 範囲を、3 社で現物確認した結果：

```python
FULL_DEDUCTION_TAX_CODES = frozenset({34, 108, 136, 163})
```

| code | name | name_ja |
|---|---|---|
| 34 | `purchase_with_tax` | 課対仕入 |
| 108 | `purchase_with_tax_8` | 課対仕入8%（旧 8% 標準税率時代） |
| 136 | `purchase_with_tax_10` | 課対仕入10%（現行標準税率） |
| 163 | `purchase_with_tax_reduced_8` | 課対仕入8%（軽）（軽減税率） |

### §4.0.2 確定事項の根拠

- **3 社（3525430 / 12243357 / 10794380）で完全一致**
- フィールド名・値は完全一致、件数も完全一致（各 4 件）
- `name_ja` に「課税仕入」を含むレコードは 3 社とも 0 件（freee マスタは「課対仕入」で統一）
- 経過措置範囲（183〜230）との **重複なし**（飛び地配置）

### §4.0.3 排他性の保証

```
TRANSITIONAL    : 183, 184, ..., 230 （48 個、連続）
FULL_DEDUCTION  : 34, 108, 136, 163 （4 個、飛び地）
共通要素        : なし
```

→ `is_transitional_tax(c) and is_full_deduction_tax(c)` は常に False。互いに排他的な分類が現物で保証されている。

### §4.0.4 8% 系統の補足観察（重要、クラスタ A 以降で参照）

3 社共通で `code=108`（課対仕入8%）と `code=163`（課対仕入8%（軽））の両方がマスタに存在。

- **β2-B 分類ロジック上**：両方とも通常課税仕入として扱う（`FULL_DEDUCTION_TAX_CODES` に両方含める）
- **観察上**：`code=108` は旧 8% 標準税率時代のコードで、現在はほぼ使われない。実データで出た場合は β2-D 観察フェーズで「違和感」として記録する
- **β2-B 実装方針**：両方とも分類は同等扱い、観察は β2-D で行う

### §4.0.5 マスタに無い code の扱い（持ち越し論点、β2-B で対処）

3 社で確認したが、たとえば 10794380 のマスタは経過措置コードが 12 件のみ（3525430 / 12243357 は 48 件）。同様に通常課税仕入も会社設定により部分集合の可能性あり。

→ 「マスタに無い code の deals が出てきた場合の扱い」は β2-A メモ §4.2 で β2-B 持ち越し論点として記録済み。**実装中に該当ケースが出たら、独断で進めずレベル A で報告すること**。

---


## §5. クラスタ A（schema 拡張 + classify_transaction + β1 削除）

### §5.1 schema.py の拡張

#### A-1. Classification Enum 追加

`schema.py` に以下を追加：

```python
from enum import Enum


class Classification(str, Enum):
    """V1-3-20 β2 の 5 分類体系（β2-A 確定）。"""
    QUALIFIED_BUT_TRANSITIONAL_TAX = "qualified_but_transitional_tax"
    NONQUALIFIED_BUT_FULL_DEDUCTION_TAX = "nonqualified_but_full_deduction_tax"
    PARTNER_UNKNOWN = "partner_unknown"
    EXPECTED_TRANSITIONAL_TAX = "expected_transitional_tax"
    EXPECTED_FULL_DEDUCTION_TAX = "expected_full_deduction_tax"
    NONE = "none"
```

#### A-2. InvoiceCheckRow に `tax_code` 追加

既存 8 フィールドはそのまま、最後に追加：

```python
@dataclass(frozen=True)
class InvoiceCheckRow:
    wallet_txn_id: str
    transaction_date: Optional[date] = None
    partner: str = ""
    description: str = ""
    tax_label: str = ""
    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")
    is_qualified_invoice: bool = False
    tax_code: int | None = None  # ← β2 で追加
```

### §5.2 run.py の改修（経過措置判定ヘルパー + classify_transaction）

#### A-3. 定数定義（run.py）

```python
TRANSITIONAL_TAX_CODES = frozenset(range(183, 231))
"""経過措置コード範囲（β2-A クラスタ 0 で 3 社一致確認済、183〜230 の 48 個）。"""

FULL_DEDUCTION_TAX_CODES = frozenset({34, 108, 136, 163})
"""通常課税仕入コード（β2-B クラスタ 0 で 3 社一致確認済、全 4 件、飛び地）。

freee 標準コードでの意味:
    34  -> 課対仕入       (purchase_with_tax)
    108 -> 課対仕入8%     (purchase_with_tax_8、旧 8% 標準税率時代)
    136 -> 課対仕入10%    (purchase_with_tax_10、現行標準税率)
    163 -> 課対仕入8%（軽）(purchase_with_tax_reduced_8、軽減税率)

経過措置範囲 (183-230) とは重複なし。
判定上の互いに排他的な分類が現物で保証されている:
    is_transitional_tax(c) and is_full_deduction_tax(c) は常に False。

【補足観察】
code=108（課対仕入8%）は旧 8% 標準税率時代のコードで、現在はほぼ使われない。
β2-B では 108 / 163 ともに通常課税仕入として扱うが、実データで code=108 が出た
場合は「違和感」として β2-D 観察フェーズで記録する（ただし β2-B では分類ロジックを
変更しない、観察用の前提知識として保持するのみ）。
"""
```

#### A-4. 判定ヘルパー（run.py）

##### 🔴 実装フェーズ着手前の重要方針（3 点、独自解釈禁止）

以下 3 点は**指示書での明示**であり、Claude Code は**独自の防御ロジックを追加しない**こと。

###### 方針 1：`tax_code=None` は常に False 扱い

判定ヘルパーは `tax_code is None` を**常に False に倒す**。

- `is_transitional_tax(None)` → False（経過措置ではない）
- `is_full_deduction_tax(None)` → False（通常課税仕入ではない）

意味：**判定不能は通常課税仕入にも経過措置にも入れない**。

これを書いておかないと、`None in set` の扱いでブレたり、Claude Code が防御ロジックを独自追加する事故が起きる。仕様で固定する。

###### 方針 2：`Classification.NONE` の意味を 1 行で固定

```
NONE = 「課税仕入でもなく、インボイス論点の対象外」
```

- 非課税
- 対象外
- 判定不要（partner 不明 × 通常課税仕入で 20 万円未満、partner 不明 × 経過措置で 20 万円未満、partner 不明 × その他、等）

を**全部ここに集約**する。`expected_*` と混ざらないように：

- `EXPECTED_*`：分類は確定しているが Finding 化しない（観察用に内部分類）
- `NONE`：そもそも分類対象外、観察も不要

これを曖昧にすると、テスト設計が崩れて classification_counts が信用できなくなる。

###### 方針 3：`classify_transaction` は「必ず 1 つ返す」分類関数

```
1 取引 = 必ず 1 Classification（NONE 含む）
```

- これは**フィルタ関数ではなく分類関数**
- 「該当なし」も `Classification.NONE` として返す（None や空タプルではない）
- 5 分類 + NONE の合計 6 値の Enum で必ずいずれか 1 つを返す

これがブレると：

- 件数整合チェックが壊れる（`sum(classification_counts.values()) == total_rows` が成立しなくなる）
- classification_counts が信用できなくなる
- end-to-end テスト（§6.7）で不整合が発生

##### 判定ヘルパーの実装

```python
def is_transitional_tax(tax_code: int | None) -> bool:
    """経過措置コード（控80 / 控50）かを判定。

    tax_code=None は常に False（方針 1）。判定不能を経過措置に入れない。
    """
    if tax_code is None:
        return False
    return tax_code in TRANSITIONAL_TAX_CODES


def is_full_deduction_tax(tax_code: int | None) -> bool:
    """通常課税仕入かを判定。

    tax_code=None は常に False（方針 1）。判定不能を通常課税仕入に入れない。
    """
    if tax_code is None:
        return False
    return tax_code in FULL_DEDUCTION_TAX_CODES
```

#### A-5. classify_transaction 実装（run.py、β2 の核心）

β2-A メモ §2 の判定ロジックに従う：

```python
def classify_transaction(row: InvoiceCheckRow) -> Classification:
    """5 分類体系で 1 行を分類する（β2-A 確定の解釈 X：推定吸収パターン）。

    本関数は分類関数であり、フィルタ関数ではない（方針 3）。
    1 取引 = 必ず 1 Classification を返す（NONE を含む 6 値のいずれか）。
    None や空タプルは返さない。これにより:
        sum(classification_counts.values()) == total_rows
    が常に成立する。

    Args:
        row: InvoiceCheckRow（tax_code フィールドを含む β2 拡張版）。

    Returns:
        Classification の 6 値のいずれか（5 分類 + NONE）。

    Note:
        - NONE = 「課税仕入でもなく、インボイス論点の対象外」（方針 2）
          非課税・対象外・判定不要を全部 NONE に集約。
        - EXPECTED_* と NONE は別概念:
            EXPECTED_* = 分類は確定、Finding 化しないだけ（観察用に内部分類）
            NONE       = そもそも分類対象外、観察も不要
    """
    is_transitional = is_transitional_tax(row.tax_code)
    is_full_deduction = is_full_deduction_tax(row.tax_code)
    is_amount_over_threshold = row.debit_amount >= AMOUNT_THRESHOLD
    is_partner_unknown = (row.partner == "")

    # partner 不明の推定吸収パターン（解釈 X）
    if is_partner_unknown:
        if is_full_deduction and is_amount_over_threshold:
            return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        elif is_transitional and is_amount_over_threshold:
            return Classification.PARTNER_UNKNOWN
        else:
            return Classification.NONE

    # 通常の 4 象限分類
    if row.is_qualified_invoice and is_transitional:
        return Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
    elif (not row.is_qualified_invoice) and is_full_deduction and is_amount_over_threshold:
        return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
    elif row.is_qualified_invoice and is_full_deduction:
        return Classification.EXPECTED_FULL_DEDUCTION_TAX
    elif (not row.is_qualified_invoice) and is_transitional:
        return Classification.EXPECTED_TRANSITIONAL_TAX
    else:
        return Classification.NONE
```

### §5.3 β1 ロジックの削除

#### 削除してよい

```python
# 削除対象
def find_candidates(rows: Iterable[InvoiceCheckRow]) -> list[InvoiceCheckRow]: ...
TAXABLE_PURCHASE_PREFIXES = ("課対仕入", "課税仕入")
def is_taxable_purchase(tax_label: str) -> bool: ...
```

#### 残す

```python
# 残す
AMOUNT_THRESHOLD = Decimal("200000")
@dataclass(frozen=True)
class InvoiceCheckRow:  # tax_code 追加で改変、ただし型名は維持
```

#### `__all__` の更新

`__all__` から削除した 3 つを除き、新規追加分（Classification、classify_transaction、is_transitional_tax、is_full_deduction_tax、TRANSITIONAL_TAX_CODES、FULL_DEDUCTION_TAX_CODES）を追加：

```python
__all__ = [
    "AMOUNT_THRESHOLD",
    "TRANSITIONAL_TAX_CODES",
    "FULL_DEDUCTION_TAX_CODES",
    "Classification",
    "InvoiceCheckRow",
    "is_transitional_tax",
    "is_full_deduction_tax",
    "classify_transaction",
]
```

### §5.4 設計思想（β2-A メモ §3 を実装に反映）

- **判定は止めない**：partner 不明でも tax 分類で判定できるなら吸収する
- **推定して前に進める**：partner 不明 × 通常課税仕入 × 20 万以上は nonqualified_but_full_deduction_tax として扱う
- **判定ロジックは「壊れないこと」を最優先**：tax_code 単独判定、文字列比較は使わない

### §5.5 クラスタ A 完了条件

- [ ] schema.py に Classification Enum 追加
- [ ] schema.py の InvoiceCheckRow に tax_code フィールド追加
- [ ] run.py に TRANSITIONAL_TAX_CODES / FULL_DEDUCTION_TAX_CODES 定義
- [ ] run.py に is_transitional_tax / is_full_deduction_tax / classify_transaction 実装
- [ ] run.py から find_candidates / TAXABLE_PURCHASE_PREFIXES / is_taxable_purchase を削除
- [ ] `__all__` 更新
- [ ] 単体テスト：5 分類すべての判定ケースが pytest で確認できる
- [ ] 既存 28 テスト（β2-A メモ §6.1 の意図分析対象）の取り扱いは**クラスタ B で書き換え**、クラスタ A 段階では一旦コメントアウトまたは skipped で OK

**クラスタ A 完了 + GO 取得まで、クラスタ B には進まない。**

---

## §6. クラスタ B（fetch 改修 + CLI 変更 + テスト総入れ替え + 実データ検証）

### §6.1 _normalize_deals の改修

#### B-1. tax_code 取得の追加

既存の `_normalize_deals(deals_json, partners_map, taxes_map) -> list[InvoiceCheckRow]` を改修：

```python
def _normalize_deals(deals_json, partners_map, taxes_map):
    rows = []
    for deal in deals_json.get("deals", []):
        for detail in deal.get("details", []):
            tax_code = detail.get("tax_code")  # ← β2 で追加
            # ... 既存の partner / tax_label / debit_amount などの取得 ...
            row = InvoiceCheckRow(
                wallet_txn_id=f"{deal['id']}-{detail['id']}",
                # ... 既存フィールド ...
                tax_code=tax_code,  # ← β2 で追加
            )
            rows.append(row)
    return rows
```

注意：`tax_code` は deals レスポンスの `details[].tax_code` から取得する。β1 のときは `tax_label` を `taxes_map` 経由で文字列化していたが、β2 では tax_code そのものを保持する（tax_label もそのまま維持）。

### §6.2 run.py CLI 出力の変更

#### B-2. classification_counts と findings の構造変更

β1 の出力 JSON：
```json
{
  "status": "ok",
  "candidates_count": 12,
  "findings": [...]
}
```

β2-B の出力 JSON：
```json
{
  "status": "ok",
  "exit_code": 0,
  "company_id": 3525430,
  "mode": "target_month_cumulative",
  "period_start": "2025-04-01",
  "period_end": "2025-12-31",
  "target_month": "2025-12",
  "single_month": false,
  "rule_code": "V1-3-20",
  "scope": {"deals": true, "manual_journals": false},
  "classification_counts": {
    "qualified_but_transitional_tax": 3,
    "nonqualified_but_full_deduction_tax": 5,
    "partner_unknown": 1,
    "expected_transitional_tax": 10,
    "expected_full_deduction_tax": 50,
    "none": 100
  },
  "findings_count": 9,
  "findings": [
    {
      "severity": "warning",
      "rule_code": "V1-3-20",
      "message": "...",
      "wallet_txn_id": "...",
      "raw": { ... }
    }
  ]
}
```

#### B-3. classification を Finding に組み込まない（β2-C スコープ）

**重要**：β2-B では `findings` 配列の構造は β1 と同じまま。`classification` フィールドを Finding に追加するのは β2-C スコープ。

β2-B での Finding 化対象：
- `classify_transaction(row)` の結果が以下 3 つのいずれかなら Finding 化：
  - `QUALIFIED_BUT_TRANSITIONAL_TAX`
  - `NONQUALIFIED_BUT_FULL_DEDUCTION_TAX`
  - `PARTNER_UNKNOWN`
- 他 3 つ（EXPECTED_*、NONE）は Finding 化しない（観察用に classification_counts には含む）

#### B-4. checker.py との結線

β2-B では `checker.py` を改修しない。`to_findings(rows)` の入力が **`InvoiceCheckRow` の Finding 化対象 3 分類のリスト**になるよう、run.py 側で事前にフィルタリングする：

```python
# run.py 内（疑似コード）
classified = [(row, classify_transaction(row)) for row in normalized_rows]
classification_counts = collections.Counter(c.value for _, c in classified)

# Finding 化対象（3 分類のみ）
finding_target_rows = [
    row for row, c in classified
    if c in {
        Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
        Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        Classification.PARTNER_UNKNOWN,
    }
]
findings = to_findings(finding_target_rows)  # checker.py の既存関数
```

→ checker.py の `to_findings` は β1 のまま、message も β1 のまま（β2-C で改修）。

### §6.3 既存 5 テストの書き換え（β2-A メモ §6.1 のマッピング）

β2-A メモで確定した意図継承マッピング：

| 既存テスト | β2 での扱い | 書き換え後の意図 |
|---|---|---|
| `test_all_three_conditions_met` | **書き換え** | 5 分類のうち nonqualified_but_full_deduction_tax の正常パス |
| `test_qualified_invoice_excluded` | **書き換え** | 適格 × 通常課税仕入 → expected_full_deduction_tax<br>適格 × 経過措置 → qualified_but_transitional_tax |
| `test_non_taxable_purchase_excluded` | **継承** | 非課税仕入は 5 分類のいずれにも該当しない（NONE） |
| `test_amount_threshold_boundary` | **継承** | パターン②と partner_unknown の 20 万円境界 |
| `test_mixed_rows_preserve_order` | **継承** | classify_transaction のリスト処理での順序保持 |

「継承」は意図のみ継承。テスト関数名・assert 文は新分類体系に合わせて書き直す。

### §6.4 新規テスト追加

#### TestClassifyTransaction（5 分類すべて）

- `test_qualified_but_transitional_tax`
- `test_nonqualified_but_full_deduction_tax_over_threshold`
- `test_nonqualified_but_full_deduction_tax_under_threshold`（NONE になる）
- `test_partner_unknown_with_transitional_tax_over_threshold`
- `test_partner_unknown_with_full_deduction_tax_over_threshold`（推定吸収で nonqualified_but_full_deduction_tax）
- `test_partner_unknown_under_threshold`（NONE になる）
- `test_partner_unknown_other_tax`（NONE になる）
- `test_expected_full_deduction_tax`（適格 × 通常課税仕入）
- `test_expected_transitional_tax`（非適格 × 経過措置）

#### TestTransitionalTaxBoundary

- `test_tax_code_183_is_transitional`（範囲下限）
- `test_tax_code_230_is_transitional`（範囲上限）
- `test_tax_code_182_is_not_transitional`（範囲外）
- `test_tax_code_231_is_not_transitional`（範囲外）
- `test_tax_code_none_is_not_transitional`

#### TestFullDeductionTaxBoundary（クラスタ 0 GO 後の範囲で）

- 同様に境界テスト 3〜5 件

#### TestAmountThresholdInClassification

- `test_amount_threshold_pattern2`（200,000 円ちょうどでパターン②に分類）
- `test_amount_threshold_pattern2_under`（199,999 円で NONE）
- `test_amount_threshold_partner_unknown_transitional`（partner 不明 × 経過措置 × 20 万境界）

#### TestEndToEndClassificationCounts

- 5 分類すべてが含まれる deals JSON を入力に、`classification_counts` が正しく出ることを end-to-end で確認

### §6.5 削除する既存テスト

- なし。既存 5 テスト（TestInvoiceCandidatesAlpha）は**書き換え**で対応。クラス名は `TestClassifyTransactionLegacyIntents` 等に変更してよい（任意、必須ではない）。

### §6.6 既存 23 テスト（β1 新規追加分）の扱い

β1 で追加した以下のテスト群は、**書き換え不要**で通る想定：

- `TestInvoiceCheckContext`（4 件、context は変わらない）
- `TestCliArgValidation`（9 件、CLI 引数は変わらない）
- `TestMissingFiles`（1 件、missing_files プロトコルは変わらない）
- `TestNormalizeDeals`（9 件、tax_code フィールド追加で**書き換え必要**）
- `TestFindingConversion`（9 件、checker.py 不変なので通る）
- `TestExitZeroEndToEnd`（2 件、出力 JSON 構造変更で**書き換え必要**）

→ **書き換え必要：TestNormalizeDeals（9 件）、TestExitZeroEndToEnd（2 件）**
→ **書き換え不要：TestInvoiceCheckContext（4 件）、TestCliArgValidation（9 件）、TestMissingFiles（1 件）、TestFindingConversion（9 件）**

### §6.7 実データ検証（K4 案 Z 確定）

#### 検証対象

**3525430 / 2025-12 のみ**。3 社観察は β2-D で実施。

#### 検証コマンド

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id 3525430 --target-month 2025-12
```

#### 検証観点

- exit 0 で正常終了
- stdout に `"status": "ok"` の JSON
- `classification_counts` の 6 キー（5 分類 + none）すべてが出力される
- `findings_count` が 3 分類（QUALIFIED_BUT_TRANSITIONAL_TAX + NONQUALIFIED_BUT_FULL_DEDUCTION_TAX + PARTNER_UNKNOWN）の合計と一致
- **`classification_counts` の合計が deals 件数（`_normalize_deals` の出力件数）と一致**（§5.2 A-4 方針 3「必ず 1 つ返す」の担保）

→ 不一致なら方針 3 違反。即報告レベル A。

**重要**：件数の妥当性は β2-D で評価する。β2-B では **「正しく動いているか」のみ** 確認。0 件でも多すぎてもエラーにしない（ただし合計件数の整合性は必ずチェック）。

### §6.8 クラスタ B 完了条件

- [ ] _normalize_deals に tax_code 取得追加
- [ ] run.py CLI 出力に classification_counts 反映
- [ ] checker.py への結線（finding_target_rows の事前フィルタリング）
- [ ] 既存 5 テスト（TestInvoiceCandidatesAlpha）の意図継承書き換え
- [ ] TestNormalizeDeals（9 件）の書き換え（tax_code 追加対応）
- [ ] TestExitZeroEndToEnd（2 件）の書き換え（出力 JSON 構造変更対応）
- [ ] TestClassifyTransaction（9〜10 件）の追加
- [ ] TestTransitionalTaxBoundary（5 件）の追加
- [ ] TestFullDeductionTaxBoundary（3〜5 件）の追加
- [ ] TestAmountThresholdInClassification（3 件）の追加
- [ ] TestEndToEndClassificationCounts（1 件）の追加
- [ ] 全テスト通過（既存 28 - 削除 0 + 書き換え + 新規追加）
- [ ] 実データ検証（3525430 / 2025-12）で classification_counts 出力確認
- [ ] 完了報告に classification_counts のサマリ + 分類別サンプル含める（後述 §7）

---

## §7. 完了報告フォーマット（K5 案 2 確定）

クラスタ B 完了時の報告には**分類別サンプル**を必須で含める。

### §7.1 報告必須項目

```md
## クラスタ B 完了

### 影響ファイル
| ファイル | 種別 |
|---|---|
| schema.py | 改変（Classification 追加 + InvoiceCheckRow に tax_code 追加） |
| run.py | 改変（β1 削除 + 5 分類実装 + _normalize_deals 改修 + CLI 出力変更） |
| checker.py | 不変 |
| tests/unit/test_invoice_registration_status.py | 改変（書き換え + 新規追加） |
| .claude/skills/.../SKILL.md | 不変（β2-C で改修判断） |

### テスト結果
全 {N} tests passed
- 書き換え: TestInvoiceCandidatesAlpha 5 件、TestNormalizeDeals 9 件、TestExitZeroEndToEnd 2 件 = 16 件
- 新規追加: TestClassifyTransaction、TestTransitionalTaxBoundary、TestFullDeductionTaxBoundary、TestAmountThresholdInClassification、TestEndToEndClassificationCounts = {M} 件
- 不変通過: TestInvoiceCheckContext 4 件、TestCliArgValidation 9 件、TestMissingFiles 1 件、TestFindingConversion 9 件 = 23 件

### 実データ検証結果（3525430 / 2025-12）

#### classification_counts
- qualified_but_transitional_tax: {N} 件
- nonqualified_but_full_deduction_tax: {N} 件
- partner_unknown: {N} 件
- expected_transitional_tax: {N} 件
- expected_full_deduction_tax: {N} 件
- none: {N} 件
- 合計: {N} 件 = deals details 件数 {N} と一致

#### findings_count
- {N} 件（3 分類の合計）

#### 分類別サンプル（各 1 件、Finding 化しない 2 分類も観察用に必須）

##### qualified_but_transitional_tax（Finding 化）
```json
{
  "wallet_txn_id": "...",
  "raw": { "qualified_invoice_issuer": true, "tax_label": "課対仕入（控80）10%", "tax_code": ..., "debit_amount": "...", "partner": "...", ... }
}
```

##### nonqualified_but_full_deduction_tax（Finding 化）
（同様、サンプル 1 件）

##### partner_unknown（Finding 化）
（同様、サンプル 1 件）

##### expected_transitional_tax（Finding 化しない、観察用）
（同様、サンプル 1 件）

##### expected_full_deduction_tax（Finding 化しない、観察用）
（同様、サンプル 1 件）

### 確認事項
- β2-A メモ §1〜§6 の方針との整合
- β1 削除対象（find_candidates / TAXABLE_PURCHASE_PREFIXES / is_taxable_purchase）の削除確認
- AMOUNT_THRESHOLD / InvoiceCheckRow（型名）の維持確認
- checker.py / SKILL.md / β1 の他テスト（不変対象）の保持確認

### 想定外論点（あれば）
- {内容、レベル A 即時報告 / レベル B 後で相談}
```

---

## §8. 禁止事項（β2-B で守ること）

### 禁止リスト

1. **manual_journals に手を出さない**（β2-D で判断）
2. **Finding 構造の classification 組み込みをしない**（β2-C スコープ）
3. **Finding の message 改修をしない**（β2-C スコープ）
4. **FindingGroup を作らない**（β2-C 以降）
5. **Excel exporter に手を出さない**（β3 以降）
6. **SKILL.md を改訂しない**（β2-C で改訂判断）
7. **checker.py を改修しない**（β2-C スコープ）
8. **削除対象以外の β1 公開 API に手を出さない**：
   - **削除してよい**：`find_candidates`, `TAXABLE_PURCHASE_PREFIXES`, `is_taxable_purchase`
   - **残す**：`AMOUNT_THRESHOLD`, `InvoiceCheckRow`（型名・既存フィールド）
9. **PROJECT_ROOT 環境変数機構を壊さない**（β1 クラスタ B で導入、テスト都合）
10. **推測で tax_code 範囲を固定しない**（クラスタ 0 で現物確認）
11. **クラスタ 0 GO 取得前に classify_transaction の実装に着手しない**
12. **件数妥当性の議論をしない**（β2-D 観察フェーズ）
13. **3 社検証をしない**（β2-D で実施、β2-B では 3525430 のみ）
14. **想定外論点を独断で進めない**（運用原則 12）
15. **β2-A メモの方針を変更しない**（変更したい場合はレベル A 報告）

### β1 公開 API の削除明示

```md
削除してよい：
- find_candidates
- TAXABLE_PURCHASE_PREFIXES
- is_taxable_purchase

残す：
- AMOUNT_THRESHOLD
- InvoiceCheckRow（型名は維持、tax_code フィールドのみ追加）
```

---

## §9. 段階的進行ルール（最重要）

### 各クラスタ完了ごとに停止して報告

- クラスタ 0 完了 → 報告 → 戦略 Claude のレビュー → 「GO」が出てから次へ
- クラスタ A 完了 → 報告 → レビュー → 「GO」
- クラスタ B 完了 → 報告 → レビュー → β2-B 完了確認

**勝手に次のクラスタに進まない**。各クラスタの完了報告で必ず一旦停止する。

### 想定外論点が出たとき

実装中に以下のような事象に遭遇したら、独断で進めず即時報告（レベル A）：

- 通常課税仕入の tax_code が 3 社で一致しない
- マスタに無い tax_code の deals が出てきた（β2-A メモ §4.2 持ち越し論点）
- 既存テストの書き換えが「意図継承」では不十分
- β2-A メモの方針と現物が食い違う
- スコープ外の処理を入れたくなる気持ちが湧いた

→ 独断で進めず、報告して指示を仰ぐ。

---

## §10. 既存ファイルと変更点まとめ

### 新設ファイル

なし（β2-B では新設なし、β2-C で必要なら新設判断）

### 改変ファイル

| ファイル | 改変内容 |
|---|---|
| `schema.py` | Classification Enum 追加 + InvoiceCheckRow に tax_code 追加 |
| `run.py` | β1 削除（3 件）+ 経過措置判定ヘルパー追加 + classify_transaction 追加 + _normalize_deals 改修 + CLI 出力に classification_counts 追加 |
| `tests/unit/test_invoice_registration_status.py` | 書き換え（既存 5 + TestNormalizeDeals 9 + TestExitZeroEndToEnd 2 = 16 件）+ 新規追加（{M} 件） |

### 不変ファイル

| ファイル | 理由 |
|---|---|
| `checker.py` | β2-C スコープ |
| `.claude/skills/check-invoice-registration-status/SKILL.md` | β2-C スコープ |
| 既存テストの一部（TestInvoiceCheckContext, TestCliArgValidation, TestMissingFiles, TestFindingConversion） | β2-B で構造変更ない |

---

## §11. 末尾強調（最重要事項の再掲）

> **β2-B は判定ロジックの全面置き換え。β1 の 3 条件 AND は削除し、5 分類体系で deals だけ動かす最小経路を通す。**

- manual_journals は β2-D / β2-E、Excel は β3 以降
- 件数判断は β2-D、β2-B では「正しく動いているか」だけ見る
- 3 社検証は β2-D、β2-B では 3525430 のみ
- 想定外論点が出たら独断で進めない（運用原則 12）
- 困ったら戦略 Claude / 悠皓さんに確認（運用原則 15: GO フロー × 原則 6）
- 各クラスタ完了で必ず停止して報告

---

## §12. β2-B から β2-C への申し送り（β2-B 完了時に整理）

β2-B 完了報告を受けて、β2-C で必要な作業：

1. **Finding 構造への classification フィールド追加**
2. **message を classification 別に書き分け**（修正アクションが読み取れる文言）
3. **raw に判断材料を残す**（qualified_invoice_issuer / tax_code / tax_label / debit_amount 等）
4. **FindingGroup 設計（または最小実装）**
5. **SKILL.md 改訂判断**

これらは **β2-B 完了報告時のサンプル**を見て判断する。

---

## §13. では、クラスタ A から開始してください

### 最初のアクション

1. β2-A メモ（`V1-3-20_beta2_A_data_structure_policy.md`）を view で確認（必須）
2. §4 を **参考記録として** 確認（クラスタ 0 確定事項、特に §4.0.4 と §4.0.5）
3. クラスタ A：schema 拡張 → classify_transaction 実装 → β1 削除
4. §5.5 の完了条件チェックリストに沿って報告

**クラスタ A 完了 + GO 取得まで、クラスタ B の実装には着手しないでください。**

完了報告をお待ちしています。
