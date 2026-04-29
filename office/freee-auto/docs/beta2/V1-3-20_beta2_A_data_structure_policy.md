# V1-3-20 β2 データ構造方針メモ（β2-A 成果物）

**作成日**: 2026-04-27
**位置づけ**: β2-A（データ構造統合方針）の最終成果物。β2-B 着手前の意思決定基盤。
**前提**: β1 完結状態（39 tests passed、3525430/2025-12 で 12 件抽出）+ β2 全体ロードマップ承認済み

---

## §0. このメモの目的

β2-B 以降で迷わなくて済むよう、β2 全体を貫く設計判断を**この時点ですべて確定**させる。

このメモは：

- ✅ β2 の方針を確定する設計書
- ❌ 実装指示書ではない
- ❌ Claude Code に直接渡すプロンプトではない

β2-B 着手時に、別途**β2-B 実装指示書**を作成する。

---

## §1. β2-A の 4 論点と確定事項

### 論点 1：find_candidates 置き換え方針

**確定**: 案 A（完全置き換え）

| 観点 | 確定内容 |
|---|---|
| `find_candidates(rows)` | β2 で削除（書き換えではなく削除） |
| 新ロジック | `classify_transaction(row, tax_master) -> Classification` を新規実装 |
| β1 既存 5 テスト（TestInvoiceCandidatesAlpha） | テスト意図を継承、機械的削除/維持はしない |
| β1 import 互換性 | 破壊する（β2 では `from .run import find_candidates` は通らない） |

#### β1 定数群の扱い

| 定数 / 関数 | 扱い | 理由 |
|---|---|---|
| `AMOUNT_THRESHOLD = Decimal("200000")` | **残す** | パターン②と partner_unknown で使用 |
| `TAXABLE_PURCHASE_PREFIXES` | **削除** | β2 では tax_code 判定のため不要 |
| `is_taxable_purchase(tax_label)` | **削除** | 同上 |

#### 方針文（β2-A 確定）

> β1 での「α 既存資産を改変しない」は β1 内の安全装置であり、β2 以降に永続適用しない。
> β2 では、旧 3 条件 AND ロジックを 5 分類ロジックに置き換える。
> ただし、既存テストの「**意図**」は可能な限り継承する。

---

### 論点 2：経過措置コード判定方式

**確定**: 案 2 単独（`tax_code` 数値での判定）

#### 確定根拠（3 社現物確認の結果）

3 社（3525430 / 12243357 / 10794380）で確認：

| 観点 | 結果 |
|---|---|
| `tax_code` の連続範囲 | **183〜230** に経過措置コード 48 個が連番配置 |
| 3 社間の `tax_code` 一致 | **完全一致**（同じ code は同じ意味） |
| `name_ja` 表記揺れ | あり（10794380 だけ半角括弧 `(控80)`） |
| マスタフラグ（is_transitional 等） | **存在しない**（案 3 は実行不可） |

#### 判定ロジックの構造

```python
TRANSITIONAL_TAX_CODES = frozenset(range(183, 231))  # 183〜230

def is_transitional_tax(tax_code: int | None) -> bool:
    if tax_code is None:
        return False
    return tax_code in TRANSITIONAL_TAX_CODES

def is_full_deduction_tax(tax_code: int | None) -> bool:
    """通常課税仕入かの判定。経過措置以外で課税仕入系のもの。"""
    # 詳細は β2-B で確定（freee の課税仕入系コード範囲を別途調査）
    ...
```

#### 設計思想（確定）

> **判定ロジックは「壊れないこと」を最優先**
> - tax_code ベース → 壊れにくい
> - 文字列 → 壊れる
> - マスタフラグ → 存在しない
> 👉 だから案 2 一択

#### 案 1（tax_label 文字列）併用しない理由

「判定はシンプルに、検知は別でやる」原則に従う。tax_code で判定し、文字列での交差検証は責務分離違反。マスタ不整合検知は**別問題**として扱う。

#### 持ち越し論点（β2-B で決定）

- **マスタに無い code の deals が出てきた場合の扱い**：
  - 10794380 のマスタは経過措置コードが 12 件（3 社中 2 社は 48 件）
  - 8% 軽減税率系の控80/50 や共対仕入の控80/50 が抜けている
  - β2-B で実データを見てから判定（独断で β2-A では決めない）

---

### 論点 3：InvoiceCheckRow 拡張要否

**確定**: `tax_code: int | None = None` のみ追加

#### 拡張内容

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

#### 追加しないフィールドと理由

| 候補 | 理由 |
|---|---|
| `partner_id: int \| None` | β1 で partner 文字列空判定が機能している。Q3' 解釈 X（推定吸収）と整合 |
| `account_item_id: int` | 5 分類判定に不要。β2-D 観察 / β2-E Excel で必要なら別途追加 |
| `account_item_name: str` | 同上 |
| `tax_rate: Decimal` | 5 分類に不要 |

#### 設計理由

- β1 の InvoiceCheckRow は全フィールド default 付き → **設計の一貫性**
- `tax_code: int | None = None` で **manual_journals 追加時の柔軟性確保**（β2-D で source 別の tax_code 取得）
- 型名は `InvoiceCheckRow` のまま維持（β2 でも「インボイスチェック用の行」という意味は変わらない）

#### 方針文（β2-A 確定）

> β2 の 5 分類判定に必要な最小拡張として、InvoiceCheckRow には `tax_code` のみ追加する。
> partner_id や account_item 情報は、β2-B/C の判定には不要なため追加しない。
> 必要になった場合は、β2-D 以降の観察・Excel 統合設計で別途判断する。

---

### 論点 4：manual_journals

**確定**: 案 Y（段階的アプローチ）

#### スコープ

| フェーズ | manual_journals 対応 |
|---|---|
| **β2-B（経過措置ロジック実装）** | ❌ deals のみ |
| **β2-C（Finding/FindingGroup 整備）** | ❌ deals のみ |
| **β2-D（3 社観察）** | 🔄 観察結果次第で追加判断 |
| **β2-E（Excel 統合直前仕様）** | ✅ **仕様は manual_journals 込みで設計**（実装はせず） |

#### 各フェーズでの具体的扱い

##### β2-B / β2-C（deals 単体）

- 5 分類ロジックを deals だけで固める
- テストの単純さを保つ（V1-3-10 が辿った Step 3-A 以前のパターン）
- `source: str` は β1 同様 "deal" 固定

##### β2-D（観察フェーズで判断）

- 3 社（または 4 社）の deals 観察結果を見てから、manual_journals 必要性を判断
- 必要と判断したら、β2-D 着手時に Claude Code に **manual_journals データ整備を依頼**
- 474381 の `taxes_codes.json` 未配置と併せて fetch 連鎖の可能性

##### β2-E（仕様だけ受け皿を作る）

- Excel 統合直前仕様書に manual_journals 列・行・親子構造を**設計だけ**含める
- 実装はせず（β3 で実装）
- 将来の手戻りを減らすため、仕様だけは先に受け皿を作っておく

#### 方針文（β2-A 確定）

> β2-B/C は deals 単体で 5 分類ロジックと Finding 構造を固める。
> manual_journals は β2-D の実データ観察時に必要性を判断する。
> ただし β2-E の Excel 統合直前仕様では、将来 manual_journals を載せられる前提で受け皿を設計する。

---

## §2. 5 分類体系（β2 全体共通、再確認）

ロードマップ §3 で確定した内容の再掲。β2-B 実装時の参照基準。

### 5 分類

| # | 分類コード | 条件 | severity | Finding 化 |
|---|---|---|---|---|
| ① | `qualified_but_transitional_tax` | 適格 × 経過措置 | warning | ✅ する |
| ② | `nonqualified_but_full_deduction_tax` | 非適格 × 通常課税仕入 × 20 万以上 | warning | ✅ する |
| ③ | `partner_unknown` | partner 不明 × 経過措置 × 20 万以上 | warning | ✅ する |
| ④ | `expected_transitional_tax` | 非適格 × 経過措置 | — | ❌ しない（観察用に内部分類） |
| ⑤ | `expected_full_deduction_tax` | 適格 × 通常課税仕入 | — | ❌ しない（観察用に内部分類） |

### 判定ロジック（疑似コード、解釈 X：推定吸収パターン）

```python
def classify_transaction(row: InvoiceCheckRow) -> Classification:
    is_transitional = is_transitional_tax(row.tax_code)
    is_full_deduction = is_full_deduction_tax(row.tax_code)
    is_amount_over_threshold = row.debit_amount >= AMOUNT_THRESHOLD
    is_partner_unknown = (row.partner == "")  # partners_map 未紐付けで partner 空文字

    # partner 不明の推定吸収パターン
    if is_partner_unknown:
        if is_full_deduction and is_amount_over_threshold:
            return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        elif is_transitional and is_amount_over_threshold:
            return Classification.PARTNER_UNKNOWN
        else:
            return Classification.NONE  # 観察のみ、Finding 化しない

    # 通常の 4 象限分類
    if row.is_qualified_invoice and is_transitional:
        return Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
    elif (not row.is_qualified_invoice) and is_full_deduction and is_amount_over_threshold:
        return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
    elif row.is_qualified_invoice and is_full_deduction:
        return Classification.EXPECTED_FULL_DEDUCTION_TAX  # 内部分類のみ
    elif (not row.is_qualified_invoice) and is_transitional:
        return Classification.EXPECTED_TRANSITIONAL_TAX  # 内部分類のみ
    else:
        return Classification.NONE  # 該当なし
```

**重要**: partner 不明分岐を最優先しない。partner 不明でも tax 分類で判定できるなら吸収する（解釈 X）。

---

## §3. β2 設計思想（β2 全体を貫く判断軸）

ロードマップ §1 + 本セッションでの追加判断を統合。

### 3.1 業務フロー観点

- レビューは「**同時に見る**」もの（順番ではなく）
- description に情報があるなら **判定を止めない**
- 実務上ほしいのは「**修正アクション**」
- partner_unknown は「例外」ではなく「**補助情報**」

### 3.2 一言まとめ

- **判定は止めない**
- **推定してでも前に進める**
- **修正アクションを出す**

### 3.3 実装思想

- **判定ロジックは「壊れないこと」を最優先**
- **責務分離を守る**（判定はシンプルに、検知は別でやる）
- **YAGNI 原則**（必要最小限以上のスコープを先に決めない）

---

## §4. β2-B 着手前の準備事項

β2-B 実装指示書を作る前に、以下を確認・準備しておく。

### 4.1 確認済み（β2-A で確定）

- ✅ 5 分類体系
- ✅ partner 不明の解釈 X（推定吸収）
- ✅ 経過措置コード判定方式（tax_code 範囲 183〜230）
- ✅ InvoiceCheckRow 拡張内容（tax_code 追加）
- ✅ find_candidates 完全置き換え方針
- ✅ β1 既存テストの扱い（意図継承）
- ✅ β1 定数群の整理方針

### 4.2 β2-B で確定する持ち越し論点

- 🔄 通常課税仕入の `tax_code` 範囲（freee の課税仕入系コード範囲を別途調査）
- 🔄 マスタに無い `tax_code` の deals が出てきた場合の扱い（実データ観察）
- 🔄 `_normalize_deals()` で `tax_code` フィールド追加の最小差分

### 4.3 β2-D で確定する持ち越し論点

- 🔄 manual_journals の必要性（実データ観察次第）
- 🔄 474381 のデータ整備（必要なら fetch）
- 🔄 account_item_id / account_item_name の追加要否（観察結果次第）

### 4.4 β2-E で確定する持ち越し論点

- 🔄 V1-3-10 レポートとの統合方式
- 🔄 親子行構造（partner / classification / partner × classification のどれを単位とするか）
- 🔄 Excel での severity 色分け（V1-3-10 の 4 色帯と整合）

---

## §5. β1 から β2 への変更点まとめ

β2-B 実装指示書を作る際の**差分確認用**。

### 削除されるもの

```python
# 削除
TAXABLE_PURCHASE_PREFIXES = ("課対仕入", "課税仕入")
def is_taxable_purchase(tax_label: str) -> bool: ...
def find_candidates(rows: Iterable[InvoiceCheckRow]) -> list[InvoiceCheckRow]: ...
```

### 追加されるもの

```python
# 追加
TRANSITIONAL_TAX_CODES = frozenset(range(183, 231))  # 経過措置コード範囲
FULL_DEDUCTION_TAX_CODES = frozenset(...)  # 通常課税仕入コード範囲（β2-B で確定）

def is_transitional_tax(tax_code: int | None) -> bool: ...
def is_full_deduction_tax(tax_code: int | None) -> bool: ...
def classify_transaction(row: InvoiceCheckRow) -> Classification: ...

class Classification(Enum):
    QUALIFIED_BUT_TRANSITIONAL_TAX = "qualified_but_transitional_tax"
    NONQUALIFIED_BUT_FULL_DEDUCTION_TAX = "nonqualified_but_full_deduction_tax"
    PARTNER_UNKNOWN = "partner_unknown"
    EXPECTED_TRANSITIONAL_TAX = "expected_transitional_tax"
    EXPECTED_FULL_DEDUCTION_TAX = "expected_full_deduction_tax"
    NONE = "none"
```

### 変更されるもの

```python
# 変更（フィールド追加）
@dataclass(frozen=True)
class InvoiceCheckRow:
    # ... 既存 8 フィールド ...
    tax_code: int | None = None  # ← 追加
```

### 維持されるもの

```python
# 維持
AMOUNT_THRESHOLD = Decimal("200000")
@dataclass(frozen=True)
class InvoiceCheckRow: ...  # 型名・既存フィールドは維持
```

---

## §6. テスト戦略（β2-B 着手時の指針）

β1 既存テストの「意図継承」方針に従い、以下のように扱う。

### 6.1 既存 5 テスト（TestInvoiceCandidatesAlpha）の意図分析

| 既存テスト | 意図 | β2 での扱い |
|---|---|---|
| `test_all_three_conditions_met` | 3 条件 AND の正常パス | **書き換え**：5 分類のうち nonqualified_but_full_deduction_tax の正常パスへ |
| `test_qualified_invoice_excluded` | 適格事業者の除外 | **書き換え**：適格 × 通常課税仕入 → expected_full_deduction_tax（内部分類のみ）<br>適格 × 経過措置 → qualified_but_transitional_tax（Finding 化） |
| `test_non_taxable_purchase_excluded` | 非課税仕入の除外 | **継承**：非課税仕入は 5 分類のいずれにも該当しない（NONE） |
| `test_amount_threshold_boundary` | 20 万円境界 | **継承**：パターン②と partner_unknown で同じ閾値が効く |
| `test_mixed_rows_preserve_order` | 順序保持 | **継承**：classify_transaction のリスト処理でも順序保持を保証 |

### 6.2 新規テスト（β2-B で追加）

- 5 分類それぞれの判定ケース（5 ケース）
- partner 不明 4 ケース（推定吸収パターン）
- 境界値（20 万円ちょうど、経過措置コード 183 / 230 の境界）
- 経過措置コード判定ヘルパーの単体テスト
- マスタに無い tax_code の扱い（β2-B で確定後）

---

## §7. β2-A 完了状態

### 完了チェックリスト

- [x] 論点 1 確定（find_candidates 完全置き換え）
- [x] 論点 2 確定（tax_code 単独判定、範囲 183〜230）
- [x] 論点 3 確定（tax_code フィールド追加）
- [x] 論点 4 確定（manual_journals は段階的、案 Y）
- [x] 5 分類体系の最終確認
- [x] β2 設計思想の文書化
- [x] β2-B 着手前の準備事項リスト
- [x] β1 から β2 への変更点まとめ
- [x] テスト戦略の指針

### β2-A 成果物

このメモ自体（`V1-3-20_beta2_A_data_structure_policy.md`）が β2-A の成果物。

### 次のステップ

**β2-B 実装指示書の作成**へ進む。

---

## §8. β2-B への申し送り事項

β2-B 実装指示書を作成する際に**必ず引用する**べき内容：

1. **§1 論点 1**：find_candidates 削除・classify_transaction 新規・既存テスト意図継承
2. **§1 論点 2**：tax_code 範囲 183〜230 を `TRANSITIONAL_TAX_CODES` 定数化
3. **§1 論点 3**：InvoiceCheckRow への `tax_code: int | None = None` 追加
4. **§1 論点 4**：β2-B は deals のみ、manual_journals は β2-D で判断
5. **§2 5 分類体系の判定ロジック疑似コード**
6. **§3 β2 設計思想**
7. **§4.2 β2-B で確定する持ち越し論点 3 件**
8. **§5 β1 から β2 への変更点**
9. **§6 既存 5 テストの意図継承マッピング**

---

## §9. 想定外論点（β2-A で発見された記録）

### 9.1 10794380 のマスタ部分集合

3 社現物確認で発見：

> 10794380 のマスタは経過措置コードが 12 件しか存在しない（3525430 / 12243357 は 48 件）。8% 軽減税率系の控80/50 や共対仕入の控80/50 が抜けている。

これは β2-B で「マスタに無い tax_code の deals が出てきた場合の扱い」として持ち越し（§4.2）。

### 9.2 freee コード体系変更リスク

- 案 2（tax_code 判定）は freee がコード体系を変更すると壊れる
- 案 1 併用しないことで「壊れないこと最優先」原則に従う
- 万一壊れたときは別 Skill「マスタ不整合検知」として扱う

---

## §10. このメモの位置づけ（再確認）

- ✅ β2-A の最終成果物
- ✅ β2-B 実装指示書の引用元
- ✅ β2-D / β2-E でも参照される設計判断の根拠
- ❌ Claude Code に渡すプロンプトではない
- ❌ 実装指示書ではない

β2-B 実装指示書は別途作成する。
