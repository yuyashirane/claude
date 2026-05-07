---
name: excel-report
description: |
  Finding リストを受け取り、`templates/TC_template.xlsx` をベースとした
  Excel レポート (.xlsx) を生成する内部ライブラリ Skill。

  本 Skill は会話発動型ではなく、他の Skill (V1-3-10 / V1-3-20 / 将来の
  V1-3-30 など) の run.py から `export_to_excel()` を呼び出して使う
  「ライブラリ Skill」です。Claude Code エージェントが直接発動する場面は
  ありません。発動する Skill 側 (例: check-tax-classification) の
  SKILL.md に従って間接的に利用されます。

  実装の正本: `skills/export/excel_report/`。本 SKILL.md は `.claude/skills/`
  への登録用エントリで、実装コードは既存配置を参照します (β2-E E5-1 で
  論点 3 = 物理移動なし の決定に基づく)。
---

# Excel Report (内部ライブラリ Skill)

## 概要

`Finding[]` を受け取り、テンプレート駆動 (`templates/TC_template.xlsx`) で
Excel レポート (.xlsx) を生成します。スタイル (色・フォント・罫線・列幅) は
テンプレートから継承し、Python 側は文字列流し込みと severity 表示変換のみを
担当します。

**実装の正本**: `skills/export/excel_report/` 配下の
`exporter.py` / `template_engine.py` / `sheet_builder.py` /
`styles.py` / `sort_priority_map.py`。本 SKILL.md は `.claude/skills/`
への登録用エントリで、実装コードは既存配置を参照します。

## 位置づけ

本 Skill は「ライブラリ Skill」です。会話発動型ではなく、他の Skill から
内部的に呼び出されます。

- 呼び出し元 (production): V1-3-10 (`check-tax-classification`) の `run.py`
- 将来の呼び出し元 (予定): V1-3-20 (`check-invoice-registration-status`) ほか

会話から「Excel を出力して」という依頼があった場合は、出力対象のチェック
結果が属する上位 Skill (例: `check-tax-classification`) を発動してください。
本 Skill 単独では Finding を生成しません。

## エントリポイント

```python
from skills.export.excel_report.exporter import export_to_excel

path = export_to_excel(
    findings=findings,           # list[Finding]
    output_path=Path("report.xlsx"),
    company_name="株式会社〇〇",  # 任意、レポートタイトル用
    period="2026年2月期",          # 任意、対象期間文字列
    template_path=None,            # 任意、None ならデフォルト使用
    ctx=None,                      # 任意、CheckContext (Phase 8-C 追加)
)
```

定義位置: [`skills/export/excel_report/exporter.py:19`](../../skills/export/excel_report/exporter.py)

シグネチャ:

```python
def export_to_excel(
    findings: list,
    output_path: Path,
    company_name: str = "",
    period: str = "",
    template_path: Path | None = None,
    ctx=None,
) -> Path:
```

## 入力

| 引数 | 型 | 内容 |
|---|---|---|
| `findings` | `list[Finding]` | 共通 Finding (`skills/_common/schema.py`) のリスト。空リスト可。`area` 属性で詳細シートに振り分けられる |
| `output_path` | `Path` | 出力先 .xlsx の絶対パスまたは相対パス。親ディレクトリは事前に存在している必要あり |
| `company_name` | `str` | サマリーシートのタイトル・メタ情報に反映。省略可 |
| `period` | `str` | 対象期間の表示文字列 (例: `"2026/02"`、`"2026年2月期"`)。省略可 |
| `template_path` | `Path \| None` | テンプレートファイルパス。`None` の場合は `templates/TC_template.xlsx` を使用 |
| `ctx` | `CheckContext \| None` | 渡されると親行 GL リンクが会計期間全体 (`ctx.period_start`/`period_end`) で生成される。`None` のときは `link_hints` ベース (単月) にフォールバック (Phase 8-C 追加) |

## 出力

戻り値: `Path` (保存された .xlsx のパス、引数 `output_path` と同じ値)。

例外:
- `TypeError`: `findings` が `list` でない場合
- `FileNotFoundError`: テンプレートファイルが存在しない場合
- `ValueError`: `output_path` の親ディレクトリが存在しない場合

## 実装の場所

物理ファイルは `skills/export/excel_report/` 配下のまま (β2-E E5-1 で物理移動なしを決定)。
本 SKILL.md は登録ポインタとして `.claude/skills/excel-report/SKILL.md` に置く。

```
office/office-claude/
├── .claude/skills/excel-report/SKILL.md   ← 本ファイル (Skill 登録)
└── skills/export/excel_report/             ← 実装の正本
    ├── exporter.py
    ├── template_engine.py
    ├── sheet_builder.py
    ├── styles.py
    ├── sort_priority_map.py
    ├── references/area-sheet-mapping.json
    └── SKILL.md                            ← 旧版 (実装側のローカル説明)
```

## 主要モジュール

| モジュール | 役割 |
|---|---|
| `exporter.py` | エントリポイント `export_to_excel()` の薄い委譲層 (実体は `template_engine.build_output()` を呼ぶ) |
| `template_engine.py` | テンプレート駆動 Excel エンジン本体。`build_output()` がサマリーシート + area 別詳細シートを生成。Phase 8-B 親子行 (`_write_parent_row` / `_write_child_row` / `_fill_detail_sheet_grouped`) と Phase 8-C ctx 駆動 GL リンクを含む |
| `sheet_builder.py` | サマリーシート・詳細シート生成モジュール (Phase 6.11a v2 の旧経路、現在は template_engine が主) |
| `styles.py` | severity 表示マップのみ (Phase 6.12 で最小化、色/フォント/列幅はテンプレートから継承) |
| `sort_priority_map.py` | TC sub_code → 優先度 (1〜99) のマッピング、`get_sort_priority(sub_code)` 関数 |

## 出力構成 (V1-3-10 ベース)

| シート | 条件 |
|---|---|
| サマリー | 常に生成 (findings 空でも空の集計表) |
| A4 家賃・地代 | TC-02 の Finding が存在する場合のみ |
| A5 人件費 | TC-03 の Finding が存在する場合のみ |
| A8 売上 | TC-01 の Finding が存在する場合のみ |
| A10 その他経費 | TC-05b/d/e, TC-07 の Finding が存在する場合のみ |
| A11 営業外・特別損益 | TC-04, TC-05a/c の Finding が存在する場合のみ |
| A12 税金 | TC-06 の Finding が存在する場合のみ |

`AREA_ORDER` 定数: `["A4", "A5", "A8", "A10", "A11", "A12"]`
([`skills/export/excel_report/template_engine.py:37`](../../skills/export/excel_report/template_engine.py))

V1-3-20 用の `area="A14"` (インボイス専用エリア) は β2-E E5-2 で
`AREA_ORDER` および `references/area-sheet-mapping.json` に追加予定。

## 依存関係

- **共通スキーマ**: `skills/_common/schema.py` の `Finding`、`skills/_common/lib/schema.py` の `FindingGroup` / `FindingLike`
- **集約層**: `skills/_common/lib/finding_grouper.py` の `group()` (TC sub_code 単位の `FindingGroup` を生成)
- **freee リンク生成**: `skills/_common/lib/freee_link_generator.py` の `build_group_gl_link` / `generate_gl_url` / `generate_jnl_url`
- **テンプレート**: `templates/TC_template.xlsx` (唯一の正、変更禁止)
- **外部依存**: `openpyxl` のみ (pandas / xlsxwriter は不使用)

## 使用例 (V1-3-10 production callsite)

[`skills/verify/V1-3-rule/check-tax-classification/run.py:426, 477`](../../skills/verify/V1-3-rule/check-tax-classification/run.py) より:

```python
from skills.export.excel_report.exporter import export_to_excel

output_path = (
    reports_dir
    / f"v1-3-10_{period_start}_to_{period_end}_{ts}.xlsx"
)

export_to_excel(
    findings,
    output_path,
    company_name=company_name,
    period=_format_period_jp(period_start, period_end),
    ctx=ctx,
)
```

production callsite はこの 1 箇所のみ。scripts (`scripts/verify_phase*.py` 等)
とテスト (`tests/unit/test_excel_export.py` 等) からは多数呼ばれている。

## 関連テスト

| テストファイル | 件数 | 焦点 |
|---|---|---|
| `tests/unit/test_excel_export.py` | 54 | Excel 出力一般 (空 findings、列出力、severity マッピング、template 不在等) |
| `tests/unit/test_template_engine_phase8b.py` | 39 | Phase 8-B 親子行レイアウト + Phase 8-C ctx |
| `tests/unit/test_step3c_exporter.py` | 18 | Phase 8-C ctx 関連、`_sort_findings` / `_parent_row_*` 等の pure helper |
| `tests/unit/test_finding_grouper.py` | 18 | `finding_grouper.group()` / `is_mixing_pattern` |
| `tests/e2e/e2e_phase7.py` | (e2e) | Phase 7 e2e 実行 |

## 制限事項

- freee リンク URL 生成は Phase 7 以降で対応。Phase 6 では URL 列が空欄
- 判定ロジックは含まない (出力専用)。Finding は呼び出し元の Skill が生成
- `openpyxl` のみ使用 (pandas / xlsxwriter は不使用)
- V1-3-20 用の `area="A14"` は β2-E E5-2 以降で対応予定

## 拡張ポイント (β2-E E5 サブクラスタ)

E5-1 (本 Skill 登録) 完了後、以下が予定されている:

- **E5-2**: `AREA_ORDER` + `area-sheet-mapping.json` に `A14` 追加
- **E5-3**: V1-3-20 固有 4 列 (classification / partner / transaction_date / is_qualified_invoice) を詳細シートに表示
- **E5-4**: V1-3-20 固有 `FindingGroup` (classification 単位) を共通版 `FindingGroup` (TC 単位) にアダプタ変換 (論点 1)
- **E5-5**: V1-3-20 から `export_to_excel` を呼ぶ統合
- **E5-6**: V1-3-20 用 Excel 出力テストの新規追加

## 関連ドキュメント

- 実装側ローカル説明: [`skills/export/excel_report/SKILL.md`](../../skills/export/excel_report/SKILL.md)
- E5 事前調査レポート: [`docs/analysis/v1-3-excel-integration-survey-2026-05-08.md`](../../docs/analysis/v1-3-excel-integration-survey-2026-05-08.md)
- 設計メモ: `docs/design/V1-3-20_beta2_E_design_v2.md`
