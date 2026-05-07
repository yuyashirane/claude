# office-claude 開発引き継ぎ書 (連休中後半 → 連休後)

**作成日**: 2026-05-06 (連休前半完了時)
**前セッションでの到達点**: β2-E E1〜E3-b 完了 (連休中目標①の実質達成)
**次セッションのゴール**: E3-c 以降を連休中または連休後に進める

---

## 0. このドキュメントの使い方

このドキュメントは、**新しいセッションの Claude (または Claude Code) に渡すための引き継ぎ書**です。

新しいセッションを開始するときは、文末の「**開始プロンプト**」をコピーして送ってください。Claude が状況を即座に把握し、次のアクションを提案します。

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
- **悠皓**: ゴール設定、業務判断、最終承認 (push, reset --hard, rebase 等の破壊的操作)
- **戦略Claude**: プロンプト設計、技術判断、ファイル化と命名 (`YYYY-MM-DD_NNN_<種類>_<内容>.md`)
- **Claude Code**: 実装、調査、commit (merge / push はしない)

### 1.3 開発環境
- **OS**: Windows
- **エディタ**: VS Code + Claude Code
- **言語**: Python (Anaconda 環境)
- **リポジトリ**: https://github.com/yuyashirane/claude (private)
- **作業ディレクトリ**: `C:\Users\yuya_\claude\office\office-claude`

---

## 2. 連休前半 (2026-05-06) の達成

### 2.1 大局的な達成

**連休中目標 ① (Finding スキーマの統一) を実質達成**。V1-3-10 と V1-3-20 が共通 Finding で動作する状態に到達。

### 2.2 完了したクラスタ

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

### 2.3 テストの推移

| 時点 | 件数 | 結果 |
|---|---|---|
| 連休前 | 481 | PASS |
| E1 後 | 510 | PASS (+29、共通スキーマ単体テスト追加) |
| E3-pre 後 | 512 | PASS (+2、invoice_warning テスト) |
| E3-b 完了時点 | **512** | **全件 PASS** |

E1 から E3-b までの全期間を通じて、既存テストは 1 件も破壊せず維持。

### 2.4 重要な設計判断 (このセッションで確定)

| 論点 | 判断 |
|---|---|
| Finding 統合方式 | 案 B+ (V1-3-10 ベースに V1-3-20 を寄せる) |
| Severity 名称 | `🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low` |
| ReviewLevel 名称 | `🔴 必須確認 / 🟠 重点確認 / 🟡 通常確認 / 🟢 参考確認` |
| ErrorType 拡張 | `invoice_warning` 追加 (V1-3-20 用) |
| V1-3-20 Severity マッピング | `"warning"` → `"🟠 High"` |
| V1-3-20 必須属性 | tc_code="V1-3-20" / sub_code="01-03" / area="A14" / sort_priority=30 |
| raw 維持戦略 | E3-b では維持 (戦略 A)、E3-c で解体予定 |

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

### 3.2 E4 (Context 統合) — 0.5〜1 セッション

**スコープ**:
- V1-3-10 配下の `TransactionRow` / `ReferenceBundle` / `CheckContext` を共通化
- `skills/_common/context.py` を新設
- V1-3-20 の `InvoiceCheckContext` を共通 `CheckContext` に統合

**優先度**: 中

### 3.3 E5 (Excel 統合) — 2〜3 セッション 【最大規模】

**スコープ**:
- `skills/export/excel_report/` を共通 Skill 化
- `.claude/skills/` への登録
- V1-3-20 用の親子行表示ロジック追加 (FindingGroup 活用)
- V1-3-20 固有列 (classification / is_qualified_invoice / partner / transaction_date) の追加

**優先度**: 高 (連休中目標③に直結)

### 3.4 E6 (仕上げ) — 1 セッション

**スコープ**:
- SKILL.md 3 ファイル更新
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

**対応**: `.gitignore` に追加。

**優先度**: 低

### 4.4 dead code 5 関数の整理 (TODO-D)

**背景**: β2-D L1-B 完了ログ §7.2 で指摘済。

**対応**: E3-d (E6) で扱う。

**優先度**: 低

---

## 5. このセッションで確立した運用ルール

### 5.1 ファイル化と命名

戦略Claude が作成するプロンプト・メモ・設計書は **Markdown ファイル** として `/mnt/user-data/outputs/` に保存し、`present_files` で悠皓に渡す。

命名規則:
```
YYYY-MM-DD_NNN_<種類>_<内容>.md
```

- `<種類>`: `prompt` / `design` / `memo` / `report`
- 例: `2026-05-06_015_prompt_v1-3-20-beta2-e3pre-e3b-migration.md`

### 5.2 戦略Claude のレビューポイント

戦略Claude は以下のときに悠皓に確認を求める (それ以外は判断巻き取り):
- ゴール設定が不明確で複数の方向性がありうるとき
- 業務判断 (会計・税務・実務) が必要なとき
- 破壊的操作 (push, reset --hard, rebase) が絡むとき
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

### 5.4 戦略Claude の独断ミスを防ぐルール

E2-b2 で得た教訓:
- ErrorType / ReviewLevel / Severity 等の対応関係を提示するときは、必ず現行コード or 仕様書を直接確認する
- 「変更なし」と書く前に、現行と提示内容が完全一致しているか机上検証する
- 業務上の意味論を含む判断は、悠皓に確認を取る

---

## 6. Git 状態 (連休前半完了時点)

### 6.1 ブランチ

- `main`: 最新 (origin から +24 commit、push 待ち)
- `feature/define-common-finding`: 別タスクの残存 (削除可能、悠皓判断)

### 6.2 未対応の modified ファイル

- `.claude/settings.local.json`: 別件、TODO-C で対応予定
- `.pyc` 系: 別件、`.gitignore` に追加済 (一部 tracked のまま、TODO 候補)

### 6.3 直近の commit (上位 10 件)

```
42bf4a8 Merge: V1-3-20 β2-E E3-pre + E3-b V1-3-20 型移行             ← E3-b merge ★
3ac6c46 test(V1-3-20): InvoiceFinding 構築箇所と関連 fixture を共通 Finding 対応に修正
ecfa393 refactor(V1-3-20): to_finding を共通 Finding 構築に対応
861acd7 refactor(V1-3-20): InvoiceFinding を共通 Finding のエイリアスに変更
a84909e feat(_common): Finding に raw 属性を追加(β2-E E3-b 準備)
fcf1a9a feat(_common): ErrorType に invoice_warning を追加(β2-E E3-pre)
0abd1e1 docs(analysis): V1-3-20 移行 (E3) 事前調査レポートを追加
f60d85d chore: add python compiled cache files to ignore list
76e0f74 Merge: V1-3-20 β2-E E2-b3 Severity 旧値の機械置換
010333a refactor(scripts): Severity 旧値を新名称に置換
```

### 6.4 push 推奨

連休前半の成果 (24 commit) はローカルのみ。**次セッション開始前に push を推奨**:

```powershell
git push origin main
```

---

## 7. 重要ファイル

### 7.1 設計書・調査資料

| ファイル | 内容 |
|---|---|
| `docs/design/V1-3-20_beta2_E_design_v0.md` | 設計メモ v0 (連休前半作成) |
| `docs/design/V1-3-20_beta2_E_design_v2.md` | **設計メモ v2 (連休前半完了時更新、要参照)** |
| `docs/analysis/finding-schema-comparison-20260506.md` | Finding 比較調査 |
| `docs/analysis/v1-3-20-scope-investigation-2026-05-06.md` | β2-E スコープ調査 |
| `docs/analysis/severity-review-level-occurrence-survey-2026-05-06.md` | E2-b1 旧値調査 |
| `docs/analysis/v1-3-20-migration-survey-2026-05-06.md` | E3-a V1-3-20 移行調査 |

### 7.2 実装ファイル

| パス | 内容 |
|---|---|
| `skills/_common/schema.py` | 共通 Finding スキーマ (E1 で新設、E3-b で raw 追加) |
| `skills/_common/lib/finding_factory.py` | `_ERROR_TYPE_TO_REVIEW_LEVEL` 中央集約 (E2-b2, E3-pre 更新) |
| `skills/_common/lib/finding_grouper.py` | SEVERITY_ORDER 中央集約 (E2-b3 更新) |
| `skills/verify/V1-3-rule/check-tax-classification/schema.py` | V1-3-10 (E2-a で re-export 化) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` | V1-3-20 (E3-b で InvoiceFinding を共通 Finding のエイリアス化) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/severity_map.py` | V1-3-20 用 Severity マッピング (E3-b で新設) |
| `skills/verify/V1-3-rule/check-invoice-registration-status/checker.py` | V1-3-20 to_finding (E3-b で改修) |
| `skills/export/excel_report/template_engine.py` | SEVERITY_TO_PARENT_STYLE 中央集約 (E2-b3 更新) |

### 7.3 テストファイル

| パス | 内容 |
|---|---|
| `tests/unit/test_common_schema.py` | 共通スキーマ単体テスト (E1 で新設、20 件) |
| `tests/unit/test_invoice_registration_status.py` | V1-3-20 テスト (E3-b で fixture 修正、129 件) |
| (他 V1-3-10 関連テスト多数) | E2-b2 / E2-b3 で機械置換済 |

---

## 8. 開始プロンプト (新セッション用)

新しいセッションを Claude Code (または Claude チャット版) で開始するときは、以下をコピーして送ってください:

```
office-claude プロジェクトの作業を再開します。

引き継ぎ書として `docs/handover/handover_2026-05-XX.md` (このファイル) を確認してください。

連休前半 (2026-05-06) で達成済:
- ✅ 連休中目標 ① Finding スキーマ統一 (実質達成)
- ✅ β2-E E1〜E3-b 完了 (V1-3-10 + V1-3-20 が共通 Finding で動作)
- ✅ 全 512 件テスト PASS

残作業:
- E3-c (raw 解体) — 1〜2 セッション、内部最適化
- E4 (Context 統合) — 0.5〜1 セッション
- E5 (Excel 統合) — 2〜3 セッション、最大規模、連休中目標③に直結
- E6 (仕上げ) — 1 セッション
- 連休後 TODO 多数 (error_type 体系見直し等)

最初にお願いしたいこと:

1. 現在の Git 状態を確認
   - git branch で現在のブランチを確認
   - git status でクリーン状態か確認
   - git log --oneline -10 で直近の履歴を確認

2. 引き継ぎ書 (handover_2026-05-XX.md) と
   設計メモ v2 (docs/design/V1-3-20_beta2_E_design_v2.md) を読んで
   状況を把握してください

3. 次に進めるべきクラスタを提案してください:
   - E3-c (raw 解体): 内部最適化、内側仕上げ感
   - E4 (Context 統合): 軽量、E1〜E3 と連続性高
   - E5 (Excel 統合): 規模大、連休中目標③に直結
   - 連休後 TODO 系: error_type 見直しなど

   状況に応じて推奨を出してください。

制約:
- ファイル変更前は必ず確認を求める
- 大きな変更は段階的に (1ファイル = 1commit を目安に)
- git push, git reset --hard, git rebase は実行しない
- 30分以上動かない場合は止まって報告
- 戦略Claude / Claude Code の運用ルール (引き継ぎ書 §5) を遵守

私は Git に少し慣れてきましたが、新しい操作が必要になる場合は事前に説明してください。
```

---

## 9. 心構え

### 9.1 連休中目標達成の意義を忘れない

連休前半で目標①を実質達成した。これは大きな成果。残作業は **連休中に完遂しなくても問題ない**。動くものを壊さず、段階的に進めることが最優先。

### 9.2 判断は人がする (引き継ぎ書 §8.2 から継承)

戦略Claude は技術的判断を巻き取るが、業務上の意味論を含む判断は悠皓に委ねる。Claude Code に「方針を決めて」と丸投げせず、選択肢を出させて選ぶ。

### 9.3 push は慎重に (引き継ぎ書 §8.3 から継承)

- ローカル commit はいつでもやり直せる
- GitHub に push したら基本的に取り消せない
- push 前に必ず `git log` と `git diff` で内容確認

### 9.4 困ったら止まる (引き継ぎ書 §8.4 から継承)

Claude Code が想定外の動きをしたら、作業を止めて状況を確認。慌てて操作を重ねると傷が深くなる。

---

## 10. 補遺: 連休前の引き継ぎ書からの継承

連休前の `handover_to_next_session.md` (2026-05-06 朝に作成) からの継承事項:

- §1.2 開発体制: 確立済 (戦略Claude 主軸 + Claude Code 主軸の組み合わせ)
- §5 Git 運用ルール: 継続適用
- §7 注意点: §7.1〜§7.4 すべて引き続き有効
- §8 心構え: §9 で継承

---

**作成者**: 戦略Claude (claude.ai セッション、2026-05-06 連休前半完了時)
**バージョン**: 2.0 (連休前半達成版)
**次回更新タイミング**: E3-c 完了時、または E5 完了時
