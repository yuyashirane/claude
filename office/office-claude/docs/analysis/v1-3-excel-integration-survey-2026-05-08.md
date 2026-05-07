# V1-3 Excel 統合 (E5) 事前調査レポート

**作成日**: 2026-05-08
**作成者**: Claude Code (戦略 Claude プロンプト指示)
**対象**: β2-E E5 (Excel 統合) の事前調査
**前提**: E1〜E4 完了、整理タスク群 (TODO-E1〜E5) 完了、テスト 588 件 PASS

---

## 1. 調査の目的

設計メモ v2 §4.1 と引き継ぎ書 v3 §3.3 の方針に従い、E5 では以下を行う予定:

- `skills/export/excel_report/` を共通 Skill として昇格
- `.claude/skills/` への登録
- V1-3-20 用の親子行表示ロジック追加 (FindingGroup 活用)
- V1-3-20 固有列 (classification / is_qualified_invoice / partner / transaction_date) の追加

本レポートは E5 実装前の現状把握。E1-pre / E4-pre と同じパターンで、実コードを根拠に記述する。

---

## 2. 軸 A: 既存 Excel 出力の構造

### 2.1 `skills/export/excel_report/` のディレクトリ構造

直下のファイル(`__pycache__/` 除く):

| ファイル | 種別 |
|---|---|
| `__init__.py` | パッケージ宣言のみ(1 行コメント) |
| `exporter.py` | エントリポイント |
| `template_engine.py` | テンプレート駆動エンジン本体 (1133 行) |
| `sheet_builder.py` | 旧 sheet 構築 (Phase 6.11a v2 由来、現在は ctx 駆動の template_engine が主) |
| `styles.py` | severity 表示マップのみ (Phase 6.12 で最小化) |
| `sort_priority_map.py` | TC sub_code → 優先度マップ |
| `template_engine.py.bak_20260418_223238` | バックアップ |
| `SKILL.md` | Skill 説明 (`.claude/skills/` には未登録) |
| `references/area-sheet-mapping.json` | area → シート名マッピング |

### 2.2 主要ファイルの役割

- **`exporter.py`**: `export_to_excel(findings, output_path, company_name, period, template_path, ctx)` の 1 関数のみ。実体は `template_engine.build_output()` に委譲。
- **`template_engine.py`**: テンプレート駆動 (`templates/TC_template.xlsx` 読込→流し込み)。28 個の関数 + 定数群。親子行ロジック `_write_parent_row` / `_write_child_row` / `_fill_detail_sheet_grouped` を含む。
- **`sheet_builder.py`**: 別系統の sheet 組み立て関数群 (`build_detail_sheet`, `build_summary_sheet`, `_write_detail_data_row` 等)。template_engine.py から見ると独立して使われているコードは少ない (引き継ぎ書で「dead code 候補」と扱われている可能性)。
- **`styles.py`**: `SEVERITY_DISPLAY` (絵文字 → "重大"/"要注意"/"要確認" マップ) のみ。
- **`sort_priority_map.py`**: TC-XX-X コード → 優先度 (1〜99) のマッピング、`get_sort_priority(sub_code)` 関数。

### 2.3 出力フローのエントリポイント

- **関数**: `export_to_excel`
- **定義位置**: [skills/export/excel_report/exporter.py:19](office/office-claude/skills/export/excel_report/exporter.py:19)
- **シグネチャ**: `export_to_excel(findings: list, output_path: Path, company_name: str = "", period: str = "", template_path: Path | None = None, ctx=None) -> Path`
- **callsite (production)**: 1 件
  - [skills/verify/V1-3-rule/check-tax-classification/run.py:426](office/office-claude/skills/verify/V1-3-rule/check-tax-classification/run.py:426), 477 (V1-3-10 本体、try/except 経由)
- **callsite (scripts)**: 7 ファイル(`scripts/e2e/generate_template_data.py`, `scripts/verify_phase6_excel.py`, `scripts/verify_phase8b.py`, `scripts/verify_phase8c.py`, `scripts/verify_phase_a_*.py` × 3)
- **callsite (tests)**: 4 ファイル(`tests/e2e/e2e_phase7.py`, `tests/unit/test_excel_export.py`, `tests/unit/test_step3c_exporter.py`, `tests/unit/test_template_engine_phase8b.py`)

### 2.4 Finding → Excel の変換ロジック

- **入力**: `findings: list[Finding]`(共通 Finding、`area` 属性で振り分け)
- **出力**: 保存された `.xlsx` ファイルのパス (`Path`)
- **シート構成**: `templates/TC_template.xlsx` をベースとする。
  - サマリーシート (常に生成)
  - area 別の詳細シート: A4 / A5 / A8 / A10 / A11 / A12(`AREA_ORDER` 定数、[template_engine.py:37](office/office-claude/skills/export/excel_report/template_engine.py:37))。該当 Finding がない area のシートは `wb.remove()` で削除される。
  - 参考シート (テンプレ由来、何もしない)
- **列構成**: テンプレートに固定。詳細シートは Row 4+ がデータ行、各 sub_code に対し親行 1 + 子行 N の構造 (Phase 8-B 以降)。
- **テンプレート使用**: Yes、`templates/TC_template.xlsx`(`DEFAULT_TEMPLATE_PATH`)。スタイル(色・フォント・罫線・列幅)はテンプレートから継承し、Python 側は文字列流し込みのみ。

---

## 3. 軸 B: 共通 Skill 化への影響

### 3.1 V1-3-10 からの callsite

production コードからの呼び出しは 1 ファイル 1 箇所:

- [skills/verify/V1-3-rule/check-tax-classification/run.py:426, 477](office/office-claude/skills/verify/V1-3-rule/check-tax-classification/run.py:426)
- import 文: `from skills.export.excel_report.exporter import export_to_excel`(動的 import、try/except 内)

V1-3-20(`check-invoice-registration-status`)からの呼び出しは現状 0 件 = E5 の対象。

### 3.2 `.claude/skills/` の現状

```
office/office-claude/.claude/skills/
├── check-invoice-registration-status/
│   └── SKILL.md
└── check-tax-classification/
    └── SKILL.md
```

**Excel 出力系 Skill (`excel-report` 等) は `.claude/skills/` に未登録**。`skills/export/excel_report/SKILL.md` は存在するが、`.claude/skills/` 配下にはマウントされていない。

### 3.3 共通 Skill 化に必要な変更の規模感(事実ベース)

- **新設ファイル**: `.claude/skills/excel-report/SKILL.md`(または同等パス) 1 件
- **既存ファイルの物理移動**: 不要(現状の `skills/export/excel_report/` 配下はそのままで OK、`.claude/skills/` から参照する形でよい)
- **import パス変更**: 既存 callsite すべてが `from skills.export.excel_report.exporter import export_to_excel` 形式。物理移動しないなら 0 件、物理移動する場合は production 1 + scripts 7 + tests 4 = **計 12 ファイルの import 文修正**
- **V1-3-20 側の追加**: V1-3-20 の `run.py` から `export_to_excel` を呼ぶ箇所を新規追加(行数は数行)

---

## 4. 軸 C: V1-3-20 用の親子行表示

### 4.1 FindingGroup の現状(2 つの定義が存在)

**重要発見**: `FindingGroup` という名前のクラスがリポジトリ内に 2 つ独立に定義されている。

#### (a) 共通版: [skills/_common/lib/schema.py:57](office/office-claude/skills/_common/lib/schema.py:57)

```python
@dataclass(frozen=True)
class FindingGroup:
    group_key: str
    tc_code: str
    sub_code: str
    severity: str
    area: str
    count: int
    total_debit: int
    total_credit: int
    findings: tuple = field(default_factory=tuple)
```

- **使用箇所**: V1-3-10 の Excel 出力。`finding_grouper.group()` ([skills/_common/lib/finding_grouper.py:207](office/office-claude/skills/_common/lib/finding_grouper.py:207)) が生成、`template_engine._fill_detail_sheet_grouped` ([template_engine.py:1004](office/office-claude/skills/export/excel_report/template_engine.py:1004)) が読む
- **集約単位**: TC sub_code 単位(`group_key` は GROUP_KEY_STRATEGIES が TC ごとに生成)
- **テスト**: [tests/unit/test_finding_grouper.py](office/office-claude/tests/unit/test_finding_grouper.py)、18 tests

#### (b) V1-3-20 固有版: [skills/verify/V1-3-rule/check-invoice-registration-status/schema.py:66](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/schema.py:66)

```python
@dataclass(frozen=True)
class FindingGroup:
    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]
```

- **使用箇所**: V1-3-20 の `run.find_groups`([run.py:288](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/run.py:288)) が生成
- **集約単位**: classification 単位(QUALIFIED_BUT_TRANSITIONAL_TAX / NONQUALIFIED_BUT_FULL_DEDUCTION_TAX / PARTNER_UNKNOWN の 3 種、固定順序)
- **テスト**: [tests/unit/test_invoice_registration_status.py:1686](office/office-claude/tests/unit/test_invoice_registration_status.py:1686) `class TestFindingGroup` (4 tests)

**結論**: V1-3-10 の親子行レイアウトを再利用するには、V1-3-20 用 FindingGroup を共通版の構造に変換するか、Excel 層が両方扱える設計にするか、いずれかの判断が必要(論点 1)。

### 4.2 V1-3-10 における親子行ロジックの有無

存在する。実コード位置:

- [`_write_parent_row`](office/office-claude/skills/export/excel_report/template_engine.py:806): `(ws, row, group, ctx)` を受け取り、Named Style "parent_row_style_{severity}" を適用
- [`_write_child_row`](office/office-claude/skills/export/excel_report/template_engine.py:894): `(ws, row, finding, prev_message, txn_index)`、Named Style "child_row_style"
- [`_fill_detail_sheet_grouped`](office/office-claude/skills/export/excel_report/template_engine.py:1004): `(ws, findings, ctx)` を受け取り、`finding_grouper.group()` で共通版 `FindingGroup` を生成 → 親子行を順に書き込む
- [`_apply_parent_row_alignment`](office/office-claude/skills/export/excel_report/template_engine.py:198) / [`_apply_child_row_alignment`](office/office-claude/skills/export/excel_report/template_engine.py:204): 行 alignment 適用
- [`_parent_row_summary`](office/office-claude/skills/export/excel_report/template_engine.py:718) / [`_parent_row_observation`](office/office-claude/skills/export/excel_report/template_engine.py:755) / [`_parent_row_check_result`](office/office-claude/skills/export/excel_report/template_engine.py:767): 親行の D/E/Q 列の文字列組み立て (pure helper)

`SEVERITY_TO_PARENT_STYLE` ([template_engine.py:128-131](office/office-claude/skills/export/excel_report/template_engine.py:128)) で severity → スタイル名のマッピングが中央集約されている。

すべて V1-3-10 の共通版 FindingGroup (TC sub_code 単位) を前提とした実装。V1-3-20 の classification 単位 FindingGroup には現状未対応。

### 4.3 V1-3-20 で必要な親子表示構造

V1-3-20 の Finding 構造 ([test_invoice_registration_status.py:1669-1683](office/office-claude/tests/unit/test_invoice_registration_status.py:1669) の `_make_finding` ファクトリより):

```python
InvoiceFinding(
    tc_code="V1-3-20",
    sub_code="01",
    severity="🟠 High",
    error_type="invoice_warning",
    review_level="🟠 重点確認",
    area="A14",        # ← 重要: 既存 AREA_ORDER (A4/A5/A8/A10/A11/A12) には含まれない
    sort_priority=30,
    wallet_txn_id=...,
    message=...,
    classification=...,
    raw={...},
)
```

`area="A14"` は V1-3-10 既存マッピングに存在しないため、E5 では area マッピング側の拡張も必要(`AREA_ORDER` 定数、`area-sheet-mapping.json`)。

V1-3-20 の親子行は「classification 単位の親 1 + その classification に属する Finding を子 N」という構造になる(設計メモ §6.2 TestFindGroups 由来)。

---

## 5. 軸 D: V1-3-20 固有列

### 5.1 4 列の格納方法 (実コード根拠)

| 列名 | 共通 Finding 直下属性 | raw["..."] | その他 |
|---|---|---|---|
| `classification` | ✅ 定義: [_common/schema.py:123](office/office-claude/skills/_common/schema.py:123)<br>✅ 設定済: [checker.py:166](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:166) (`classification.value`) | なし | - |
| `partner` | ✅ 定義: [_common/schema.py:124](office/office-claude/skills/_common/schema.py:124)<br>**⚠️ checker.to_finding では未設定** | ✅ [checker.py:247](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:247) (`_build_raw`内) | - |
| `transaction_date` | ✅ 定義: [_common/schema.py:125](office/office-claude/skills/_common/schema.py:125)<br>**⚠️ checker.to_finding では未設定** | ✅ [checker.py:249-253](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:249) (isoformat) | - |
| `is_qualified_invoice` | ✅ 定義: [_common/schema.py:126](office/office-claude/skills/_common/schema.py:126)<br>**⚠️ checker.to_finding では未設定** | ✅ [checker.py:255](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:255) | - |

加えて [_common/schema.py:127](office/office-claude/skills/_common/schema.py:127) には `tax_code: Optional[int]` も用意されている(これも raw のみに格納されている可能性、未調査)。

`raw` 経由のテストアクセス箇所 (8 件、[test_invoice_registration_status.py](office/office-claude/tests/unit/test_invoice_registration_status.py) line 689, 691, 693, 744, 1467, 1477, 1479, 1494):

```python
assert f.raw["partner"] == "未登録ベンダー"
assert f.raw["transaction_date"] == "2025-12-15"
assert f.raw["is_qualified_invoice"] is False
```

**現状の実装と定義の乖離**:
- 共通 Finding には 4 列すべての**直下属性が定義済**
- ただし `checker.to_finding` は `classification` だけ直下に渡し、残り 3 列は `raw` dict にのみ入れている
- Excel 層が `f.partner` で読みに行くと現状は `None` が返る

### 5.2 E3-c との関係 (案 X/Y/Z)

#### Claude Code の推奨: **案 Y (E3-c を E5 より先に着手)**

#### 理由 (実コード根拠)

1. **E3-c の規模が小さい**: 現在 raw のみに格納されているのは `partner` / `transaction_date` / `is_qualified_invoice` / `tax_code` の 4 列のみ。`checker.to_finding` ([checker.py:153-169](office/office-claude/skills/verify/V1-3-rule/check-invoice-registration-status/checker.py:153)) に 4 行の代入を追加するだけで完結する。テスト側の `f.raw["..."]` → `f.<attr>` 書き換えは 8 件(line 689, 691, 693, 744, 1467, 1477, 1479, 1494)。
2. **E5 の Excel 層が 4 列に統一的にアクセスできる**: 現状のままだと、Excel 層では `classification` は `f.classification` から、`partner` 等は `f.raw["partner"]` から読み出す混在実装になり、可読性とテスト容易性が下がる。
3. **案 X (E5 先行) の場合の二度手間**: E5 で Excel 層に raw 依存を入れると、後の E3-c 完了後に Excel 層を再修正する必要が出る。
4. **案 Z (混在) の判断余地が乏しい**: raw 解体は機械的な書き換えで済むため、E5 と混ぜる利点が薄い。
5. **既に共通 Finding に 4 列の直下属性が定義済** ([_common/schema.py:123-127](office/office-claude/skills/_common/schema.py:123)): E1 で先回り対応されている = E3-c で残るのは「checker での代入」「テストでのアクセス書き換え」のみ。

最終決定は戦略 Claude + 悠皓に委ねる。

---

## 6. 軸 E: テスト戦略

### 6.1 既存 Excel 出力テストのカバレッジ

| ファイル | テスト件数 | 焦点 |
|---|---|---|
| `tests/unit/test_excel_export.py` | 54 | Excel 出力一般(空 findings、列出力、severity マッピング、template 不在等) |
| `tests/unit/test_template_engine_phase8b.py` | 39 | Phase 8-B 親子行レイアウト + Phase 8-C ctx |
| `tests/unit/test_step3c_exporter.py` | 18 | Phase 8-C ctx 関連、`_sort_findings` / `_parent_row_*` 等の pure helper |
| `tests/unit/test_finding_grouper.py` | 18 | `finding_grouper.group()` / `is_mixing_pattern` |
| `tests/e2e/e2e_phase7.py` | (e2e 1 ファイル) | Phase 7 e2e 実行 |
| `tests/unit/test_invoice_registration_status.py` | 129 | V1-3-20 全般。Excel 出力テストは未含 |

合計: Excel 関連 unit テスト = 54 + 39 + 18 + 18 = **129 件**(`test_finding_grouper.py` を含む場合)。

### 6.2 共通 Skill 化後の見直し論点 (事実整理のみ)

- **import パス**: 物理移動しない場合は不要、移動する場合は計 12 ファイルの import 文を修正
- **V1-3-20 用 Excel テストの新規追加位置**: 既存テスト群との整合をどう取るか(同一ファイルに追加 / 専用ファイル新設 / V1-3-20 既存 test_invoice_registration_status.py に追加 のいずれか)は判断対象
- **fixture の共通化**: V1-3-10 の test_excel_export.py に `tests/fixtures/` 系の共有 fixture があるか、V1-3-20 から流用可能かは未調査

---

## 7. E5 実装フェーズ予測 (Claude Code の試案)

軸 A〜E の調査結果から、E5 を以下のサブクラスタに分割できそう (試案):

- **E5-pre (E3-c)**: `checker.to_finding` に 3 列代入を追加 + テスト 8 件の raw アクセスを直下属性アクセスに書き換え。1 commit。
- **E5-1**: `.claude/skills/excel-report/SKILL.md` 新設 (物理移動なし版)。`skills/export/excel_report/` を共通 Skill として `.claude/skills/` から参照可能にする。SKILL.md のみの追加で済む可能性。
- **E5-2**: V1-3-20 用の `area="A14"` を AREA_ORDER + area-sheet-mapping.json に追加。テンプレート (`TC_template.xlsx`) に A14 用シートを追加するか別テンプレを使うかの判断が必要。
- **E5-3**: V1-3-20 固有 4 列を Excel 詳細シートの列として表示するロジック追加 (template_engine の `_write_child_row` 拡張、または V1-3-20 専用 child row 関数の新設)。
- **E5-4**: V1-3-20 用の親子行表示ロジック追加。classification 単位 FindingGroup を共通版 FindingGroup と Excel 層がどう扱うかの判断が必要(論点 1)。
  - 案 1: V1-3-20 固有 FindingGroup を共通版 FindingGroup に変換するアダプタを作る
  - 案 2: Excel 層が両方の FindingGroup 型を受け取れるように改修
  - 案 3: V1-3-20 用の親子行関数を別途定義
- **E5-5**: V1-3-20 から `export_to_excel` を呼ぶ統合(`run.py` の export ステップ追加)。
- **E5-6**: V1-3-20 用 Excel 出力テストの新規追加。

E5-pre + E5-1〜E5-6 で 7 サブクラスタ。引き継ぎ書 v3 §3.3 が「E5 は 2〜3 セッション想定」と記載しているのと整合する規模感。

---

## 8. 結論と次のアクション

### 8.1 自明な部分 (戦略 Claude 確認不要)

- `skills/export/excel_report/` の主要ファイルは exporter / template_engine / sheet_builder / styles / sort_priority_map の 5 つ
- Excel 出力エントリポイントは `export_to_excel`、production callsite は V1-3-10 の 1 箇所のみ
- `.claude/skills/` には Excel 出力系の Skill は未登録(= E5 で新設対象)
- V1-3-10 では親子行ロジック (`_write_parent_row` / `_write_child_row` / `_fill_detail_sheet_grouped`) が完全実装済
- 共通 Finding には V1-3-20 固有 4 列(classification / partner / transaction_date / is_qualified_invoice) + tax_code の直下属性が既に定義済 ([_common/schema.py:123-127](office/office-claude/skills/_common/schema.py:123))
- V1-3-20 Finding の `area` は `"A14"` で既存 AREA_ORDER (A4/A5/A8/A10/A11/A12) に未含 = area マッピング拡張が必要

### 8.2 要相談 (戦略 Claude に判断仰ぐ)

- **論点 1 (FindingGroup 二重定義)**: 共通版 FindingGroup (TC 単位) と V1-3-20 固有版 FindingGroup (classification 単位) の扱いをどうするか(アダプタ / 多態化 / 別関数化のいずれか)
- **論点 2 (E3-c 案 X/Y/Z)**: Claude Code 推奨は案 Y(E3-c 先行)。最終判断
- **論点 3 (`skills/export/excel_report/` の物理移動の要否)**: `.claude/skills/excel-report/SKILL.md` を新設するだけで済ませるか、物理移動するか。物理移動の場合は import 修正 12 ファイル
- **論点 4 (`area="A14"` 用テンプレート)**: 既存 `TC_template.xlsx` に A14 シートを追加するか、V1-3-20 専用テンプレを別途用意するか
- **論点 5 (V1-3-20 用 Excel テスト位置)**: 既存 `test_excel_export.py` 等に追加 / 専用ファイル新設 / `test_invoice_registration_status.py` に追加 のいずれか
- **論点 6 (sheet_builder.py の扱い)**: dead code として削除できるか、Phase 8 関連で再利用予定があるか確認(本タスクのスコープ外、参考論点)

---

**作成者**: Claude Code
**バージョン**: v1
