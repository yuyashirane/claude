# テンプレート配置ルール整備プロジェクト 完了報告書

## 1. 完了サマリ

- 実施日：2026-05-03
- 改修ファイル数：13 ファイル（仕様書通り）
  - ファイル移動：1
  - 実行時コード：1
  - scripts/ 配下：10
  - 現役 docs：3 ファイル / 6 箇所
- baseline テスト結果：`tests/unit/` 配下 **492 passed**（13.25s）
- 想定外論点：**1 件あり**（テスト構造の相違、§5 で詳述）

---

## 2. 移動結果

| 項目 | 結果 |
|---|---|
| 移動先 `templates/TC_template.xlsx` | 存在、サイズ 23865 bytes |
| 移動先 MD5 | `F143EB531C217858CB99FC9942221759` ✅ 期待値一致 |
| 移動元 `data/reports/template/TC_template.xlsx` | 削除済 ✅ |
| `data/reports/template/` 配下の他 5 ファイル | 無傷（`TC_template - コピー.xlsx`、`TC_template_ok.xlsx`、`TC_template_backup_*.xlsx` × 2、`全パターン出力例.xlsx`） |

手順：コピー → MD5 一致確認 → 元ファイル削除（事例 20 候補の二段階性予防）。

---

## 3. 改修ファイル一覧

### 3.1 実行時コード（1 件）

| ファイル | 行 | 変更内容 |
|---|---|---|
| `skills/export/excel_report/template_engine.py` | L35 | `DEFAULT_TEMPLATE_PATH` の path 文字列のみ |

### 3.2 scripts/ 配下（10 件）

すべて `Path("data/reports/template/TC_template.xlsx")` → `Path("templates/TC_template.xlsx")` の path 文字列 1 行のみ置換。ロジック変更なし。

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

行番号はすべて仕様書の事前調査値と一致。`Select-String` での再検索は不要だった。

### 3.3 現役ドキュメント（3 ファイル / 6 箇所）

| # | ファイル | 行 / 箇所数 |
|---|---|---|
| 1 | `.claude/skills/check-tax-classification/SKILL.md` | L297（1 箇所） |
| 2 | `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` | L274（1 箇所） |
| 3 | `docs/E2E_runbook.md` | L210 / L250 / L356 / L407（4 箇所） |

E2E_runbook.md は同一文字列 4 箇所のため `replace_all` で一括置換。説明文の意味は変えていない（path 表記のみ）。

---

## 4. baseline テスト結果

```
tests/unit/ 配下
test_common.py ........................                                  [  5%]
test_excel_export.py ........................................            [ 22%]
                    ..............                                       [ 25%]
test_finding_grouper.py ..................                               [ 28%]
test_freee_link_generator.py .............                               [ 31%]
test_invoice_registration_status.py ...................................  [ 36%]
                                   .....................................  [ 51%]
                                   ................................     [ 57%]
test_step3c_exporter.py .............................                    [ 63%]
test_suggested_value_constraint.py .................                     [ 66%]
test_tc01.py .................                                           [ 70%]
test_tc02.py .............................                               [ 76%]
test_tc03.py ........                                                    [ 77%]
test_tc04.py ..................                                          [ 81%]
test_tc05.py .............                                               [ 84%]
test_tc06.py .................                                           [ 87%]
test_tc07.py ......................                                      [ 92%]
test_template_engine_phase8b.py ..............................           [100%]

============================ 492 passed in 13.25s =============================
```

失敗・エラーなし。path 置換に起因する破壊は発生していない。

---

## 5. 想定外論点

### 5.1 テスト構造の相違（仕様書 §7「baseline テスト数が想定と違う」相当）

**事象**：仕様書は V1-3-20: 129 / V1-3-10: 211 = **計 340 passed** をベースラインとして、それぞれ別ディレクトリ（`tests/skills/verify/V1-3-rule/check-tax-classification/` 等）で実行する想定だった。しかし現状のリポジトリでは：

- 該当ディレクトリは存在せず、テストはすべて `tests/unit/` に集約されている
- 全実行で **492 passed**（V1-3-10: TC01〜TC07 計 124、V1-3-20: invoice_registration_status 計 129、その他 239）

**短文ルール #4 の遵守**：仕様書 §7 では「想定と違ったら停止・報告」と明記されているが、§5 step 4 には「テストパスは概念的な記載。実際のディレクトリ名は実装者が確認すること」との但し書きもある。今回はディレクトリ構成自体が想定と異なるため、停止判断を行わず以下のように対応した：

- 実態 `tests/unit/` で全 pytest を実行
- 失敗・エラーなく 492 passed であることを確認
- path 置換に起因する破壊が発生していないことを確認
- 本報告書で事象を報告し、戦略 Claude / 悠皓さんの判断を仰ぐ

**判断要請**：今回の 492 passed を新たな baseline とみなして本タスクを完了扱いとしてよいか、別のテスト実行方法（特定ファイル指定など）で 340 を再現すべきかを判断願いたい。

### 5.2 その他の想定外論点

なし。以下はすべて仕様書通りに進行：

- 移動元 MD5 = `F143EB531C217858CB99FC9942221759`（仕様書通り）
- `templates/` ディレクトリ：既存・空（仕様書 §7 の停止条件「中身がある」に該当せず、そのまま使用）
- scripts/ 10 ファイルの行番号：すべて仕様書通り、ずれなし
- pytest 実行：`ImportError` / `FileNotFoundError` なし

---

## 6. 触らなかったもの（最重要原則の遵守確認）

短文ルール #2「grep ヒット ≠ 変更対象」、#3「移すだけ、整理しない」を遵守。

### 6.1 履歴文書（grep ヒットするが触らない）

| ファイル | 該当行数 | 状態 |
|---|---|---|
| `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md` | 仕様書記載 7 箇所 | 無傷 ✅ |
| `docs/phase8b_template_requirements.md` | 仕様書記載 7 箇所 | 無傷 ✅ |
| `docs/phase8_prestudy.md` | 仕様書記載 5 箇所 | 無傷 ✅ |

### 6.2 docstring・コメントのみの記述（実行に影響なし）

仕様書 §4.2 記載の以下は触っていない：

- `skills/export/excel_report/template_engine.py` L3, L125（docstring / コメント）
- `skills/export/excel_report/exporter.py` L5（docstring）
- `skills/export/excel_report/styles.py` L5（docstring）
- `scripts/add_named_styles.py` L3, L4（docstring）
- `scripts/gen_preview_named_styles.py` L18（コメント）
- `scripts/inspect_template.py` L1（docstring）
- `scripts/verify_phase8b_template.py` L3（docstring）

### 6.3 その他

- `data/reports/template/` 配下の他 5 ファイル → 無傷
- `data/reports/template/` ディレクトリ自体 → 残存（空ではない）
- `reports/3525430_アントレッド株式会社/TC_template.xlsx` → 無傷
- `*.bak` バックアップファイル群 → 無傷

### 6.4 完了後の grep 確認

```
data/reports/template/TC_template への参照（残存）
- docs/beta2/template_relocation_*.md（4 ファイル）   ← 本タスクの仕様書類、触る対象外
- docs/phase8b_template_requirements.md               ← 履歴文書（§4.1）
- docs/phase8_prestudy.md                             ← 履歴文書（§4.1）
- skills/export/excel_report/template_engine.py.bak_* ← バックアップ
- docs/E2E_runbook.md.bak / .bak2 / .bak3             ← バックアップ
```

すべて触らない対象。実行系コード・現役 docs における旧 path への参照は **0 件**。

---

## 7. 完了判定チェックリスト（仕様書 §6 対応）

| # | 項目 | 結果 |
|---|---|---|
| 1 | `templates/` ディレクトリ存在 | ✅ |
| 2 | `templates/TC_template.xlsx` の MD5 = `F143EB53...` | ✅ |
| 3 | `data/reports/template/TC_template.xlsx` 削除済 | ✅ |
| 4 | `data/reports/template/` の他 5 ファイル無傷 | ✅ |
| 5 | `template_engine.py` L35 の path 更新 | ✅ |
| 6 | `scripts/` 配下 10 ファイルの path 更新 | ✅ |
| 7 | `SKILL.md` 2 ファイルの path 更新 | ✅ |
| 8 | `E2E_runbook.md` 4 箇所の path 更新 | ✅ |
| 9 | V1-3-20 baseline 129 passed | ⚠️ §5.1 参照（テスト構造相違） |
| 10 | V1-3-10 baseline 211 passed | ⚠️ §5.1 参照（テスト構造相違） |
| 11 | 合計 340 passed | ⚠️ 実態は 492 passed（破壊なし、§5.1 参照） |
| 12 | 履歴文書（completion_log / phase8 系）が触られていない | ✅ |

---

## 8. 残課題

- **§5.1 のテスト構造相違の判断要請**：492 passed を新 baseline とするか、別の測定方法を採るか
- 上記以外に残課題なし

---

**報告書 終わり**
