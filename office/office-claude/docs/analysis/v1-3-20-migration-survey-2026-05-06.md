# V1-3-20 移行 (E3) 事前調査レポート

**作成日**: 2026-05-06
**ブランチ**: main (調査のみ、変更なし)
**目的**: V1-3-20 を共通スキーマに移行するための判断材料を集める
**ステータス**: 読み取り専用調査。実装変更なし。

---

## 0. エグゼクティブサマリ(先に結論)

- **Severity 値は `"warning"` 1 種類のみ**(`checker.py:120` で固定)。マッピングは単純(`"warning"` → `"🟠 High"` 推奨)
- **判定層の I/F は L1-B で確立した「判定層は触らない」を概ね維持できる**:
  - `classify_transaction` / `find_groups` は完全維持可能(Severity / Finding 生成に関与せず)
  - `to_finding` のみ部分改修(`InvoiceFinding(...)` → `Finding(...)`、本体ロジック変更最小)
- **raw 解体は局所的だが破壊的**:
  - 書き込みは `_build_raw()` 1 箇所のみ
  - 読み取りはほぼテストに集中(`test_invoice_registration_status.py` 22 件)
  - `f.raw.keys()` 全集合比較 2 件が要書き換え
- **E3 推奨分割: (c) 3 分割**
  - E3-b: 型変更(`InvoiceFinding` → `Finding`)+ Severity マッピング(raw 構造は維持)
  - E3-c: raw 解体(直下属性に振り分け、テスト書き換え)
  - E3-d (任意): SKILL.md 更新・dead code 整理
- **連休中完了可能性**: E3-b は確実、E3-c も時間あれば可能。E3-d は連休後で問題なし

---

## Section 1: V1-3-20 Severity 値の実態

### 1.1 使用されている Severity 値の全列挙

調査結果: **`"warning"` の 1 種類のみ**。

| 値 | 使用箇所 | 用途/コンテキスト |
|---|---|---|
| `"warning"` | `skills/.../check-invoice-registration-status/checker.py:120` (固定文字列) | `to_finding()` 内で `severity="warning"` として全 Finding に固定適用。3 分類すべて `"warning"` |

テスト側 `test_invoice_registration_status.py` でも `severity` の値検証は `"warning"` のみ確認(grep 結果)。

V1-3-20 では Severity を **判定の入力にも使わず、出力時の固定タグとしてのみ機能**(差別化は `classification` Enum で行う)。

### 1.2 共通 Severity Literal への変換マップ提案

```python
V1320_SEVERITY_MAP = {
    "warning": "🟠 High",   # 警告系の意味合い
}
```

#### 提案根拠
- V1-3-20 の `"warning"` はインボイス登録未確認の **警告** という意味で、新名称体系の `"🟠 High"`(旧 `"🟠 Warning"` の後継)に最も対応する
- `"🔴 Critical"` ほど確定誤りではなく、`"🟡 Medium"` ほど判断要素ではない、警戒レベル
- 単一値マッピングのため、`Literal` 検証は不要(`to_finding` 内で固定値を返すだけ)

### 1.3 不明点・懸念点

- なし。Severity は実質固定値のため、E3 の中で最も単純な置換項目

---

## Section 2: raw dict の使われ方

### 2.1 raw への書き込み箇所

**1 箇所のみ**: `skills/.../check-invoice-registration-status/checker.py:189-213` の `_build_raw(row)` 関数。

```python
def _build_raw(row) -> dict[str, Any]:
    return {
        "tax_label": row.tax_label,
        "tax_code": row.tax_code,
        "debit_amount": str(row.debit_amount),
        "partner": row.partner,
        "description": row.description,
        "transaction_date": row.transaction_date.isoformat() if row.transaction_date is not None else "",
        "source": "deal",
        "is_qualified_invoice": row.is_qualified_invoice,
    }
```

`source` は "deal" 固定(β2-D 完了ログ §7.2 の既知制約、L1-C 以降で動的化予定)。

### 2.2 raw の読み取り箇所

V1-3-20 関連での raw アクセス箇所:

| ファイル | 件数 | パターン |
|---|---|---|
| `tests/unit/test_invoice_registration_status.py` | **22** | `f.raw["..."]` または `f.raw.keys()` |
| `skills/.../check-invoice-registration-status/run.py` | 0 | 読み取りなし(JSON シリアライズは finding.raw を dict としてそのまま出力) |
| `skills/.../check-invoice-registration-status/checker.py` | 0 | 読み取りなし |
| その他(_common, excel_report, scripts) | 0 | V1-3-20 raw に依存しない |

#### テスト側の主要な raw アクセスパターン
- `tests/unit/test_invoice_registration_status.py:661, 1422`: **`f.raw.keys()` 全集合比較**(8 key の存在を検証)
- L671-678, L1438-1468: 各 key の値を `f.raw["..."]` で個別検証(8 key × 2 ブロック = 約 16 件)
- L727, L1482: `transaction_date == ""` の空文字検証

### 2.3 raw key 別の分類

| key | 型 | 共通 Finding に対応する属性 | 分類 | E3 での扱い |
|---|---|---|---|---|
| `tax_label` | str | **なし** | **B** 新規追加判断 | E3-c で `Finding.tax_label: Optional[str]` 追加 or raw に残す |
| `tax_code` | int | `Finding.tax_code: Optional[int]` (E1 追加済) | **A** 吸収可能 | E3-c で直下属性に移行 |
| `debit_amount` | str(Decimal を str 化) | `Finding.debit_amount: Optional[int]` (V1-3-10 既存) | **C** 型変換必要 | E3-c で str→int 変換、整合性要確認 |
| `partner` | str | `Finding.partner: Optional[str]` (E1 追加済) | **A** 吸収可能 | E3-c で直下属性に移行 |
| `description` | str | **なし**(`message` は別意味) | **B** 新規追加判断 | E3-c で `Finding.description` 追加 or raw に残す |
| `transaction_date` | str(ISO or "") | `Finding.transaction_date: Optional[str]` (E1 追加済) | **A** 吸収可能 | E3-c で直下属性に移行(空文字 vs None の整合確認要) |
| `source` | str("deal" 固定) | **なし** | **D** raw に残す | "deal" 固定で情報量低、L1-C 動的化予定のため raw 維持が妥当 |
| `is_qualified_invoice` | bool | `Finding.is_qualified_invoice: Optional[bool]` (E1 追加済) | **A** 吸収可能 | E3-c で直下属性に移行 |

### 2.4 共通 Finding 既存属性への吸収可否

E1 で共通 Finding に追加した 5 属性での吸収状況:
- `Finding.classification` ← `InvoiceFinding.classification` から(raw 経由ではない、既に直下持ちの設計済)
- `Finding.partner` ← `raw["partner"]` ✅
- `Finding.transaction_date` ← `raw["transaction_date"]` ✅
- `Finding.is_qualified_invoice` ← `raw["is_qualified_invoice"]` ✅
- `Finding.tax_code` ← `raw["tax_code"]` ✅(型 `Optional[int]` で一致)

### 2.5 raw に残すべき key

- `source`: "deal" 固定で情報量低い。L1-C で動的化予定のため、E3 では raw に残すのが妥当
- `tax_label` / `description`: 共通 Finding に対応属性なし。新規追加すべきか raw 残置かは戦略 Claude の判断項目
  - 推奨: **`tax_label` は Finding 直下に追加**(V1-3-10 でも近い概念があり、Excel 出力で列として使う可能性が高い)
  - 推奨: **`description` は raw 残置**(V1-3-10 では `message` が同じ役割、共通化は意味論的に妥当でない)

---

## Section 3: 判定層の I/F

### 3.1 to_finding / to_findings の現行シグネチャ

`skills/.../check-invoice-registration-status/checker.py:104-126`(to_finding)、L129-152(to_findings):

```python
def to_finding(row, classification):
    return InvoiceFinding(
        severity="warning",
        message=_format_message(row, classification),
        wallet_txn_id=row.wallet_txn_id,
        classification=classification,
        rule_code="V1-3-20",
        raw=_build_raw(row),
    )

def to_findings(rows, classifications):
    if len(rows) != len(classifications):
        raise ValueError(...)
    return [to_finding(r, c) for r, c in zip(rows, classifications)]
```

戻り値の型: `InvoiceFinding` (V1-3-20 配下の dataclass)。

### 3.2 classify_transaction / find_groups の I/F

#### `classify_transaction(row: InvoiceCheckRow) -> Classification` (`run.py:195`)
- 入力: `InvoiceCheckRow`(V1-3-20 固有)
- 出力: `Classification` Enum
- **Severity / Finding 生成に関与せず**。完全に判定ロジック専用

#### `find_groups(findings: list) -> list[FindingGroup]` (`run.py:272`)
- 入力: `InvoiceFinding` のリスト
- 出力: `FindingGroup`(V1-3-20 配下)
- 内部で Finding を classification 単位に束ねるだけ。**Severity 値・raw 構造に直接依存せず**

### 3.3 「判定層は触らない」原則の維持可否

**(B) 部分的に維持** が妥当。

- `classify_transaction`: 完全維持可能(InvoiceCheckRow → Classification、Finding と無関係)
- `find_groups`: 完全維持可能(Finding を受け取って FindingGroup を返すだけ、内部で属性アクセスは `f.classification` のみ確認推奨)
- `to_finding`: **本体内の `InvoiceFinding(...)` を `Finding(...)` に置換するだけ**で済む可能性が高い
  - 引数: 変更なし
  - 戻り値型: `InvoiceFinding` → `Finding` 変更のみ
  - 内部の `_format_message` / `_build_raw` は不変(E3-b 段階で raw 維持の場合)
- `to_findings`: 完全維持可能(`to_finding` を呼ぶだけ)

ロジック自体の書き換えはなく、**型置換と属性詰め替えのみ**で完了する。

---

## Section 4: InvoiceFinding 利用箇所の所在

### 4.1 ファイル別件数(実コード `.py` のみ、ドキュメント `.md` 除外)

| ファイル | 件数 | カテゴリ |
|---|---|---|
| `skills/.../check-invoice-registration-status/checker.py` | 8 | V1-3-20 実装 |
| `skills/.../check-invoice-registration-status/run.py` | 4 | V1-3-20 実装 |
| `skills/.../check-invoice-registration-status/schema.py` | 3 | V1-3-20 スキーマ定義 |
| `tests/unit/test_invoice_registration_status.py` | 9 | V1-3-20 テスト |
| **計(実コード)** | **24** | — |

ドキュメント(設計メモ・仕様書・分析レポート等)では合計 **81 件**残存するが、これらは歴史記録として置換対象外。

### 4.2 影響範囲の評価

E3 で `InvoiceFinding` を共通 `Finding` に置換する場合の影響範囲:

- **schema.py の `InvoiceFinding` 定義**: 削除または互換のため re-export(E2-a と同様のパターン採用可)
- **checker.py の import + to_finding 内部**: import 変更 + 直接生成箇所(L119-126)を変更
- **run.py の import + 型注釈**: import 変更
- **test_invoice_registration_status.py**: import + 直接構築するフィクスチャ(`_make_finding` 周辺)を変更

合計 24 件の `InvoiceFinding` 出現箇所は、import 経由・直接構築・type hint の 3 系統。**機械置換ベース**で対応可能。

---

## Section 5: テストへの影響評価

### 5.1 V1-3-20 テストの構成概観

`tests/unit/test_invoice_registration_status.py` は **129 件のテスト + 26 のテストクラス** で構成:

主要なクラス(L 行番号):
- `TestClassifyTransactionLegacyIntents` (L118): 分類ロジック検証
- `TestNormalizeDeals` (L443): 入力正規化検証
- `TestFindingConversion` (L630): **raw 8 key 検証あり** ← 影響大
- `TestExitZeroEndToEnd` (L756): E2E
- `TestClassifyTransaction` (L1094): 分類検証
- `TestRawSchemaExtended` (L1414): **raw 8 key 検証あり** ← 影響大
- `TestMessageTemplate` (L1495): メッセージテンプレート
- `TestFindGroups` (L1711): グループ化
- `TestFindingToDict` (L1830): JSON シリアライズ

### 5.2 予想される FAIL パターン

| パターン | 予想件数 | 対応難易度 | 備考 |
|---|---|---|---|
| Severity 値の変換 (`"warning"` → `"🟠 High"`) | ~3-5 件 | 低 | 単純文字列置換 |
| `f.raw.keys()` 全集合比較 (8 key 想定) | 2 件(L661, L1422) | 中 | raw を解体する場合は集合内容変更が必要 |
| `f.raw["..."]` 個別アクセス | ~22 件 | 中 | 直下属性に移行する場合 `f.partner` 等に書き換え |
| `InvoiceFinding(...)` 直接構築 | ~9 件 | 中 | `Finding(...)` に置換 + 必須引数追加(tc_code, sub_code, error_type, review_level, area, sort_priority など V1-3-10 由来必須項目) |
| その他 (型注釈 / import) | ~5 件 | 低 | 機械置換 |

**重要**: V1-3-20 の `InvoiceFinding` は 6 属性(severity, message, wallet_txn_id, classification, rule_code, raw)に対し、共通 `Finding` は **必須属性 7 個**(tc_code, sub_code, severity, error_type, review_level, area, sort_priority)。`InvoiceFinding(...)` を `Finding(...)` に置換する際、必須項目の追加が必要 → これが E3-b の実装難所。

#### 必須項目の対応案
- `tc_code` ← `"V1-3-20"`(rule_code を流用)
- `sub_code` ← classification の値を割り当て(例: `"V1-3-20-QBT"`)
- `error_type` ← `"gray_review"` または `"reverse_suspect"`(警戒レベル)
- `review_level` ← `"🟠 重点確認"`(Severity の対応マップ経由で導出)
- `area` ← 専用 area コード(例: `"A14"`)を新設するか、既存 area から選ぶ
- `sort_priority` ← 適当な値(例: 30)

これらの設計判断は **戦略 Claude のレビューが必要**。

---

## Section 6: E3 戦略推奨

### 6.1 サブクラスタ分割案

**推奨: (c) 3 分割案**

#### E3-b: 型変更 + Severity マッピング(raw 構造は維持)
- `InvoiceFinding` → 共通 `Finding` に置換(必須項目を to_finding 内で詰める)
- `severity="warning"` → `"🟠 High"` に変換
- raw 構造はそのまま維持(`f.raw["partner"]` 等のテストはそのまま PASS)
- 影響: ~24 件の `InvoiceFinding` 置換 + テスト 9-12 件
- **510 件 PASS 維持を主目標**(raw を解体せず維持することで raw アクセステストは不変)

#### E3-c: raw 解体(直下属性に振り分け)
- `raw["partner"]` 等のテストアクセスを `f.partner` に書き換え
- `_build_raw()` を廃止または縮小、Finding 直下属性 (partner / transaction_date / is_qualified_invoice / tax_code) に値を直接渡す
- `f.raw.keys()` 集合比較 2 件を書き換え(残る key は source / tax_label / description 程度)
- `tax_label` / `description` を Finding 直下に追加するか raw 維持かを設計判断
- 影響: テスト ~22 件 + checker.py の `_build_raw` 改修

#### E3-d (任意): SKILL.md 更新・dead code 整理
- SKILL.md 3 ファイルの記述更新
- L1-B で残置した dead code 5 関数の整理
- 連休後で問題なし

#### 推奨理由
- **(b) 2 分割では E3-c が肥大化**(raw 解体 + Severity マップ + 型変更を同時にやるとリスク高)
- **(a) 1 クラスタは判断項目が多すぎ**(必須属性 7 個の設計判断 + raw 解体 + Severity マップ + テスト書き換えを 1 セッションで処理は無理)
- **(c) 3 分割なら E3-b で「動く中間状態」が確保**できる(raw 維持で全件 PASS)→ 連休中に E3-b だけでも完了する保険

### 6.2 連休中完了可能性

| クラスタ | 所要見積 | 連休中可否 |
|---|---|---|
| E3-b | 1 セッション(1〜1.5h) | ✅ 確実 |
| E3-c | 1〜2 セッション(2〜3h) | ⚠️ 時間あれば可能 |
| E3-d | 0.5 セッション | ⏰ 連休後で問題なし |

**現実的目標: E3-b 完了 + 余裕あれば E3-c 着手**

E3-b で `InvoiceFinding → Finding` 置換が完了すれば、V1-3-20 が共通スキーマで動作する状態に達する。raw 構造の解体(E3-c)は内部最適化であり、外部 I/F には影響しない。

### 6.3 リスクの所在

#### リスク 1: 必須属性 7 個の設計判断(E3-b で発生)
共通 `Finding` の必須属性(tc_code / sub_code / error_type / review_level / area / sort_priority)を V1-3-20 の各 Finding にどう設定するか。特に:
- `area`: 既存 V1-3-10 の A1-A13 体系に「インボイス」を新設するか、既存と統合するか
- `sub_code`: 3 分類 (QUALIFIED_BUT_TRANSITIONAL_TAX / NONQUALIFIED_BUT_FULL_DEDUCTION_TAX / PARTNER_UNKNOWN) を sub_code 文字列にエンコードする規則
- `error_type`: 「警戒系」を `"gray_review"` / `"reverse_suspect"` のどちらにするか

**戦略 Claude のレビュー必須項目**

#### リスク 2: `f.raw.keys()` の全集合比較テスト 2 件(E3-c で発生)
- L661: `assert set(f.raw.keys()) == {"tax_label", "tax_code", "debit_amount", ...}`
- L1422: 同類

raw 構造を変えると必ず壊れる。テスト書き換えで対応するが、**意図(8 key の存在保証)を保てる新たな検証方式**を設計する必要

#### リスク 3: `debit_amount` の型変換(E3-c で発生)
- V1-3-20 raw: `str` (Decimal を str 化)
- 共通 Finding: `Optional[int]`
- `Decimal("300000")` → `int(300000)` の変換ロジックを `to_finding` に追加が必要
- 端数処理(小数点付き Decimal)の扱いが不明 → 戦略 Claude 確認推奨

---

## Section 7: 残った不明点

調査でも資料からは解消できなかった点:

1. **共通 `Finding` の必須項目の設定方針**(area / sort_priority / error_type 等)— 戦略 Claude のレビュー必須
2. **`tax_label` / `description` を Finding 直下に追加するか、raw 維持か** — 設計判断項目
3. **`debit_amount` の型変換時の端数処理** — Decimal の小数部の扱い不明
4. **V1-3-20 の `area` コードを既存 V1-3-10 体系(A1-A13)に追加するか別系統にするか** — 戦略 Claude のレビュー必須
5. **`source` を将来 raw から動的化する際の方針(L1-C で予定)とE3 の整合性** — 矛盾しない設計か要確認
6. **`InvoiceFinding` を schema.py に「再エクスポート互換層」として残すか完全削除するか** — E2-a と同パターンで再エクスポートが安全
7. **`severity="warning"` → `"🟠 High"` 一意マッピングで本当に十分か**(将来「軽微なインボイス警告」等が増える可能性) — 戦略 Claude のレビュー推奨
