# tmp/ 整理作業 報告書

- 日付: 2026-05-01
- 担当: 実装 Claude
- 対象プロジェクト: `office/office-claude/`
- 目的: 戦略 Claude 提示の理想ディレクトリ構造に合わせ、`tmp/` 配下の散在ファイルを正規ディレクトリへ移送し、参照パスを更新する。

---

## 1. 実施サマリー

| 項目 | 結果 |
| --- | --- |
| `tmp/` 内ファイル数（着手前） | 39 |
| 移送先と件数 | `scripts/` 21件 / `data/` 12件 / `tests/e2e/` 4件 / `reports/` 3件 |
| 着手後の `tmp/` | 削除（空ディレクトリ）|
| パス参照修正（`.py`） | 7ファイル |
| ドキュメント修正（`.md`） | 1ファイル（`docs/phase8b_template_requirements.md`）|
| 残課題 | SKILL.md 内の `tmp/` 参照修正（保留・後述）|

---

## 2. 移送内訳

### 2.1 `scripts/` へ（汎用Pythonスクリプト 21件）
- `add_named_styles.py`
- `check_deal_id.py`
- `gen_preview_named_styles.py`
- `indent_samples.py`
- `inspect_template.py`
- `merge_deals_antred_202504-202512.py`
- `merge_deals_comnet.py`
- `merge_deals_daily.py`
- `merge_deals_plusvalue.py`
- `merge_partners_comnet.py`
- `merge_partners_daily.py`
- `save_taxes_daily.py`
- `verify_named_style.py`
- `verify_phase8b.py`
- `verify_phase8b_template.py`
- `verify_phase8c.py`
- `verify_phase_a_comnet-system_202504-202603.py`
- `verify_phase_a_kiyo_202504-202603.py`
- `verify_phase_a_plusvalue_202504-202603.py`
- `verify_step3b.py`
- `verify_step3c.py`

### 2.2 `data/` へ（入力・サンプルデータ 12件）
- `deals_offset_1900_comnet.json`
- `deals_page3.json`
- `page1700_antred.json`
- `indent_sample_a_alignment.xlsx` / `_b_zenkaku.xlsx` / `_c_c_only.xlsx`
- `preview_named_styles_sample.xlsx` / `_v2.xlsx`
- `v1320_b2b_real.json` / `b2c_clusterB.json` / `b2c_complete.json` / `real.json`

### 2.3 `tests/e2e/` へ（E2E系 4件）
- `e2e_611b_test.xlsx`
- `e2e_phase7.py`
- `process_e2e.py`
- `run_e2e_step1.py`

### 2.4 `reports/` へ（チェック結果・ログ 3件）
- `account_items_check.txt`
- `step3a_run_12243357.log`
- `phase_c1_fetch_audit.md`

---

## 3. パス参照の修正

### 3.1 実コードのパス（実行に影響あり）
| ファイル | 旧 | 新 |
| --- | --- | --- |
| `scripts/gen_preview_named_styles.py` | `tmp/preview_named_styles_sample.xlsx` / `_v3.xlsx` | `data/preview_named_styles_sample.xlsx` / `_v3.xlsx` |
| `scripts/merge_deals_comnet.py` | `tmp/deals_offset_1900_comnet.json` | `data/deals_offset_1900_comnet.json` |
| `scripts/merge_deals_antred_202504-202512.py` | `tmp/page1700_antred.json` (2箇所) | `data/page1700_antred.json` |
| `scripts/indent_samples.py` | `tmp/indent_sample_*.xlsx` (3行) | `data/indent_sample_*.xlsx` |

### 3.2 docstring の Usage 行（実行コマンド表記）
- `scripts/add_named_styles.py`
- `scripts/verify_phase8b.py`
- `scripts/verify_phase8b_template.py`
- `scripts/verify_phase8c.py`
- `scripts/verify_phase_a_comnet-system_202504-202603.py`
- `scripts/verify_phase_a_kiyo_202504-202603.py`
- `scripts/verify_phase_a_plusvalue_202504-202603.py`

いずれも `py tmp/xxx.py` → `py scripts/xxx.py` に置換。

### 3.3 コメント
- `tests/e2e/process_e2e.py` 内のコメント `tmp/taxes_full.json から読む` を「同階層の taxes_full.json から読む」に修正（実コードは元から `Path(__file__).parent` を使用しているため挙動変更なし）。

### 3.4 ドキュメント
- `docs/phase8b_template_requirements.md`
  - `tmp/add_named_styles.py` → `scripts/add_named_styles.py`（2箇所）
  - `tmp/verify_phase8b_template.py` → `scripts/verify_phase8b_template.py`

---

## 4. 残課題（戦略 Claude へ判断依頼）

以下の SKILL.md には `tmp/` 参照が残存している。SKILL.md は運用ルールの正本であるため、書き換える前に方針確認をお願いしたい。

| ファイル | 行 | 該当文言 |
| --- | --- | --- |
| `.claude/skills/check-tax-classification/SKILL.md` | 287, 293 | `tmp/verify_phase8c.py`（旧検証スクリプトを代替実行禁止する旨の記述）|
| `.claude/skills/check-invoice-registration-status/SKILL.md` | 329 | `tmp/` 配下のスクリプトを代替実行禁止 |
| `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` | 271 | `tmp/verify_phase8c.py`（参照のみ・改変禁止）|

### 確認したい点
1. パス文字列を `scripts/verify_phase8c.py` 等に機械置換してよいか？
2. それとも、`tmp/` という記述自体が「旧E2E検証時の暫定スクリプトで参考のみ」という履歴的意味を持つため、**注釈付きで原文残置**するか？（ファイル実体は `scripts/` に移動済みのため、現状は SKILL.md の参照リンクが死んでいる状態）
3. 二重管理になっている `.claude/skills/` と `skills/` の統合方針（戦略Claudeのディレクトリ構造案では `.claude/skills/` 配下に7カテゴリで集約とされており、`skills/` 直下の整理が次タスク）。

---

## 5. 今後の運用ルール（記録）

戦略 Claude より受領したルールを以下に明記し、次回以降の作成・保存に適用する。

- レポートの保存先: `reports/{事業所ID}_{事業所名}/` を統一規約とする
  - 例: `reports/10794380_株式会社デイリーユニフォーム/`
  - 既存の事業所ディレクトリ4件はこの規約に整合済み
  - 事業所横断のレポート（本報告書のような workspace 系）は `reports/` 直下に保存
- 新規ファイル作成時は以下のディレクトリ構造を厳守
  - `scripts/`（汎用Pythonスクリプト）
  - `data/`（解析素材）
  - `references/`（参照資料、未作成 — 必要時に作成）
  - `templates/`（業務ルール・マニュアル、未作成 — 必要時に作成）
  - `tests/e2e/`（E2E）
- `.claude/skills/` 配下は機能カテゴリ（verify / intake / classify / ...）× 番号体系で管理（プラグイン互換性のため）

---

## 6. 検証済み事項

- `tmp/` ディレクトリの完全削除を確認（`ls office/office-claude/` で `tmp` が存在しないこと）
- `scripts/` 内の `tmp/` 文字列残置 0 件（`Grep` で確認済）
- `docs/phase8b_template_requirements.md` 内の `tmp/` 文字列残置 0 件
- 残存は §4 に記載した SKILL.md 3ファイルのみ
