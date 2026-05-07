# office-claude 開発引き継ぎ書 (E4 完了 → 次セッション)

**作成日**: 2026-05-08 (E4 完了直後、軽量タスク前)
**前バージョン**: `handover_2026-05-06_post-e3b.md` (連休前半完了時)
**前セッションでの到達点**: β2-E E4 (Context 統合) 完了、連休中目標 ② 達成
**次セッションのゴール**: 整理タスク群の処理 + 次クラスタ (E3-c または E5) への着手

---

## 0. このドキュメントの使い方

このドキュメントは、**新しいセッションの Claude (または Claude Code) に渡すための引き継ぎ書**です。

新しいセッションを開始するときは、文末の「**開始プロンプト**」をコピーして送ってください。Claude が状況を即座に把握し、次のアクションを提案します。

v2 (`handover_2026-05-06_post-e3b.md`) からの主な更新点:
- §2: 連休後半 (2026-05-07〜08) の達成 (E4 完了) を追加
- §3: E4 完了に伴い残作業を更新
- §4: 連休後 TODO に E4 由来の整理タスク群を追加
- §5: 運用ルールに「グローバル CLAUDE.md」「worktree 運用での注意」「stage 不整合への対処」を追加
- §6: Git 状態を最新化 (origin/main = `dfff3b9`)
- §7: 重要ファイルに E4 関連を追加
- §8: 開始プロンプトを最新版に更新
- §10 (新設): 設計判断の確定事項記録 (E4 で確定した論点 1〜5)

---

## 1. プロジェクト概要

### 1.1 プロジェクト名
**office-claude** (会計事務所業務AI化プロジェクト)

### 1.2 開発体制 (確立済)

```
[悠皓] やりたいことを伝える
   ↓ 依頼  ↑ 確認 (最小限・重要なことのみ)
[戦略Claude] Claude Code 用プロンプトを設計・確定する (Markdown 形式)
   ↓ 指示  ↑ 報告
[Claude Code] 実装・調査を実行する
```

役割分担:
- **悠皓**: ゴール設定、業務判断、最終承認 (push, reset --hard, rebase 等の破壊的操作、merge も含む)
- **戦略Claude**: プロンプト設計、技術判断、ファイル化と命名 (`YYYY-MM-DD_NNN_<種類>_<内容>.md`)
- **Claude Code**: 実装、調査、commit (merge / push はしない)

### 1.3 開発環境

- **OS**: Windows
- **エディタ**: VS Code + Claude Code
- **言語**: Python (Anaconda 環境)
- **リポジトリ**: https://github.com/yuyashirane/claude (private)
- **リポジトリのルート**: `C:\Users\yuya_\claude\`
- **office-claude プロジェクトの位置**: `C:\Users\yuya_\claude\office\office-claude\` (= リポジトリ全体の中のサブディレクトリ)
- **作業 worktree**: `C:\Users\yuya_\claude\.claude\worktrees\beautiful-sammet-4c11aa\` (`claude/beautiful-sammet-4c11aa` ブランチ)

**重要 (v2 から訂正)**: `office-claude` はリポジトリのルートではなく、`claude/` 全体が 1 つの Git リポジトリ。引き継ぎ書 v2 ではパス記述が誤っていた箇所がある (例: 「作業ディレクトリ: `C:\Users\yuya_\claude\office\office-claude`」と書いていたが、これは「プロジェクトのディレクトリ」であって「リポジトリのディレクトリ」ではない)。

---

## 2. 連休中の達成

### 2.1 大局的な達成

**連休中目標 ① (Finding スキーマの統一) と ② (Context 統合) を達成**。残るは目標 ③ (Excel 統合 = E5)。

V1-3-10 と V1-3-20 は共通 Finding + 共通 CheckContext で動作する状態に到達。

### 2.2 完了したクラスタ (累計)

#### 連休前半 (2026-05-06)

| クラスタ | 内容 | 主要な commit |
|---|---|---|
| **E1** | 共通スキーマ定義 (`skills/_common/schema.py` 新設) | f59efb2, b4ad7d3 |
| **E2-a** | V1-3-10 schema.py を共通スキーマからの re-export に変更 | 9cb738f |
| **E2-b1** | Severity / ReviewLevel 旧値の出現箇所調査 (96 件特定) | e6385c5 |
| **E2-b2** | ReviewLevel 機械置換 (25 件、`_ERROR_TYPE_TO_REVIEW_LEVEL` 中央集約) | 97dbdfb, 21b8823 |
| **E2-b3** | Severity 機械置換 (61 件、SEVERITY_ORDER + SEVERITY_TO_PARENT_STYLE 中央集約) | 3996256, ffd9823, ad30796, 010333a |
| **E3-a** | V1-3-20 移行 事前調査 | 0abd1e1 |
| **E3-pre** | invoice_warning ErrorType 追加 | fcf1a9a |
| **E3-b** | V1-3-20 InvoiceFinding を共通 Finding のエイリアスに変更 + to_finding 改修 | a84909e, 861acd7, ecfa393, 3ac6c46 |

#### 連休後半 (2026-05-07〜08)

| クラスタ | 内容 | 主要な commit |
|---|---|---|
| (運用) | 設計メモ v2 作成、引き継ぎ書 v2 commit | ebb5464, 8e07528 |
| (運用) | `.gitignore` に `.claude/worktrees/` 追加 (worktree submodule 誤検知の防止) | 2b8fdb6 |
| **E4-pre** | V1-3 Context 統合 事前調査 | 3ae6051 |
| **E4-1 + E4-2** | `skills/_common/context.py` 新設、V1-3-10 schema.py を re-export に変更 | eedd814 |
| **E4-3a** | 共通 `CheckContext` に `target_month` / `single_month` を Optional 追加 | d5ddbd5 |
| **E4-3b** | V1-3-20 `InvoiceCheckContext` 削除、テスト 4 箇所を共通 `CheckContext` 使用に書き換え | dfff3b9 |

### 2.3 テストの推移

| 時点 | 件数 | 結果 |
|---|---|---|
| 連休前 | 481 | PASS |
| E1 後 | 510 | PASS (+29、共通スキーマ単体テスト追加) |
| E3-pre 後 | 512 | PASS (+2、invoice_warning テスト) |
| E3-b 完了時点 | 512 | PASS |
| **E4 着手時 baseline (実測)** | **588** | **PASS** |
| E4-1+E4-2 後 | 588 | PASS (無修正で維持) |
| E4-3a 後 | 588 | PASS (無修正で維持) |
| E4-3b 後 | **588** | **PASS** |

**重要**: v2 引き継ぎ書では「512 件」と記載していたが、E4 着手時点での実測は 588 件。差分 76 件は v2 作成後・E4 着手前のいずれかの時点で追加されていた可能性 (経緯不明)。今後は **588 件** を baseline とする。

E1 から E4-3b までの全期間を通じて、既存テストは 1 件も破壊せず維持。

### 2.4 重要な設計判断 (E4 で確定したものを含む)

| 論点 | 判断 |
|---|---|
| Finding 統合方式 | 案 B+ (V1-3-10 ベースに V1-3-20 を寄せる) |
| Severity 名称 | `🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low` |
| ReviewLevel 名称 | `🔴 必須確認 / 🟠 重点確認 / 🟡 通常確認 / 🟢 参考確認` |
| ErrorType 拡張 | `invoice_warning` 追加 (V1-3-20 用) |
| V1-3-20 Severity マッピング | `"warning"` → `"🟠 High"` |
| V1-3-20 必須属性 | tc_code="V1-3-20" / sub_code="01-03" / area="A14" / sort_priority=30 |
| raw 維持戦略 | E3-b では維持 (戦略 A)、E3-c で解体予定 |
| **Context 統合方式** (E4) | **V1-3-10 既存をベースに V1-3-20 を寄せる** |
| **`company_id` 型** (E4 論点 1) | **`str` 統一** |
| **`target_month` / `single_month`** (E4 論点 2) | **共通 `CheckContext` に Optional として追加** |
| **`InvoiceCheckContext` の存続** (E4 論点 3) | **削除** (run.py 未使用と判明したため) |
| **`InvoiceCheckRow`** (E4 論点 4) | **E4 スコープ外** (連休後 TODO へ) |
| **動的 import (`spec_from_file_location`) の解消** (E4 論点 5) | **E5 以降で対応** |

論点 1〜5 の詳細経緯は `docs/analysis/v1-3-context-survey-2026-05-07.md` 参照。

---

## 3. 残作業 (次セッション以降)

### 3.1 E3-c (raw 解体) — 1〜2 セッション

**スコープ**:
- `f.raw["partner"]` 等のテストアクセス 22 件を `f.partner` 等に書き換え
- `f.raw.keys()` 全集合比較 2 件を新検証方式に
- `_build_raw()` を廃止または縮小
- `tax_label` / `description` / `source` の最終判断
- `debit_amount` の型変換ロジック設計
- `Finding.raw` 属性を最終的に削除するか判断

**優先度**: 中 (内部最適化のため、急がなくても V1-3-20 は動く)

### 3.2 ~~E4 (Context 統合)~~ — **完了** (2026-05-07〜08)

連休後半で完了。詳細は §2.2、§2.4、§10 参照。

### 3.3 E5 (Excel 統合) — 2〜3 セッション 【最大規模】

**スコープ**:
- `skills/export/excel_report/` を共通 Skill 化
- `.claude/skills/` への登録
- V1-3-20 用の親子行表示ロジック追加 (FindingGroup 活用)
- V1-3-20 固有列 (classification / is_qualified_invoice / partner / transaction_date) の追加

**優先度**: 高 (連休中目標③に直結)

### 3.4 E6 (仕上げ) — 1 セッション

**スコープ**:
- SKILL.md 3 ファイル更新 (E4 由来の更新を含む、§4.5 参照)
- RUNBOOK 更新
- `InvoiceFinding.raw["source"]` 動的化
- L1-B まとめタスク 6 件の整理

**優先度**: 低

### 3.5 統合パイプライン (旧目標④) — β3 範囲

V1-3-10 + V1-3-20 + Excel を 1 つの手続きとして実行可能にする。E5 完了後、独立タスク。

---

## 4. 連休後の TODO (β2-E メインラインから外れる)

### 4.1 error_type 体系の全面見直し (TODO-A)

**背景**: E3-pre で `invoice_warning` を追加したが、ErrorType の英語名と業務上の意味論にズレがある可能性。

**対応**: ErrorType 体系を業務語彙に整え、仕様書 35 Finding の error_type を再割り当て。

**優先度**: 中

### 4.2 schema.py.bak_20260418_221222 の整理 (TODO-B)

**対応**: 削除候補。

**優先度**: 低

### 4.3 .claude/settings.local.json の管理 (TODO-C)

**背景**: Claude Code のローカル設定が Git 管理対象になっている。

**対応**: `.gitignore` に追加 + `git rm --cached` で tracked 状態を解消。

**優先度**: 低

### 4.4 dead code 5 関数の整理 (TODO-D)

**背景**: β2-D L1-B 完了ログ §7.2 で指摘済。

**対応**: E3-d (E6) で扱う。

**優先度**: 低

### 4.5 E4 由来の整理タスク群 (TODO-E、新規)

E4 完了後、Claude Code から引き継ぎ事項として報告された 5 件:

| # | 内容 | 優先度 | 推奨対処タイミング |
|---|---|---|---|
| E-1 | SKILL.md (`.claude/skills/check-invoice-registration-status/SKILL.md` line 353) の `InvoiceCheckContext` 言及を `CheckContext` に更新 | 中 | E6 (仕上げ) または専用ミニ commit |
| E-2 | `_common/context.py` docstring 内の「E4-3b で実施する」を「実施済」に更新 | 低 | E6 または合間 |
| E-3 | V1-3-20 schema.py の未使用 `from datetime import date` 削除 | 低 | E6 または合間 |
| E-4 | 引き継ぎ書 §2.3 の baseline 件数更新 (512 → 588) | 高 | **本ドキュメント (v3) で対応済** ✅ |
| E-5 | `.gitignore` に `*.pyc` (`__pycache__/`) 追加 (stage 不整合再発防止) | 中 | TODO-D と一緒に整理タスクとして |

### 4.6 E4 論点 4 / 5 由来の TODO (新規)

| # | 内容 | 優先度 | 関連 |
|---|---|---|---|
| TODO-F | `InvoiceCheckRow` の整理 (V1-3-20 入力型の共通化検討) | 中 | E4 論点 4 (スコープ外判断) |
| TODO-G | `_common/lib/finding_factory.py` の動的 import (`spec_from_file_location`) を `_common.context` への直接 import に切替 | 中 | E4 論点 5、E5 着手前または完了後 |

---

## 5. 運用ルール (v2 から拡張)

### 5.1 ファイル化と命名

戦略Claude が作成するプロンプト・メモ・設計書は **Markdown ファイル** として `/mnt/user-data/outputs/` に保存し、`present_files` で悠皓に渡す。

命名規則:
```
YYYY-MM-DD_NNN_<種類>_<内容>.md
```

- `<種類>`: `prompt` / `design` / `memo` / `report`
- 例: `2026-05-07_004_prompt_e4-1-e4-2-context-common-extraction.md`

引き継ぎ書はやや別格で、`docs/handover/handover_<日付>_<状態>.md` の形式 (例: `handover_2026-05-08_post-e4.md`)。

### 5.2 戦略Claude のレビューポイント

戦略Claude は以下のときに悠皓に確認を求める (それ以外は判断巻き取り):
- ゴール設定が不明確で複数の方向性がありうるとき
- 業務判断 (会計・税務・実務) が必要なとき
- 破壊的操作 (push, reset --hard, rebase, merge) が絡むとき
- 連休中目標の優先順位を変える判断が必要なとき
- 調査結果から方針を大きく変える必要が出たとき

### 5.3 プロンプト設計の原則

戦略Claude が Claude Code 用プロンプトを書くとき:
- 範囲・制約・してはいけないことを明記
- 中央集約地点があれば最初に変更
- 段階的テスト (中央変更 → FAIL 観測 → テスト側更新)
- commit を機能領域ごとに分割
- 中断点で悠皓レビューを挟む (大規模変更時)
- ステップ番号で構造化
- 実装前に「ステップ X: 事前確認」を必須化
- **想定外 callsite の検出ステップを 危険度の高い変更の冒頭に明示** (E4-3b で確立)

### 5.4 戦略Claude の独断ミスを防ぐルール

E2-b2 + E4 で得た教訓:
- ErrorType / ReviewLevel / Severity 等の対応関係を提示するときは、必ず現行コード or 仕様書を直接確認する
- 「変更なし」と書く前に、現行と提示内容が完全一致しているか机上検証する
- 業務上の意味論を含む判断は、悠皓に確認を取る
- **(E4 教訓)** リポジトリ構造・ファイル配置・運用ルールについても、戦略 Claude の記憶や前提に依存せず、Claude Code に現状を確認させる
- **(E4 教訓)** 「commit 先のブランチ」「main 直接 commit の可否」のような Git 運用前提も、暗黙にせず明示的にプロンプトに書く

### 5.5 グローバル CLAUDE.md と Git 運用 (新規、E4 で確認)

Claude Code 側に **グローバル CLAUDE.md** が存在し、以下のルールが含まれる (悠皓設定):

- **`main` への直接 commit 禁止**: すべての commit は worktree ブランチまたは feature ブランチに対して行う
- merge は悠皓が手元で実行 (`cd C:\Users\yuya_\claude → git merge <ブランチ> → git push origin main`)

戦略 Claude が Claude Code 用プロンプトを書くときは、このルールに整合する手順 (worktree / feature ブランチに commit → merge は悠皓判断) を最初から織り込む。

### 5.6 worktree 運用での注意 (新規、E4 で確認)

- 作業 worktree (例: `.claude/worktrees/beautiful-sammet-4c11aa/`) は Git の `.git` ファイル (ポインタ) を持つ
- これがメイン worktree から見ると **`mode 160000` (gitlink/submodule)** として誤検知されることがある
- 対策: `.gitignore` に `.claude/worktrees/` を追加 (commit `2b8fdb6` で対応済)
- もし staged 状態で `Subproject commit ...` が現れたら、`git restore --staged .claude/worktrees/<name>` で取り消せる (commit する前に止まること)

### 5.7 stage 不整合への対処 (新規、E4 で確認)

予期しない `Changes to be committed:` (= staged) が発生した場合:

1. まず止まって `git status` / `git diff --cached` で内容確認
2. **`git commit` を打たない** (= stage 状態のままなら可逆)
3. 戦略 Claude に報告
4. 戦略 Claude の指示に従って `git restore --staged <パス>` で取り消し

`git restore --staged` は stage 状態だけを取り消すコマンド。working tree のファイルは変更しない、履歴も変更しない、完全に可逆。

### 5.8 リポジトリ構造の確定事項 (新規、E4 で確認)

- リポジトリのルート: `C:\Users\yuya_\claude\` (= `claude/` 全体が 1 repo)
- office-claude プロジェクトの位置: `C:\Users\yuya_\claude\office\office-claude\`
- すべての Git コマンドは「リポジトリルートからの相対パス」で扱う
- 例: `git add office/office-claude/skills/_common/context.py` (○) / `git add skills/_common/context.py` (× リポジトリルートにそんなファイルはない)

---

## 6. Git 状態 (E4 完了時点 = 2026-05-08 朝)

### 6.1 ブランチ

- `main`: origin と同期、`dfff3b9` (E4-3b)
- `claude/beautiful-sammet-4c11aa`: main と同じ位置 (作業 worktree のブランチ、継続使用中)
- `feature/define-common-finding`: 別タスクの残存 (削除可能、悠皓判断)

### 6.2 未対応の modified / untracked ファイル

- `.claude/settings.local.json`: 別件、TODO-C で対応予定
- `.pyc` 系: TODO-D / TODO-E5 で対応予定 (`*.pyc` の `.gitignore` 追加)
- `.claude/worktrees/`: `.gitignore` 追加済 (`2b8fdb6`)、ignored 状態

### 6.3 直近の commit (上位 10 件、origin/main 反映済)

```
dfff3b9 refactor(V1-3-20): InvoiceCheckContext を削除し共通 CheckContext に統合 (β2-E E4-3b)  ← E4 完了 ★
d5ddbd5 feat(_common): CheckContext に target_month / single_month を追加 (β2-E E4-3a)
eedd814 refactor(_common): Context 系を共通化し V1-3-10 schema.py を re-export に変更 (β2-E E4-1 + E4-2)
3ae6051 docs(analysis): V1-3 Context 統合 (E4) 事前調査レポートを追加
2b8fdb6 chore: ignore .claude/worktrees/ to prevent worktree submodule misdetection
8e07528 docs(handover): 連休前半完了 → 次セッション用引き継ぎ書を追加
ebb5464 docs(design): V1-3-20 β2-E 設計メモ v2 を追加 (E1〜E3-b 完了反映)
ca74eb2 chore: add local Claude settings and ignore Python cache directories
42bf4a8 Merge: V1-3-20 β2-E E3-pre + E3-b V1-3-20 型移行
3ac6c46 test(V1-3-20): InvoiceFinding 構築箇所と関連 fixture を共通 Finding 対応に修正(β2-E E3-b)
```

### 6.4 push 状態

連休前半 +24 + 連休後半 +7 = **計 31 commit が origin/main に反映済**。次セッション開始前の追加 push 不要。

---

## 7. 重要ファイル

### 7.1 設計書・調査資料

| ファイル | 内容 |
|---|---|
| `docs/design/V1-3-20_beta2_E_design_v0.md` | 設計メモ v0 (連休前半作成) |
| `docs/design/V1-3-20_beta2_E_design_v2.md` | 設計メモ v2 (連休前半完了時更新) |
| `docs/analysis/finding-schema-comparison-20260506.md` | Finding 比較調査 (E1) |
| `docs/analysis/v1-3-20-scope-investigation-2026-05-06.md` | β2-E スコープ調査 |
| `docs/analysis/severity-review-level-occurrence-survey-2026-05-06.md` | E2-b1 旧値調査 |
| `docs/analysis/v1-3-20-migration-survey-2026-05-06.md` | E3-a V1-3-20 移行調査 |
| **`docs/analysis/v1-3-context-survey-2026-05-07.md`** | **E4-pre Context 統合調査 (E4 論点 1〜5 の根拠)** |

### 7.2 実装ファイル

| パス | 内容 |
|---|---|
| `skills/_common/schema.py` | 共通 Finding スキーマ (E1 で新設、E3-b で raw 追加) |
| **`skills/_common/context.py`** | **共通 CheckContext (E4-1 で新設、E4-3a で target_month/single_month 追加)** |
| `skills/_common/lib/finding_factory.py` | `_ERROR_TYPE_TO_REVIEW_LEVEL` 中央集約 (E2-b2, E3-pre 更新)、`_build_reference_bundle` 実体 |
| `skills/_common/lib/finding_grouper.py` | SEVERITY_ORDER 中央集約 (E2-b3 更新) |
| `skills/verify/V1-3-rule/check-tax-classification/schema.py` | V1-3-10 (E2-a で Finding 系、E4-2 で Context 系を re-export 化) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` | V1-3-20 (E3-b で InvoiceFinding を共通 Finding のエイリアス化、E4-3b で `InvoiceCheckContext` 削除) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/severity_map.py` | V1-3-20 用 Severity マッピング (E3-b で新設) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/checker.py` | V1-3-20 to_finding (E3-b で改修) |
| `skills/export/excel_report/template_engine.py` | SEVERITY_TO_PARENT_STYLE 中央集約 (E2-b3 更新) |

### 7.3 テストファイル

| パス | 内容 |
|---|---|
| `tests/unit/test_common_schema.py` | 共通スキーマ単体テスト (E1 で新設、20 件) |
| `tests/unit/test_invoice_registration_status.py` | V1-3-20 テスト (E3-b で fixture 修正、E4-3b で `TestInvoiceCheckContext` クラス 4 テストを共通 `CheckContext` 使用に書き換え、計 129 件) |
| (他 V1-3-10 関連テスト多数) | E2-b2 / E2-b3 / E4-2 で共通化済 |

### 7.4 戦略 Claude プロンプトの履歴

参考までに、E4 関連の戦略 Claude プロンプトを記録 (悠皓のローカルに保存されているはず):

| ファイル | 内容 |
|---|---|
| `2026-05-07_001_prompt_handover-and-design-v2-commit-A.md` | 設計メモ v2 + v2 引き継ぎ書 commit (A 方式) |
| `2026-05-07_002_prompt_unstage-and-gitignore-worktrees.md` | stage 解消 + `.gitignore` に worktrees 追加 |
| `2026-05-07_003_prompt_e4-pre-context-survey.md` | E4-pre 事前調査 |
| `2026-05-07_004_prompt_e4-1-e4-2-context-common-extraction.md` | E4-1 + E4-2 共通切り出し |
| `2026-05-07_005_prompt_e4-3a-e4-3b-v1-3-20-context-merge.md` | E4-3a + E4-3b V1-3-20 寄せ |

---

## 8. 開始プロンプト (新セッション用)

新しいセッションを Claude Code (または Claude チャット版) で開始するときは、以下をコピーして送ってください:

```
office-claude プロジェクトの作業を再開します。

引き継ぎ書として `docs/handover/handover_2026-05-08_post-e4.md` (このファイル) を確認してください。

連休中の達成済:
- ✅ 連休中目標 ① Finding スキーマ統一 (連休前半)
- ✅ 連休中目標 ② Context 統合 = E4 (連休後半)
- β2-E E1〜E4 完了 (V1-3-10 + V1-3-20 が共通 Finding + 共通 CheckContext で動作)
- 全 588 件テスト PASS

残作業:
- E3-c (raw 解体) — 1〜2 セッション、内部最適化
- E5 (Excel 統合) — 2〜3 セッション、最大規模、連休中目標 ③ に直結
- E6 (仕上げ) — 1 セッション
- 連休後 TODO 多数 (error_type 体系見直し、E4 由来の整理タスク群等)

最初にお願いしたいこと:

1. 現在の Git 状態を Claude Code 側で確認してもらう
   - git branch / git status / git log --oneline -10

2. 引き継ぎ書 (handover_2026-05-08_post-e4.md) と
   設計メモ v2 (docs/design/V1-3-20_beta2_E_design_v2.md) を読んで
   状況を把握してください

3. 次に進めるべきクラスタを提案してください:
   - 整理タスク群 (TODO-E1, E-2, E-3 等): 軽量、合間に処理
   - E3-c (raw 解体): 内部最適化、内側仕上げ感
   - E5 (Excel 統合): 規模大、連休中目標 ③ に直結
   - 連休後 TODO 系: error_type 見直しなど

   状況に応じて推奨を出してください。

制約:
- ファイル変更前は必ず確認を求める
- 大きな変更は段階的に (1ファイル = 1commit を目安に、最終的には機能領域ごとに commit 分割)
- git push, git reset --hard, git rebase は実行しない
- main 直接 commit は禁止 (グローバル CLAUDE.md 方針、引き継ぎ書 §5.5)
- 30分以上動かない場合は止まって報告
- 戦略Claude / Claude Code の運用ルール (引き継ぎ書 §5) を遵守
- リポジトリ構造: ルートは C:\Users\yuya_\claude\、office-claude はサブディレクトリ (引き継ぎ書 §5.8)

私は Git に少し慣れてきました (git restore --staged も使えるように)。
新しい操作が必要になる場合は事前に説明してください。
```

---

## 9. 心構え

### 9.1 連休中目標達成の意義を忘れない

連休前半で目標①、連休後半で目標②を達成。残るは目標③ (Excel 統合 = E5)。これは大きな成果。残作業は **連休中に完遂しなくても問題ない**。動くものを壊さず、段階的に進めることが最優先。

### 9.2 判断は人がする (引き継ぎ書 v2 §8.2 から継承)

戦略Claude は技術的判断を巻き取るが、業務上の意味論を含む判断は悠皓に委ねる。Claude Code に「方針を決めて」と丸投げせず、選択肢を出させて選ぶ。

### 9.3 push は慎重に (引き継ぎ書 v2 §8.3 から継承、E4 で実証)

- ローカル commit はいつでもやり直せる
- GitHub に push したら基本的に取り消せない
- push 前に必ず `git log` と `git diff` で内容確認
- push 後 = 「リモートに退避された安全状態」と捉えると次の判断が楽になる (E4 で実感)

### 9.4 困ったら止まる (引き継ぎ書 v2 §8.4 から継承、E4 で実証)

Claude Code が想定外の動きをしたら、作業を止めて状況を確認。慌てて操作を重ねると傷が深くなる。

E4 で実例:
- stage 不整合 (`.pyc` 56 件 + `settings.local.json` が staged) を Claude Code が検出 → 止まって報告 → 戦略 Claude が `git restore --staged` ミニ指示 → 解消
- これがあるべき動き。Claude Code が独断で `git restore --staged .` を打って続行することもできたが、それをしなかったのは正しい判断

### 9.5 「目標」を立てたら「リズム」も大事に (新規)

E4 で確立したリズム:
- 事前調査 (E4-pre) → 設計判断 → 実装プロンプト 1 (E4-1+E4-2) → merge+push → 実装プロンプト 2 (E4-3) → merge+push
- 各段階で push して「安全状態」を作る
- このリズムは E5 でも踏襲できる (規模が大きいだけ)

---

## 10. 設計判断の確定事項記録 (新規、E4 で確定)

E4 で確定した論点 1〜5 の判断と根拠を記録。将来 (E3-c, E5 着手時、または別プロジェクトで類似判断が必要なとき) の参照用。

### 10.1 論点 1: 共通 `CheckContext.company_id` の型

**判断**: **`str` 統一** (案 A)

**根拠**:
- V1-3-10 既存の 19 ファイル (`"2422271"` 等の文字列リテラル) を無修正で動かす
- 影響最小化を優先
- freee API のネイティブ型 (int) との整合は将来 adapter 層で扱う

**裁定**: 悠皓判断 (戦略 Claude 推奨案を採用)

### 10.2 論点 2: `target_month` / `single_month` の扱い

**判断**: **共通 `CheckContext` に Optional フィールドとして追加** (案 A)

```python
target_month: Optional[date] = None  # V1-3-20 で使用
single_month: bool = False           # V1-3-20 で使用
```

**根拠**:
- 設計メモ v2 §3.1 「V1-3-20 を寄せる」に最も忠実
- Optional なので V1-3-10 への影響ゼロ (既存テストは無修正で PASS)
- 将来 V1-3-30 以降の月次系チェックでも使える

**裁定**: 悠皓判断 (戦略 Claude 推奨案を採用)

### 10.3 論点 3: `InvoiceCheckContext` の存続

**判断**: **削除** (案 A)

**根拠**:
- run.py で 1 件もヒットせず、テストでのみ使用 (E4-pre 調査で判明)
- 削除しても本番動作に影響ゼロ
- テスト 4 箇所の修正は E4-3b スコープ内
- 設計と実装の乖離 (「設計上は V1-3-20 用 Context があるが実体は V1-3-10 を使用」) を解消

**裁定**: 悠皓判断 (戦略 Claude 推奨案を採用)

### 10.4 論点 4: `InvoiceCheckRow` の扱い

**判断**: **E4 スコープ外、連休後 TODO へ** (TODO-F)

**根拠**:
- 設計メモ v2 §3 で言及されていない (E4-pre で Claude Code が指摘)
- `InvoiceCheckRow` は V1-3-20 入力型であり、Context (実行環境情報) と性質が違う
- Context 統合と入力行型の整理は別の関心事
- β3 (統合パイプライン) で扱う方が自然

**裁定**: 戦略 Claude 即決 (悠皓承認)

### 10.5 論点 5: `_common/lib/finding_factory.py` の動的 import

**判断**: **E4 スコープ外、E5 以降で対応** (TODO-G)

**根拠**:
- E4 の本来の目的 (Context 統合) と直交している
- 「commit を機能領域ごとに分割」原則 (引き継ぎ書 §5.3) に従う
- E4 完了後に `_common/context.py` が安定したら、別タスクとして「動的 import → 直接 import」のリファクタリングを 1 commit で実施可能

**裁定**: 戦略 Claude 即決 (悠皓承認)

---

## 11. 補遺: 引き継ぎ書 v2 からの継承

引き継ぎ書 v2 (`handover_2026-05-06_post-e3b.md`) の以下のセクションは v3 でも有効:

- §1.2 開発体制: 確立済 (戦略Claude 主軸 + Claude Code 主軸の組み合わせ)
- §5 運用ルール: 継続適用 (v3 §5 で拡張済)
- §9 心構え: 継承 (v3 §9 で実例を追加)
- §10 補遺: v2 が引き継いだ「連休前 `handover_to_next_session.md`」の継承事項も引き続き有効

---

**作成者**: 戦略Claude (claude.ai セッション、2026-05-08 朝、E4 完了直後)
**バージョン**: 3.0 (E4 完了反映版)
**次回更新タイミング**: E5 着手前の整理タスク完了時、または E5 完了時
