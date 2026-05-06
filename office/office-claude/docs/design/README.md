# office-claude 設計ドキュメント

このディレクトリには office-claude プロジェクトの設計書を集約しています。

## ファイル構成

```
docs/design/
├── README.md                                     ← 本ファイル（道しるべ）
├── office-claude-design-v2_2.md                  ← 全体設計書 v2.2（Markdown版・運用上の正本）
├── raw/                                          ← 原本docx 退避先（改訂履歴を保持）
│   ├── ◆office-claude-design-v2.2.docx          ← 現行 v2.2 原本
│   └── ◆office-claude-design-v2.1_rev.docx      ← v2.1 原本（改訂前・履歴用）
└── skills/
    └── V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md
                                                  ← V1-3-10 個別Skill仕様書
```

**方針**:
- `design/` 直下には **Markdown 版のみ** 残す（GitHub 上で読みやすく、diff も取りやすい）
- 原本 docx は `raw/` へ退避し、改訂履歴として保持する（v2.1, v2.2 の両方を保管）
- 将来 docx 改訂版が来たら `raw/` に追加し、[../../scripts/docx_to_md.py](../../scripts/docx_to_md.py) で再変換する

関連スクリプト: [office-claude/scripts/docx_to_md.py](../../scripts/docx_to_md.py) — docx → Markdown 変換ツール（python-docx 利用）

## 2つの設計書の役割の違い

| 観点 | 全体設計書 v2.2 | V1-3-10 仕様書 v1.2.2 |
|---|---|---|
| 対象範囲 | プロジェクト全体（10原則・7カテゴリ・V1〜V6 全フェーズ） | 単一Skill（消費税区分チェック）の詳細仕様 |
| 抽象度 | 高（憲法・方針レベル） | 低（実装に直結するスキーマ・チェックロジック） |
| 主な読者 | 全スタッフ・新規参画者・設計議論の出発点 | V1-3-10 の実装者・テスト作成者・近接Skillの設計者 |
| 更新頻度 | 章単位の改訂（数ヶ月） | 章節単位（実装と並走して頻繁に rev） |
| 役割 | 「どこに何があるか」の地図 | 「何を実装するか」の正本 |

**読み順の推奨**: 全体設計書 → V1-3-10 仕様書。V1-3-10 は全体設計の「7カテゴリ × V1〜V6」の中の `V1-3 ルール / Skill 10番` に位置付けられる。

## Finding スキーマの正本: §13.4.2

V1-3-10 仕様書の **§13.4.2「Finding スキーマ v0.2（実装時の正）」が Finding スキーマの正本** である。

仕様書本文の §2.3 にも Finding 定義が掲載されているが、内容が乖離する場合は §13.4.2 を上書き優先とする（仕様書冒頭・§13冒頭・§13.5 整合性メモにも明記）。

主な差分（§2.3 v1.2.1 → §13.4.2 v0.2）:
- `sub_code` 必須化
- `subarea` / `notes` / `matched_keywords` / `rule_basis` / `link_hints` を追加
- `freee_general_ledger_url` は optional（Excel 層で埋める）

→ 詳細は [skills/V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md](skills/V1-3-10_check-tax-classification_仕様書_v1.2.2_rev.md) §13.4.2 を参照。

## reports/schema_gap_report.md との関係

`office-claude/reports/schema_gap_report.md` は **§13.4.2 を正本としたときの実装乖離調査レポート**である（2026-04-16 時点）。

- 仕様書 §13.4.2（正本）⇔ 実装 `skills/verify/V1-3-rule/check-tax-classification/schema.py` の差分を 30属性ベースで列挙
- Finding 属性 22件 / FindingDetail ほぼ全差替え / LinkHints 6→8属性の乖離を特定
- Phase 7（freee URL 生成）前の整備優先度=高

つまり:
- **「あるべき姿」** → V1-3-10 仕様書 §13.4.2
- **「現状」** → schema.py 等の実装
- **「ギャップ」** → reports/schema_gap_report.md

仕様書を改訂したら schema_gap_report.md の再生成が必要。逆に実装を仕様書に合わせて整備したら、ギャップ件数が減る方向に schema_gap_report.md を更新する。

## 補修履歴

### 2026-05-05: 全体設計書 v2.2 docx → md 変換と §9.2 H3 見出し補修

- python-docx で `◆office-claude-design-v2.2.docx` を `office-claude-design-v2_2.md` に変換（239 段落 / 57 見出し / 40 表）
- 原本docx の §9.2 H3 見出し 4箇所に文字欠落があったため、md 側で補修

| 行 | 補修前（原本docxそのまま） | 補修後（md） |
|---|---|---|
| 176 | `### 1:` | `### ルール1: ディレクトリ構造をプラグイン互換に` |
| 199 | `### 2:` | `### ルール2: パスはプロジェクトルート相対で書く` |
| 202 | `### 3: Skillkebab-case9` | `### ルール3: Skill技術名は英語kebab-case（原則9の徹底）` |
| 208 | `### 5:  .env` | `### ルール5: 認証情報は .env で外出し` |

補修根拠:
- v2.1（前バージョン）に対応する見出しが存在することを確認
- 各見出し直下の本文から見出しの意図を逆算可能
- 補修前の見出しは数字とコロンのみで明らかに不完全

> docx 原本は触っていない（後日改訂版が来る可能性を考慮し保持）。docx が改訂されたら再変換し、本補修は不要になる見込み。
