# V1-3-20 β2-D L1-A 実装指示書

**作成日**: 2026-04-29
**対象**: V1-3-20 β2-D L1-A（observations 拡張）
**前提**: V1-3-20 β2-C 完結（パターン A 確定、3 社観察完了、119 tests passed）+ L1 設計メモ確定（Q1〜Q6）+ L1 実装指示書セッションでの再定義（L1 = L1-A + L1-B 分離）
**位置付け**: Claude Code が本書を読んでそのまま実装に入れる粒度の実装指示書

---

## 文書の使い方

本書は L1-A 実装フェーズで Claude Code が参照する実装指示書です。

- **§1〜§2**：前提とスコープ（L1-A と L1-B の分離が最重要）
- **§3〜§4**：実装の中核（クラスタ分割と実装詳細）
- **§5〜§6**：テスト方針と検証手順
- **§7**：触らないもの（スコープ防衛）
- **§8**：Claude Code 実行プロンプトへの案内

実行時は別ファイル `V1-3-20_beta2_D_L1_claude_code_prompt.md` を Claude Code に投入する。本書 §1〜§7 が仕様本体であり、実行プロンプトはその要約・投入用である。

設計判断の根拠を遡る場合は、設計メモ `V1-3-20_beta2_D_L1_design_memo.md`（1097 行、確定済み）を参照する。

---

## §1. 概要と前提

### 1.1 一行サマリ

> **β2-C 構造を維持したまま、observations に `tax_code_distribution` と `source_breakdown` の 2 項目を追加する。**

### 1.2 L1 = L1-A + L1-B の分離（本指示書最重要）

L1 は当初「manual_journals 取り込み + observations 拡張 + partners_qii_cache 新設」を一括で行う想定だった。しかし L1 実装指示書セッションでの現物確認（V1-3-20 β2-C run.py 全体の view）により、以下の事実が判明した：

- 現状の β2-C は **`freee_to_context.py` / `CheckContext` を使っていない**
- 独自正規化経路（`_normalize_deals` + `InvoiceCheckRow`）で動作している
- `InvoiceCheckRow` には `raw` フィールドがなく、`raw["source"]` 構造は存在しない
- manual_journals は scope.manual_journals = false で対象外（β2-C 確定）

つまり設計メモの前提（「`freee_to_context.py` の既存経路を利用する」）を実現するには、**β2-C 実装の構造的書き換え**が必要であり、これは「観察項目を増やす」L1 の表層的目的を超えた作業規模になる。

そのため L1 を 2 段階に分離する：

| 段階 | スコープ | 状態 |
|---|---|---|
| **L1-A**（本指示書） | β2-C 構造を維持し、observations に 2 項目追加 | 本指示書で確定 |
| **L1-B**（後続タスク） | freee_to_context.py / CheckContext / TransactionRow への移行、manual_journals 取り込み、partners_qii_cache 生成 | 別タスクとして分離 |

> **本指示書は「当初設計メモをそのまま実装するもの」ではなく、現物確認により判明した β2-C 実装構造を前提に、L1 を安全に分割して実装するための指示書である。**

### 1.3 L1-A の動機

L1-A の動機は「観察できる AI」思想の**第一段階の実装**である：

- β2-C の判定構造（5 分類体系・partner_unknown_breakdown）は完全維持
- observations に 2 項目（`tax_code_distribution` / `source_breakdown`）を追加
- 既存 119 tests を壊さない
- L1-B 移行の踏み台となる構造を作る

L1-A 単独では 12243357 のような manual_journals 中心の会社で「見える会社」化は達成されない（manual_journals = 0 のため）。それは L1-B の役割。

### 1.4 設計メモとの参照関係

本指示書は設計メモ確定文（Q1〜Q6）を踏まえつつ、現物確認の結果に基づき**スコープを縮小**している。設計メモとの対応関係：

| 設計メモの確定文 | L1-A での扱い |
|---|---|
| Q1（freee_to_context.py の既存経路を利用） | **L1-B に繰り越し**（L1-A では既存 _normalize_deals を維持） |
| Q2（partners_qii_cache 案 α / 案 Y） | **L1-B に繰り越し**（L1-A では生成しない） |
| Q3（軽量見積もり：12243357 / 2025-07 課対仕入レンジ該当 0 件） | 事実として参照、L1-B 完結後の主検証社として残す |
| Q4-(a)（class_counts は合算、source_breakdown 分離） | **L1-A で実装**（ただし source_breakdown は deals 固定） |
| Q4-(b)（partner_unknown_breakdown は β2-C 構造維持） | **L1-A で維持**（既存実装そのまま） |
| Q4-(c)（層別 source 不可知） | **L1-A では既存構造の制約で部分的にのみ達成**（InvoiceCheckRow に raw["source"] が無いため） |
| Q4-(d)（observations 拡張：tax_code_distribution / source_breakdown） | **L1-A で実装**（本指示書の中核） |
| Q5 / Q6（事実確定） | 事実として参照 |

### 1.5 設計メモ §3 の原則の L1-A での適用

設計メモ §3 の 4 原則（層別 source 不可知 / source 格納場所の固定 / observations の内部構造分離 / YAGNI 段階的拡張）の L1-A での適用：

| 原則 | L1-A での適用 |
|---|---|
| 1：層別 source 不可知 | **部分適用**。InvoiceCheckRow には raw["source"] が無いため、L1-A では source 概念は source_breakdown 関数内で deals 固定として扱う。完全適用は L1-B で達成。 |
| 2：source 格納場所の固定 | **L1-B で適用**。L1-A では source 情報を持たない。 |
| 3：observations の内部構造分離（原因構造 → 表現） | **L1-A で適用**。tax_code_distribution（原因構造系）と source_breakdown（表現の補助情報）を別系統として並置。 |
| 4：YAGNI 段階的拡張 | **L1-A で徹底**。partners_qii_cache を生成しない判断、source_breakdown の引数を rows のみにする判断、すべて YAGNI に基づく。 |

#### 原則 1 についての L1-A の方針（補足）

> **L1-A では source 不可知の完成を目指さない。**
> **L1-A では source_breakdown を導入し、将来の source 不可知化に向けた観察口を作る。**

L1-A の `_calculate_source_breakdown` は deals 固定で manual_journals_rows = 0 を返す。これは「source 概念を観察層に持ち込むための器」を先に作る意味であり、L1-B で manual_journals が取り込まれた段階で source 由来の値が初めて埋まる。器を先に作っておくことで、L1-B で「観察項目を増やす」必要がなく、「値の出方が変わる」だけになる。

---

## §2. 実装スコープ

### 2.1 L1-A の実装内容（4 点）

L1-A で実装するのはこの 4 点のみ：

1. **`_calculate_tax_code_distribution(rows)` 関数を新設**（observations 用、原因構造系）
2. **`_calculate_source_breakdown(rows)` 関数を新設**（observations 用、表現の補助情報）
3. **`main()` 内で上記 2 関数を呼び出し、observations 出力 dict に追加**
4. **新規テスト 8 本（T1〜T8）を追加し、既存 119 tests passed を維持**

### 2.2 変更マップ（層別俯瞰表）

| 層 | 対象 | 種別 | 概要 |
|---|---|---|---|
| 観察層 | `run.py` の `_calculate_tax_code_distribution`（新設） | **New** | tax_code 分布を集計する純粋関数 |
| 観察層 | `run.py` の `_calculate_source_breakdown`（新設） | **New** | source 別行数を集計する純粋関数（L1-A では deals 固定） |
| 観察層 | `run.py` main 内 observations 集計呼び出し（L991〜L992 周辺） | **Modify** | 上記 2 関数の呼び出しを追加 |
| 観察層 | `run.py` main 内 出力 dict（L1025〜L1027 周辺） | **Modify** | observations dict に 2 キーを追加 |
| テスト層 | テストファイル | **New / Modify** | 新規テスト 8 本追加、既存 119 tests passed 維持 |
| 取り込み層 | `_normalize_deals` / `_build_partners_map` 等 | **No Change** | 既存 β2-C 構造を完全維持 |
| 判定層 | `classify_transaction` / `checker.py` | **No Change** | 既存 β2-C 構造を完全維持 |
| 観察層 | `_calculate_partner_unknown_breakdown`（L295〜L328） | **No Change** | β2-C 構造を完全維持 |
| 取り込み層 | `freee_to_context.py` | **No Change** | L1-A では使わない。L1-B で対応 |
| 型定義層 | `schema.py` / `InvoiceCheckRow` | **No Change** | β2-C 構造を完全維持 |

「**No Change が大半**」が L1-A の特徴。新設 2 関数 + 既存 main の 2 箇所改修のみ。

### 2.3 L1-A スコープから外す項目（L1-B または別タスク）

L1-A で扱わない項目を明示する。スコープ肥大防止のため、これらに「ついでに対応する」誘惑を排除する。

| 項目 | 扱い |
|---|---|
| `partners_qii_cache` の生成 | **L1-B**。現行 InvoiceCheckRow.is_qualified_invoice が qii 判定を完結させているため、未使用 cache の先回り作成は YAGNI 違反。 |
| `freee_to_context.py` / `CheckContext` への移行 | **L1-B**。β2-C 構造の全面置換になるため、独立タスク化。 |
| `TransactionRow` への移行（InvoiceCheckRow 廃止） | **L1-B**。型変更は判定層・テスト全体に波及するため、独立タスク化。 |
| `manual_journals` 取り込み | **L1-B**。`scope.manual_journals` は L1-A では false のまま維持。 |
| `source_breakdown.manual_journals_rows` の deals/manual_journals 由来分岐 | **L1-B**。L1-A では固定で 0。 |
| `raw["source"]` フィールドの導入 | **L1-B**。InvoiceCheckRow への raw フィールド追加は構造変更。 |
| `schema.py` の observations 型定義追加 | **β2-E 以降または exporter / report 統合時**（設計メモ §7-#1）。L1-A では run.py インライン dict のまま。 |
| `tax_code_distribution` の拡張（top_codes 件数調整、tax_code 名称付与など） | **β2-E 以降の実需要に応じて**（設計メモ §7-#3）。L1-A では最小構成のみ。 |
| `474381`（自社 freee）の fetch 整備 | **別タスク**（memory に記録済み）。 |
| `Phase C-1` fetch 層総点検 | **別タスク**。 |
| 自然言語 `explanation` の追加 | **exporter / report 層に委譲**（設計メモ §4.6 確定）。 |
| T 番号妥当性チェック | **β3 範疇**。 |

### 2.4 「L1-A と L1-B の境界線」の宣言

本指示書では以下の 2 点を **L1-A と L1-B の境界線**として明示的に固定する：

```
scope.manual_journals は false のまま維持する。
source_breakdown.manual_journals_rows は 0 とする。
```

この 2 点は実装中・テスト中・実機検証中に**常に成立**していなければならない。逆に、これが false / ゼロ以外になっていたら L1-B の領域に踏み込んでいるサインである。

### 2.5 実装規模の概算

| 作業 | 行数規模 |
|---|---|
| `_calculate_tax_code_distribution` 関数 | 30〜50 行 |
| `_calculate_source_breakdown` 関数 | 約 10 行 |
| 集計呼び出し追加（main 内） | 2 行 |
| 出力 dict への追加 | 2 行 |
| 新規テスト（T1〜T8） | 60〜100 行 |
| **合計** | **約 100〜170 行** |

L1-A は **小規模実装**である。一方、実機検証（C2）は別フェーズ。

---
## §3. 実装クラスタ分割

### 3.1 クラスタ構成

L1-A は 2 クラスタに分割する：

```
クラスタ C1：実装 + テスト
クラスタ C2：実機検証
```

C1 と C2 は性質が異なる：

- **C1**：コードを正しく変える（実装フェーズ）
- **C2**：実データで意味があるか確認する（観察 / 検証フェーズ）

両者を分離することで、C1 で問題が出たときの切り戻し範囲を明確にする。

### 3.2 クラスタ C1：実装 + テスト

#### 範囲

- `_calculate_tax_code_distribution` 関数の新設
- `_calculate_source_breakdown` 関数の新設
- `main()` 内 observations 集計呼び出しの追加
- 出力 dict への 2 キー追加
- 新規テスト 8 本（T1〜T8）の追加
- 既存 119 tests がそのまま通ることの確認

#### 完了基準（すべて満たすこと）

- [ ] `_calculate_tax_code_distribution` / `_calculate_source_breakdown` の 2 関数が新設されている
- [ ] `main()` 内で 2 関数が呼び出され、戻り値が observations dict に追加されている
- [ ] 新規テスト 8 本（T1〜T8）が追加され、すべて passed
- [ ] 既存 119 tests がそのまま passed（破壊的変更なし）
- [ ] **`scope.manual_journals` は false のまま維持**（境界線①）
- [ ] **`source_breakdown.manual_journals_rows` は 0**（境界線②）
- [ ] partners_qii_cache を生成していない（L1-B スコープのため）
- [ ] freee_to_context.py / CheckContext / TransactionRow に依存していない
- [ ] InvoiceCheckRow への新フィールド追加なし

#### 切り戻し条件

以下のいずれかが発生したら C1 を一旦止め、悠皓さんに報告する：

- 既存 119 tests のいずれかが fail する
- 既存 observations 出力構造（class_counts / partner_unknown_breakdown）に変化が出る
- 上記「境界線①②」のいずれかが破られる

### 3.3 クラスタ C2：実機検証

#### 範囲

- 3525430 / 2025-12 で実機実行（理想型・回帰確認）
- 10794380 / 2025-12 で実機実行（漏れ集中型・回帰確認）

#### 完了基準（すべて満たすこと）

##### 3525430 / 2025-12（理想型）

- [ ] Findings 2 件（β2-C 結果との連続性）
- [ ] class_counts が β2-C と一致
- [ ] partner_unknown_breakdown が β2-C と一致（解釈 X 推定吸収 2/2）
- [ ] tax_code_distribution が出力されている（top_codes / judging_target_count / judging_target_ratio の 3 キー）
- [ ] source_breakdown が出力されている（deals_rows / manual_journals_rows / total の 3 キー）
- [ ] **境界線**：source_breakdown.manual_journals_rows = 0、scope.manual_journals = false

##### 10794380 / 2025-12（漏れ集中型）

- [ ] Findings 8 件（β2-C 結果との連続性）
- [ ] class_counts が β2-C と一致
- [ ] partner_unknown_breakdown が β2-C と一致
- [ ] tax_code_distribution が出力されている
- [ ] source_breakdown が出力されている
- [ ] **境界線**：source_breakdown.manual_journals_rows = 0、scope.manual_journals = false

#### 12243357 / 2025-07 の扱い

12243357 / 2025-07 は L1-A では主検証社から外す。

理由は、L1-A では manual_journals を取り込まないため、同社の観察価値（manual_journals 中心の構造を observations で説明する）がまだ発揮されないためである。

同社は L1-B（manual_journals / 共通 context 移行）完了後の主検証社として扱う。

### 3.4 クラスタ実行順序

```
C1（実装 + テスト）→ C1 完了報告 → 悠皓さん GO → C2（実機検証）
```

C1 と C2 は **直列実行**。C1 が完了基準を満たさない状態で C2 に進まない。

---

## §4. クラスタごとの実装詳細

### 4.1 _calculate_tax_code_distribution 関数の新設

#### 配置場所

`run.py` の `_calculate_partner_unknown_breakdown` 関数（L295〜L328）の**直後**に配置する。既存の観察関数と並列パターンで揃える。

#### 関数シグネチャ

```python
def _calculate_tax_code_distribution(
    rows: list,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """tax_code 分布を集計（β2-D L1-A observations）。

    judging-target 0 件の会社で「なぜ 0 件なのか」を tax_code 分布で説明する
    観察項目（原因構造系）。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {
            "top_codes": {"<tax_code 文字列>": <件数>, ...},
            "judging_target_count": <課対仕入レンジ該当件数>,
            "judging_target_ratio": <該当比率、小数点以下 4 桁>,
        }
    """
```

#### 仕様

| 項目 | 仕様 |
|---|---|
| 入力 | `rows: list[InvoiceCheckRow]`（main() の `rows` をそのまま渡す） |
| 戻り値 | `dict[str, Any]`（3 キー固定） |
| 純粋関数 | I/O なし、副作用なし |
| `top_codes` の対象 | rows のうち `tax_code is not None` のすべてを集計し、件数 1 以上のキーをすべて出力 |
| `top_codes` のキーの型 | **str**（tax_code を `str(tax_code)` で文字列化） |
| `top_codes` の値の型 | int（件数） |
| `top_codes` の並び順 | 件数の降順、同数の場合は tax_code 昇順（決定論的）。実装は `dict(sorted(...))` で OK |
| `judging_target_count` の定義 | **L1-A では tax_code が 183〜230 の範囲にある行数**（経過措置レンジのみ）。FULL_DEDUCTION 系コードを含める拡張は L1-B 以降で扱う。実装は既存ヘルパー `is_transitional_tax(tc)` を単独で使用 |
| `judging_target_ratio` の定義 | `judging_target_count / len(rows)` を `round(..., 4)` で 4 桁に丸める |
| `judging_target_ratio` の rows 空時の値 | `0.0`（ZeroDivisionError を回避、明示的に 0.0 を返す） |
| `top_codes` の rows 空時の値 | `{}`（空 dict） |
| `tax_code is None` の扱い | `top_codes` に含めない（カウント対象外）。`judging_target_count` にも含めない |

#### 実装スケッチ（参考）

```python
def _calculate_tax_code_distribution(
    rows: list,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """tax_code 分布を集計（β2-D L1-A observations）。

    judging-target 0 件の会社で「なぜ 0 件なのか」を tax_code 分布で説明する
    観察項目（原因構造系）。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {
            "top_codes": {"<tax_code 文字列>": <件数>, ...},
            "judging_target_count": <課対仕入レンジ該当件数>,
            "judging_target_ratio": <該当比率、小数点以下 4 桁>,
        }
    """
    counter: Counter[int] = Counter()
    judging_target = 0
    for row in rows:
        tc = row.tax_code
        if tc is None:
            continue
        counter[tc] += 1
        # L1-A: 経過措置レンジ（183〜230）のみを judging_target にカウント
        # FULL_DEDUCTION 系コードを含める拡張は L1-B 以降
        if is_transitional_tax(tc):
            judging_target += 1

    # 件数降順、同数なら tax_code 昇順（決定論的順序）
    sorted_items = sorted(counter.items(), key=lambda x: (-x[1], x[0]))
    top_codes = {str(code): count for code, count in sorted_items}

    total = len(rows)
    ratio = round(judging_target / total, 4) if total > 0 else 0.0

    return {
        "top_codes": top_codes,
        "judging_target_count": judging_target,
        "judging_target_ratio": ratio,
    }
```

> **注**：上記スケッチは参考実装。Claude Code が既存コードスタイルに合わせて微調整してよい。ただし**仕様（戻り値構造・キー型・桁・空時挙動）は厳守**する。

### 4.2 _calculate_source_breakdown 関数の新設

#### 配置場所

`_calculate_tax_code_distribution` 関数の**直後**に配置する。

#### 関数シグネチャ

```python
def _calculate_source_breakdown(
    rows: list,  # type: ignore[type-arg]
) -> dict[str, int]:
    """source 別行数を集計（β2-D L1-A observations）。

    L1-A 暫定: deals 固定として扱う（manual_journals 未取り込み）。
    L1-B（manual_journals / 共通 context 移行）で source 由来で分岐する構造に拡張する。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {"deals_rows": N, "manual_journals_rows": 0, "total": N}
    """
```

#### 仕様

| 項目 | 仕様 |
|---|---|
| 入力 | `rows: list[InvoiceCheckRow]`（main() の `rows` をそのまま渡す） |
| 戻り値 | `dict[str, int]`（3 キー固定） |
| 純粋関数 | I/O なし、副作用なし |
| `deals_rows` | `len(rows)`（L1-A では rows はすべて deals 由来） |
| `manual_journals_rows` | **常に 0**（L1-A の境界線②） |
| `total` | `len(rows)`（= deals_rows） |
| 引数の拡張 | しない（rows のみ。L1-B で必要になったら拡張） |

#### 実装スケッチ（参考）

```python
def _calculate_source_breakdown(
    rows: list,  # type: ignore[type-arg]
) -> dict[str, int]:
    """source 別行数を集計（β2-D L1-A observations）。

    L1-A 暫定: deals 固定として扱う（manual_journals 未取り込み）。
    L1-B（manual_journals / 共通 context 移行）で source 由来で分岐する構造に拡張する。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {"deals_rows": N, "manual_journals_rows": 0, "total": N}
    """
    return {
        "deals_rows": len(rows),
        "manual_journals_rows": 0,
        "total": len(rows),
    }
```

### 4.3 main() 内の改修

#### 改修箇所 1：observations 集計呼び出しの追加（L991〜L992 周辺）

##### 現状（β2-C）

```python
    # Step 7.5: observations 集計（β2-C 確定、partner_unknown_breakdown のみ）
    partner_unknown_breakdown = _calculate_partner_unknown_breakdown(classified)
```

##### 改修後（L1-A）

```python
    # Step 7.5: observations 集計（β2-C 確定 + β2-D L1-A 拡張）
    partner_unknown_breakdown = _calculate_partner_unknown_breakdown(classified)
    tax_code_distribution = _calculate_tax_code_distribution(rows)  # L1-A 新規
    source_breakdown = _calculate_source_breakdown(rows)             # L1-A 新規
```

#### 改修箇所 2：出力 dict への追加（L1025〜L1027 周辺）

##### 現状（β2-C）

```python
            "observations": {
                "partner_unknown_breakdown": partner_unknown_breakdown,
            },
```

##### 改修後（L1-A）

```python
            "observations": {
                "partner_unknown_breakdown": partner_unknown_breakdown,
                "tax_code_distribution": tax_code_distribution,    # L1-A 新規
                "source_breakdown": source_breakdown,              # L1-A 新規
            },
```

#### 改修箇所外：scope は変更しない

```python
            "scope": {"deals": True, "manual_journals": False},
```

L1-A では `manual_journals: False` を**そのまま維持**する（境界線①）。これは L1-B で初めて true に変わる。

### 4.4 既存ファイル構造の参照ガイド

実装中に Claude Code が参照する箇所のサマリ：

| 参照対象 | 行番号 | 用途 |
|---|---|---|
| `InvoiceCheckRow` のフィールド定義 | L122〜L148 | tax_code / partner 等のアクセス方法 |
| `is_transitional_tax` / `is_full_deduction_tax` | L155〜L190 周辺 | tax_code が課対仕入レンジに該当するかの判定（既存ヘルパー） |
| `TRANSITIONAL_TAX_CODES` / `FULL_DEDUCTION_TAX_CODES` | モジュール定数（冒頭付近） | 課対仕入レンジ定数（直接参照不要、ヘルパー経由で OK） |
| `_calculate_partner_unknown_breakdown` | L295〜L328 | 既存観察関数のスタイル参考、純粋関数パターン |
| `classified` 変数の生成箇所 | L940〜L948 周辺 | `(row, classification)` のタプルリスト |
| `rows` 変数の生成箇所 | L928〜L929（`_normalize_deals` 呼び出し） | `_calculate_tax_code_distribution` / `_calculate_source_breakdown` の入力 |
| observations 集計呼び出し | L991〜L992 | 改修箇所 1 |
| 出力 dict | L1010〜L1029 | 改修箇所 2 |

### 4.5 触らないもの（再確認、§7 で詳述）

L1-A 実装中に**絶対に触らない**項目：

- `InvoiceCheckRow` の定義（フィールド追加・変更なし）
- `_normalize_deals` / `_build_partners_map` / `_build_taxes_map`
- `classify_transaction` / `checker.py` / 5 分類体系
- `_calculate_partner_unknown_breakdown`
- `freee_to_context.py`（L1-A では import しない、参照しない）
- `schema.py`（V1-3-20 用も V1-3-10 用も）
- `scope` の構造
- 既存テストファイルの既存テストケース（追加 OK、既存修正 NG）

これらに「ついでに対応したくなる」誘惑が出たら、L1-B / 別タスクの領域である。L1-A スコープで完結させる。

---
## §5. テスト方針

### 5.1 テスト構成

L1-A のテストは以下の構成：

- **新規テスト 8 本（T1〜T8）**：L1-A で追加する観察項目の動作確認
- **既存テスト 119 本**：そのまま passed を維持（破壊的変更なし）

### 5.2 新規テスト 8 本（T1〜T8）

#### T1：tax_code_distribution の出力構造

**目的**：`_calculate_tax_code_distribution` が必要な 3 キーを揃えて返すことを確認。

**テスト名（仮）**：`test_tax_code_distribution_output_structure`

**入力**：任意の InvoiceCheckRow リスト（例：tax_code を 1 つ持つ 1 行）

**期待**：
- 戻り値が dict
- キー集合が `{"top_codes", "judging_target_count", "judging_target_ratio"}` と完全一致
- `top_codes` は dict
- `judging_target_count` は int
- `judging_target_ratio` は float

#### T2：tax_code_distribution の top_codes 集計内容

**目的**：tax_code 分布が正しく集計され、件数降順 + tax_code 昇順の決定論的順序で並ぶことを確認。

**テスト名（仮）**：`test_tax_code_distribution_top_codes_content`

**入力**：以下の tax_code 構成の InvoiceCheckRow リスト
- tax_code=2 が 3 行
- tax_code=183 が 5 行
- tax_code=23 が 5 行
- tax_code=None が 2 行

**期待**：
- `top_codes == {"23": 5, "183": 5, "2": 3}`
  - 件数降順（5, 5, 3）
  - 同数の 23 と 183 は tax_code 昇順（23 が先）
- tax_code=None の 2 行は集計されない（top_codes に "None" や "0" などは出ない）

#### T3：tax_code_distribution の judging_target

**目的**：経過措置レンジ（183〜230）の件数・比率が L1-A 仕様で正しく計算されることを確認。

**テスト名（仮）**：`test_tax_code_distribution_judging_target`

**入力**：以下の tax_code 構成の InvoiceCheckRow リスト（10 行）
- tax_code=183 が 2 行（経過措置レンジ内）
- tax_code=230 が 1 行（経過措置レンジ内、上限値）
- tax_code=182 が 1 行（経過措置レンジ外、下限-1）
- tax_code=231 が 1 行（経過措置レンジ外、上限+1）
- tax_code=34 が 1 行（FULL_DEDUCTION 系、L1-A では judging_target に含めない）
- tax_code=2 が 4 行（レンジ外）

**期待**：
- `judging_target_count == 3`（183, 230, 183 の 3 行のみ。FULL_DEDUCTION の 34 は含めない）
- `judging_target_ratio == 0.3`（3 / 10、`round(0.3, 4) == 0.3`）

> **注**：T3 は L1-A 仕様（FULL_DEDUCTION 系を含めない）を明示的に検証する重要なテスト。L1-B で仕様変更されたら T3 を更新する想定。

#### T4：tax_code_distribution の rows 空時の挙動

**目的**：rows が空でも出力構造が崩れないこと、ZeroDivisionError が出ないことを確認。

**テスト名（仮）**：`test_tax_code_distribution_empty_rows`

**入力**：空リスト `[]`

**期待**：
- `top_codes == {}`
- `judging_target_count == 0`
- `judging_target_ratio == 0.0`
- 例外が発生しない

#### T5：source_breakdown の出力構造

**目的**：`_calculate_source_breakdown` が必要な 3 キーを揃えて返すことを確認。

**テスト名（仮）**：`test_source_breakdown_output_structure`

**入力**：任意の InvoiceCheckRow リスト（例：3 行）

**期待**：
- 戻り値が dict
- キー集合が `{"deals_rows", "manual_journals_rows", "total"}` と完全一致
- 全 3 キーの値が int

#### T6：source_breakdown の deals 固定挙動

**目的**：L1-A 仕様（deals 固定、manual_journals_rows = 0）が正しく実装されていることを確認。

**テスト名（仮）**：`test_source_breakdown_deals_fixed`

**入力**：5 行の InvoiceCheckRow リスト

**期待**：
- `deals_rows == 5`（= len(rows)）
- `manual_journals_rows == 0`（**L1-A 境界線②**）
- `total == 5`（= deals_rows）

> **注**：`manual_journals_rows == 0` は L1-A の境界線②そのもの。本テストが fail するのは L1-B の領域に踏み込んだサイン。

#### T7：observations の出力キー（統合確認）

**目的**：main() の出力 dict の `observations` フィールドに 3 キーが揃うことを確認。

**テスト名（仮）**：`test_observations_keys_extended`

**入力**：main() を呼び出せる最小構成（既存テストの fixture / mock を再利用）

> **注**：T7 の入力は、既存テストで使用している deals_json fixture を流用する。main() を直接叩くのではなく、既存のテストパターンに従う。

**期待**：
- 出力 JSON の `observations` が dict
- キー集合が `{"partner_unknown_breakdown", "tax_code_distribution", "source_breakdown"}` と完全一致
- 既存の `partner_unknown_breakdown` のキーが β2-C 通り（`absorbed_into_nonqualified` / `remaining_partner_unknown`）

#### T8：scope と境界線の維持

**目的**：L1-A の境界線①②が main() 出力で維持されていることを確認。

**テスト名（仮）**：`test_scope_manual_journals_remains_false`

**入力**：main() を呼び出せる最小構成

**期待**：
- `scope.manual_journals == False`（**L1-A 境界線①**）
- `scope.deals == True`（β2-C 維持）
- `observations.source_breakdown.manual_journals_rows == 0`（**L1-A 境界線②**）

> **注**：T8 は L1-A と L1-B の境界線そのもの。本テストが fail するのは、Claude Code が誤って manual_journals 取り込みに踏み込んだサインであり、即座に切り戻し対象。

### 5.3 既存テスト 119 本への影響確認

#### 期待される結果

- **既存 119 tests がそのまま passed**：L1-A は既存破壊しない方針のため、既存テストへの修正は不要

#### 既存テストへの影響が出た場合の対処

| 既存テストの fail 内容 | 想定される原因 | 対処 |
|---|---|---|
| observations 出力構造のテストが fail | observations dict にキーが追加されたことで完全一致テストが崩れた | 既存テスト側を「3 キー揃うこと」に変更してよいか悠皓さんに確認 |
| 5 分類体系のテストが fail | classify_transaction を誤って触った | 切り戻し（C1 切り戻し条件発動） |
| partner_unknown_breakdown のテストが fail | `_calculate_partner_unknown_breakdown` を誤って触った | 切り戻し（C1 切り戻し条件発動） |
| `_normalize_deals` のテストが fail | InvoiceCheckRow 生成ロジックを誤って触った | 切り戻し（C1 切り戻し条件発動） |

**原則**：既存テストの修正は最小限。修正が必要な場合は「観察項目追加に伴うキー追加への対応」のみ許容し、それ以外（ロジック変更を伴う修正）は切り戻し対象。

### 5.4 テストファイルの配置

既存テストファイルの配置を確認のうえ、同一ファイル内に T1〜T8 を追加する想定。新規テストファイルは作成しない（既存パターン踏襲）。

具体的なファイルパスは Claude Code が既存テストの配置を確認して決定する。

### 5.5 テスト実行コマンド

```bash
# 既存と同じテスト実行コマンドを使用
# pytest（PYTHONIOENCODING=utf-8 必須、運用原則 7）
PYTHONIOENCODING=utf-8 pytest <test_file_path> -v
```

実行結果は完了報告に含める：

- 新規テスト T1〜T8：8 passed
- 既存テスト：119 passed
- **合計 127 passed**（127 = 119 + 8）

---

## §6. 検証手順（クラスタ C2）

### 6.1 検証社の確定

| 役割 | 会社 / 期間 | 期待される確認内容 |
|---|---|---|
| 回帰確認（理想型） | 3525430 / 2025-12 | β2-C 結果（Findings 2 件）の維持 + observations 拡張 2 項目の出力 |
| 回帰確認（漏れ集中型） | 10794380 / 2025-12 | β2-C 結果（Findings 8 件）の維持 + observations 拡張 2 項目の出力 |

12243357 / 2025-07 は L1-A では検証対象外（理由は §3.3 参照）。

### 6.2 検証手順（共通）

各検証社で以下の手順を実施：

#### Step 1：データ準備

- 対象会社の必要 JSON（partners_all.json / taxes_codes.json / deals_*.json / company_info.json / account_items_all.json）が `data/.../` 配下に揃っていることを確認
- 不足があれば freee MCP で取得

#### Step 2：Skill 実行

```bash
cd <project root>
PYTHONIOENCODING=utf-8 python -m skills.verify.V1-3-rule.check-invoice-registration-status.run \
    --company-id <company_id> \
    --target-month 2025-12
```

または既存の Skill 起動方法に従う（既存パターンに合わせる）。

#### Step 3：出力 JSON の確認項目

| 確認項目 | 期待値 |
|---|---|
| `status` | `"ok"` |
| `exit_code` | `0` |
| `scope.deals` | `true` |
| `scope.manual_journals` | **`false`**（境界線①） |
| `findings_count` | 各社の β2-C 結果と一致 |
| `groups[*].findings_count` の合計 | findings_count と一致 |
| `classification_counts` | β2-C と一致（6 キーすべて存在） |
| `observations` のキー集合 | `{partner_unknown_breakdown, tax_code_distribution, source_breakdown}` |
| `observations.partner_unknown_breakdown` | β2-C 結果と一致 |
| `observations.tax_code_distribution.top_codes` | 件数降順 + tax_code 昇順、件数 1 以上のキーのみ |
| `observations.tax_code_distribution.judging_target_count` | 経過措置レンジ（183〜230）該当件数 |
| `observations.tax_code_distribution.judging_target_ratio` | 小数点以下 4 桁 |
| `observations.source_breakdown.deals_rows` | classification_counts の総和と一致 |
| `observations.source_breakdown.manual_journals_rows` | **`0`**（境界線②） |
| `observations.source_breakdown.total` | deals_rows と一致 |

### 6.3 3525430 / 2025-12 の期待値（理想型）

#### β2-C 結果との連続性

| 項目 | 期待 |
|---|---|
| `findings_count` | **2**（β2-C 結果） |
| `classification_counts` | β2-C 結果と完全一致 |
| `partner_unknown_breakdown.absorbed_into_nonqualified` | **2**（解釈 X 推定吸収 2/2） |
| `partner_unknown_breakdown.remaining_partner_unknown` | **0** |

#### L1-A 新規項目の確認

| 項目 | 期待 |
|---|---|
| `tax_code_distribution.top_codes` | 件数 1 以上のすべての tax_code が出力 |
| `tax_code_distribution.judging_target_count` | β2-C で Finding 2 件の元になった行数（経過措置レンジ該当件数）と矛盾しない |
| `tax_code_distribution.judging_target_ratio` | 0.0000〜1.0000 の範囲、小数点以下 4 桁 |
| `source_breakdown.deals_rows` | classification_counts の総和と一致 |
| `source_breakdown.manual_journals_rows` | **0** |
| `source_breakdown.total` | deals_rows と一致 |

### 6.4 10794380 / 2025-12 の期待値（漏れ集中型）

#### β2-C 結果との連続性

| 項目 | 期待 |
|---|---|
| `findings_count` | **8**（β2-C 結果） |
| `classification_counts` | β2-C 結果と完全一致 |
| `partner_unknown_breakdown` | β2-C 結果と完全一致 |

#### L1-A 新規項目の確認

3525430 と同じ項目を確認（top_codes / judging_target_count / judging_target_ratio / source_breakdown 各キー）。

### 6.5 検証完了報告のフォーマット

C2 完了時に Claude Code は以下のフォーマットで報告する：

```markdown
## C2 実機検証完了報告

### 3525430 / 2025-12（理想型）

#### β2-C 結果との連続性
- findings_count: 2（期待 2）✅
- classification_counts: <値>（β2-C と一致）✅
- partner_unknown_breakdown: absorbed=2 / remaining=0 ✅

#### L1-A 新規項目
- tax_code_distribution.top_codes: <値>
- tax_code_distribution.judging_target_count: <値>
- tax_code_distribution.judging_target_ratio: <値>
- source_breakdown: deals_rows=<N> / manual_journals_rows=0 / total=<N> ✅

#### 境界線
- scope.manual_journals: false ✅
- source_breakdown.manual_journals_rows: 0 ✅

### 10794380 / 2025-12（漏れ集中型）

（同様のフォーマット）

### 総合判定

- [ ] 両社とも β2-C 結果との連続性を維持
- [ ] 両社とも L1-A 新規項目が出力されている
- [ ] 両社とも境界線①②が維持されている
- [ ] 異常なし

C2 完了。
```

### 6.6 ズレが出た場合の対処

#### β2-C 結果との連続性が崩れた場合

| ズレ | 対処 |
|---|---|
| findings_count が β2-C と異なる | 切り戻し（実装側を確認、判定ロジックを誤って触った可能性） |
| classification_counts が β2-C と異なる | 切り戻し |
| partner_unknown_breakdown が β2-C と異なる | 切り戻し |

#### L1-A 新規項目に異常が出た場合

| ズレ | 対処 |
|---|---|
| top_codes の並び順が決定論的でない | 実装の sorted() の key を確認 |
| judging_target_count が予想より多い | FULL_DEDUCTION 系を含めていないか確認（L1-A では含めない） |
| source_breakdown.manual_journals_rows ≠ 0 | 切り戻し（境界線②違反） |
| scope.manual_journals == true | 切り戻し（境界線①違反） |

#### 切り戻しの判断

切り戻しが発生した場合、Claude Code は実装を中断し、悠皓さんに報告する。原因分析と修正方針は別セッションで対応。

---
## §7. 触らないもの（再掲）

本書 §2.3 / §4.5 で部分的に触れた「触らないもの」を、最後の防御として一覧で明示する。Claude Code が実装中に「ついでに対応したくなる」誘惑が出たら、本章を再確認する。

### 7.1 触らないもの（一覧）

| カテゴリ | 触らない対象 | 触らない理由 |
|---|---|---|
| 取り込み層 | `_normalize_deals` / `_build_partners_map` / `_build_taxes_map` | β2-C 構造を完全維持（既存破壊しない方針） |
| 取り込み層 | `freee_to_context.py`（import / 参照ともに不可） | L1-A では使わない。L1-B で対応 |
| 判定層 | `classify_transaction` / `checker.py` / 5 分類体系 | β2-C 構造を完全維持（既存テスト 119 本の前提） |
| 観察層 | `_calculate_partner_unknown_breakdown`（L295〜L328） | β2-C 構造を完全維持（partner_unknown_breakdown は β2-C で確定） |
| 型定義層 | `InvoiceCheckRow` の定義（L122〜L148） | フィールド追加・変更なし。raw["source"] 導入は L1-B |
| 型定義層 | `schema.py`（V1-3-20 用 / V1-3-10 用ともに） | 観察用型定義の追加は別タスク（β2-E 以降） |
| 出力構造 | `scope` の構造 | scope.manual_journals = false のまま維持（境界線①） |
| 出力構造 | `class_counts` の構造（6 キー） | β2-C 確定 |
| 出力構造 | `partner_unknown_breakdown` の構造（2 キー） | β2-C 確定 |
| テスト | 既存テストファイルの既存テストケース | 追加 OK、ロジック変更を伴う既存修正は NG |
| 別タスク | partners_qii_cache の生成 | L1-B スコープ |
| 別タスク | manual_journals の取り込み | L1-B スコープ |
| 別タスク | 474381（自社 freee）の fetch 整備 | 別タスク（memory 記録済み） |
| 別タスク | Phase C-1 fetch 層総点検 | 別タスク |
| 別タスク | T 番号妥当性チェック | β3 範疇 |
| 別タスク | 自然言語 explanation の追加 | exporter / report 層に委譲 |
| 別タスク | tax_code_distribution の拡張（top_codes 件数調整、tax_code 名称付与） | β2-E 以降の実需要に応じて |

### 7.2 「ついでに触りたくなる」誘惑への対処

実装中に以下の誘惑が出やすい。それぞれ本書のどこを参照するかを示す：

| 誘惑 | 対処 | 参照 |
|---|---|---|
| 「partners_qii_cache を生成しておけば L1-B で楽になる」 | YAGNI 違反。生成しない | §1.5 原則 4 / Step 1 確定文 |
| 「raw["source"] を InvoiceCheckRow に追加すれば source_breakdown が綺麗になる」 | 構造変更は L1-B | §1.2 / §2.3 |
| 「freee_to_context.py を呼び出せば manual_journals も取り込める」 | L1-A スコープ外 | §1.2 / §2.3 |
| 「judging_target に FULL_DEDUCTION も含める方が観察として豊か」 | L1-A 仕様で含めない（T3 で固定） | §4.1 仕様表 / §5.2 T3 |
| 「既存テストを少し書き換えれば全体が綺麗になる」 | ロジック変更を伴う既存修正は NG | §5.3 |
| 「scope.manual_journals = true にしておけば後で楽」 | 境界線①違反、即切り戻し | §2.4 / §3.2 切り戻し条件 |

### 7.3 境界線の再宣言

L1-A 実装中・テスト中・実機検証中、以下の 2 点は**常に成立**していなければならない：

```
scope.manual_journals は false のまま維持する。
source_breakdown.manual_journals_rows は 0 とする。
```

これが false / ゼロ以外になっていたら、L1-B の領域に踏み込んでいるサインである。即座に切り戻し対象。

---

## §8. Claude Code 実行プロンプト

### 8.1 実行プロンプトの位置付け

L1-A 実装の Claude Code への投入は、別ファイル `V1-3-20_beta2_D_L1_claude_code_prompt.md` を使用する。

- **本書（実装指示書）§1〜§7**：仕様本体。設計判断の根拠と詳細仕様を含む。
- **実行プロンプト**：本書の要約 + Claude Code への投入用インストラクション。

両者の役割が異なるため、ファイルを分離する：

| ファイル | 役割 | 想定読者 |
|---|---|---|
| `V1-3-20_beta2_D_L1_implementation_spec.md`（本書） | 仕様 | 戦略 Claude / 悠皓さん（設計判断の根拠を確認するとき） |
| `V1-3-20_beta2_D_L1_claude_code_prompt.md` | 投入文 | Claude Code（実装実行時） |

### 8.2 実行フロー

```
1. 悠皓さんが Claude Code に実行プロンプトを投入
2. Claude Code が C1（実装 + テスト）を実行
3. C1 完了報告
4. 悠皓さん GO 判断
5. Claude Code が C2（実機検証）を実行
6. C2 完了報告
7. L1-A 完結
```

### 8.3 実行プロンプトの構成（参考）

実行プロンプトには以下を含める：

- 実装指示書本体への参照（本書 §1〜§7）
- C1 / C2 のスコープ要約
- 触ってはいけないものの再掲（境界線①②）
- 完了報告フォーマット
- 切り戻し条件

詳細は実行プロンプト本体を参照。

---

## 文書末尾

本指示書は L1-A 実装フェーズで使用する。L1-B は別タスクとして分離されており、本指示書のスコープ外である。

設計判断の根拠を遡る場合：
- L1 設計メモ：`V1-3-20_beta2_D_L1_design_memo.md`（1097 行、確定済み）
- L1 実装指示書セッション 6 論点確定：本書 §1.4 / §2 / §3 / §4 / §5 / §6
- 観察セッションでの 3 社観察結果：`V1-3-20_beta2_C_observation_log.md`（722 行）

L1-A 実装指示書、ここで完結。
