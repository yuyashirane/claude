# テンプレート配置ルール整備プロジェクト 実装指示書

**作成日**：2026-05-03
**対象**：Claude Code（Sonnet 推奨、仕様明確タスク）
**前提**：戦略 Claude × 悠皓さん間で着手前チェック 6 項目すべて消化済、スコープ確定済
**SSOT**：本書 + `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md`

---

## 0. 本タスクの本質（最初に頭に入れる）

```
L1-A：作る
L1-B：繋ぐ（bridge）
本タスク：移す（relocate）
```

このプロジェクトは「**正規版 1 ファイルを移す**」＋「**動作を壊さないための最小修正**」のみ。新規ロジックは一切作らない。設計判断も一切しない。

---

## 1. ゴール

```
data/reports/template/TC_template.xlsx（正規版、23865 bytes、MD5 F143EB53...）
↓
templates/TC_template.xlsx に移動

＋

template_engine.py（1 行）
scripts/ 配下 10 ファイル（path のみ）
SKILL.md 2 ファイル / E2E_runbook.md 4 箇所（現役ドキュメント、path 表記のみ）

baseline テスト（V1-3-20: 129 / V1-3-10: 211 = 計 340）を維持して完了
```

---

## 2. 厳守原則（短文ルール）

| # | ルール | 本タスクでの意味 |
|---|---|---|
| 1 | 論点前に現物 | 着手前に該当ファイルを必ず view（コード転記前の現物再確認） |
| 2 | grep ヒット ≠ 変更対象 | 本書記載のファイル以外は変更しない |
| 3 | 移すだけ、整理しない | path 文字列の置換のみ、ロジック変更なし |
| 4 | 運用判断は推測しない、聞く | 想定外論点が出たら停止して報告 |
| 5 | baseline テストが崩れたら止まる | 340 を維持できなければ停止して報告 |

---

## 3. 改修対象（厳密リスト）

### 3.1 ファイル移動（1 件）

| 操作 | 対象 |
|---|---|
| 移動元 | `data/reports/template/TC_template.xlsx` |
| 移動先 | `templates/TC_template.xlsx` |
| 期待サイズ | 23865 bytes |
| 期待 MD5 | `F143EB531C217858CB99FC9942221759` |

**手順**：
1. `templates/` ディレクトリが存在しない場合は作成
2. `data/reports/template/TC_template.xlsx` を `templates/TC_template.xlsx` にコピー
3. コピー後、`templates/TC_template.xlsx` の MD5 が `F143EB53...` で始まることを確認
4. 確認できたら **元ファイル `data/reports/template/TC_template.xlsx` を削除**（コピー → 削除 = 移動）

> ⚠️ **重要**：MD5 確認前に元ファイルを削除しないこと。事例 20 候補（path 不整合の二段階性）の予防。

> ⚠️ **触らない**：`data/reports/template/` 配下の他の 5 ファイル（`TC_template - コピー.xlsx`、`TC_template_ok.xlsx`、`TC_template_backup_*.xlsx` × 2、`全パターン出力例.xlsx`）はすべて触らない。

### 3.2 実行時コード（1 件）

#### `skills/export/excel_report/template_engine.py` L35

**改修前**：
```python
DEFAULT_TEMPLATE_PATH = Path("data/reports/template/TC_template.xlsx")
```

**改修後**：
```python
DEFAULT_TEMPLATE_PATH = Path("templates/TC_template.xlsx")
```

**変更行数**：1 行のみ。前後の行（L34, L36）は触らない。

### 3.3 scripts/ 配下のハードコード path（10 ファイル）

すべて同じパターン。`TPL = Path("data/reports/template/TC_template.xlsx")` または `tpl = Path(...)` を `templates/TC_template.xlsx` に置換するのみ。**ロジック変更は一切なし**。

| # | ファイル | 行 |
|---|---|---|
| 1 | `scripts/add_named_styles.py` | L27 |
| 2 | `scripts/indent_samples.py` | L16 |
| 3 | `scripts/inspect_template.py` | L13 |
| 4 | `scripts/verify_named_style.py` | L67 |
| 5 | `scripts/verify_phase8b.py` | L42 |
| 6 | `scripts/verify_phase8b_template.py` | L26 |
| 7 | `scripts/verify_phase8c.py` | L51 |
| 8 | `scripts/verify_phase_a_comnet-system_202504-202603.py` | L27 |
| 9 | `scripts/verify_phase_a_kiyo_202504-202603.py` | L27 |
| 10 | `scripts/verify_phase_a_plusvalue_202504-202603.py` | L27 |

**注意**：
- 各ファイルとも path 文字列 1 行のみの変更
- 行番号は事前調査時点（2026-05-03）の値。**実装時に必ず現物 view で確認**してから書き換えること（事例 14 / 15 / 16 対策）
- 行番号がずれていたら `Select-String` などで `data/reports/template` を再検索して位置を特定する
- 同じファイル内に他の path（出力先など）がある場合、**触らない**（短文ルール 3）

### 3.4 現役ドキュメント（3 ファイル / 6 箇所）

#### 3.4.1 `.claude/skills/check-tax-classification/SKILL.md` L297

**改修前**：
```
- テンプレート: `data/reports/template/TC_template.xlsx`（唯一の正、変更禁止）
```

**改修後**：
```
- テンプレート: `templates/TC_template.xlsx`（唯一の正、変更禁止）
```

> 「変更禁止」という記述は **テンプレートファイルの中身を変えるな**の意味であり、path 表記の変更は対象外。説明文の意味は変えない。

#### 3.4.2 `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` L274

3.4.1 と同じパターン。同じ置換を行う。

#### 3.4.3 `docs/E2E_runbook.md`（4 箇所）

| 行 | 内容（path 部分のみ） |
|---|---|
| L210 | `data/reports/template/TC_template.xlsx` を読み込んでデータだけを流し込む |
| L250 | `print(f"[1] Template path used: data/reports/template/TC_template.xlsx")` |
| L356 | エラー対処：`data/reports/template/TC_template.xlsx` の配置を確認 |
| L407 | テンプレートファイル欠落時：`data/reports/template/TC_template.xlsx` の配置を確認 |

すべて **path 文字列のみ** を `templates/TC_template.xlsx` に置換。説明文の意味・周辺記述は変えない。

---

## 4. 改修しない対象（明示）

短文ルール 2「grep ヒット ≠ 変更対象」を遵守。grep でヒットするが**触らないファイル**：

### 4.1 履歴文書（書き換えると SSOT が壊れる）

| ファイル | 該当行数 | 理由 |
|---|---|---|
| `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md` | 7 箇所 | L1-B 完了時点の正式記録（SSOT） |
| `docs/phase8b_template_requirements.md` | 7 箇所 | Phase 8-B 要件定義（履歴文書） |
| `docs/phase8_prestudy.md` | 5 箇所 | Phase 8 事前調査（履歴文書） |

**これらは「当時 data/reports/template/ だった」という履歴記録として価値があるため、絶対に書き換えない**。

### 4.2 docstring・コメントのみの記述（実行に影響なし、現役ではない）

| ファイル | 行 | 内容 |
|---|---|---|
| `skills/export/excel_report/template_engine.py` | L3, L125 | docstring / コメント |
| `skills/export/excel_report/exporter.py` | L5 | docstring |
| `skills/export/excel_report/styles.py` | L5 | docstring |
| `scripts/add_named_styles.py` | L3, L4 | docstring（path 文字列ではない） |
| `scripts/gen_preview_named_styles.py` | L18 | コメント |
| `scripts/inspect_template.py` | L1 | docstring |
| `scripts/verify_phase8b_template.py` | L3 | docstring |

**判断基準**：
- 実際の動作に使う path 文字列（`Path("...")` の引数）→ 改修
- ファイル名のみの言及（`TC_template.xlsx に...`）や docstring → **触らない**

> ⚠️ 「親切な完全置換」誘惑を発動させない。docstring の正確性を保つ整理欲が出ても、**スコープ外**として封じる。

### 4.3 その他（運用上の理由）

- `data/reports/template/` 配下の他 5 ファイル（backup / コピー / 全パターン出力例）
- `reports/3525430_アントレッド株式会社/TC_template.xlsx`（28451 bytes、別系統）
- `data/reports/template/` ディレクトリ自体の削除（残っていても問題なし）

---

## 5. 実装手順（推奨フロー）

### Step 1：事前確認

```powershell
# 1. 移動元の現物確認
Get-FileHash -Path "data\reports\template\TC_template.xlsx" -Algorithm MD5
# → F143EB531C217858CB99FC9942221759 を期待

# 2. templates/ ディレクトリの存在確認
Test-Path "templates"
```

### Step 2：ファイル移動（コピー → 確認 → 削除）

```powershell
# 1. templates/ ディレクトリ作成（存在しない場合）
if (-not (Test-Path "templates")) { New-Item -ItemType Directory -Path "templates" }

# 2. コピー
Copy-Item -Path "data\reports\template\TC_template.xlsx" -Destination "templates\TC_template.xlsx"

# 3. コピー後の MD5 確認（重要：これが一致するまで元ファイルを削除しない）
Get-FileHash -Path "templates\TC_template.xlsx" -Algorithm MD5
# → F143EB531C217858CB99FC9942221759 を期待

# 4. 一致を確認したら、元ファイルを削除
Remove-Item -Path "data\reports\template\TC_template.xlsx"
```

### Step 3：path 文字列の置換（順次）

各ファイルで該当行を view → 確認 → 1 行のみ置換 → 確認、を繰り返す。

順序の推奨：
1. `skills/export/excel_report/template_engine.py`（最重要、1 行）
2. `scripts/` 配下 10 ファイル（順次）
3. `.claude/skills/check-tax-classification/SKILL.md`（1 箇所）
4. `skills/verify/V1-3-rule/check-tax-classification/SKILL.md`（1 箇所）
5. `docs/E2E_runbook.md`（4 箇所）

### Step 4：baseline テスト実行

```powershell
# venv をアクティブにしてから実行
$env:PYTHONIOENCODING = "utf-8"

# V1-3-20 のテスト
pytest tests/skills/verify/V1-3-rule/check-tax-classification/ -v 2>&1 | Select-Object -Last 30
# → 129 passed を期待

# V1-3-10 のテスト
pytest tests/skills/verify/V1-3-rule/check-tax-classification-v1310/ -v 2>&1 | Select-Object -Last 30
# → 211 passed を期待

# 合計確認
pytest 2>&1 | Select-Object -Last 5
# → 全体 passed を期待
```

> ⚠️ テストパスは概念的な記載。実際のディレクトリ名は実装者が確認すること。
> ⚠️ baseline 数（V1-3-20: 129 / V1-3-10: 211）が崩れたら **即停止して報告**。

### Step 5：完了報告

完了報告書（軽量、~100〜200 行程度）を `/mnt/user-data/outputs/template_relocation_completion_log.md` として作成。以下を含める：

- 移動完了の確認（templates/TC_template.xlsx の MD5）
- 改修ファイル数（実績）
- baseline テスト結果（V1-3-20: 129 / V1-3-10: 211）
- 想定外論点の有無
- 残課題（あれば）

---

## 6. 完了判定（チェックリスト）

| # | 項目 | 期待値 |
|---|---|---|
| 1 | `templates/` ディレクトリ存在 | ✅ |
| 2 | `templates/TC_template.xlsx` の MD5 | `F143EB53...` |
| 3 | `data/reports/template/TC_template.xlsx` 削除済 | ✅ |
| 4 | `data/reports/template/` の他 5 ファイル | 触られていない |
| 5 | `template_engine.py` L35 の path 更新 | `Path("templates/TC_template.xlsx")` |
| 6 | `scripts/` 配下 10 ファイルの path 更新 | すべて新 path |
| 7 | `SKILL.md` 2 ファイルの path 更新 | すべて新 path |
| 8 | `E2E_runbook.md` 4 箇所の path 更新 | すべて新 path |
| 9 | V1-3-20 baseline | 129 passed |
| 10 | V1-3-10 baseline | 211 passed |
| 11 | 合計 | 340 passed |
| 12 | 履歴文書（completion_log / phase8 系）が触られていない | ✅ |

---

## 7. 想定外論点が出たときの対応

「**勝手に判断せず、停止して戦略 Claude / 悠皓さんに報告**」を厳守。

予想される想定外論点：

| 想定外論点 | 対応 |
|---|---|
| `templates/` ディレクトリが既に存在し、何かファイルが入っている | 停止・報告（運用判断が必要） |
| 移動元の MD5 が `F143EB53...` ではない | 停止・報告（事例 20 候補の二段階目） |
| scripts/ のいずれかで行番号が大きくずれている | 自分で `Select-String` で特定し、行番号のみ修正して進める。ただし**置換対象が増えていたら停止・報告** |
| baseline テスト数が想定と違う（例：V1-3-20 が 130 になっている / 128 になっている） | 停止・報告（仕様進化または既存問題の可能性、事例 22 候補） |
| `template_engine.py` L1085 以外で `DEFAULT_TEMPLATE_PATH` を参照している箇所がある | 停止・報告（影響範囲が増える可能性） |
| pytest が ImportError や FileNotFoundError でこける | 停止・報告（path 修正漏れの可能性） |
| その他、本書に記載のない事象 | 停止・報告 |

---

## 8. 役割分担

| 担当 | 役割 |
|---|---|
| 戦略 Claude | 設計判断・本指示書作成・想定外論点が出た際の構造整理 |
| Claude Code | 本書に従った実装・テスト実行・完了報告書作成 |
| 悠皓さん | 視覚確認・運用判断・最終承認 |

Claude Code は **本書から外れる判断**を一切しない。判断が必要な場面では停止して戦略 Claude / 悠皓さんに報告する。

---

## 9. やってはいけないこと（再強調）

- ❌ scripts/ で path 文字列以外の整理（コメント追加 / リファクタ / 関数化など）
- ❌ docstring の修正（更新対象外、整合性問題は次フェーズで判断）
- ❌ 履歴文書（completion_log / phase8 系）の書き換え
- ❌ `data/reports/template/` 配下の他 5 ファイルの整理（backup 削除など）
- ❌ `data/reports/template/` ディレクトリ自体の削除（空ディレクトリでも残す）
- ❌ `reports/3525430_アントレッド株式会社/TC_template.xlsx` への変更
- ❌ 「ついでに」何かを整理する誘惑への迎合
- ❌ baseline 数が想定と違うのに進めること
- ❌ 想定外論点が出たのに自分で判断して進めること

---

## 10. 末尾原則（再掲）

```
本タスクの本質：移す（relocate）
スコープ：正規版 1 ファイルの移動 + 動作を壊さないための最小修正
規模：~10〜30 行 + 13 ファイル更新
工数見積：1 セッション（2〜4 時間）

「整理したい」誘惑を構造的に回避し、
path 文字列の置換だけに徹すること。
```

L1-B で確立された 4 装置と「抽象 → 現物」回帰原則を継承し、**最小スコープで壊さず移す**ことが本タスクの全て。

---

**実装指示書 終わり**
