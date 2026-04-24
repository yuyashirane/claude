---
name: check-tax-classification
description: |
  V1-3-10 消費税区分チェック。freee 会計の取引データから各仕訳の消費税
  区分（課税/非課税/対象外）の妥当性を TC-01〜TC-07 ルールで検証し、
  Excel レポートを `data/reports/{事業所ID}_{会社名}/` に出力する。

  発動トリガー:
    - 「V1-3-10」「check-tax-classification」というコード/名称
    - 「消費税区分チェック」「税区分チェック」「課税区分確認」
      「非課税チェック」「課税区分の妥当性確認」
    - 「{事業所ID} の {YYYY-MM} をチェック」（単月）
    - 「{事業所ID} の {期首}〜{対象月} をチェック」（累積）

  単月/累積の判定:
    - 「単月」「{YYYY年M月}単月」「その月だけ」→ --single-month
    - 期間指定なし or 「期首から」→ 累積（--target-month のみ）
    - 「{開始月}〜{終了月}」→ --period-start / --period-end

  類似スキル `anthropic-skills:freee-verify-monthly`（66項目を広く浅く）
  とは対照的に、本スキルは消費税区分（TC系）に特化した精密チェックを提供する。
  会計事務所の月次・決算帳簿レビューで使用。
---

# V1-3-10 消費税区分チェック

## 概要

freee 会計から指定期間の取引データを取得し、各取引・各明細の消費税区分の
妥当性を単票ベースでチェックします。結果は Excel レポートとして
`data/reports/{事業所ID}_{会社名}/` に出力します。

**実装の正本**: `skills/verify/V1-3-rule/check-tax-classification/` 配下の
`run.py` および `checker.py`, `checks/`, `references/`, `schema.py`。
本 SKILL.md は `.claude/skills/` への登録用エントリであり、
実装コードは既存配置を参照します。

## 発動条件

以下のような依頼で発動してください：

- 「消費税区分チェックを実行して」
- 「○○社の消費税チェックをお願い」
- 「事業所 ID ○○○○ の ○年○月をチェックして」
- 「V1-3-10 を実行」
- 「税区分の妥当性を確認したい」

**誤発動の回避**: 「月次チェック」「決算レビュー」「記帳チェック」のように
消費税区分以外の項目も含む広範なチェック依頼は、`anthropic-skills:freee-verify-monthly`
の責務です。本スキルは TC 系（消費税区分）単体に限定してください。

## 引数の抽出ルール

会話から以下の引数を抽出してください。会話パターンは 3 種類です。

### パターン 1: 期間指定（開始月〜終了月）

| 引数 | 型 | 内容 | 例 |
|---|---|---|---|
| `company_id` | int | freee 事業所 ID | `3525430` |
| `period_start` | str | 開始年月 | `2025-04` |
| `period_end` | str | 終了年月 | `2026-03` |

### パターン 2: 対象月指定（累積、期首〜対象月）

| 引数 | 型 | 内容 | 例 |
|---|---|---|---|
| `company_id` | int | freee 事業所 ID | `3525430` |
| `target_month` | str | 対象月 | `2026-03` |

期首は run.py が `company_info.json` から読み取ります。

### パターン 3: 対象月指定（単月）

| 引数 | 型 | 内容 | 例 |
|---|---|---|---|
| `company_id` | int | freee 事業所 ID | `3525430` |
| `target_month` | str | 対象月 | `2026-03` |
| `single_month` | bool | 単月フラグ | `True` |

### パターン判定ルール（重要）

会計実務では「○月をチェック」は **期首からの累積** が基本です。以下に従って判定：

1. **「○月から○月」「○年度通期」** → パターン 1（期間指定）
2. **「○月をチェック」「○月の確認」（単独月のみ）** → パターン 2（累積、デフォルト）
3. **「○月だけ」「○月単月」「単独で」** → パターン 3（単月）
4. **曖昧な場合**（「3 月を単独で」など、解釈が割れる表現）→ 悠皓さんに確認

### 正規化ルール

- 年月は `YYYY-MM` 形式に統一
- 「2026 年 3 月」「2026/03」「2026-03」「R8.3」はすべて `2026-03`
- 「今月」「先月」等の相対表現は **使わず、悠皓さんに対象月を確認**
- `period_start > period_end` の場合は **入れ替えず、エラーとして悠皓さんに確認**

### 会話抽出例

**例 1**（パターン 1: 期間指定）

```
悠皓: 「消費税区分チェックを実行して。3525430 の 2025 年 4 月から 2026 年 3 月」
抽出: company_id=3525430, period_start="2025-04", period_end="2026-03"
```

**例 2**（パターン 2: 累積デフォルト）

```
悠皓: 「3525430 の 2026 年 3 月をチェックして」
抽出: company_id=3525430, target_month="2026-03"（累積モード）
```

**例 3**（パターン 3: 単月明示）

```
悠皓: 「3525430 の 2025 年 12 月だけ確認して」
抽出: company_id=3525430, target_month="2025-12", single_month=True
```

**例 4**（曖昧 → 確認）

```
悠皓: 「3525430 の 3 月を単独でチェック」
対応: 「『単独』は単月チェック（その月のみ）と累積チェック（期首〜3 月）の
       どちらでしょうか？」
```

**例 5**（引数不足）

```
悠皓: 「消費税チェックして」
対応: 「対象の事業所 ID と期間を教えてください。
       例: 事業所 3525430、2026 年 3 月（累積）」
```

## 実行手順

### 重要: fetch 責務の分離

本 Skill では freee MCP の呼び出しは **Claude Code エージェント（あなた）** の
責務です。run.py は MCP を呼びません。run.py は既存 JSON を読み込んで
チェックを実行するだけです。

### 必要な JSON ファイル

`data/e2e/{company_id}/{period_end}/` 配下に以下 5 ファイル：

| ファイル | 役割 |
|---|---|
| `company_info.json` | 会社・会計期情報（パターン 2/3 では `data/e2e/{company_id}/` 直下も可） |
| `account_items_all.json` | 勘定科目マスタ |
| `partners_all.json` | 取引先マスタ |
| `taxes_codes.json` | 税区分マスタ |
| `deals_{period_start}_to_{period_end}.json` | 期間内取引（マージ済み） |

### 実行フロー

1. 会話から引数を抽出（パターン 1/2/3 を判定）
2. パターン 2/3 の場合：
   - `data/e2e/{company_id}/company_info.json` の存在確認
   - 無ければ **RUNBOOK_fetch.md Step 1 に従って fetch**
   - company_info を読んで `fiscal_year_start` から period_start を決定
     - パターン 2: `period_start = 期首YYYY-MM`, `period_end = target_month`
     - パターン 3: `period_start = period_end = target_month`
3. `data/e2e/{company_id}/{period_end}/` の 5 ファイルを確認、不足は fetch
   - **fetch 詳細は `scripts/e2e/RUNBOOK_fetch.md` を参照**（保存先は新命名規則
     `data/e2e/{company_id}/{period_end}/` を使う、`{period_end}` は YYYY-MM 形式）
4. run.py を実行（後述コマンド）
5. exit code に応じて分岐：
   - **0**: 結果 JSON を整形して報告
   - **2**: `missing_files` を読み取り該当 JSON を fetch して再実行
     （**最大 2 回**まで自動リトライ）
   - **1**: 引数を再確認して悠皓さんに報告
   - **3**: target_month が期首より前 → 悠皓さんに確認
   - **その他**: エラー詳細を悠皓さんに報告

### run.py 実行コマンド

実装本体は `skills/verify/V1-3-rule/check-tax-classification/run.py` にあります。
プロジェクトルート（`office/office-claude/`）で以下を実行してください。

**パターン 1（期間指定）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-tax-classification/run.py \
  --company-id {company_id} \
  --period-start {period_start} \
  --period-end {period_end}
```

**パターン 2（累積）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-tax-classification/run.py \
  --company-id {company_id} \
  --target-month {target_month}
```

**パターン 3（単月）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-tax-classification/run.py \
  --company-id {company_id} \
  --target-month {target_month} \
  --single-month
```

**具体例**: 事業所 3525430 の 2025 年 12 月単月

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-tax-classification/run.py \
  --company-id 3525430 --target-month 2025-12 --single-month
```

### fetch 詳細手順の参照先

各 JSON の取得方法（エンドポイント、ページング、整形ヘルパー）の
詳細は `scripts/e2e/RUNBOOK_fetch.md` を参照してください。
**新命名規則ではディレクトリを `YYYY-MM`、deals ファイル名を
`deals_{period_start}_to_{period_end}.json` とすること**（既存の `YYYYMM`
形式データはそのまま据え置き、新規取得分のみ新命名）。

## 応答テンプレート

### 実行前応答（引数抽出結果の確認）

```
以下で消費税区分チェックを実行します。
- 事業所 ID: {company_id}
- 対象期間: {period_jp}（モード: {累積 / 単月 / 期間指定}）
- 必要 JSON: 不足 {N} 件 → MCP で取得します
```

### 正常終了時

```
消費税区分チェックを実行しました。

会社名: {company_name}
事業所 ID: {company_id}
対象期間: {period_jp}
検出件数: {findings_count} 件
Excel 出力先: {output_path}
```

### JSON 不足時（自動リトライ中）

```
{missing_files の filename リスト} を取得中です…
（取得後 run.py を再実行します）
```

### エラー時

```
消費税区分チェックの実行中にエラーが発生しました。

エラー段階: {error_stage}
エラー内容: {message}

悠皓さん、ご確認をお願いします。
```

### 引数不備時

```
引数が不足しています。以下を教えてください。

- 事業所 ID（freee の事業所 ID）
- 対象月 または 対象期間（YYYY-MM 形式）

例:
  「3525430 の 2026 年 3 月（累積）」
  「3525430 の 2026 年 3 月だけ（単月）」
  「3525430 の 2025 年 4 月から 2026 年 3 月」
```

## 禁止事項（Claude Code として守ること）

1. 会話から抽出できない引数を **勝手に推測しない**（必ず悠皓さんに確認）
2. `run.py` を経由せず、直接 checker / exporter を呼ばない
3. run.py から MCP を呼ぶことを期待しない（run.py は読むだけ）
4. 累計集計・期間比較・月別推移の質問が来ても **この Skill では処理しない**
   （「この Skill は単票チェックのみ対応です。累計集計は Phase 8-D で実装予定です」と返す）
5. Excel 出力以外の形式（CSV、PDF 等）への変換は **今回のスコープ外**
6. exit 2 リトライは **最大 2 回**まで（それ以降は悠皓さんに報告）
7. `tmp/verify_phase8c.py` などの旧検証スクリプトを **本 Skill の代替として実行しない**
   （run.py が唯一の正規エントリポイント）

## 関連情報

- 内部モデル: 指定期間内の単票チェックの集合（累計・比較・集計なし）
- 既存 E2E 実装: `tmp/verify_phase8c.py`（参照のみ、改変禁止、代替実行禁止）
- テンプレート: `data/reports/template/TC_template.xlsx`（唯一の正、変更禁止）
- fetch 手順: `scripts/e2e/RUNBOOK_fetch.md`
- 運用原則: 設計書 v3.0 付録 B 参照
- 実装本体（参考）: `skills/verify/V1-3-rule/check-tax-classification/SKILL.md`
