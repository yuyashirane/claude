# V1-3-20 β2-E 設計メモ v2

**作成日**: 2026-05-06 (v0)、2026-05-06 (v2 更新)
**作成者**: 戦略 Claude (claude.ai セッション)
**ステータス**: v2 (E1〜E3-b 完了状況を反映)
**前提資料**:
- `docs/design/office-claude-design-v2_2.md` (全体設計書)
- `docs/design/skills/V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md` (§13.4.2 Finding 正本)
- `docs/analysis/finding-schema-comparison-20260506.md` (Finding 比較調査)
- `docs/analysis/v1-3-20-scope-investigation-2026-05-06.md` (β2-E スコープ調査)
- `docs/analysis/severity-review-level-occurrence-survey-2026-05-06.md` (E2-b1 旧値調査)
- `docs/analysis/v1-3-20-migration-survey-2026-05-06.md` (E3-a V1-3-20 移行調査)

---

## 0. このドキュメントの位置づけ

β2-D L1-B 完了 (2026-05-02) 後の β2-E 設計を記録するメモ。v0 から v2 への更新で、**E1〜E3-b 完了の実績を反映**。残作業の見通しと、次セッションへの引き継ぎ材料を整理する。

### v0 → v2 の主な変更点

- §1.1 完了条件: E1〜E3-b 完了状況を反映
- §2.3.1 共通スキーマの配置: CheckContext を別ファイルに分離する方針を明確化
- §2.3.2 共通 Finding の属性: tax_code を Optional[int] に確定
- §2.4 Severity / ReviewLevel: 新名称体系を確定 (E1 で実装済)
- §5.2 クラスタ分割: E2-a/b1/b2/b3 + E3-a/pre/b の実績を反映
- §7 TBD: 解消されたものをマーク、新規論点 (error_type 体系見直し) を追加
- §8 連休中の現実的目標: 達成済 (連休中目標①の実質達成)

---

## 1. β2-E のゴール定義

### 1.1 完了条件 (進捗チェック付き)

| # | 完了条件 | ステータス |
|---|---|---|
| 1 | V1-3-10 と V1-3-20 が同一の Finding 派生型を出力 | ✅ 達成 (E3-b 完了) |
| 2 | 両 Skill の出力が 1 つの Excel ブックにまとまる | ⏳ E5 待ち |
| 3 | V1-3-10 既存テスト (124 + 239 = 363 件) 全件 PASS | ✅ 達成 (継続維持) |
| 4 | V1-3-20 既存テスト (129 件) 全件 PASS | ✅ 達成 (継続維持) |
| 5 | β2-D L1-B の「判定層は触らない」原則を継承 | ✅ 達成 |

**全体進捗: 80%** (出力統合 = E5 のみ残)

### 1.2 β3 との境界

β2-E に **含まないもの** (β3 以降に持ち越し):

- T 番号妥当性チェック
- 統合パイプライン (V1-3-10 + V1-3-20 を1コマンド) ← 引き継ぎ書旧目標④
- partner_master 同名 partner 後勝ち問題の本格対応
- dead code 5 関数の整理 (E3-d で部分対応予定)
- Phase 7 (freee URL 列実装)
- error_type 体系の全面見直し (新規 TODO、後述 §7)

### 1.3 β2-E 内で扱う論点

サブ Phase 化された項目:

- ✅ `_ERROR_TYPE_TO_REVIEW_LEVEL` の中央集約 (E2-b2 で確立)
- ✅ Severity 中央集約地点 SEVERITY_ORDER + SEVERITY_TO_PARENT_STYLE (E2-b3 で確立)
- ✅ V1-3-20 の Severity マッピング (E3-b で severity_map.py 新設)
- ⏳ `InvoiceFinding.raw["source"]` の動的化 (β2-D 既知制約、E3-c 対応候補)
- ⏳ wallet_txn_id ID 衝突対策 (E3-c 対応候補)
- ⏳ L1-B まとめタスク 6 件 (E3-d または独立タスク)

---

## 2. Finding スキーマ統合方針

### 2.1 採用案 (確定)

**案 B+** (現 V1-3-10 を基準に V1-3-20 を寄せ、段階的に §13.4.2 へ近づける) を採用。

実装結果として:
- ✅ 共通 Finding を `skills/_common/schema.py` に配置 (E1)
- ✅ V1-3-10 を re-export 化 (E2-a)
- ✅ V1-3-20 を共通 Finding のエイリアスに (E3-b)
- ⏳ §13.4.2 完全準拠は Phase 6/7 で漸進

### 2.2 採用根拠 (E3-b 完了時点での確認)

E3-b 完了により、案 B+ の妥当性が実証された:

| 観点 | 想定 (v0) | 実測 (v2) |
|---|---|---|
| 所要時間 | 2〜3 営業日 | E1〜E3-b で 1 セッション内に達成 |
| 影響範囲 | V1-3-20 中心 | V1-3-10 + V1-3-20 + 共通スキーマ |
| 既存テスト破壊 | 限定的 | 0 件 (510 → 512、増加のみ) |
| β2-D L1-B 戦略との整合 | bridge 戦略を継承 | 完全継承、判定層維持 |

### 2.3 共通スキーマの構造 (確定)

#### 2.3.1 配置 (修正版)

```
skills/_common/
├── schema.py        ← Finding / LinkHints / FindingDetail / Severity 等 (E1 で新設)
├── context.py       ← CheckContext を E4 で配置予定 (現状未作成)
├── lib/
│   ├── finding_factory.py   ← _ERROR_TYPE_TO_REVIEW_LEVEL を含む (E2-b2 で更新)
│   ├── finding_grouper.py   ← SEVERITY_ORDER を含む (E2-b3 で更新)
│   └── ... (その他)
└── references/
    └── ... (JSON マスタ群)
```

**v0 の誤り訂正**: schema.py に CheckContext を含めると書いていたが、E4 で別ファイル (`context.py`) に配置する方針が正しい。E3-b の段階では V1-3-10 配下に CheckContext が残っており、E4 で共通化予定。

#### 2.3.2 共通 `Finding` の属性 (E3-b 完了時点)

V1-3-10 既存属性 19 個 + V1-3-20 由来追加 5 個 + raw 1 個 = 計 25 属性。

| 属性 | 型 | 由来 | 備考 |
|---|---|---|---|
| (V1-3-10 既存 19 属性) | — | V1-3-10 | E1 で完全コピー |
| `classification` | `Optional[str]` | V1-3-20 由来 | E1 で追加 |
| `partner` | `Optional[str]` | V1-3-20 raw | E1 で追加 |
| `transaction_date` | `Optional[str]` | V1-3-20 raw | E1 で追加 |
| `is_qualified_invoice` | `Optional[bool]` | V1-3-20 raw | E1 で追加 |
| `tax_code` | `Optional[int]` | V1-3-20 raw | E1 で確定 (Optional[int]) |
| `raw` | `Optional[dict[str, Any]]` | V1-3-20 互換のため | **E3-b で追加** (戦略 A、E3-c で削除候補) |

#### 2.3.3 §13.4.2 未実装属性 (E3-b 完了時点)

§13.4.2 で定義されているが現在未実装の 11 属性は **β2-E では追加しない** (Phase 6/7 で対応)。これは v0 から変更なし。

### 2.4 Severity / ReviewLevel (E1〜E2-b3 で確定)

#### 確定値

```python
# 共通 Severity (E1 + E2-b3 で確定)
Severity = Literal["🔴 Critical", "🟠 High", "🟡 Medium", "🟢 Low"]

# 共通 ReviewLevel (E1 + E2-b2 で確定)
ReviewLevel = Literal["🔴 必須確認", "🟠 重点確認", "🟡 通常確認", "🟢 参考確認"]

# 共通 ErrorType (E1 + E3-pre で確定)
ErrorType = Literal[
    "direct_error",
    "reverse_suspect",
    "invoice_warning",  # ← E3-pre で追加 (V1-3-20 用)
    "gray_review",
    "mild_warning",
]
```

#### ErrorType と ReviewLevel の対応 (E2-b2 + E3-pre で確定)

```python
_ERROR_TYPE_TO_REVIEW_LEVEL = {
    "direct_error":    "🔴 必須確認",
    "reverse_suspect": "🟠 重点確認",
    "invoice_warning": "🟠 重点確認",  # E3-pre で追加
    "gray_review":     "🟡 通常確認",
    "mild_warning":    "🟢 参考確認",
}
```

**注**: この対応関係は機械置換で確定したものであり、ErrorType の業務上の意味論との整合性は将来見直し予定 (§7 TODO 参照)。

#### 旧値からの互換マップ (E1 で実装、E2-b2/b3 で実用)

```python
SEVERITY_LEGACY_MAP = {
    "🔴 High":     "🔴 Critical",
    "🟡 Medium":  "🟡 Medium",
    "🟠 Warning": "🟠 High",
    "🟢 Low":      "🟢 Low",
}

REVIEW_LEVEL_LEGACY_MAP = {
    "🔴必修":  "🔴 必須確認",
    "🟠警戒":  "🟠 重点確認",
    "🟡判断":  "🟡 通常確認",
    "🟢参考":  "🟢 参考確認",
}
```

旧値の置換は完了 (E2-b2 で 25 件、E2-b3 で 61 件)。LEGACY_MAP は **歴史記録 + 将来の互換性のため保持**。

#### V1-3-20 用 Severity マッピング (E3-b で新設)

```python
# skills/verify/V1-3-rule/check-invoice-registration-status/severity_map.py
V1320_SEVERITY_MAP: dict[str, Severity] = {
    "warning": "🟠 High",
}
```

V1-3-20 固有のため、共通スキーマには置かず V1-3-20 配下に配置。

### 2.5 LinkHints / FindingDetail (E1 で確定、変更なし)

V1-3-10 既存をそのまま昇格。仕様書 §13.4.2 との差は Phase 7 で対応。LinkHints の V1-3-20 への導入は β2-E スコープ内だが、現状は `Optional[LinkHints] = None` で運用中。

### 2.6 V1-3-20 固有概念の共存 (E3-b で確定)

| 概念 | 配置 | E3-b での扱い |
|---|---|---|
| `Classification` Enum | V1-3-20 配下 | 維持 |
| `FindingGroup` | V1-3-20 配下 | 維持 (E5 で Excel 親子行に活用) |
| `InvoiceCheckRow` | V1-3-20 配下 | 維持 |
| `InvoiceCheckContext` | V1-3-20 配下 | 維持 (E4 で共通 CheckContext に統合予定) |
| `InvoiceFinding` | V1-3-20 schema.py | **共通 Finding のエイリアス化** (E3-b) |

---

## 3. Context 統合方針 (E4 で扱う、未着手)

### 3.1 採用方針 (v0 から変更なし)

V1-3-10 既存 `CheckContext` をそのまま共通昇格し、V1-3-20 は寄せる。

### 3.2 配置

`skills/_common/context.py` (新設予定) に共通 `CheckContext` を配置する。

### 3.3 進捗

E4 未着手。E3-b 完了時点では V1-3-10 schema.py に CheckContext が残っている。

---

## 4. Excel 出力統合方針 (E5 で扱う、未着手)

### 4.1 採用方針 (v0 から変更なし)

V1-3-10 既存 `skills/export/excel_report/` を共通 Excel 出力 Skill として昇格。

### 4.2 進捗

E5 未着手。E3-b 完了時点では V1-3-20 用の Excel 出力は未対応 (V1-3-20 は JSON 出力のみ)。

E2-b3 で `template_engine.py:127-133` の `SEVERITY_TO_PARENT_STYLE` 辞書が中央集約地点として更新済 (新名称対応)。

---

## 5. フェーズ分割 (実装ロードマップ、E3-b 完了時点)

### 5.1 設計思想 (確認: β2-D L1-B の bridge 戦略を継承)

判定層を触らない原則を E1〜E3-b 全期間で維持。

### 5.2 クラスタ分割案 (実績反映)

| クラスタ | 内容 | ステータス | 所要 (実績) |
|---|---|---|---|
| **E1** | 共通スキーマ定義 | ✅ 完了 | 1 セッション |
| **E2-a** | V1-3-10 schema.py の re-export 化 | ✅ 完了 | 0.5 セッション |
| **E2-b1** | Severity / ReviewLevel 旧値の出現箇所調査 | ✅ 完了 | 0.5 セッション |
| **E2-b2** | ReviewLevel 機械置換 (25 件) | ✅ 完了 | 0.5 セッション |
| **E2-b3** | Severity 機械置換 (61 件) | ✅ 完了 | 0.5 セッション |
| **E3-a** | V1-3-20 移行 事前調査 | ✅ 完了 | 0.5 セッション |
| **E3-pre** | invoice_warning ErrorType 追加 | ✅ 完了 | E3-b と統合 |
| **E3-b** | V1-3-20 型移行 (raw 維持) | ✅ 完了 | 1 セッション |
| **E3-c** | raw 解体 (直下属性へ振り分け) | ⏳ 未着手 | 1〜2 セッション |
| **E3-d** | SKILL.md 更新・dead code 整理 | ⏳ 未着手 | 1 セッション |
| **E2-c (任意)** | V1-3-10 schema 整理 | ⏳ 任意 | 0.5 セッション |
| **E4** | Context 統合 | ⏳ 未着手 | 0.5〜1 セッション |
| **E5** | Excel 統合 | ⏳ 未着手 | 2〜3 セッション |
| **E6** | 仕上げ | ⏳ 未着手 | 1 セッション |

### 5.3 トータル所要 (実測 + 見積)

- **完了済**: 約 4.5〜5 セッション
- **残**: 約 5〜8 セッション (E3-c〜E6)
- **連休後着手で問題ない**: E5 (2〜3 セッション) が最大、それ以外は短い

### 5.4 各クラスタのブランチ運用 (実績)

実際に切ったブランチ (すべて main へ merge 後削除済):

- ✅ `feature/v1-3-20-beta2-e1-common-schema`
- ✅ `feature/v1-3-20-beta2-e2a-v1-3-10-reexport`
- ✅ `feature/v1-3-20-beta2-e2b2-review-level-rename`
- ✅ `feature/v1-3-20-beta2-e2b3-severity-rename`
- ✅ `feature/v1-3-20-beta2-e3-migrate` (E3-pre + E3-b 統合)

---

## 6. テスト戦略 (実績)

### 6.1 既存テスト保護方針 (達成)

E1〜E3-b 全期間を通じて全件 PASS を維持:
- 開始時点: 481 件
- E1 後: 510 件 (+29、共通スキーマ単体テスト追加)
- E3-pre 後: 512 件 (+2、invoice_warning テスト)
- 現在: **512 件 全件 PASS**

### 6.2 各クラスタの確認結果

すべてのクラスタで「既存テスト全件 PASS」の合格基準を達成。

### 6.3 新規テスト

- `tests/unit/test_common_schema.py` (E1 で新設、20 件)
- 既存テストへの新値対応 (E2-b2 / E2-b3 / E3-b)

### 6.4 E2E 検証

E5 完了時に手動実行予定 (E3-b 完了時点では未実施)。

---

## 7. 残課題・TODO (E3-b 完了時点)

### 解消済 (v0 の TBD)

- ✅ **TBD-1** V1-3-20 の severity 値 → 解消 (`"warning"` 1 種のみ、E3-a で確認)
- ✅ **TBD-2** raw dict 解体時の情報損失リスク → E3-b で raw 維持により回避、E3-c で再評価
- ✅ **TBD-3** `excel_report` Skill の現状 → E5 で扱う (現時点では深掘り不要)
- ✅ **TBD-4** V1-3-20 の Excel 出力 → JSON のみと判明 (E5 で対応)
- ✅ **TBD-5** `.claude/skills/` 登録手順 → E5 で扱う
- ✅ **TBD-6** クラスタ E4 の必要性 → V1-3-10 配下に CheckContext が残っているため E4 必要と確認
- ⏳ **TBD-7** L1-B まとめタスク 6 件の処理位置 → 引き続き悠皓判断 (E3-d 候補)

### 新規 TODO (E1〜E3-b で発覚)

#### TODO-A: error_type 体系の全面見直し

**背景**: E3-pre で `invoice_warning` を追加したが、これは妥協措置。本質的には ErrorType の英語名と業務上の意味論が一致していない可能性が高い。

**具体的な懸念**:
- `reverse_suspect` (逆仕訳の疑い) という名前の意味論が広範な事象に対応できない
- `gray_review` / `mild_warning` の境界が不明瞭
- 仕様書 §13.1〜§13.3 の 35 Finding と error_type 対応が固定化されている

**対応案**:
- ErrorType 体系を業務語彙に整える (例: `tax_classification_error` / `partner_unconfirmed` / `invoice_compliance` 等)
- 仕様書 35 Finding の error_type 再割り当て
- 影響範囲が大きいため、独立した中規模タスクとして扱う

**優先度**: 中 (連休後の早い時期に検討)

#### TODO-B: schema.py.bak_20260418_221222 の整理

**背景**: 2026-04-18 のバックアップファイルが skills/verify/V1-3-rule/check-tax-classification/ 配下に残置。

**対応**: 削除可能だが、誰も触っていない過去の状態のため、別タスクで判断。

**優先度**: 低

#### TODO-C: .claude/settings.local.json の管理方針

**背景**: Claude Code のローカル設定が Git 管理対象になっている。

**対応**: `.gitignore` に `.claude/settings.local.json` を追加し、各環境で個別管理する。

**優先度**: 低 (連休後)

#### TODO-D: dead code 5 関数の整理

**背景**: β2-D L1-B 完了ログ §7.2 で指摘された V1-3-20 の dead code。

**対応**: E3-d で扱う。

**優先度**: 低

---

## 8. 連休中の現実的目標 (達成状況)

### v0 で立てた目標

E1 + E2 + E3 までを連休中の現実的目標とする。

### 達成状況 (2026-05-06 時点)

| クラスタ | 計画 | 実績 |
|---|---|---|
| E1 | 連休中目標 | ✅ 達成 |
| E2 | 連休中目標 | ✅ 達成 (E2-a/b1/b2/b3) |
| E3 | 連休中目標 | ✅ 半分達成 (E3-a/pre/b 完了、E3-c 未着手) |
| E4 | 余裕あれば | ⏳ 連休後 |
| E5 | 連休後 | ⏳ 連休後 |
| E6 | 連休後 | ⏳ 連休後 |

### 連休中目標 ① (Finding スキーマ統一) の達成

E3-b 完了時点で **V1-3-10 と V1-3-20 が共通 Finding で動作する状態に到達**。連休中目標①は実質達成。

### 残作業 (E3-c 以降) の見通し

- **E3-c** (raw 解体): 内部最適化、外部 I/F に影響なし。連休中・連休後どちらでも可
- **E4** (Context 統合): 0.5〜1 セッション、軽量
- **E5** (Excel 統合): 2〜3 セッション、最大規模
- **E6** (仕上げ): 1 セッション

---

## 9. 次のアクション

### 直近 (次セッション開始時)

1. 引き継ぎ書 `docs/handover/handover_2026-05-XX.md` を読む
2. 現在の Git 状態を確認 (main、+24 commit が origin にあるはず)
3. E3-c から始めるか、E4 に進むか、別タスクかを悠皓が判断

### E3-c 着手時の注意

- raw アクセスする 22 件のテストを書き換え
- `f.raw.keys()` 全集合比較 2 件は意図 (8 key の存在保証) を保てる新検証方式に
- `tax_label` / `description` / `source` / `debit_amount` の最終判断 (raw 残置 vs 直下属性)
- `Finding.raw` を最終的に削除するかは E3-c 完了時に判断

### E4 着手時の注意

- V1-3-10 配下の `TransactionRow` / `ReferenceBundle` / `CheckContext` を共通化
- V1-3-20 の `InvoiceCheckContext` を共通 `CheckContext` に統合
- E2-a と同じ re-export パターンを使うか検討

---

**作成者**: 戦略 Claude (claude.ai セッション)
**バージョン**: v2 (E1〜E3-b 完了状況を反映)
**次回更新タイミング**: E3-c 完了時 → v3、または E4 完了時
