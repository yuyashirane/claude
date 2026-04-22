# Phase 8-B テンプレート修正要件（確定版 v2）

**作成**: Claude Code
**初版**: 2026-04-19（事前調査フェーズ）
**確定版**: 2026-04-20（Q1-Q5 判断確定後）
**対象**: `data/reports/template/TC_template.xlsx`
**担当**: 悠皓さん（テンプレ修正）/ Claude Code（実装・検証）
**前提**: Phase 8-A 完了（FindingGroup + finding_grouper 実装済み、317 tests green）
**関連**: `docs/phase8_prestudy.md` §6.3 / §6.4、Phase 8-B 本実装指示書

---

## 0. 本書の位置付け

Phase 8-B 本実装の入力となる要件定義書。初版の Q1-Q5 について戦略 Claude + 悠皓さんがレビュー済み。本確定版に基づいて悠皓さんが TC_template.xlsx に **5 つの Named Style** を追加する。

### 責務境界（再掲・厳守）

| 層 | 責務 |
|---|---|
| テンプレ側（悠皓さん） | 親行 4 つ + 子行 1 つの **視覚スタイル定義**（色・フォント・罫線・配置） |
| Python 側（Claude Code） | スタイル**名の参照のみ**。severity → style 名のマッピング以外で定数を書かない |

---

## 1. Q1-Q5 最終判断（確定）

| # | 論点 | **確定結果** | 判断者 |
|---|------|---------------|--------|
| Q1 | インデント方式 | **案 c（C 列のみ `Alignment.indent=2`）** | 悠皓さん |
| Q2 | 親行背景色 | **severity 連動 4 色 × Named Style 4 つ（方式 X）** | 悠皓さん + 戦略 Claude |
| Q3 | 親行行高 | **42.75pt 維持**（子行と同じ、現行 Row 4 と同値） | 悠皓さん |
| Q4 | 子行 fill | **なし**（severity 塗り分けは従来通り Python 側が重ね塗り） | 戦略 Claude |
| Q5 | number_format | **Named Style に含めない**。O/P 列は従来通り Python 側で `#,##0` を設定 | 戦略 Claude |

---

## 2. 親行色分けの設計（方式 X 採用・方式 Y 不採用）

### 2.1 採用: 方式 X（Named Style を severity ごとに 4 つ用意）

テンプレ側に親行 Named Style を 4 つ定義し、Python 側は severity 文字列 → style 名のマッピングを参照するだけ。

```python
# template_engine.py に追加されるマッピング（定数の部類だが "スタイル構築" ではなく "名前参照"）
SEVERITY_TO_PARENT_STYLE = {
    "🔴 Critical": "parent_row_style_critical",
    "🔴 High":     "parent_row_style_critical",  # Phase 8-A 互換
    "🟠 Warning":  "parent_row_style_warning",
    "🟡 Medium":   "parent_row_style_medium",
    "🟢 Low":      "parent_row_style_low",
}

def _apply_parent_row_style(cell, group_severity: str) -> None:
    style_name = SEVERITY_TO_PARENT_STYLE.get(
        group_severity, "parent_row_style_medium"  # 未知 severity フォールバック
    )
    cell.style = style_name
```

### 2.2 不採用: 方式 Y（親行 1 style + Python で fill 重ね塗り）

不採用理由:
- styles.py に「親行用 severity fill 4 色」の定数追加が必要になる
- 指示書 §8 落とし穴 3「styles.py への新規定数追加禁止」に抵触
- テンプレ駆動哲学の「例外」をさらに 1 つ生む（既存の severity_fills 抽出は**子行のみ**に留めたい）

### 2.3 方式 X のメリット

- Python は「名前参照」のみで新しい定数を書かない（哲学完全準拠）
- 色調整は悠皓さんがテンプレ UI でダイレクトに実施可能
- severity 追加時は「テンプレに Named Style を追加 + Python のマッピングに 1 行追加」で対応可能

---

## 3. 追加する Named Style 5 つ（完全定義）

すべて TC_template.xlsx に登録する。既存の `標準` スタイルは変更しない。

### 3.1 `parent_row_style_critical`（重大・赤系）

| プロパティ | 値 |
|---|---|
| フォント名 | Meiryo UI |
| フォントサイズ | 10 pt |
| bold | **True** |
| 文字色 | `#000000`（自動 / 黒） |
| 背景色 | **`#FCEBEB`**（淡い赤） |
| 塗りつぶしタイプ | solid |
| 横揃え | left |
| 縦揃え | center |
| インデント | 0 |
| 罫線 top | **medium** `#C00000`（重大の開始を視覚化） |
| 罫線 bottom | thin `#C00000` |
| 罫線 left/right | thin `#D9D9D9` |
| number_format | なし（Python 側で設定） |

### 3.2 `parent_row_style_warning`（要注意・オレンジ系）

| プロパティ | 値 |
|---|---|
| フォント名 | Meiryo UI |
| フォントサイズ | 10 pt |
| bold | **True** |
| 文字色 | `#000000` |
| 背景色 | **`#FAEEDA`**（淡いオレンジ） |
| 塗りつぶしタイプ | solid |
| 横揃え | left |
| 縦揃え | center |
| インデント | 0 |
| 罫線 top | medium `#ED7D31` |
| 罫線 bottom | thin `#ED7D31` |
| 罫線 left/right | thin `#D9D9D9` |
| number_format | なし |

### 3.3 `parent_row_style_medium`（判断・黄系）

| プロパティ | 値 |
|---|---|
| フォント名 | Meiryo UI |
| フォントサイズ | 10 pt |
| bold | **True** |
| 文字色 | `#000000` |
| 背景色 | **`#FEF5D6`**（淡い黄 / 悠皓さん微調整可） |
| 塗りつぶしタイプ | solid |
| 横揃え | left |
| 縦揃え | center |
| インデント | 0 |
| 罫線 top | medium `#BF8F00` |
| 罫線 bottom | thin `#BF8F00` |
| 罫線 left/right | thin `#D9D9D9` |
| number_format | なし |

### 3.4 `parent_row_style_low`（参考・緑系）

| プロパティ | 値 |
|---|---|
| フォント名 | Meiryo UI |
| フォントサイズ | 10 pt |
| bold | **True** |
| 文字色 | `#000000` |
| 背景色 | **`#EAF3DE`**（淡い緑） |
| 塗りつぶしタイプ | solid |
| 横揃え | left |
| 縦揃え | center |
| インデント | 0 |
| 罫線 top | medium `#548235` |
| 罫線 bottom | thin `#548235` |
| 罫線 left/right | thin `#D9D9D9` |
| number_format | なし |

### 3.5 `child_row_style`（子行共通）

| プロパティ | 値 |
|---|---|
| フォント名 | Meiryo UI |
| フォントサイズ | 10 pt |
| bold | False |
| 文字色 | `#000000`（自動） |
| 背景色 | **なし**（`fill_type=None`）— severity_fills が重ね塗りするため |
| 横揃え | left |
| 縦揃え | center |
| **インデント** | **0**（C 列のインデントは Python 側で個別適用 / 方式 α） |
| 罫線 bottom | thin `#D9D9D9` |
| 罫線 top/left/right | 無指定 or thin `#D9D9D9` |
| number_format | なし |

### 3.6 共通の行高

- 親行 / 子行ともに **42.75 pt**（現行 Row 4 と同値、Q3 確定）

---

## 4. 親行スタイル適用範囲（重要・厳守）

### 4.1 ルール

親行の Named Style は **A 列 〜 最終列（現状 W 列 = 23 列）すべてのセル** に適用する。子行も同様に全列に `child_row_style` を適用する。

### 4.2 理由

- Excel 上で「1 行の帯」として視覚認識させるため
- 部分適用（A〜D だけ塗る、C だけ強調 等）は帯が途切れ、グループ構造が伝わらない
- severity 連動 4 色（Q2）の意図は「行全体の色分け」で初めて成立する
- 将来列追加時も破綻しない

### 4.3 正しい擬似コード

```python
MAX_COL = 23  # A〜W

parent_style_name = SEVERITY_TO_PARENT_STYLE.get(
    group.severity, "parent_row_style_medium"
)
for col_idx in range(1, MAX_COL + 1):
    cell = ws.cell(row=parent_row_idx, column=col_idx)
    cell.style = parent_style_name
    # 値は後で列ごとに設定（summary / severity / 空欄など）
```

### 4.4 ❌ 禁止パターン

- 値のあるセルだけ塗る
- C 列だけ強調
- Q/R 列（freee リンク列）を白く抜く（親行では値空欄でも**背景色は続ける**）
- 空欄列を塗り飛ばす

---

## 5. C 列インデントの実装方式（方式 α 採用）

### 5.1 採用: 方式 α（child_row_style に indent を含めず、C 列のみ Python 側で適用）

```python
# 子行描画時
cell.style = "child_row_style"
if col == _D_TCNAME:  # C 列（項目名）
    cell.alignment = Alignment(
        vertical="center", horizontal="left", indent=2,
    )
```

### 5.2 採用理由

- Named Style 数を 5 つに抑えられる（方式 β なら 6 つに増える）
- C 列の特殊扱いを Python 側 1 箇所で吸収
- Phase 7 のハイパーリンク Q/R 列の「セル単位の属性上書き」と同じ性質（既存パターンの踏襲）

### 5.3 不採用: 方式 β（child_row_style_c_column を別立て）

- Named Style 6 つになる冗長さ
- テンプレ修正作業が増える

※ Claude Code が実装時に「方式 β の方が自然」と判断した場合は、理由を明示した上で変更を許容（戦略 Claude の合意事項）。

---

## 6. 悠皓さん向け: TC_template.xlsx への追加手順

### 6.1 openpyxl スクリプトでの追加（推奨）

Excel UI で Named Style を直接作るのは煩雑なので、以下のスクリプトで一括追加する。Claude Code が提供する確定版スクリプトは、悠皓さんの最終確認後に `tmp/add_named_styles.py` として生成する。

```python
# tmp/add_named_styles.py（参考実装）
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, NamedStyle, Alignment
from openpyxl.styles.borders import Border, Side

TPL = Path("data/reports/template/TC_template.xlsx")

PARENT_COLORS = [
    ("parent_row_style_critical", "FCEBEB", "C00000"),  # 赤系
    ("parent_row_style_warning",  "FAEEDA", "ED7D31"),  # オレンジ系
    ("parent_row_style_medium",   "FEF5D6", "BF8F00"),  # 黄系
    ("parent_row_style_low",      "EAF3DE", "548235"),  # 緑系
]

def make_parent(name: str, bg_hex: str, accent_hex: str) -> NamedStyle:
    ns = NamedStyle(name=name)
    ns.font = Font(name="Meiryo UI", size=10, bold=True, color="FF000000")
    ns.fill = PatternFill("solid", fgColor=f"FF{bg_hex}")
    ns.alignment = Alignment(vertical="center", horizontal="left")
    thin_gray = Side(border_style="thin", color="FFD9D9D9")
    medium_accent = Side(border_style="medium", color=f"FF{accent_hex}")
    thin_accent   = Side(border_style="thin",   color=f"FF{accent_hex}")
    ns.border = Border(
        left=thin_gray, right=thin_gray,
        top=medium_accent, bottom=thin_accent,
    )
    return ns

def make_child() -> NamedStyle:
    ns = NamedStyle(name="child_row_style")
    ns.font = Font(name="Meiryo UI", size=10, bold=False, color="FF000000")
    # 背景色はあえて設定しない（severity_fills が重ね塗りするため）
    ns.alignment = Alignment(vertical="center", horizontal="left")
    thin = Side(border_style="thin", color="FFD9D9D9")
    ns.border = Border(left=thin, right=thin, top=thin, bottom=thin)
    return ns

def main() -> None:
    wb = load_workbook(TPL)
    existing = {s.name if hasattr(s, "name") else s for s in wb.named_styles}

    for name, bg, accent in PARENT_COLORS:
        if name not in existing:
            wb.add_named_style(make_parent(name, bg, accent))

    if "child_row_style" not in existing:
        wb.add_named_style(make_child())

    wb.save(TPL)
    print("追加完了。登録済み Named Styles:",
          [s.name if hasattr(s, "name") else s for s in wb.named_styles])

if __name__ == "__main__":
    main()
```

### 6.2 Excel UI での追加（代替手順）

openpyxl を使いたくない場合は Excel UI で作成可能。大まかな流れ:

1. TC_template.xlsx を開く
2. リボン「ホーム」→「セルのスタイル」→「新しいセルのスタイル」
3. 名前に `parent_row_style_critical` を入力
4. 書式設定ダイアログで §3.1 の値をすべて設定
5. OK で登録
6. §3.2 / 3.3 / 3.4 / 3.5 も同様に登録（合計 5 つ）
7. 上書き保存

※ Excel UI は罫線の色指定に制約があり、正確な hex 色 (`#C00000` 等) を設定しにくい。**openpyxl スクリプトの方が確実**。

### 6.3 色の微調整について

- 背景色 4 色（`#FCEBEB` / `#FAEEDA` / `#FEF5D6` / `#EAF3DE`）は初期値。悠皓さんがテンプレで確認して微調整してよい
- 罫線の accent 色（`#C00000` 等）も、印刷時に濃すぎる場合は 1 段薄くして OK
- 微調整後は Claude Code に hex 値を連絡 → Python 側のドキュメント更新（コード定数は不要、テンプレが唯一の正）

---

## 7. Claude Code によるテンプレ検証手順（悠皓さん作業後）

悠皓さんから「テンプレ修正完了」連絡を受けた後、Claude Code が以下を自動検証する:

### 7.1 検証項目

- [ ] `load_workbook(TPL)` 後、`wb.named_styles` に **5 つの Named Style** がすべて登録されている:
  - `parent_row_style_critical`
  - `parent_row_style_warning`
  - `parent_row_style_medium`
  - `parent_row_style_low`
  - `child_row_style`
- [ ] 各 Named Style の `fill.fgColor.rgb` が §3 の指定 hex と一致（大文字小文字・alpha 許容）
- [ ] 親行 4 style の `font.bold = True`
- [ ] `child_row_style` の `font.bold = False`、`fill.fill_type in (None, "none", None)`
- [ ] `copy_worksheet` 後も全 Named Style が維持される（Phase 8-A P1 再実行）
- [ ] `save → load` ラウンドトリップ後も全 Named Style が維持される（Phase 8-A P2 再実行）

### 7.2 検証スクリプト

Claude Code が悠皓さん作業後に `tmp/verify_phase8b_template.py` を生成・実行する（検証後は削除）。

```python
# 検証スクリプト雛形
from pathlib import Path
from openpyxl import load_workbook

REQUIRED = {
    "parent_row_style_critical": "FCEBEB",
    "parent_row_style_warning":  "FAEEDA",
    "parent_row_style_medium":   "FEF5D6",
    "parent_row_style_low":      "EAF3DE",
    "child_row_style":           None,  # fill なし
}

def main():
    wb = load_workbook("data/reports/template/TC_template.xlsx")
    names = {s.name if hasattr(s, "name") else s for s in wb.named_styles}
    # REQUIRED の各スタイルを検証 ...
```

---

## 8. 禁止事項（Claude Code が守る、継続）

- ❌ `template_engine.py` / `exporter.py` の編集（本実装 GO 判断後のみ解禁）
- ❌ `styles.py` への新規定数追加
- ❌ Python 側で Font / PatternFill / Border / Alignment を**新規構築**する（既存の severity_fills 抽出・Q/R 列ハイパーリンク Font は例外として継続）
- ❌ Finding dataclass へのフィールド追加
- ❌ checker / finding_factory への変更
- ✅ テンプレ駆動哲学: Python 側は「名前参照」と「C 列 indent=2 の上書き」のみ

---

## 9. 次のステップ

1. **戦略 Claude**: 本確定版 (v2) のレビュー → OK なら悠皓さんへ転送
2. **悠皓さん**: §6.1 のスクリプト（または §6.2 UI 手順）で TC_template.xlsx に 5 つの Named Style を追加 → Claude Code に完了連絡
3. **Claude Code**: §7 の検証スクリプト実行 → 5 style 全件確認 → 結果を戦略 Claude に報告
4. **戦略 Claude**: 検証結果確認 → 本実装 GO 判断
5. **Claude Code**: Phase 8-B 本実装着手（template_engine.py 改修 + 18 tests 追加 + E2E 検証）

---

**以上、Phase 8-B テンプレート修正要件 確定版 v2。**
