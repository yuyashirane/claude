---
name: check-invoice-registration-status
description: |
  freee 会計の指定期間の取引から「適格マークなし × 課税仕入 × 単行 20 万円以上」
  の 3 条件 AND を満たす候補仕訳を抽出する Skill (V1-3-20 β1)。

  発動トリガー:
    - 「V1-3-20」「check-invoice-registration-status」というコード/名称
    - 「インボイス登録状況チェック」「適格請求書の確認」
      「インボイス未登録の仕入を抽出」「インボイス未登録チェック」
    - 「{事業所ID} の {YYYY-MM} のインボイスチェック」（単月）
    - 「{事業所ID} の {期首}〜{対象月} のインボイス確認」（累積）

  単月/累積の判定:
    - 「単月」「{YYYY年M月}単月」「その月だけ」→ --single-month
    - 期間指定なし or 「期首から」→ 累積（--target-month のみ）
    - 「{開始月}〜{終了月}」→ --period-start / --period-end

  会計事務所の月次・決算帳簿レビューで使用。
  β1 では deals のみ対応・候補一覧 JSON 出力まで（Excel / manual_journals /
  登録番号チェック / 経過措置は β2 以降）。
---

# V1-3-20 インボイス登録状況チェック (β1)

## 概要

freee 会計から指定期間の取引データ（deals）を取得し、各取引明細について
以下の **3 条件 AND** を満たす候補仕訳を抽出します。

1. **適格マークなし**: 取引先の `qualified_invoice_issuer == False`（または欠損）
2. **課税仕入**: 税区分名が `課対仕入...` または `課税仕入...` で始まる
3. **単行 20 万円以上**: 借方金額 ≥ 200,000 円

結果は **候補一覧 JSON** として標準出力に返します。Excel レポート出力・
manual_journals 連携・登録番号妥当性チェック・経過措置（80%/50%）判定は
**β2 以降**のスコープです。

**実装の正本**: `skills/verify/V1-3-rule/check-invoice-registration-status/` 配下の
`run.py` / `checker.py` / `schema.py`。本 SKILL.md は `.claude/skills/` への
登録用エントリで、実装コードは既存配置を参照します。

## 発動条件

以下のような依頼で発動してください：

- 「インボイス登録状況チェックを実行して」
- 「○○社のインボイス未登録の仕入を抽出」
- 「事業所 ID ○○○○ の ○年○月のインボイスチェック」
- 「V1-3-20 を実行」
- 「適格請求書発行事業者の登録状況を確認したい」

**誤発動の回避**:

- 「月次チェック」「決算レビュー」「記帳チェック」のように消費税区分以外も
  含む広範な依頼は `anthropic-skills:freee-verify-monthly` の責務です。
- 消費税区分（課税/非課税/対象外）の妥当性チェックは V1-3-10
  `check-tax-classification` の責務です。本スキルはあくまで「インボイス登録
  ステータス × 課税仕入 × 20 万円閾値」の 3 条件 AND 抽出に限定してください。
- 「登録番号（T 番号）の妥当性確認」「経過措置 80%/50% の自動判定」「少額特例」
  「公共交通費特例」を含む依頼は **β2 以降**です。本スキルでは扱わないので、
  その旨を悠皓さんに伝えてください。

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
| `target_month` | str | 対象月 | `2025-12` |

期首は run.py が `company_info.json` から読み取ります。

### パターン 3: 対象月指定(単月)

| 引数 | 型 | 内容 | 例 |
|---|---|---|---|
| `company_id` | int | freee 事業所 ID | `3525430` |
| `target_month` | str | 対象月 | `2025-12` |
| `single_month` | bool | 単月フラグ | `True` |

### パターン判定ルール（重要）

会計実務では「○月をチェック」は **期首からの累積** が基本です。以下に従って判定：

1. **「○月から○月」「○年度通期」** → パターン 1（期間指定）
2. **「○月をチェック」「○月の確認」（単独月のみ）** → パターン 2（累積、デフォルト）
3. **「○月だけ」「○月単月」「単独で」** → パターン 3（単月）
4. **曖昧な場合**（「3 月を単独で」など、解釈が割れる表現）→ 悠皓さんに確認

### 正規化ルール

- 年月は `YYYY-MM` 形式に統一
- 「2025 年 12 月」「2025/12」「2025-12」「R7.12」はすべて `2025-12`
- 「今月」「先月」等の相対表現は **使わず、悠皓さんに対象月を確認**
- `period_start > period_end` の場合は **入れ替えず、エラーとして悠皓さんに確認**

### 会話抽出例

**例 1**（パターン 1: 期間指定）

```
悠皓: 「インボイス登録状況チェックを実行して。3525430 の 2025 年 4 月から 2026 年 3 月」
抽出: company_id=3525430, period_start="2025-04", period_end="2026-03"
```

**例 2**（パターン 2: 累積デフォルト）

```
悠皓: 「3525430 の 2025 年 12 月のインボイス未登録仕入を抽出して」
抽出: company_id=3525430, target_month="2025-12"（累積モード）
```

**例 3**（パターン 3: 単月明示）

```
悠皓: 「3525430 の 2025 年 12 月だけインボイスチェック」
抽出: company_id=3525430, target_month="2025-12", single_month=True
```

**例 4**（曖昧 → 確認）

```
悠皓: 「3525430 の 12 月を単独でインボイスチェック」
対応: 「『単独』は単月チェック（その月のみ）と累積チェック（期首〜12 月）の
       どちらでしょうか？」
```

**例 5**（引数不足）

```
悠皓: 「インボイスチェックして」
対応: 「対象の事業所 ID と期間を教えてください。
       例: 事業所 3525430、2025 年 12 月（累積）」
```

## 実行手順

### 重要: fetch 責務の分離

本 Skill では freee MCP の呼び出しは **Claude Code エージェント（あなた）** の
責務です。run.py は MCP を呼びません。run.py は既存 JSON を読み込んで
チェックを実行するだけです。

### 必要な JSON ファイル

`tests/e2e/{company_id}/{period_end}/` 配下に以下 **5 ファイル**：

| ファイル | 役割 |
|---|---|
| `company_info.json` | 会社・会計期情報（パターン 2/3 では `tests/e2e/{company_id}/` 直下も可） |
| `account_items_all.json` | 勘定科目マスタ |
| `partners_all.json` | 取引先マスタ（**`qualified_invoice_issuer` フィールドで適格判定**） |
| `taxes_codes.json` | 税区分マスタ（`name_ja` を tax_label として使用） |
| `deals_{period_start}_to_{period_end}.json` | 期間内取引（マージ済み） |

> **β1 では `manual_journals_{...}.json` は参照しません**。β2 以降で
> deals と manual_journals を合流する予定です。

### 実行フロー

1. 会話から引数を抽出（パターン 1/2/3 を判定）
2. パターン 2/3 の場合：
   - `tests/e2e/{company_id}/company_info.json` の存在確認
   - 無ければ **RUNBOOK_fetch.md Step 1 に従って fetch**
   - company_info を読んで `fiscal_year_start` から period_start を決定
     - パターン 2: `period_start = 期首YYYY-MM`, `period_end = target_month`
     - パターン 3: `period_start = period_end = target_month`
3. `tests/e2e/{company_id}/{period_end}/` の **5 ファイル**を確認、不足は fetch
   - **fetch 詳細は `scripts/e2e/RUNBOOK_fetch.md` を参照**（保存先は新命名規則
     `tests/e2e/{company_id}/{period_end}/` を使う、`{period_end}` は YYYY-MM 形式）
4. run.py を実行（後述コマンド）
5. exit code に応じて分岐：
   - **0**: 結果 JSON を整形して報告
   - **2**: `missing_files` を読み取り該当 JSON を fetch して再実行
     （**最大 2 回**まで自動リトライ）
   - **1**: 引数を再確認して悠皓さんに報告
   - **3**: target_month が期首より前 → 悠皓さんに確認
   - **その他**: エラー詳細を悠皓さんに報告

### run.py 実行コマンド

実装本体は `skills/verify/V1-3-rule/check-invoice-registration-status/run.py` に
あります。プロジェクトルート（`office/office-claude/`）で以下を実行してください。

**パターン 1（期間指定）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id {company_id} \
  --period-start {period_start} \
  --period-end {period_end}
```

**パターン 2（累積）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id {company_id} \
  --target-month {target_month}
```

**パターン 3（単月）**

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id {company_id} \
  --target-month {target_month} \
  --single-month
```

**具体例**: 事業所 3525430 の 2025 年 12 月（累積、期首 2025-04 〜 2025-12）

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id 3525430 --target-month 2025-12
```

### fetch 詳細手順の参照先

各 JSON の取得方法（エンドポイント、ページング、整形ヘルパー）の
詳細は `scripts/e2e/RUNBOOK_fetch.md` を参照してください。
新命名規則ではディレクトリを `YYYY-MM`、deals ファイル名を
`deals_{period_start}_to_{period_end}.json` とすること（既存の `YYYYMM`
形式データはそのまま据え置き、新規取得分のみ新命名）。

> **β1 では manual_journals は fetch しません**。β2 以降で
> `manual_journals_{period_start}_to_{period_end}.json` の取得手順を追加予定。

## 応答テンプレート

### 実行前応答（引数抽出結果の確認）

```
以下でインボイス登録状況チェックを実行します。
- 事業所 ID: {company_id}
- 対象期間: {period_jp}（モード: {累積 / 単月 / 期間指定}）
- スコープ: deals のみ（manual_journals は β2 以降）
- 必要 JSON: 不足 {N} 件 → MCP で取得します
```

### 正常終了時

```
インボイス登録状況チェックを実行しました。

事業所 ID: {company_id}
対象期間: {period_jp}
スコープ: deals のみ（manual_journals は β2 以降）
候補件数: {candidates_count} 件

候補（冒頭 3 件まで）:
- {finding[0].message}
- {finding[1].message}
- {finding[2].message}
{... 残り N-3 件は省略 ...}

完全な JSON 出力は run.py の標準出力をご確認ください。

※ 件数の妥当性は β2 で評価予定。本リリース（β1）は候補抽出までを保証します。
※ 登録番号妥当性 / 経過措置（80%/50%）/ 少額特例 / 公共交通費特例は
   未対応（β2 以降）。
```

### JSON 不足時（自動リトライ中）

```
{missing_files の filename リスト} を取得中です…
（取得後 run.py を再実行します）
```

### エラー時

```
インボイス登録状況チェックの実行中にエラーが発生しました。

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
  「3525430 の 2025 年 12 月（累積）」
  「3525430 の 2025 年 12 月だけ（単月）」
  「3525430 の 2025 年 4 月から 2026 年 3 月」
```

## 禁止事項（Claude Code として守ること）

1. 会話から抽出できない引数を **勝手に推測しない**（必ず悠皓さんに確認）
2. `run.py` を経由せず、直接 `checker.py` / `find_candidates` を呼ばない
3. run.py から MCP を呼ぶことを期待しない（run.py は読むだけ）
4. **累計集計・期間比較・月別推移には対応しない**（β2 以降）
   - そのような依頼が来たら「本リリース（β1）では単票候補抽出のみです。
     累計・期間比較は β2 以降で対応予定」と返す
5. **manual_journals は β1 では扱わない**（β2 で deals と合流予定）
   - 「振替伝票も含めて」と言われた場合は「β1 では deals のみ。manual_journals
     は β2 で対応予定」と返す
6. **登録番号（T 番号）の妥当性チェックを行わない**（β2 以降）
7. **経過措置（80%/50%）の自動判定を行わない**（β2 以降）
8. **少額特例 / 公共交通費特例の判定を行わない**（β2 以降）
9. **Excel レポート出力は β1 にはない機能**
   - 「Excel で出して」と言われたら「β1 では JSON 出力のみ。Excel は β2 以降」
     と返す
10. **FindingGroup（指摘事項のグルーピング集約）は β1 にない**（β2 以降）
11. 20 万円閾値・課税仕入 prefix を **悠皓さんの依頼で可変化しない**
    （実行時カスタムは α 仕様維持、β1 でも固定）
12. exit 2 リトライは **最大 2 回**まで（それ以降は悠皓さんに報告）
13. `tmp/` 配下のスクリプト（旧E2E検証時の暫定スクリプト群。2026-05-01 の整理で
    `scripts/` に移送済みだが、Skill実行の代替手段としては引き続き使用禁止）を
    **本 Skill の代替として実行しない**（run.py が唯一の正規エントリポイント）

## 関連情報

### 実装本体

- 配置: `skills/verify/V1-3-rule/check-invoice-registration-status/`
- α 公開 API（`run.py`、α から不変）:
  - `InvoiceCheckRow`（frozen dataclass）
  - `find_candidates(rows) -> list[InvoiceCheckRow]`（3 条件 AND）
  - `is_taxable_purchase(tax_label) -> bool`
  - `AMOUNT_THRESHOLD = Decimal("200000")`（固定）
  - `TAXABLE_PURCHASE_PREFIXES = ("課対仕入", "課税仕入")`（固定）
- β1 追加（`run.py` 末尾）:
  - CLI 3 パターン引数パース、exit code 0/1/2/3/4 分岐
  - `_normalize_deals(deals_json, partners_map, taxes_map) -> list[InvoiceCheckRow]`
  - `_is_qualified_invoice(partner) -> bool`
    （`bool(partner.get("qualified_invoice_issuer"))`）
- Finding 変換層（`checker.py`、純粋関数のみ・I/O フリー）:
  - `to_finding(row) -> InvoiceFinding`
  - `to_findings(rows) -> list[InvoiceFinding]`
- スキーマ（`schema.py`）:
  - `InvoiceCheckContext`（V1-3-20 β1 専用最小版、V1-3-10 とは独立）
  - `InvoiceFinding`（V1-3-10 と共通最小サブセット + `raw` dict）

### 参考

- 内部モデル: 指定期間内の単票候補抽出（累計・比較・集計なし、β1）
- fetch 手順: `scripts/e2e/RUNBOOK_fetch.md`
- 適格判定ルール: `is_qualified_invoice = bool(partner.get("qualified_invoice_issuer"))`
  - True 倒し: `qualified_invoice_issuer == True`
  - False 倒し: `False / null / 欠損 / partner_id が partners_map に無い`
- 関連 Skill:
  - V1-3-10 `check-tax-classification`（消費税区分の妥当性チェック、独立）
  - `anthropic-skills:freee-verify-monthly`（66 項目を広く浅く、独立）
- 運用原則: 設計書 v3.0 付録 B 参照
