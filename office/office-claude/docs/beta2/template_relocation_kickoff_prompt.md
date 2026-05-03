# Claude Code キックオフプロンプト：テンプレート配置ルール整備プロジェクト

**作成日**：2026-05-03
**渡す相手**：Claude Code（Sonnet 推奨）
**用途**：Claude Code セッション開始時、本書全体を貼り付ける

---

## あなたへの指示

あなたは Claude Code として、テンプレート配置ルール整備プロジェクトの実装を担当します。

実装指示書（**SSOT**）：

```
docs/template_relocation_implementation_spec.md
```

または

```
/mnt/user-data/uploads/template_relocation_implementation_spec.md
```

**最初にこの指示書を全文 view してから着手してください**。

---

## タスクの本質（30 秒で頭に入れる）

```
L1-A：作る
L1-B：繋ぐ（bridge）
本タスク：移す（relocate）
```

**「正規版 1 ファイルを移す」＋「動作を壊さないための最小修正」**

設計判断は一切しない。新規ロジックは作らない。**path 文字列の置換だけ**。

---

## 改修サマリ

| 区分 | 件数 | 内容 |
|---|---|---|
| ファイル移動 | 1 件 | `data/reports/template/TC_template.xlsx` → `templates/TC_template.xlsx` |
| 実行時コード | 1 件 | `template_engine.py` L35（DEFAULT_TEMPLATE_PATH） |
| scripts/ | 10 件 | path のみ置換、ロジック変更なし |
| 現役 docs | 3 件 / 6 箇所 | SKILL.md × 2 + E2E_runbook.md × 4 |
| **合計** | **13 ファイル** | |

baseline テスト：**V1-3-20: 129 / V1-3-10: 211 = 計 340 passed** を維持。

---

## 厳守事項（最重要）

### ① 短文ルール 5 つを携帯する

| # | ルール |
|---|---|
| 1 | 論点前に現物 |
| 2 | grep ヒット ≠ 変更対象 |
| 3 | 移すだけ、整理しない |
| 4 | 運用判断は推測しない、聞く |
| 5 | baseline テストが崩れたら止まる |

### ② 触らないものリスト

- `data/reports/template/` 配下の他 5 ファイル（backup / コピー / 全パターン出力例）
- 履歴文書（completion_log / phase8 系）
- docstring・コメントのみの記述
- `reports/3525430_アントレッド株式会社/TC_template.xlsx`

### ③ 想定外論点が出たら即停止

実装指示書 §7 に記載の想定外論点が発生したら、自分で判断せず**停止して報告**してください。

特に注意：

- `templates/` が既に存在し中身がある → 停止
- 移動元の MD5 が `F143EB53...` ではない → 停止
- baseline テスト数が想定と違う（130 / 128 等） → 停止
- pytest が想定外のエラー → 停止

---

## 実行環境

| 項目 | 値 |
|---|---|
| プロジェクトルート | `C:\Users\yuya_\claude\office\office-claude\` |
| Python | 3.12.8 / venv |
| シェル | PowerShell |
| 文字コード | `$env:PYTHONIOENCODING = "utf-8"` |

---

## 推奨フロー

1. 実装指示書 §5 の Step 1〜5 に従う
2. 各 path 置換時は **必ず現物 view → 行番号確認 → 1 行のみ置換 → 確認** を厳守
3. 行番号がずれていたら `Select-String -Path <file> -Pattern "data/reports/template" -Context 2,2` で位置を特定
4. すべての置換完了後、baseline テスト実行
5. 完了報告書を `template_relocation_completion_log.md` として作成

---

## 完了報告書の様式（軽量版）

`/mnt/user-data/outputs/template_relocation_completion_log.md` として作成。**~100〜200 行程度**で十分。

含めるべき内容：

```markdown
# テンプレート配置ルール整備プロジェクト 完了報告書

## 1. 完了サマリ
- 実施日：YYYY-MM-DD
- 改修ファイル数：実績値
- baseline テスト結果：V1-3-20: ___ / V1-3-10: ___
- 想定外論点：あり / なし

## 2. 移動結果
- templates/TC_template.xlsx の MD5：実測値
- data/reports/template/TC_template.xlsx：削除済 / 残存

## 3. 改修ファイル一覧
（各ファイルでの変更内容を簡潔に）

## 4. baseline テスト結果
（pytest の出力末尾を貼り付け）

## 5. 想定外論点（あれば）
（停止・報告した内容）

## 6. 触らなかったもの（最重要原則の遵守確認）
- data/reports/template/ 配下の他 5 ファイル
- 履歴文書 19 箇所
- docstring・コメント

## 7. 残課題（あれば）
```

---

## 開始してください

実装指示書を view → 事前確認 → 移動 → 置換 → テスト → 完了報告 の順で進めてください。

質問・想定外論点があれば、いつでも停止して報告してください。

**頑張ってください。**
