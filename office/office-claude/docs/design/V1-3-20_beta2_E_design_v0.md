# V1-3-20 β2-E 設計メモ v0

**作成日**: 2026-05-06
**作成者**: 戦略 Claude (claude.ai セッション)
**ステータス**: ドラフト v0(叩き台)。悠皓レビュー後に v1 へ昇格予定
**前提資料**:
- `docs/design/office-claude-design-v2_2.md` (全体設計書)
- `docs/design/skills/V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md` (§13.4.2 Finding 正本)
- `docs/analysis/finding-schema-comparison-20260506.md` (Finding 比較調査)
- `docs/analysis/v1-3-20-scope-investigation-2026-05-06.md` (β2-E スコープ調査)
- `docs/beta2/V1-3-20_beta2_D_L1_B_completion_log.md` (β2-D L1-B 完了ログ)

---

## 0. このドキュメントの位置づけ

β2-D L1-B 完了(2026-05-02)を踏まえ、β2-E の設計を確定するためのメモ。
β2-E のスコープは「**V1-3-10 と V1-3-20 を共通レポートとして出力できる状態にする**」と定義する(後述 §1)。

本メモは v0(叩き台)であり、未確定事項は「TBD」と明示する。悠皓のレビュー後に v1 へ昇格し、Claude Code が実装着手できる状態にする。

---

## 1. β2-E のゴール定義

### 1.1 完了条件

以下のすべてを満たした時点で β2-E 完了とする:

1. V1-3-10 と V1-3-20 が **同一の Finding 派生型**(後述)を出力する
2. 両 Skill の出力が **1 つの Excel ブック**にまとまり、共通フォーマットで読める
3. V1-3-10 既存テスト(直接 124 件 + 共通系 228 件 = 352 件)が **全件 PASS** を維持
4. V1-3-20 既存テスト(129 件)が **全件 PASS** を維持
5. β2-D L1-B で確立した「**判定層は触らない**」原則が継承され、`classify_transaction` / `find_groups` / `to_finding` / `to_findings` の中身が変更されていない

### 1.2 β3 との境界

β2-E に **含まないもの**(β3 以降に持ち越し):

- T 番号妥当性チェック(指示書 v3 §1.4 で明記)
- 統合パイプライン(V1-3-10 + V1-3-20 を1コマンドで実行する手続き) ← 引き継ぎ書の旧目標④
- partner_master 同名 partner 後勝ち問題の本格対応
- dead code 5 関数の整理
- Phase 7(freee URL 列実装) — Finding に LinkHints があれば自動的に動く想定だが、URL 生成側の実装は別 Phase

### 1.3 β2-E に含むが、判断を要する論点

以下は β2-E スコープに「論理的には含まれる」が、設計判断によりサブ Phase 化または β3 送りにする可能性がある:

- `InvoiceFinding.raw["source"]` の動的化(β2-D 完了ログ §7.2)
- wallet_txn_id ID 衝突対策
- L1-B まとめタスク 6 件(SKILL.md 更新等)

これらは β2-E 内のフェーズ分割(後述 §5)で処理位置を決める。

---

## 2. Finding スキーマ統合方針

### 2.1 採用案

**案 B+(現 V1-3-10 を基準に V1-3-20 を寄せ、段階的に §13.4.2 へ近づける)を採用する**。

### 2.2 採用根拠

| 観点 | 案 A | 案 B | **案 B+** | 案 C |
|---|---|---|---|---|
| 仕様書準拠 | ◎ | △ | ○(段階的) | ✕ |
| 影響範囲 | 481 件全部 | V1-3-20 中心 | V1-3-20 中心 | import のみ |
| 所要時間 | 5〜8 営業日 | 1〜2 営業日 | 2〜3 営業日 | 半日〜1日 |
| **β2-E との整合** | △(再設計コスト) | ○ | **◎** | ✕(意義放棄) |
| 将来拡張性 | ◎ | ○ | ○ | △ |

決定要因:
- 案 A は β2-E スコープに対してオーバースペック。Phase 6/7 に向けた仕様書準拠は β2-E 後でも間に合う
- 案 B は短期完結だが、§13.4.2 から離れたまま固定化されるリスク
- **案 B+ は「短期完結 × 段階的に正本に寄せる」を両立**。β2-D L1-B の bridge 戦略と同じ思想
- 案 C は共通化の意義を捨てる選択

### 2.3 共通スキーマの構造

#### 2.3.1 配置

`skills/_common/schema.py` (新設) に以下を配置:

- `Finding` (共通 dataclass)
- `Severity`, `ReviewLevel`, `ErrorType` (Literal/Enum)
- `LinkHints`, `FindingDetail` (補助 dataclass)
- `CheckContext` (共通入力コンテキスト)

V1-3-10 / V1-3-20 配下の `schema.py` は、Skill 固有の dataclass のみ残す:

- V1-3-10: 固有なし(全部共通へ昇格)
- V1-3-20: `Classification` Enum、`InvoiceCheckRow`、`FindingGroup` を残す

#### 2.3.2 共通 `Finding` の属性(現 V1-3-10 ベース)

現 V1-3-10 `Finding` の属性をそのまま昇格させ、以下を追加:

| 属性 | 型 | 由来 | 備考 |
|---|---|---|---|
| (既存 V1-3-10 属性すべて) | — | V1-3-10 | そのまま |
| `classification` | `Optional[str]` | V1-3-20 由来 | 文字列で持ち、Enum 値は `_common.classification` に分離 |
| `partner` | `Optional[str]` | V1-3-20 raw | 取引先名(V1-3-10 でも今後使える) |
| `transaction_date` | `Optional[str]` | V1-3-20 raw | YYYY-MM-DD 形式 |
| `is_qualified_invoice` | `Optional[bool]` | V1-3-20 raw | 適格請求書発行事業者フラグ |
| `tax_code` | `Optional[str]` | V1-3-20 raw | 税区分コード(V1-3-10 では未使用) |

V1-3-20 の `raw` dict 8 フィールドのうち、`tax_label` / `debit_amount` / `description` / `source` は V1-3-10 既存属性(または `note`)で吸収可能なため、Finding 直下属性としては追加しない。

#### 2.3.3 §13.4.2 未実装属性の扱い

§13.4.2 で定義されているが現在未実装の 11 属性(skill_code / finding_id / count / total_amount / account_name / matched_keywords / rule_basis / freee_general_ledger_url / freee_journal_url / row_data / target_month)は **β2-E では追加しない**。

理由:
- これらは Phase 6 "-" 固定問題 / Phase 7 freee URL 列実装で必要になる属性
- β2-E のゴール(共通レポート出力)には不要
- 案 B+ の「段階的に §13.4.2 へ近づける」方針通り、Phase 6/7 着手時に追加する

### 2.4 Severity / ReviewLevel / ErrorType の正規化

V1-3-10 既存の Literal 型(絵文字 + ラベル付き)を共通採用:

```python
Severity = Literal["🔴 High", "🟡 Medium", "🟠 Low", "🟢 Info"]
ReviewLevel = Literal["🔴必修", "🟡推奨", "🟠任意", "🟢参考"]
ErrorType = Literal[...]  # V1-3-10 既存定義
```

V1-3-20 の `severity: str`(型制約なし)は、共通 `Severity` Literal に統一する。これにより V1-3-20 の `severity` 値を Literal 値に正規化する変換が必要(後述 §5 のフェーズ分割で位置決めする)。

### 2.5 LinkHints / FindingDetail の扱い

#### LinkHints

V1-3-10 既存の LinkHints をそのまま共通昇格する。仕様書 §13.4.2 との差(`date_range tuple` ↔ `period_start/end date`、`tax_group_code 単数 int` ↔ `tax_group_codes 複数 str` 等)は **β2-E では解消しない**。理由は §2.3.3 と同じく Phase 7 着手時に対応する。

V1-3-20 への LinkHints 導入は **β2-E スコープ内** とする。`InvoiceFinding` から共通 `Finding` に移行する際、LinkHints は `Optional[LinkHints]` として持たせる(V1-3-20 は当面 None で運用、Phase 7 で値を設定)。

#### FindingDetail

V1-3-10 既存の FindingDetail(判定根拠スタイル)をそのまま共通昇格する。仕様書 §13.4.2 の FindingDetail(仕訳明細スタイル)とは概念衝突するが、これも Phase 6/7 で再設計する。

### 2.6 V1-3-20 固有概念の共存

V1-3-20 固有概念は以下のように共通スキーマと共存させる:

- `Classification` Enum: V1-3-20 配下 (`skills/.../check-invoice-registration-status/schema.py`) に残す
- `FindingGroup`: V1-3-20 配下に残す。Excel 出力時の親子行構造を支える
- `InvoiceCheckRow`: V1-3-20 配下に残す
- `InvoiceCheckContext`: 共通 `CheckContext` に統合する(後述 §3)

---

## 3. Context 統合方針

### 3.1 採用方針

**V1-3-10 既存 `CheckContext` をそのまま共通昇格し、V1-3-20 は寄せる。**

V1-3-10 の `CheckContext` は完全実装(company_id, fiscal_year_id, period_start/end, transactions, account_master, tax_code_master, partner_master, references, company_name, skill_name, debug_mode)で、V1-3-20 の `InvoiceCheckContext` は最小限(company_id, period_start/end, target_month, single_month)。

V1-3-20 が必要としない属性は `Optional` で持つ、または Skill 固有の context 生成関数で埋めるアプローチで吸収する。

### 3.2 V1-3-20 固有属性の扱い

V1-3-20 の `target_month` / `single_month` は共通 `CheckContext` に **追加する**(`Optional`)。理由: V1-3-10 でも将来「単月チェックモード」を持つ可能性があり、汎用的な属性として共通化して問題ない。

### 3.3 配置

`skills/_common/context.py` (既存があれば改修、なければ新設) に共通 `CheckContext` を配置する。`build_check_context` 関数は β2-D L1-B で `scripts/e2e/freee_to_context.py` に共通化済みのため、そのまま流用。

---

## 4. Excel 出力統合方針

### 4.1 採用方針

**V1-3-10 既存の `skills/export/excel_report/` を共通 Excel 出力 Skill として昇格させ、V1-3-10 / V1-3-20 両方の Finding を入力として受け取れるようにする。**

これは引き継ぎ書の旧目標③(Excel レポートの切り出し)を β2-E に内包する形になる。

### 4.2 親子行構造の実装

memory §β2-E スコープにある「親子行構造(FindingGroup を親、Finding を子)」は、Excel 出力層の表示ロジックとして実装する。dataclass 階層を変えるわけではない。

具体的には:

- V1-3-20: `FindingGroup` を入力として受け取り、Excel 上で親行(集計行) + 子行(個別 Finding)の階層表示を行う
- V1-3-10: 既存通り Finding をフラットに表示(親子行は使わない)

`excel_report` の出力エントリポイントを以下のように設計する(関数シグネチャは TBD、v1 で確定):

```python
def export_findings(
    findings: list[Finding] | list[FindingGroup],
    output_path: Path,
    skill_name: str,  # "V1-3-10" or "V1-3-20"
    ...
) -> None:
```

### 4.3 V1-3-20 固有列

V1-3-20 出力時のみ表示する列:

- `classification` (Classification Enum 値)
- `is_qualified_invoice` (適格請求書発行事業者フラグ)
- `partner` (取引先名)
- `transaction_date` (取引日)

これらは共通 Finding に追加した属性(§2.3.2)から取得できる。V1-3-10 出力時は値が None のため、列ごと非表示にする(または "-" 表示)。

### 4.4 .claude/skills/ への登録

`skills/export/excel_report/` を `.claude/skills/` に登録する。これにより Claude Code がこの Skill を自然に呼び出せるようになる。具体的な SKILL.md 記述は v1 で確定する。

### 4.5 既存テストの影響

`tests/unit/test_excel_export.py` (54 件) と `tests/unit/test_step3c_exporter.py` (18 件) と `tests/unit/test_finding_grouper.py` (18 件) は、Excel 出力の入出力契約変更により影響を受ける。

互換性方針: **既存テストの期待値は変えず、`export_findings` の内部実装で V1-3-10 専用パスを維持** する。これにより 90 件のテストは非破壊で通す。

---

## 5. フェーズ分割(実装ロードマップ)

### 5.1 設計思想

β2-D L1-B の運用パターン(**判定層は触らない、入力経路だけ統一する**)を継承し、β2-E でも判定層を保護する。具体的には:

- `classify_transaction` / `find_groups` / `to_finding` / `to_findings` (V1-3-20)
- `verify_*` 関数群 (V1-3-10)
- `create_finding()` (V1-3-10)

これらの **中身**は変更しない。共通スキーマへの移行は、これらが返す型を変えることで対応する(返り値の型を `Finding` (共通) に切り替えるが、内部ロジックは保持)。

### 5.2 クラスタ分割案

β2-E を以下のクラスタに分割する:

#### クラスタ E1: 共通スキーマ定義

- 所要: 1 セッション
- 範囲: `skills/_common/schema.py` の新設、共通 `Finding` / `LinkHints` / `FindingDetail` / `Severity` / `ReviewLevel` / `ErrorType` の定義
- テスト: 共通スキーマ単体テストの新設(数件)。既存 481 件への影響なし(まだ移行していないため)
- 完了条件: 共通スキーマが import 可能、既存 481 件全件 PASS 維持

#### クラスタ E2: V1-3-10 移行

- 所要: 1〜2 セッション
- 範囲: V1-3-10 の Finding を共通 Finding に置換、`create_finding()` の返り値型変更、`schema.py` の整理
- テスト影響: V1-3-10 直接 124 件 + 共通系 228 件 = 352 件
- 完了条件: V1-3-10 関連テスト 352 件全件 PASS、V1-3-20 129 件 PASS 維持

#### クラスタ E3: V1-3-20 移行

- 所要: 1〜2 セッション
- 範囲: V1-3-20 の `InvoiceFinding` を共通 Finding に置換、`to_finding` / `to_findings` の返り値型変更、`raw` dict の解体(共通 Finding 直下属性へ吸収)
- テスト影響: V1-3-20 129 件
- 完了条件: V1-3-20 関連テスト 129 件全件 PASS、V1-3-10 352 件 PASS 維持

#### クラスタ E4: Context 統合

- 所要: 0.5〜1 セッション
- 範囲: 共通 `CheckContext` の整備、V1-3-20 `InvoiceCheckContext` の廃止または互換ラッパー
- テスト影響: 既存 481 件のうち context 経路を通るもの全部
- 完了条件: 481 件全件 PASS

#### クラスタ E5: Excel 統合

- 所要: 2〜3 セッション
- 範囲: `skills/export/excel_report/` を共通 Skill として昇格、`.claude/skills/` への登録、V1-3-20 用の親子行表示ロジック追加、V1-3-20 固有列の追加
- テスト影響: `test_excel_export.py` (54) + `test_step3c_exporter.py` (18) + `test_finding_grouper.py` (18) + V1-3-20 関連の Excel 出力テスト(新規)
- 完了条件: 既存 90 件 PASS 維持、新規 V1-3-20 Excel 出力テストが PASS

#### クラスタ E6: 仕上げと L1-B まとめタスク回収

- 所要: 1 セッション
- 範囲: SKILL.md 3 ファイル更新、RUNBOOK 更新、`InvoiceFinding.raw["source"]` 動的化、dead code 整理(優先度低)
- テスト影響: 軽微
- 完了条件: ドキュメント整合、テスト全件 PASS

### 5.3 トータル所要

合計: **6.5〜10 セッション**(連休中に全部完遂は厳しい可能性。E1〜E3 までを連休中の現実的目標とする)

### 5.4 各クラスタのブランチ運用

各クラスタを独立した feature ブランチで進める:

- `feature/v1-3-20-beta2-e1-common-schema`
- `feature/v1-3-20-beta2-e2-migrate-v1-3-10`
- `feature/v1-3-20-beta2-e3-migrate-v1-3-20`
- `feature/v1-3-20-beta2-e4-unify-context`
- `feature/v1-3-20-beta2-e5-excel-integration`
- `feature/v1-3-20-beta2-e6-finalize`

各クラスタ完了時に main へ merge し、次のクラスタは最新 main から派生する。これにより「途中で挫折してもクラスタ単位で価値が残る」構造になる。

---

## 6. テスト戦略

### 6.1 既存テスト保護方針

481 件の既存テストを **β2-E 全期間を通じて全件 PASS** に保つ。各クラスタ完了時にこれを合格基準とする。

### 6.2 各クラスタでの確認方法

```powershell
# V1-3-10 直接
pytest tests/unit/test_tc01.py tests/unit/test_tc02.py tests/unit/test_tc03.py tests/unit/test_tc04.py tests/unit/test_tc05.py tests/unit/test_tc06.py tests/unit/test_tc07.py

# V1-3-10 共通系
pytest tests/unit/test_common.py tests/unit/test_finding_grouper.py tests/unit/test_freee_link_generator.py tests/unit/test_excel_export.py tests/unit/test_step3c_exporter.py tests/unit/test_suggested_value_constraint.py tests/unit/test_template_engine_phase8b.py

# V1-3-20
pytest tests/unit/test_invoice_registration_status.py
```

### 6.3 新規テスト

各クラスタで以下を新規追加する:

- E1: 共通スキーマ単体テスト(`tests/unit/test_common_schema.py` 新設)
- E5: V1-3-20 Excel 出力テスト(`tests/unit/test_invoice_excel_export.py` 新設)

### 6.4 E2E 検証

`tests/e2e/` 配下のスクリプトは β2-E 後半(E4 または E5 完了時)に手動実行し、回帰がないか確認する。

---

## 7. 残課題・不明点(v0 時点)

以下は v0 では確定しておらず、v1 までに解消するか、解消できなくても明示する:

### TBD-1: V1-3-20 の `severity: str` から共通 `Severity` Literal への変換マッピング

V1-3-20 の現行 `severity` 値が具体的にどの文字列パターンを取るか調査が必要。実装時に Claude Code が `to_finding` 内で確認する。

### TBD-2: V1-3-20 `raw` dict の解体時に発生する情報損失の可能性

`raw` dict 8 フィールドのうち `tax_label` / `description` / `source` は共通 Finding 直下属性に吸収する想定だが、既存テストが `raw["..."]` で値を取得しているケースがあれば破壊的変更になる。E3 着手時に Claude Code が grep 確認する。

### TBD-3: `excel_report` Skill の現状実装の詳細

`skills/export/excel_report/` の現行実装を未確認。E5 着手前に Claude Code が現状把握タスクを別途実施する必要あり。

### TBD-4: V1-3-20 の Excel 出力の現状

V1-3-20 が現在 Excel 出力を持っているか、JSON のみか、未確認。E5 着手前に確認。

### TBD-5: `.claude/skills/` への登録手順

`.claude/skills/` の現状の登録ファイル形式を未確認。E5 着手時に既存の Skill 登録例(V1-3-10 がどう登録されているか)を参照する。

### TBD-6: クラスタ E4(Context 統合)の必要性再検討

β2-D L1-B で `build_check_context` が共通化されているため、Context 統合の追加作業が実質不要な可能性がある。E3 完了時に再評価し、不要なら E4 をスキップする。

### TBD-7: L1-B まとめタスク 6 件の処理位置

完了ログ §7.1 の 6 件のうち、どれを E6 で処理し、どれを β2-E スコープ外として独立タスクとするか、悠皓判断事項。

---

## 8. 連休中の現実的目標

連休残日数と所要時間見積りから、**現実的目標は E1 + E2 + E3 まで** とする。E4〜E6 は連休後でも構わない。

| クラスタ | 状態 | 所要 | 累計 |
|---|---|---|---|
| E1 共通スキーマ定義 | 連休中目標 | 1 | 1 |
| E2 V1-3-10 移行 | 連休中目標 | 1〜2 | 2〜3 |
| E3 V1-3-20 移行 | 連休中目標 | 1〜2 | 3〜5 |
| E4 Context 統合 | 余裕あれば | 0.5〜1 | 3.5〜6 |
| E5 Excel 統合 | 連休後 | 2〜3 | — |
| E6 仕上げ | 連休後 | 1 | — |

E3 まで完了すれば、Finding スキーマの統一(旧目標①)は実質達成され、V1-3-10/V1-3-20 が共通スキーマで動く状態になる。Excel 統合(旧目標③)とパイプライン統合(旧目標④)は連休後の独立タスクとして残るが、構造的な障害は除去される。

---

## 9. 次のアクション

本メモが v0 として悠皓に承認されたら:

1. v1 へ昇格(必要な修正があれば反映)
2. クラスタ E1 の Claude Code 用プロンプトを戦略 Claude が作成
3. Claude Code が `feature/v1-3-20-beta2-e1-common-schema` ブランチで実装
4. 完了時に main へ merge、次のクラスタへ進む

---

**作成者**: 戦略 Claude (claude.ai セッション)
**バージョン**: v0
**次回更新タイミング**: 悠皓レビュー後 → v1 確定時
