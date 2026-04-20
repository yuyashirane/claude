# Phase 8-B テンプレート修正要件

**作成**: Claude Code (事前調査フェーズ)
**日付**: 2026-04-19
**対象**: `data/reports/template/TC_template.xlsx`
**担当**: 悠皓さん（テンプレ修正）/ Claude Code（実装）
**前提**: Phase 8-A 完了（FindingGroup + finding_grouper 実装済み、317 tests green）
**関連**: `docs/phase8_prestudy.md` §6.3 / §6.4、Phase 8-B 本実装指示書

---

## 0. 本書の位置付け

Phase 8-B 本実装の「入力」となる要件定義書。Claude Code が事前調査フェーズで作成し、戦略 Claude + 悠皓さんのレビューを経て確定する。確定後、悠皓さんが TC_template.xlsx に Named Style を追加し、Claude Code が本実装に着手する。

**本書は "テンプレ側" と "Python 側" の責務境界を明文化する**:

| 層 | 責務 |
|---|---|
| テンプレ側（悠皓さん） | 親行/子行の**視覚スタイル定義**（色・フォント・罫線・行高・インデント等） |
| Python 側（Claude Code） | スタイル**名の参照のみ**。`cell.style = "parent_row_style"` のように名前で指定し、定数を書かない |

この境界により、将来スタイル調整が必要になった場合も **テンプレ修正のみ**で完結し、Python コードに触らずに済む（template-driven philosophy の徹底）。

---

## 1. 現状テンプレートの構造（事前調査結果）

### 1.1 シート構成

```
['サマリー', 'A4 家賃・地代', 'A5 人件費', 'A8 旅費',
 'A10 その他経費', 'A11 営業外・特別損益', 'A12 税金', '参考']
```

### 1.2 Named Styles 登録状況

現状登録: `['標準']` のみ。

**Phase 8-B では `parent_row_style` / `child_row_style` の 2 つを追加する必要がある。**

### 1.3 Row 4 (データ行1件目) の既存プロパティ（A5 人件費シート基準）

| 項目 | 値 |
|---|---|
| 行高 | 42.75 pt |
| フォント | Meiryo UI 10 pt, bold=False, color=None (自動=黒) |
| 背景色 | テーマ色(severity 依存。Python で後から塗る) |
| 横揃え | center（C/D/E 列は h=None=既定） |
| 縦揃え | center |
| インデント | 0.0 |
| 罫線 | 全方向 thin（詳細は既存 Row 3-8 から継承） |

**重要**: Row 4 の fill は `severity_fills` (Python 側の `_extract_severity_fills`) が実行時に重ね塗りする構造。この挙動は Phase 8-B でも**子行については維持**する（Section 3.2 参照）。

---

## 2. Named Style の追加要件（確定案）

### 2.1 親行スタイル `parent_row_style`

「グループの要約行。ひと目で識別できる視覚強調」を目的とする。

| プロパティ | 推奨値 | 根拠 |
|---|---|---|
| フォント名 | Meiryo UI | 既存行と整合 |
| フォントサイズ | 10 pt | 既存行と整合 |
| bold | **True** | 親行の識別性 |
| 文字色 | `#1F4E78`（濃い青） | ヘッダー (`#2F5496`) と明るい子行の中間 |
| 背景色 | `#DEEBF7`（淡い青） | ヘッダー列と同系統、ただし控えめ |
| 塗りつぶしタイプ | solid | — |
| 横揃え | left | 要約文 (C 列) 可読性優先 |
| 縦揃え | center | 既存と整合 |
| インデント | 0 | 親行はインデントしない |
| 罫線 (top) | **medium** `#2F5496` | **グループ開始を視覚化**（重要） |
| 罫線 (left/right/bottom) | thin `#8EA9DB` | 既存の雰囲気を踏襲 |
| 行高 | 24 pt（現行 42.75 より低い） | 要約なので短文想定・低めで情報密度を上げる |

**意図**:
- top 罫線を太くすることで「ここから新しいグループ」と視覚的にわかる
- 行高は 24pt（子行の 42.75 より低い）で「タイトル行」の印象にする
- fill は淡い青にして、severity (赤/黄) に依存しないニュートラルな親行

### 2.2 子行スタイル `child_row_style`

「親行の詳細。個別取引 1 件 = 1 行」。既存 Row 4 のスタイルを踏襲しつつ、親行との識別を軽くつける。

| プロパティ | 推奨値 | 根拠 |
|---|---|---|
| フォント名 | Meiryo UI | 既存行と整合 |
| フォントサイズ | 10 pt | 既存行と整合 |
| bold | False | 既存と整合 |
| 文字色 | `#595959`（濃いグレー）または自動 | 親行との識別を軽く付ける |
| 背景色 | **なし または `#F8F8F8`（極薄グレー）** | severity 塗り分けを優先するため、極薄または無色 |
| 横揃え | left | 本文可読性 |
| 縦揃え | center | 既存と整合 |
| インデント | **§2.3 で選定** | — |
| 罫線 (top) | thin `#D9D9D9` | グループ内の罫線は控えめに |
| 罫線 (left/right/bottom) | thin `#D9D9D9` | 同上 |
| 行高 | 42.75 pt（現行維持） | 既存と整合 |

**重要な設計判断: 背景色は極薄または無色にする**
- 現行テンプレは `severity_fills` を Python 層が子行に重ね塗りする（赤=重大, 黄=要注意, 緑=要確認）
- 子行スタイルに強い背景色を入れると severity 塗り分けが消える
- 対応: Python 側は **子行に対しては従来通り `severity_fills` を重ね塗り**（Section 3.2）、テンプレ側の `child_row_style` の fill は `None` か極薄色にする

### 2.3 インデント方式の 3 案（**悠皓さん判断**）

Claude Code は 1 案に絞らず、3 案すべてのサンプル Excel を `tmp/` に生成済み:

| 案 | ファイル | 方式 | メリット | デメリット |
|---|---|---|---|---|
| **a** | `tmp/indent_sample_a_alignment.xlsx` | `Alignment.indent=1`（全セル） | openpyxl 慣用。テンプレに封じ込め可。実装 1 行 | 全列にインデントが入るため、右寄せ金額列も左に動く |
| **b** | `tmp/indent_sample_b_zenkaku.xlsx` | C 列の値先頭に全角スペース挿入 | 視覚的にシンプル。検索・コピペに弱いがインパクトは強 | Python 側で値加工が必要（philosophy 違反の懸念） |
| **c** | `tmp/indent_sample_c_c_only.xlsx` | C 列のみ `Alignment.indent=2` | 金額列が動かない。意味的に自然（項目名だけインデント） | NamedStyle 1 つで完結しない（C 列だけ別定義が必要） |

**Claude Code の予備的所見**（最終判断は悠皓さん）:
- 案 a は実装が最も清潔だが、O/P (金額) 列が左にずれる副作用
- 案 b は Python 側で「子行の C 列だけ全角スペースを足す」というロジックが必要になり、**template-driven philosophy に反する**（推奨しない）
- 案 c が最もバランスが良い可能性が高い。ただし NamedStyle 2 つ必要 (`child_row_style` + `child_row_style_indent_c` のような派生)、あるいは Python 側が C 列のみ `Alignment` を上書きする（1 行で済む）

→ **戦略 Claude の方針「1 案に絞らず悠皓さんに見てもらう」に従い、3 サンプル Excel を開いて比較判断してください。**

### 2.4 テンプレ追加手順（悠皓さん向け）

Excel UI で直接 Named Style を作るのは煩雑なので、**openpyxl スクリプトで追加** することを推奨する。以下のスクリプトを実行するだけで、上記 2.1 / 2.2 の要件通りに Named Style が登録される。

```python
# tmp/add_named_styles.py (参考実装、悠皓さんレビュー後 Claude Code が提供)
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, NamedStyle, Alignment
from openpyxl.styles.borders import Border, Side

tpl = Path("data/reports/template/TC_template.xlsx")
wb = load_workbook(tpl)

def make_parent():
    ns = NamedStyle(name="parent_row_style")
    ns.font = Font(name="Meiryo UI", size=10, bold=True, color="FF1F4E78")
    ns.fill = PatternFill("solid", fgColor="FFDEEBF7")
    ns.alignment = Alignment(vertical="center", horizontal="left")
    thin = Side(border_style="thin", color="FF8EA9DB")
    top  = Side(border_style="medium", color="FF2F5496")
    ns.border = Border(left=thin, right=thin, top=top, bottom=thin)
    return ns

def make_child():
    ns = NamedStyle(name="child_row_style")
    ns.font = Font(name="Meiryo UI", size=10, color="FF595959")
    # 背景色は設定しない（severity 塗り分けを壊さないため）
    ns.alignment = Alignment(vertical="center", horizontal="left")
    thin = Side(border_style="thin", color="FFD9D9D9")
    ns.border = Border(left=thin, right=thin, top=thin, bottom=thin)
    return ns

wb.add_named_style(make_parent())
wb.add_named_style(make_child())
wb.save(tpl)
print("Named Styles 追加完了")
```

**重要**: 悠皓さんがインデント方式（a/b/c）を選んだら、child_row_style の Alignment に `indent=N` を入れる（案 a なら 1、案 c なら項目名列のみ Python 側で適用）。

### 2.5 テンプレ検証手順（Claude Code 実施）

悠皓さんがテンプレ修正完了後、Claude Code が以下を自動検証する:

1. `load_workbook(tpl)` で開いて `wb.named_styles` に `parent_row_style` / `child_row_style` が含まれることを確認
2. `copy_worksheet` 後も Named Style が維持されることを確認（Phase 8-A の P1 再実行）
3. `save → load` のラウンドトリップでも維持されることを確認（Phase 8-A の P2 再実行）
4. 上記 3 件がすべて OK になったら本実装に着手

---

## 3. Python 側の実装方針（参考、Phase 8-B 本実装で確定）

### 3.1 スタイル参照のみ・定数定義なし

```python
# Phase 8-B 本実装で template_engine.py に追加（禁止事項に違反しないよう命名参照のみ）
cell.style = "parent_row_style"   # ← Named Style 名を参照するだけ
cell.style = "child_row_style"
```

styles.py への新規定数追加は禁止（指示書 §8 落とし穴 3）。

### 3.2 子行の severity 塗り分けは従来通り

```python
# _write_finding_row() の子行描画時
cell.style = "child_row_style"           # まず Named Style を適用
if row_fill is not None:                  # 次に severity fill を重ね塗り（従来と同じ）
    cell.fill = copy(row_fill)
```

Named Style の fill は「極薄色 or なし」にしておくことで、severity_fills の上書きが自然に効く。

### 3.3 親行描画時は severity 塗り分けしない

親行は `parent_row_style` の淡い青背景のみ。severity の強調は **A 列の値** （"重大"/"要注意"/"要確認"）で表現する（子行と同じ列を使うので視覚的一貫性も保てる）。

---

## 4. 悠皓さんへのお願い（チェックリスト）

- [ ] 3 つのサンプル Excel (`tmp/indent_sample_a/b/c_*.xlsx`) を開いて視覚比較
- [ ] インデント案 a / b / c のいずれかを選択
- [ ] §2.1 / §2.2 の親行・子行スタイル要件をレビュー（色・行高など違和感あれば指摘）
- [ ] §2.4 のスクリプトで TC_template.xlsx に Named Style を追加（または Claude Code が実施してよければその旨連絡）
- [ ] 追加後のテンプレを保存し、Claude Code に検証を依頼

---

## 5. 戦略 Claude へのお願い（レビューポイント）

- [ ] §2.1 親行スタイルの色・罫線・行高が意図に合っているか
- [ ] §2.2 子行スタイルの背景色方針（極薄 or なし）が severity 塗り分けと両立するか
- [ ] §2.3 インデント 3 案のトレードオフ評価が妥当か
- [ ] §3.2 子行の severity fill 重ね塗り方針を維持することに異論ないか
- [ ] Phase 8-B の列割当案（指示書 §4.2）との整合に問題ないか

---

## 6. 未解決の論点（エスカレーション対象）

| # | 論点 | 推奨 | 最終判断者 |
|---|---|---|---|
| Q1 | インデント方式（a/b/c） | 案 c（C 列のみ indent=2） | 悠皓さん |
| Q2 | 親行の背景色（淡い青 vs 淡いグレー） | 淡い青 `#DEEBF7`（ヘッダー同系統で統一感） | 悠皓さん |
| Q3 | 親行の行高（24pt vs 既存 42.75pt 維持） | 24pt（要約であることを視覚化） | 悠皓さん |
| Q4 | 子行の Named Style の fill を「なし」にするか「極薄」にするか | **なし**（severity fill を壊さない） | 戦略 Claude |
| Q5 | parent_row_style に Number Format 設定を入れるか | 入れない（Python 側で `cell.number_format = "#,##0"` は従来通り） | 戦略 Claude |

上記 Q1〜Q5 の確定後、Claude Code は TC_template.xlsx に Named Style を追加（または悠皓さんが実施）し、Phase 8-B 本実装に着手する。

---

**以上、Phase 8-B テンプレート修正要件。**
