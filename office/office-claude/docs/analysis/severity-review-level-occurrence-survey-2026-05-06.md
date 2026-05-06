# Severity / ReviewLevel 旧値の出現箇所調査レポート

**作成日**: 2026-05-06
**ブランチ**: main (調査のみ、変更なし)
**目的**: E2-b (旧値 → 新値の機械的置換) の戦略立案のため、置換対象の全箇所を把握する
**ステータス**: 読み取り専用調査。実装変更なし。

---

## 0. 集計方法と注意点

- ファイル拡張子: `*.py` / `*.json` / `*.md` を対象
- 検索ツール: ripgrep
- **置換対象外として除外**:
  - `skills/_common/schema.py` の `SEVERITY_LEGACY_MAP` / `REVIEW_LEVEL_LEGACY_MAP` 定義
  - `tests/unit/test_common_schema.py` の互換マップテスト
  - `skills/verify/V1-3-rule/check-tax-classification/schema.py.bak_20260418_221222` (バックアップ)
  - `docs/` 配下のドキュメント全般 (仕様書・分析・設計メモは歴史記録として旧値保持)
  - `reports/schema_gap_report.md` (歴史記録)

---

## Section 1: Severity 旧値の出現分布

### 1.1 件数サマリ

| 旧値 | 新値 | 総出現件数 | 置換対象(概算) | 除外(マップ/bak/docs等) |
|---|---|---|---|---|
| `🔴 High` | `🔴 Critical` | **129** (27 ファイル) | 約 55 | 約 75 |
| `🟠 Warning` | `🟠 High` | **12** (9 ファイル) | 約 7 | 約 5 |
| `🟡 Medium` | `🟡 Medium` (変更なし) | (調査対象外) | — | — |
| `🟢 Low` | `🟢 Low` (変更なし) | (調査対象外) | — | — |

### 1.2 ファイル別 件数(置換対象、`🔴 High` + `🟠 Warning` の合算)

#### A. テストファイル (置換対象 約 23 件)

| ファイル | `🔴 High` | `🟠 Warning` | カテゴリ |
|---|---|---|---|
| `tests/unit/test_template_engine_phase8b.py` | 7 | 2 | A |
| `tests/unit/test_excel_export.py` | 5 | 0 | A |
| `tests/unit/test_finding_grouper.py` | 4 | 1 | A |
| `tests/unit/test_common.py` | 5 | 0 | A |
| `tests/unit/test_tc06.py` | 1 | 0 | A |
| `tests/unit/test_tc07.py` | 1 | 0 | A |

#### B. 実装コード (置換対象 約 24 件)

| ファイル | `🔴 High` | `🟠 Warning` | カテゴリ |
|---|---|---|---|
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc01_sales.py` | 4 | 0 | B |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc02_land_rent.py` | 3 | 0 | B |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc03_payroll.py` | 2 | 0 | B |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc04_non_taxable_revenue.py` | 2 | 0 | B |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc06_tax_public_charges.py` | 2 | 0 | B |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc07_welfare.py` | 4 | 0 | B |
| `skills/_common/lib/finding_grouper.py` | 2 | 2 | B |
| `skills/export/excel_report/template_engine.py` | 1 | 1 | B |
| `skills/export/excel_report/sort_priority_map.py` | 1 | 0 | B |

#### E. スクリプト/補助ツール (置換対象 約 11 件)

| ファイル | `🔴 High` | `🟠 Warning` | カテゴリ |
|---|---|---|---|
| `scripts/e2e/generate_template_data.py` | 6 | 1 | E |
| `scripts/verify_part2_lib.py` | 3 | 0 | E |
| `scripts/verify_phase6_excel.py` | 1 | 0 | E |
| `scripts/verify_part1_schema.py` | 1 | 0 | E |

### 1.3 注目すべき出現パターン

- **TC 系チェッカー(tc01〜tc07)**: 全 7 ファイルに `severity="🔴 High"` 形式のリテラルが分散
- **`finding_grouper.py:L?`**: 集約ロジックで Severity リテラルを直接比較している可能性(行レベル未確認、E2-b 着手時に要確認)
- **`scripts/e2e/generate_template_data.py`**: テンプレート用サンプルデータ生成。テストでは保護されていないため置換ミスのリスクあり
- 機械置換が難しい f-string 動的組み立てパターンは目視範囲では未発見(E2-b 着手時に grep で再確認)

---

## Section 2: ReviewLevel 旧値の出現分布

### 2.1 件数サマリ

| 旧値 | 新値 | 総出現件数 | 置換対象(概算) | 除外 |
|---|---|---|---|---|
| `🔴必修` | `🔴 必須確認` | **48** (15 ファイル) | 約 16 | 約 32 |
| `🟡判断` | `🟡 通常確認` | **21** (6 ファイル) | 約 8 | 約 13 |
| `🟠警戒` | `🟠 重点確認` | **16** (6 ファイル) | 約 3 | 約 13 |
| `🟢参考` | `🟢 参考確認` | **22** (8 ファイル) | 約 7 | 約 15 |

### 2.2 ファイル別 件数(置換対象)

#### A. テストファイル (置換対象 約 7 件)

| ファイル | `🔴必修` | `🟡判断` | `🟠警戒` | `🟢参考` |
|---|---|---|---|---|
| `tests/unit/test_template_engine_phase8b.py` | 2 | 0 | 0 | 0 |
| `tests/unit/test_common.py` | 1 | 0 | 0 | 1 |
| `tests/unit/test_excel_export.py` | 1 | 0 | 0 | 0 |

#### B. 実装コード (置換対象 約 9 件)

| ファイル | `🔴必修` | `🟡判断` | `🟠警戒` | `🟢参考` |
|---|---|---|---|---|
| `skills/_common/lib/finding_factory.py` | **3** | **2** | **2** | **2** |

#### E. スクリプト/補助ツール (置換対象 約 18 件)

| ファイル | `🔴必修` | `🟡判断` | `🟠警戒` | `🟢参考` |
|---|---|---|---|---|
| `scripts/e2e/generate_template_data.py` | 6 | 6 | 1 | 4 |
| `scripts/verify_phase6_excel.py` | 1 | 0 | 0 | 0 |
| `scripts/verify_part2_lib.py` | 1 | 0 | 0 | 0 |
| `scripts/verify_part1_schema.py` | 1 | 0 | 0 | 0 |

### 2.3 ⚠️ 決定的な発見: `_ERROR_TYPE_TO_REVIEW_LEVEL` 辞書

`skills/_common/lib/finding_factory.py:232-237` に **ReviewLevel 値の中央集約地点** が存在:

```python
_ERROR_TYPE_TO_REVIEW_LEVEL: dict[str, str] = {
    "direct_error":    "🔴必修",
    "gray_review":     "🟡判断",
    "reverse_suspect": "🟠警戒",
    "mild_warning":    "🟢参考",
}
```

これは `create_finding()` (L279) 経由で全 Finding に伝播するため、**この 1 辞書を置換するだけで実装層の ReviewLevel 出力は全箇所新名称になる**。テストで個別に旧値を expectation する箇所のみ別途置換が必要。

docstring 内 (L262-265) の参考表記も併せて置換対象。

---

## Section 3: references/ JSON マスタの状況

### 3.1 ファイル一覧
```
skills/_common/references/
├── area-definitions.json
├── overseas-services.json
├── severity-levels.json    ← 🔴 検証対象
├── tax-code-categories.json
└── tax-codes-master.json
```

### 3.2 `severity-levels.json` の構造分析

JSON マスタは **Python リテラル `"🔴 High"` とは別構造**:

```json
{
  "severity": {
    "🔴": {"label": "High", "meaning": "..."},
    "🟡": {"label": "Medium", ...},
    "🟠": {"label": "Warning", ...},
    "🟢": {"label": "Low", ...}
  },
  "review_level": {
    "必修":   {"description": "...", ...},
    "判断":   {...},
    "警戒":   {...},
    "参考":   {...}
  }
}
```

- **emoji 単独 key + label 別キー** という分離構造で、Python の `"🔴 High"` 単一リテラルとは独立した管理
- `"label": "Warning"` (Severity) と `"必修"` 等 (ReviewLevel) は **意味的に旧名称を保持** している

### 3.3 JSON 更新の判断

- E2-b の Python リテラル置換とは **独立した修正判断** が必要
- このファイルを参照しているコードを grep する限り、`load_common_definitions("severity-levels")` 等の経路で値が読み込まれている可能性は高いが、参照箇所の網羅確認は未実施(E2-b 着手時に追加調査推奨)
- 暫定方針: **E2-b では JSON マスタを触らず、Python リテラル置換のみ実施**。JSON 側の整合は別タスク (E2-b の事後 or 別フェーズ)

---

## Section 4: 静的型チェックの状況

リポジトリ全体を確認した結果:

- `.github/workflows/`: **存在しない** (CI 設定なし)
- `mypy.ini` / `pyproject.toml` / `pre-commit-config.yaml` / `tox.ini` / `ruff.toml`: いずれも **存在しない**
- 静的型チェックは **CI に組み込まれていない**

E2-a 完了時点で型エラーが発生しても CI で検知されない状態。E2-b で旧値 → 新値置換を行うことの **静的型チェック上の緊急性は低い**(実行時動作のみが現状の合格条件)。

---

## Section 5: V1-3-20 の Severity 利用状況

### 5.1 利用実例

`skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:120`:
```python
return InvoiceFinding(
    severity="warning",   # ← 独自系統の値
    ...
)
```

### 5.2 重要な観察

- **V1-3-20 は `severity="warning"` という独自文字列**を使用。SEVERITY_LEGACY_MAP の対応外
- V1-3-20 `InvoiceFinding.severity: str` (型制約なし、設計メモ §2.4)
- これは E2-b の対象外。E3 (V1-3-20 移行) で別途マッピング設計が必要(`"warning"` → 共通 Severity Literal のいずれか、おそらく `"🟠 High"`?)

---

## Section 6: 推奨される E2-b 戦略

### 6.1 推奨: **(b) E2-b2 / E2-b3 に分割**

#### 推奨理由

総置換対象は概算 **約 95 件 (Severity 62 + ReviewLevel 34)** で、件数的には単一クラスタ可能だが、以下の理由で分割が安全:

1. **`finding_factory._ERROR_TYPE_TO_REVIEW_LEVEL` 辞書が ReviewLevel の中央集約地点**
   - この辞書を置換すれば実装側 ReviewLevel は全箇所新名称になる
   - テスト側の expectation のみ並行更新が必要 → 1 セッションで完結可能
2. **Severity の分散度が高い** (TC07 ファイル + 集約系 + テンプレート系 + スクリプト系)
   - tc01〜tc07 の 7 ファイル + finding_grouper + template_engine + sort_priority_map で 24 件の実装側散在
   - スクリプト類はテストで保護されないため目視確認が要る → リスクが ReviewLevel より高い
3. **JSON マスタは別判断** (Section 3 参照) — E2-b スコープ外で確定すべき

#### 分割案

**E2-b2: ReviewLevel 置換** (先行、低リスク)
- `finding_factory._ERROR_TYPE_TO_REVIEW_LEVEL` 辞書 + docstring + テスト 4 件 + スクリプト 4 件 + サンプル生成 17 件 = 約 34 件
- 中心ハブ 1 箇所変更 → テスト一発回帰確認
- **規模**: 1 セッション

**E2-b3: Severity 置換** (後続、分散リスク)
- TC 全 7 ファイル + 集約系 + テンプレート系 + テスト 6 件 + スクリプト 11 件 = 約 62 件
- 各 TC ファイルに分散しているため、目視 + 自動置換の組み合わせ
- **規模**: 1 セッション(または更に分割)

**(別判断) JSON マスタ更新**
- E2-b 完了後に独立タスクとして実施 (任意)

#### (a) 単一クラスタ案を選ばない理由
件数 95 件は単一可能だが、Severity 系の分散度を踏まえると、ReviewLevel を先に成功させて運用パターンを確立してから Severity に進む方が事故率が低い。

### 6.2 実装時の注意点

1. **`SEVERITY_LEGACY_MAP` / `REVIEW_LEVEL_LEGACY_MAP` 定義は触らない** (`skills/_common/schema.py`)
2. **`tests/unit/test_common_schema.py` の `TestLegacyMaps` は触らない** (互換マップ自体のテスト)
3. **`schema.py.bak_20260418_221222` は触らない** (バックアップ)
4. **`docs/` 配下と `reports/schema_gap_report.md` は触らない** (歴史記録)
5. **f-string 動的組み立てパターンが残っていないか E2-b 着手時に再 grep**
6. **scripts/ 配下は pytest 対象外**のため、置換後に手動で実行確認推奨

---

## Section 7: 残った不明点

1. **`finding_grouper.py` での Severity リテラル比較ロジック** — 行レベル未確認。E2-b 着手時に該当 4 件を view して、単純な `==` 比較か `if severity in [...]` パターンか把握する必要あり
2. **`scripts/e2e/generate_template_data.py` の用途** — テンプレートデータ生成の出力ファイルを利用しているテストや E2E があるかは未確認。置換後に整合性確認が要る場合あり
3. **JSON マスタ `severity-levels.json` を参照しているコードの網羅** — `load_common_definitions("severity-levels")` 等の grep が未実施。E2-b 着手前に確認推奨
4. **V1-3-20 の `severity="warning"` を新 Severity Literal にマップする方針** — 設計メモ §2.4 では「変換が必要(後述 §5 のフェーズ分割で位置決め)」とあるが、E3 で扱うかこの段階で確定するか、悠皓判断
5. **finding_grouper.py の Severity 由来コード**: `finding_grouper.py:L?` での Severity 比較 (置換対象 2 件) が、もし Severity の **大小比較** をしているなら新値変更で順序が変わる可能性 — 着手時に要確認
