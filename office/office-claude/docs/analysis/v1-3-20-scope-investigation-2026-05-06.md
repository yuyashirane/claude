# V1-3-20 β2-D / β2-E スコープ調査レポート

**作成日**: 2026-05-06
**ブランチ**: `chore/investigate-v1-3-20-scope`
**目的**: Finding スキーマ共通化(目標①)の判断材料として、β2-D / β2-E が Finding 構造を変更する予定があるかを把握する
**ステータス**: 読み取り専用調査。実装変更なし。

---

## 0. 調査範囲と前提

### 一次資料(参照済)
1. `memory/project_v1_3_20_invoice_check.md` (2026-04-29 時点、7 日前のスナップショット)
2. `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` (現行スキーマ)
3. `skills/verify/V1-3-rule/check-invoice-registration-status/` 配下: `schema.py` / `checker.py` / `run.py` のみ(README/TODO/設計メモなし)
4. `tests/unit/test_invoice_registration_status.py` (129 件、test 関数集計済)
5. `git log --oneline -20 -- skills/.../check-invoice-registration-status/` (3 commit のみ)

### 想定外の発見資料(memory 参照リンクから判明)
6. `office/office-claude/docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md` (**2026-05-02 作成、β2-D L1-B 完了ログ 472 行**)
7. `office/office-claude/docs/beta2/V1-3-20_beta2_D_L1_B_implementation_spec_v3.md` (**β2-D 実装指示書 v3、1072 行**)

memory(2026-04-29) は β2-C 完結時点であり、その後 β2-D が進行している。本調査では memory 後の最新事実を完了ログ・指示書 v3 から取り込む。

### 調査範囲外(深掘りせず)
- V1-3-10 側のコード詳細
- skills/_common/ 配下
- Excel 出力層

---

## Section 1: β2-D の現状

### 1.1 実装済みスコープ (3〜5 行要約)

β2-D L1-B は **2026-05-02 に「実質完了」** している(完了ログ:1)。本フェーズは「**繋ぐ(bridge)**」と位置づけられ、V1-3-20 の入力経路を独自実装(`_normalize_deals`)から **V1-3-10 共通の `build_check_context` + adapter 経路** に寄せる作業。実機 3 社(3525430 / 12243357 / 10794380)で β2-C 連続性 4 タプル突合 10/10 完全一致を達成。テスト件数は V1-3-20 129 PASS / V1-3-10 211 PASS。**最重要原則「判定層は触らない」は完全遵守され、両 Skill の `schema.py` は 1 行も変更されていない**(完了ログ:368-385、§9.2)。

### 1.2 主要な dataclass / 関数 (L1-B で追加・変更)

- 新規追加(V1-3-20 `run.py`):
  - `_build_invoice_check_rows(ctx) -> list[InvoiceCheckRow]`: TransactionRow → InvoiceCheckRow の純粋変換 adapter (~70 行)
- 改修(V1-3-20 `run.py`):
  - `_calculate_source_breakdown(transactions)`: 引数を `rows` → `transactions` に変更
  - `main()` Step 4: `build_check_context` 経由に置換
  - `scope.manual_journals`: 動的化
- 改修(`scripts/e2e/freee_to_context.py`):
  - `build_check_context` 内で `partner_master: dict[str, dict]` を生成 (~12 行追加)、`CheckContext(...)` に渡す
- **未変更**: `InvoiceCheckRow` / `Classification` / `InvoiceFinding` / `FindingGroup` / `InvoiceCheckContext` / `MESSAGE_TEMPLATES` / `to_finding` / `to_findings` / `classify_transaction` / `find_groups`

### 1.3 根拠ファイル

- `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md:1-50` (エグゼクティブサマリ)
- `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md:368-394` (§9 触らなかったもの)
- `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md:336-365` (§8 数値的指標、テスト 340 PASS)
- `docs/beta2/V1-3-20_beta2_D_L1_B_implementation_spec_v3.md:38-46` (§1.2 最重要原則)
- `docs/beta2/V1-3-20_beta2_D_L1_B_implementation_spec_v3.md:60-85` (§1.4 触らないもの)
- `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py:1-139` (現行、β2-C 状態のまま)

### 1.4 残存している L1-B まとめタスク(6 件、完了ログ §7.1)

β2-E 着手前に独立タスクとして処理予定:

| # | タスク | 規模 |
|---|---|---|
| 1 | パターン C (SKILL.md 3 ファイル更新) | 小 |
| 2 | グループ D (RUNBOOK / E2E_runbook / E2E_prompt) | 小〜中 |
| 3 | spec v2 → v3 改訂 ※既に v3 存在 → 完了済の可能性 | 中 |
| 4 | TC_template 問題対処 | 中 |
| 5 | V1-3-10 実機 44/75/37 確認(タスク 4 依存) | 小 |
| 6 | 事例 16〜20 の 2-J 統合(悠皓担当) | 中 |

(根拠: `completion_log.md:303-316`)

---

## Section 2: β2-E の予定

### 2.1 計画されているスコープ

memory と完了ログ §7.2 から、β2-E のスコープは **複数資料で「V1-3-10 と V1-3-20 の Finding / Context / Excel 統合」** と明記されている:

#### memory 由来 (β2-C 完結時の引き継ぎ論点)
> - V1-3-10 レポートとの統合方式
> - 親子行構造(FindingGroup を親、Finding を子)
> - Excel での severity 色分け
> - V1-3-20 固有列(classification、qualified_invoice_issuer 等)
> - SKILL.md 改訂判断

(根拠: `memory/project_v1_3_20_invoice_check.md:155-160`)

#### β2-D 完了ログ §7.2 (L1-C 以降の対応候補)
> - `InvoiceFinding.raw["source"]` の動的化(spec §1.5 制約 1、checker.py 改修必要)
> - wallet_txn_id ID 衝突対策
> - partner_master 同名 partner 後勝ち対策
> - dead code 5 関数の整理
> - **V1-3-20 / V1-3-10 の InvoiceCheckContext 統合(β2-E / 別 Phase)**
> - **exporter / Excel 統合(β2-E / 別 Phase)**

(根拠: `completion_log.md:319-327`)

#### β2-D 指示書 v3 §1.4「触らない論点」
> - **InvoiceFinding と V1-3-10 Finding の統合(β2-E / 別 Phase)**
> - exporter / Excel 出力の統合(β2-E / 別 Phase)
> - T 番号妥当性チェック(β3 以降)
> - partner_master の同名 partner 後勝ち問題

(根拠: `implementation_spec_v3.md:79-85`)

### 2.2 InvoiceFinding に追加・変更される予定の属性

**β2-E スコープには Finding スキーマ統合が明示的に含まれている**(指示書 v3 §1.4 / 完了ログ §7.2)。ただし具体的な属性追加・変更内容(どのフィールドが新設/廃止されるか)は **β2-E の設計メモがまだ存在しない** ため資料からは特定できない。

memory §β2-E スコープに記載の「**親子行構造(FindingGroup を親、Finding を子)**」「**V1-3-20 固有列(classification、qualified_invoice_issuer 等)**」は、Excel 出力層の話であり、InvoiceFinding の属性変更を直接示唆するものではない。ただし「V1-3-10 レポートとの統合方式」を達成するには、両 Skill の Finding が共通の出力フォーマットを持つ必要があり、**統合方式の選択次第で Finding 属性が変動する**。

(根拠: `completion_log.md:319-327`、`implementation_spec_v3.md:79-85`、`memory/project_v1_3_20_invoice_check.md:154-160`)

### 2.3 根拠ファイル

- `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md:319-327` (L1-C 以降の対応候補)
- `docs/beta2/V1-3-20_beta2_D_L1_B_implementation_spec_v3.md:79-85` (触らない論点)
- `memory/project_v1_3_20_invoice_check.md:154-160` (β2-E スコープ)
- **β2-E の設計メモ・指示書は本日時点で `docs/beta2/` に存在せず**(`ls` で確認)

### 2.4 不明な事項

- β2-E のキックオフ時期: **資料からは不明**(L1-B まとめタスク 6 件 + L1-C 以降の課題が先行する可能性あり)
- β2-E が「Finding 統合」をどこまで踏み込むか(Excel 出力層のみか、スキーマレベル統一まで踏み込むか): **資料からは不明**
- β2-E と「目標①(共通 Finding スキーマ定義)」の関係性(包含/独立/重複): **資料からは不明、悠皓の判断事項**

---

## Section 3: 共通化への影響評価

### Q1: β2-D/E は InvoiceFinding の属性を追加・変更する予定があるか?

**回答: YES (β2-E で予定あり)**

- **β2-D**: NO。L1-B 完了ログで V1-3-20 `schema.py` は「触らなかったもの」§9.2 に明記され、実機 3 社で完全遵守確認済 (`completion_log.md:380-385`)
- **β2-E**: 完了ログ §7.2「V1-3-20 / V1-3-10 の InvoiceCheckContext 統合(β2-E / 別 Phase)」+ 指示書 v3 §1.4「InvoiceFinding と V1-3-10 Finding の統合(β2-E / 別 Phase)」の **2 箇所** で明記。属性追加・変更は β2-E スコープに **論理的に含まれる**

### Q2: β2-D/E は Classification / FindingGroup の構造を変更する予定があるか?

**回答: UNKNOWN**

- **β2-D**: NO。L1-B 完了ログ §9.1 で `Classification Enum` / `FindingGroup` は「触らなかったもの」(`completion_log.md:373-379`)
- **β2-E**: memory §β2-E スコープに「**親子行構造(FindingGroup を親、Finding を子)**」「**V1-3-20 固有列(classification 等)**」が記載され、両概念を Excel 出力層で活用する方針は確定。ただし **dataclass の構造を変更する明示的な計画は資料に記載なし**。Excel 出力対応のため `findings_count` 以外のメタ情報(集計列など)を持たせる可能性は否定できないが、現時点では設計メモがないため判断不能

### Q3: β2-D/E は LinkHints / FindingDetail を新規導入する予定があるか?

**回答: UNKNOWN**

- **β2-D**: NO。V1-3-20 `schema.py` は LinkHints / FindingDetail を持たず、L1-B でも未追加 (`completion_log.md:380-385`)
- **β2-E**: V1-3-10 の LinkHints は freee URL 生成(Phase 7)で必須。β2-E が「Excel 統合」「V1-3-10 レポートとの統合方式」を含む以上、V1-3-20 に LinkHints 相当の機構を導入する **可能性は高い**。ただし指示書 v3 §1.4 の「触らない論点」リストには明記されておらず、新規導入と既存活用のいずれかは β2-E 設計次第。**資料からは不明**

---

## Section 4: 判断推奨 (Claude Code の所見、最終判断は悠皓)

### 推奨: **(d) その他 — β2-E 設計と統合・並行して共通化を進める**

#### 推奨理由

完了ログ §7.2 と指示書 v3 §1.4 で **β2-E のスコープに「InvoiceFinding と V1-3-10 Finding の統合」が 2 重に明記** されている事実から、以下が言える:

1. **目標①(Finding 共通化)と β2-E は実質的に重なる**
   - 「独立に進められる」(案 c)というより、**目標①は β2-E の設計判断そのもの**
   - 先行して案 A/B/B+ で共通化を実装すると、β2-E 着手時に再設計コストが発生する可能性が高い

2. **β2-E 完了を待つ(案 b)は時期的に不確定**
   - β2-E のキックオフ時期は資料に記載なし
   - L1-B まとめタスク 6 件 + L1-C 以降の課題群があり、β2-E までの距離が見えない
   - 「待つ」と決めると共通化が長期凍結される

3. **β2-D L1-B が確立した運用パターンが活用できる**
   - 「最重要原則: 判定層は触らない」を堅持しながら、入力経路だけを共通化した手腕
   - 同様のアプローチで「Excel 出力フォーマット統一を最重要原則とし、判定層・schema は段階的に寄せる」設計が可能
   - これは事実上の **「β2-E 設計フェーズ」を本タスク(共通化)で先行する** ことを意味する

#### 具体的な進め方 (推奨)

A. 戦略 Claude に **β2-E 設計メモ作成** を依頼。本調査の比較表(`finding-schema-comparison-20260506.md`)と統合案 A/B/C を入力資料として渡す
B. 設計メモが固まる過程で **β2-E の最初のクラスタ = 共通スキーマ定義** と位置づけ
C. β2-D L1-B の運用パターン(判定層保護 + bridge 戦略)を継承し、共通化のフェーズ分割を行う
D. L1-B まとめタスク 6 件は β2-E と独立に並行処理(SKILL.md 更新等は影響軽微)

#### 第二候補: (b) β2-E 完了を待つ

- 完全に安全だが時期不確定。β2-E が遠い場合に共通化が長期凍結
- ただし「TC_template 問題対処」「V1-3-10 実機検証」など、L1-B まとめタスクを優先したい場合は妥当

#### 不推奨: (a) 今すぐ案 A/B/B+ で共通化

- β2-E スコープに同じ統合論点が明記されている以上、**先行は二重作業のリスク**
- 案 A の所要時間「5〜8 営業日」を払った後で β2-E 設計が別方向を選ぶと、再修正コストが発生する

#### 不推奨: (c) 案 C 相当の最小共通化

- 完了ログ §7.2 が β2-E の Finding 統合を明示している以上、案 C は「共通化の意義を放棄」する選択
- ただし「β2-E のキックオフが遠いと判明し、それまで V1-3-10/V1-3-20 が独立進化する期間が長い」場合は **暫定措置として有効**

---

## Section 5: 残った不明点

調査でも資料からは解消できなかった点。悠皓の memory 確認・戦略 Claude への質問・別資料の参照が必要:

1. **β2-E のキックオフ時期**: 資料からは不明。L1-B まとめタスク 6 件と L1-C 以降の課題の優先順位次第
2. **β2-E が Finding 統合をどこまで踏み込むか**: Excel 出力層のみか、スキーマレベル統一まで踏み込むかは β2-E 設計メモ未着手のため不明
3. **β2-E の「親子行構造(FindingGroup を親、Finding を子)」が dataclass 階層を変更するか、Excel 出力層のみの概念か**: 資料からは特定できず
4. **β2-E が独立タスクとして「Finding 統合」だけを切り出せるか、Excel 出力層と論理不可分か**: メタ事例 A(論理不可分性の事前吸収)の観点で重要だが、設計メモ不在のため不明
5. **L1-C 以降の課題リスト(完了ログ §7.2 の 6 項目)と β2-E スコープの境界**: 「V1-3-20 / V1-3-10 の InvoiceCheckContext 統合」が L1-C 候補と β2-E 候補の **両方** に登場。同一論点を指すのか、段階的なのか、資料からは判別不能

---

## 6. 結論

**β2-D L1-B は完了済(2026-05-02)。schema.py は完全に保護された。β2-E は明確に Finding 統合をスコープに含む**。これにより、目標①(共通 Finding スキーマ定義)は **β2-E と実質的に重なる**。推奨は (d) **β2-E 設計フェーズと統合・並行で共通化を進める** 進め方。

判断は悠皓に委ねる。本調査結果と前報告(`finding-schema-comparison-20260506.md`)を組み合わせれば、戦略 Claude が β2-E 設計メモを書き始められる材料は揃った。
