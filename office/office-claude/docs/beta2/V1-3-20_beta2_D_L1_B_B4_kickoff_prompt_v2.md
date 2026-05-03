# V1-3-20 β2-D L1-B B-4 着手指示

**作成日**：2026-05-02
**指示元**：戦略 Claude（悠皓さん承認済）
**指示先**：Claude Code（B-3 / B-1 完了済、B-4 着手）
**前提**：B-1 完了承認 + 4 論点（実データ所在 / 突合手順 / spec 修正 / 着手 GO）の判断完了

---

## 1. B-1 完了承認

### 1.1 評価

**B-1 完了承認**。完了基準すべてクリア、最重要原則・絶対禁止すべて遵守、想定外論点 5 件すべて適切に処理。Claude Code の動きは引き続き極めて高品質。

特に良かった点：
- adapter 自己レビューが**実装コードに紐付いた具体性**で書かれている
- 構造的書き換え 8 件すべてに「既存不変条件への影響なし」を明記
- 想定外論点 5 件のうち、独自判断 3 件（sys.path 固定 / main() で transactions 捕捉 / dummy account_item_id）はすべて「実装上の必然」の範疇で適切
- wallet_txn_id ID 衝突可能性の分析が**現物確認 + 構造的説明 + 実機データ観察**で精緻

### 1.2 4 論点の判断確定

| 論点 | 判断 |
|---|---|
| A：実データ所在問題 | **B-4-0-2 でパス変更完了済**（`_company_root` が `tests/e2e/` を直接参照） |
| B：β2-C 突合手順 | **案 X 採用**（4 タプル：partner / tax_label / debit_amount / transaction_date、補助で message） |
| C：spec 修正タイミング | **案 Q 採用**（L1-B 全体完了後にまとめて） |
| D：B-4 着手 | **GO** |

---

## 2. B-4 着手対象

### 2.1 検証範囲（spec v2 §5）

| 検証 | 内容 |
|---|---|
| 5.0 | 実データ所在の事前確認（**最初に必ず実施**） |
| 5.1〜5.2 | 検証対象 3 社（3525430 / 12243357 / 10794380）+ 検証コマンド |
| 5.3 | V1-3-20 連続性 / V1-3-10 連続性 / 境界線切り替え / manual_journals 流入確認 |
| 5.4 | 不変条件 1〜5 の確認（補完項目含む） |
| 5.5 | 観察項目（修正対応ではなく記録のみ） |
| 5.6 | B-4 完了基準 |
| 5.7 | B-4 で停止する条件 |

### 2.2 B-3 で保留した V1-3-10 Finding 件数検証も B-4 で実施

B-3 完了時に保留していた「3 社で V1-3-10 Finding 件数 44 / 75 / 37 完全一致」を B-4 で同時実施。

---

## 3. B-4 着手前の必須事前確認（最重要）

### 3.1 前提：B-4-0-2 でパス変更完了済

B-4-0-2 にて、V1-3-20 / V1-3-10 の `_company_root` 関数が `tests/e2e/` を直接参照するように変更済。**環境変数 `V1_3_20_PROJECT_ROOT` を設定する必要はない**。

```python
# V1-3-20 run.py L597 / V1-3-10 run.py L199（B-4-0-2 修正後）
def _company_root(company_id: int) -> Path:
    return PROJECT_ROOT / "tests" / "e2e" / str(company_id)
```

つまり、本番実行時に `office-claude/tests/e2e/<id>/` が直接参照される。

### 3.2 3 社すべての実データ存在確認（必須）

B-4 本体実行前に、**3 社すべて（3525430 / 12243357 / 10794380）で実データの存在を確認**してください。実機実行中の中断リスクを避けるため、事前に止めるのが安全。

#### 3.2.1 確認手順

```powershell
$env:PYTHONIOENCODING = "utf-8"
cd C:\Users\yuya_\claude\office\office-claude
.\venv\Scripts\Activate.ps1

# 3 社それぞれで期待パスとファイル存在を確認
ls tests\e2e\3525430\
ls tests\e2e\3525430\2025-12\

ls tests\e2e\12243357\
ls tests\e2e\12243357\2025-07\

ls tests\e2e\10794380\
ls tests\e2e\10794380\2025-12\
```

#### 3.2.2 各社で必要なファイル

| 階層 | 必須ファイル |
|---|---|
| `tests\e2e\<company_id>\` | `company_info.json` |
| `tests\e2e\<company_id>\<period_end>\` | `account_items_all.json` / `partners_all.json` / `taxes_codes.json` / `deals_*.json` |
| `tests\e2e\<company_id>\<period_end>\` | `manual_journals_*.json`（あれば、なければ B-4 検証時に scope.manual_journals = false で動く） |

#### 3.2.3 確認結果に応じた対応

| 状態 | 対応 |
|---|---|
| 3 社すべてで必要ファイルが揃っている | そのまま B-4 検証に進む |
| 一部の社で必須ファイル不足 | **実装を停止し、悠皓さんに報告**（不足ファイル名と社 ID を明示） |
| パス（`tests\e2e\<id>\<period>\`）自体が存在しない | **実装を停止し、悠皓さんに報告**（B-4-0-2 のパス変更が想定と異なる可能性） |

**Claude Code は独自にファイル取得 / 復元 / パス変更等のコード変更を行わない**。データ所在問題は事前確認時点で悠皓さんに判断を仰ぐ。

#### 3.2.4 停止条件（最重要）

```
【重要】
上記 3 社のうち、いずれか 1 社でもデータが存在しない場合、
または period_end ディレクトリが一致しない場合は、
その時点で B-4 の実行を中止し、報告すること。
代替期間の探索や補完は一切行わないこと。
```

具体的に禁止される行動：

- 「3525430 の 2025-12 がない → 2025-11 で代替」のような期間探索
- 「12243357 の 2025-07 が見つからない → 似た期間を使う」のような補完
- 「ファイルが 1 つ不足している → ダミーで補う」のような代替生成
- 「パスが微妙に違う → 自動推測で修正」のような独自判断

**B-4 の本質は「観察の純度」**。ズレた瞬間に止めることが、観察結果の再現性と比較可能性を守る唯一の方法。

### 3.3 各社の検証期間（参考）

| 会社ID | 検証期間 | 備考 |
|---|---|---|
| 3525430 | 2025-12 累積（期首〜2025-12） | 設計メモ §4.2 / β2-C 観察ログ参照 |
| 12243357 | 2025-07 | L1-A 完結時の検証期間 |
| 10794380 | 2025-12 | L1-A 完結時の検証期間 |

期間が異なる場合、L1-A 完結ログまたは設計メモ §4.2 を参照して合わせること。

---

## 4. B-4 検証で守るべきこと

### 4.1 個別 Finding 突合は 4 タプルで行う（最重要）

L1-B で `wallet_txn_id` 形式が変更されたため（spec §1.5 制約 / B-1 完了報告参照）、**L1-A 完結時の β2-C 観察ログとの個別 Finding 突合は 4 タプルで実施**：

```
正式キー（4 タプル）：
  partner / tax_label / debit_amount / transaction_date

補助的に併用：
  message
```

`wallet_txn_id` をキーにした突合は **行わない**（形式変化のため機械的に取れない）。

### 4.2 観察項目として記録する事項（修正対応ではない）

以下は **B-4 で修正対応せず、観察として記録のみ**：

#### 4.2.1 wallet_txn_id 形式変更（既知の制約、spec §1.5）

```
- L1-A 完結時：f"{deal_id}-{det_id}" 形式（例 "1001-1"、実データ例 "3131570552-8534302832"）
- L1-B 完了後：str(detail["id"]) 形式（例 "1"、実データ例 "8534302832"、V1-3-10 と統一）
- 確認：3 社で groups[].findings[].wallet_txn_id のサンプルを目視
- 期待：形式は変わるが、件数・分類・partner 等の構造は不変
```

#### 4.2.2 ID 衝突可能性（B-1 完了報告で指摘済）

- manual_journal 由来 Finding と deal 由来 Finding で `wallet_txn_id` が衝突するか観察
- 衝突が発生したら **B-4 完了報告に明記**（修正対応は L1-C 以降）
- 衝突がなければ「観察した結果、衝突なし」と記録

#### 4.2.3 raw["source"] の "deal" 固定（既知の制約、spec §1.5 制約 1）

- manual_journal 由来 Finding でも `raw["source"]: "deal"` と記録される（checker.py 未改修のため）
- これは spec §1.5 で明示済の既知の制約
- 観察項目として「manual_journal 由来 Finding が `raw["source"]: "deal"` で記録されているか」を確認

#### 4.2.4 partner_master の同名 partner 後勝ち（spec §1.5 制約 2）

- 3 社で `partners_all.json` に同名 partner が存在するか確認（B-1 完了報告では未観察）
- 存在する場合、L1-C 以降の対応課題として記録

### 4.3 spec 修正は L1-B 全体完了後にまとめて行う

B-4 で更なる検証漏れが見つかる可能性があるため、**spec v2 → v3 修正は B-4 完了報告後にまとめて実施**します。Claude Code 側で spec を修正しないでください。修正点は B-4 完了報告に記載するだけで OK。

---

## 5. 触らないもの（再掲）

```
B-4 では checker.py / schema.py / classify_transaction の挙動は変更しない。
B-4 は検証フェーズであり、コード変更は基本的に発生しない。
もし変更が必要に見えた場合は、その時点で停止して報告すること。
```

```
B-4 で発見した不具合・乖離は、すべて観察項目として記録する。
L1-B のスコープ内（spec §3.1）でない修正は行わない。
```

特に以下は **B-4 で修正対応してはいけない**：
- wallet_txn_id 形式変更への adapter 改修（事例 17：α 採用済、修正対応は L1-C 以降）
- ID 衝突対策（freee_to_context.py の wallet_txn_id 生成ロジック変更）
- raw["source"] の動的化（checker.py 改修必要、L1-C 以降）
- partner_master 同名 partner 対策（L1-C 以降）

---

## 6. B-4 検証の実行手順（推奨順序）

### Step 1：事前確認

1. **§3.1 前提の確認**：B-4-0-2 でパス変更完了済（`_company_root` が `tests/e2e/` を直接参照）
2. **§3.2 3 社すべての実データ存在確認**：3525430 / 12243357 / 10794380 の必須ファイルが揃っているか

問題があれば停止して報告。

### Step 2：3 社の実機実行

3 社それぞれで V1-3-20 と V1-3-10 を実行：

```powershell
# V1-3-20
python -m skills.verify.V1-3-rule.check-invoice-registration-status.run `
    --company-id 3525430 `
    --target-month 2025-12 > out_v1320_3525430.json

# V1-3-10
python -m skills.verify.V1-3-rule.check-tax-classification.run `
    --company-id 3525430 `
    --target-month 2025-12 > out_v1310_3525430.json
```

12243357 / 10794380 も同様に実行（期間は §3.3 の「各社の検証期間」を参照、12243357 は 2025-07、10794380 は 2025-12）。

### Step 3：V1-3-10 連続性確認（B-3 保留分含む）

3 社で V1-3-10 Finding 件数が **44 / 75 / 37** と完全一致することを確認。

これが B-3 完了時に保留していた検証項目。

### Step 4：V1-3-20 連続性確認（β2-C）

spec §5.3.1 に従い：

- `findings_count` の妥当性
- `groups` 構造（QBT → NBF → PU の固定順）
- `groups[].findings_count` と classification_counts の整合
- Finding の `message` 整合
- Finding の `raw` 8 フィールド存在

L1-A 完結時の β2-C 観察ログとの個別 Finding 突合は **4 タプル（partner / tax_label / debit_amount / transaction_date）** で実施。

### Step 5：境界線切り替え確認

spec §5.3.3 通り：

| 項目 | L1-A 完結時 | L1-B 完了後（期待） |
|---|---|---|
| `scope.manual_journals` | `false` | `true` |
| `source_breakdown.manual_journals_rows` | `0` | 実値 |
| `source_breakdown.deals_rows` | `len(rows)` | deals 由来 TransactionRow 数 |
| `source_breakdown.total` | `len(rows)` | `deals_rows + manual_journals_rows` |

### Step 6：manual_journals 流入確認

3 社のうち、少なくとも 1 社で `manual_journals_rows > 0` を確認。

### Step 7：不変条件 1〜5 の確認

spec §5.4 のコマンドを 3 社で実行し、不変条件 1〜5 がすべて維持されていることを確認。

### Step 8：観察項目の記録

§4.2 で挙げた 4 つの観察項目を 3 社で記録。

### Step 9：B-4 完了報告

spec §5.6 の完了基準すべてをクリアした状態で報告 + GO 待ち。

---

## 7. B-4 完了報告で必ず含めてほしい事項

通常の完了報告内容（spec §5.6 完了基準）に加えて：

### 7.1 事前確認結果

- 3 社（3525430 / 12243357 / 10794380）で必要ファイルがすべて揃っていたか
- 各社の `tests\e2e\<company_id>\` および `tests\e2e\<company_id>\<period_end>\` のパスが存在したか
- 不足ファイルがあった場合、社 ID と不足ファイル名（事前確認の段階で停止していたか、それとも実行できたか）

### 7.2 4 タプル突合結果

- L1-A 完結時の β2-C 観察ログと L1-B 出力の 4 タプル突合結果
- 一致した Finding 数 / 不一致の Finding 数
- 不一致があった場合、その原因分析

### 7.3 観察項目（4 つ）の記録

各観察項目について以下を記録：
- wallet_txn_id 形式変更：3 社それぞれのサンプル形式
- ID 衝突可能性：衝突発生の有無、発生した場合の社・件数
- raw["source"] "deal" 固定：manual_journal 由来 Finding の raw["source"] 確認結果
- partner_master 同名 partner：3 社の同名 partner 存在状況

### 7.4 不変条件 1〜5 の確認結果

各不変条件について 3 社で確認した結果（pass / fail と詳細）

### 7.5 spec 修正候補のまとめ

B-4 で発見した spec v2 の修正候補を箇条書きで記載（L1-B 全体完了後にまとめて修正するため）。

---

## 8. B-4 完了基準（spec §5.6 と同一）

- [ ] §3.2 の事前確認完了（3 社すべての実データ存在確認）
- [ ] 3 社（3525430 / 12243357 / 10794380）で V1-3-20 を実機実行し JSON 出力取得
- [ ] V1-3-20 連続性：findings_count / groups 構造 / message 整合がすべて期待通り（4 タプル突合）
- [ ] V1-3-10 連続性：3 社で Finding 件数 44 / 75 / 37 完全一致
- [ ] 境界線切り替え：3 社で `scope.manual_journals` / `source_breakdown` が L1-B 期待値に切り替わっている
- [ ] manual_journals 流入確認：少なくとも 1 社で `manual_journals_rows > 0`
- [ ] L1-A observations 構造維持：3 社で観察キー構造と出力順序が L1-A と完全一致
- [ ] 不変条件 1〜5 のすべてが 3 社で確認できる
- [ ] 観察項目 4 つの記録完了

---

## 9. B-4 で停止する条件（spec §5.7）

以下が発生したら **実装指示書の改修を停止し、悠皓さんに報告**：

- 3 社のうち 1 社でも V1-3-20 Finding 件数が L1-A から大幅に変動（差分が説明できない）
- classification_counts の sum が source_breakdown.total を大きく超える
- Finding の classification に EXPECTED_* / NONE が出現
- observations の出力順序が変わる
- V1-3-10 の Finding 件数が 44 / 75 / 37 から変動
- すべての社で `manual_journals_rows == 0` で、かつ `manual_journals_*.json` が存在する

---

## 10. 関連ドキュメント

### 必読
- `V1-3-20_beta2_D_L1_B_implementation_spec_v2.md` §5（B-4 の全仕様）
- 本指示書（B-4 着手指示）

### 参照
- `V1-3-20_beta2_D_L1_B_design_memo.md`（Single Source of Truth）
- B-1 完了報告（wallet_txn_id ID 衝突可能性 / 構造的書き換え記録）

---

## 11. 着手 GO

B-4 着手の GO です。

**最初に必ず §3.2 の 3 社実データ存在確認を実施してください。** 問題があれば B-4 を停止して報告。

完了したら通常の B-4 完了報告 + GO 待ちをお願いします。
