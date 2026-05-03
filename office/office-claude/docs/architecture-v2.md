# freee自動仕訳 アーキテクチャ設計 v2

> freee会計における証憑整理・明細作成・取引登録・帳簿チェックの自動化支援システム。
> 人の判断を最小限にしながら、処理品質とスピードを上げることを目的とする。

---

## 0. 設計原則

| # | 原則 | 内容 |
|---|------|------|
| 1 | **freeeファースト** | freeeの標準機能で処理できるものはfreeeに任せる。Claude Codeは前処理・補助判断・チェック・連携ハブとして機能する |
| 2 | **人確認は必要最小限** | 高確度は自動処理、中低確度と例外のみ人が確認する |
| 3 | **Kintoneが確認フローの中心** | 要確認案件はKintoneに集約し、担当者確認→承認→freee反映→辞書改善の流れを作る |
| 4 | **説明可能な判定** | なぜその候補になったか、なぜ自動登録/Kintone送信/除外になったかを常に記録する |
| 5 | **安全性重視** | 初期は候補提示・確認フロー・ログ保存を優先。本番freeeへの自動登録は段階的に開放する |
| 6 | **学習可能な構造** | 人の修正結果を辞書・ルール改善に反映し、継続的に精度向上する |

---

## 1. 全体アーキテクチャ

### 1-1. パイプライン構成

```
┌─────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐   ┌────────┐   ┌───────┐
│  INPUT   │──▶│ NORMALIZE │──▶│ CLASSIFY │──▶│ REVIEW │──▶│ REGISTER │──▶│ VERIFY │──▶│ LEARN │
│ 書類取込  │   │ 明細標準化 │   │ 仕訳判定  │   │ 人間確認 │   │ freee登録 │   │帳簿チェック│  │学習改善 │
└─────────┘   └───────────┘   └──────────┘   └────────┘   └──────────┘   └────────┘   └───────┘
     │              │               │              │              │              │            │
 Gmail MCP     Claude Code      Claude Code     Kintone     freee MCP       Claude Code   辞書・ルール
 Drive MCP     Vision API       辞書・ルール     REST API     CSV Upload     Excelレポート   更新提案
 freee MCP                      freee過去仕訳                                Kintone出力
```

### 1-2. 実行モデル

Claude Codeは常駐プロセスではなく **オンデマンド実行** で動作する。

| 実行方式 | 用途 | トリガー |
|----------|------|----------|
| **手動実行** | スキル呼び出し（`/freee-auto-keiri` 等） | ユーザーがClaude Codeで実行 |
| **スケジュール実行** | 定期チェック、定期取込 | Claude Code Scheduled Tasks / cron |
| **イベント駆動** | 書類取込（Gmail/Drive監視） | スケジュール実行でポーリング |

> **制約**: Claude Codeはリアルタイム監視ができないため、Gmail/Drive監視は
> スケジュール実行（例: 1時間ごと）によるポーリングで代替する。

### 1-3. 外部システム連携

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                             │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Skills   │  │ Scripts  │  │ 辞書/ルール│  │ データ(data/)│  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────┬──────┘  │
│       │             │                              │         │
├───────┼─────────────┼──────────────────────────────┼─────────┤
│       │ MCP / REST API                             │         │
│  ┌────▼────┐  ┌─────▼─────┐  ┌──────────┐  ┌─────▼──────┐  │
│  │freee MCP│  │Gmail MCP  │  │Drive MCP │  │Kintone API │  │
│  └────┬────┘  └─────┬─────┘  └────┬─────┘  └─────┬──────┘  │
└───────┼─────────────┼─────────────┼───────────────┼──────────┘
        │             │             │               │
   ┌────▼────┐  ┌─────▼─────┐  ┌───▼──────┐  ┌────▼─────┐
   │freee会計 │  │  Gmail    │  │Google    │  │ Kintone  │
   │         │  │           │  │Drive     │  │          │
   └─────────┘  └───────────┘  └──────────┘  └──────────┘
```

---

## 2. 機能ごとのモジュール分割

### 2-1. ディレクトリ構成（提案）

```
freee-auto/
├── CLAUDE.md                         ← プロジェクトの憲法
├── .claude/skills/
│   ├── freee-auto-keiri/SKILL.md     ← 経理チェックスキル（既存）
│   ├── monthly-verify/SKILL.md       ← 月次レポート生成（既存）
│   ├── source-document-intake/SKILL.md ← 証憑取込（既存）
│   ├── transaction-register/SKILL.md ← 取引登録スキル（新規）
│   └── feedback-learn/SKILL.md       ← 学習改善スキル（新規）
│
├── src/
│   ├── input/                ← INPUT: 書類取込・転送
│   │   ├── gmail-watcher.js         ← Gmail添付検知
│   │   ├── drive-watcher.js         ← Google Driveフォルダ監視
│   │   ├── filebox-uploader.js      ← freeeファイルボックスへ転送
│   │   └── document-classifier.js   ← 書類種別判定（領収書/請求書等）
│   │
│   ├── normalize/            ← NORMALIZE: 明細標準化
│   │   ├── excel-parser.js          ← Excel経費精算のパース
│   │   ├── csv-converter.js         ← CSV/スプレッドシートの変換
│   │   ├── ocr-extractor.js         ← Claude Vision OCR補完
│   │   └── format-standardizer.js   ← 標準明細フォーマットへ変換
│   │
│   ├── classify/             ← CLASSIFY: 仕訳判定
│   │   ├── unprocessed-fetcher.js   ← freee未処理明細の取得（既存想定）
│   │   ├── account-matcher.js       ← 勘定科目マッチング（既存想定）
│   │   ├── tax-classifier.js        ← 消費税区分判定（既存想定）
│   │   ├── invoice-checker.js       ← インボイス区分判定（既存想定）
│   │   ├── confidence-scorer.js     ← 信頼度スコア算出（既存想定）
│   │   └── routing-decider.js       ← 自動登録/Kintone/除外の振り分け
│   │
│   ├── review/               ← REVIEW: Kintone連携
│   │   ├── kintone-sender.js        ← Kintoneへレコード登録
│   │   ├── kintone-fetcher.js       ← Kintoneから承認結果取得
│   │   └── review-aggregator.js     ← レビュー結果の集約
│   │
│   ├── register/             ← REGISTER: freee登録
│   │   ├── deal-creator.js          ← freee取引登録
│   │   ├── csv-uploader.js          ← freee CSV取込
│   │   └── dry-run-validator.js     ← ドライラン検証
│   │
│   ├── verify/               ← VERIFY: 帳簿チェック（既存）
│   │   ├── 04-generate-report.js
│   │   ├── 05-check-overseas-services.js
│   │   ├── create-report.js
│   │   ├── create-review-report.js
│   │   ├── generate-audit-report.js
│   │   └── daily-standup.js
│   │
│   ├── learn/                ← LEARN: フィードバック・学習
│   │   ├── correction-collector.js  ← Kintone修正データ収集
│   │   ├── pattern-analyzer.js      ← 修正パターン分析
│   │   ├── dictionary-updater.js    ← 辞書更新提案生成
│   │   └── accuracy-reporter.js     ← 精度レポート生成
│   │
│   └── shared/               ← 共通ユーティリティ（既存）
│       ├── freee-client.js
│       ├── kintone-client.js
│       ├── overseas-services.js
│       ├── period-utils.js
│       ├── rules.js
│       ├── gmail.js
│       ├── google-auth.js
│       └── logger.js
│
├── references/
│   ├── dictionaries/         ← 辞書（判定の材料）
│   │   ├── account-keywords.md      ← 勘定科目キーワード辞書
│   │   ├── partner-dictionary.md    ← 取引先辞書
│   │   ├── tax-class-dictionary.md  ← 税区分辞書
│   │   ├── document-type-dictionary.md ← 書類種別辞書
│   │   └── exclusion-keywords.md    ← 除外キーワード辞書
│   │
│   ├── rules/                ← ルール（判定の基準）
│   │   ├── auto-register-rules.md   ← 自動登録可否判定ルール
│   │   ├── confidence-threshold.md  ← 高/中/低/除外判定ルール
│   │   ├── kintone-routing-rules.md ← Kintone送信ルール
│   │   ├── client-exceptions/       ← 顧問先別例外ルール
│   │   │   └── {client_name}.md
│   │   └── verify-checklist.md      ← 帳簿チェックルール
│   │
│   ├── tax/                  ← 税務知識（既存）
│   │   ├── tax-classification-rules.md  ← 消費税区分 R01〜R12
│   │   └── invoice-rules.md             ← インボイス判定ルール
│   │
│   ├── accounting/           ← 会計知識（既存）
│   │   ├── account-dictionary.md        ← 勘定科目辞書（現行16科目）
│   │   ├── confidence-score-rules.md    ← 信頼度スコア算出ルール
│   │   ├── finance-analyzer.md          ← 財務分析ルール
│   │   └── monthly-check-rules.md       ← 記帳チェックリスト
│   │
│   ├── operations/           ← 運用仕様（既存）
│   │   ├── kintone-review-app-spec.md   ← Kintoneアプリ仕様
│   │   └── _old_notion-dashboard-spec.md
│   │
│   └── clients/              ← 顧問先別情報
│       └── {client_name}/
│           └── config.md
│
├── data/                     ← 処理データ
│   └── {company_id}/
│       └── {YYYY-MM-DD}/
│           ├── raw/          ← freee APIから取得した生データ
│           ├── analysis/     ← 分析結果
│           └── config.json   ← 実行時パラメータ
│
├── reports/                  ← 出力レポート（既存）
├── templates/                ← テンプレート
├── tests/                    ← テスト
├── logs/                     ← 処理ログ（.gitignore）
└── tmp/                      ← 一時ファイル（.gitignore）
```

### 2-2. モジュール一覧と責務

| モジュール | 責務 | 入力 | 出力 |
|-----------|------|------|------|
| **INPUT** | 書類の検知・取込・種別分類・転送 | Gmail, Drive, freeeファイルボックス | 分類済み書類、処理ログ |
| **NORMALIZE** | 多様な入力を統一フォーマットに変換 | Excel, CSV, OCRテキスト, 画像 | 標準明細データ（JSON） |
| **CLASSIFY** | 仕訳候補の生成と信頼度スコア付与 | 標準明細データ, freee未処理明細 | スコア付き仕訳候補 |
| **REVIEW** | Kintone連携（登録・取得・集約） | 中低確度の仕訳候補 | 承認済み仕訳データ |
| **REGISTER** | freeeへの取引登録（API/CSV） | 承認済み仕訳データ | freee登録結果、ログ |
| **VERIFY** | 帳簿チェック・異常検知・レポート | freee試算表・取引データ | チェック結果、Excelレポート |
| **LEARN** | 修正データ収集・分析・辞書更新提案 | Kintone修正データ | 辞書更新提案、精度レポート |

---

## 3. freee・Kintone・Claude Code の責任分界点

### 3-1. 処理の流れと責務マッピング

```
                    freee                Claude Code              Kintone
                    ─────                ───────────              ───────
口座同期           ◆ 自動同期
                   ◆ 明細取得
                                        ◆ 未処理明細の取得
                                        ◆ 仕訳候補の生成
                                        ◆ 信頼度スコア算出
                                        ◆ 振り分け判定
                                           ├─ 高確度 ──────▶ freee自動登録
                                           ├─ 中低確度 ────────────────────▶ ◆ レビュー待ち
                                           └─ 除外 ───▶ 除外ログ
                                                                 ◆ 担当者確認
                                                                 ◆ 承認/修正/却下
                                        ◆ 承認結果の取得
                                        ◆ freee登録実行
                   ◆ 取引登録
                                        ◆ 帳簿チェック実行
                                        ◆ レポート生成
                                           ├─ 全件 ──▶ Excelレポート
                                           └─ 要確認 ─────────────────────▶ ◆ 確認事項表示
                                        ◆ 修正データ収集
                                        ◆ 辞書更新提案
```

### 3-2. 各システムの役割定義

#### freee（データの正本）
- 口座同期・明細取込（freee標準機能を最大活用）
- 自動登録ルール（freeeの学習済みルールを優先）
- 取引データの保管・管理（正本はfreee）
- 試算表・レポートの元データ提供
- ファイルボックス（証憑保管）

#### Claude Code（前処理・補助判断・連携ハブ）
- 書類の検知・転送・OCR補完
- 多様な入力フォーマットの標準化
- freeeで処理できなかった明細の仕訳候補生成
- 信頼度スコア算出と振り分け判定
- 帳簿チェック（異常検知・分析）
- Kintone ↔ freee の橋渡し
- 辞書・ルールの更新提案

#### Kintone（人間確認のハブ）
- 要確認案件の一覧・管理
- 担当者レビュー → 承認/修正/却下
- 上長確認フロー（プロセス管理）
- 修正内容の記録（学習データの蓄積）
- 確認業務の進捗管理

### 3-3. freeeファースト判定フロー

```
未処理明細
    │
    ▼
① freee自動登録ルールで処理可能か？
    ├─ YES → freeeが自動処理（Claude Code不要）
    └─ NO
        │
        ▼
② Claude Codeが仕訳候補を生成
    │
    ▼
③ 信頼度スコアで振り分け
    ├─ 高確度（75点以上）→ 自動登録候補
    │      └─ ※Phase 3まではKintone経由で確認
    ├─ 中確度（45〜74点）→ Kintone（若手レビュー一覧）
    ├─ 低確度（0〜44点）→ Kintone（経験者レビュー一覧）
    └─ 除外 → 除外ログに記録
```

---

## 4. データの流れ

### 4-1. 証憑→取引登録フロー

```
[証憑]                    [標準化]                [判定]              [確認]            [登録]

領収書/請求書 ─▶ Claude Vision ─▶ 標準明細JSON ─▶ 仕訳候補生成 ─┬─▶ 高確度 ─────▶ freee登録
                  OCR読取                          スコア算出     │
Excel経費精算 ─▶ excel-parser ──▶ 標準明細JSON ──────────┘      ├─▶ 中低確度 ──▶ Kintone
                                                                │     │
CSV/TSV ──────▶ csv-converter ─▶ 標準明細JSON ──────────────────┘     ▼
                                                                   人間確認
通帳画像 ────▶ Claude Vision ──▶ 標準明細JSON                        │
                                                                     ▼
                                                                  承認 ──▶ freee登録
                                                                  修正 ──▶ freee登録 + 学習
                                                                  却下 ──▶ 除外ログ
```

### 4-2. 標準明細フォーマット（JSON）

全ての入力ソースを以下の統一フォーマットに変換する:

```json
{
  "source": {
    "type": "excel|csv|image|gmail|drive|freee_unprocessed",
    "file_name": "元ファイル名",
    "file_path": "ファイルパス（あれば）",
    "processed_at": "2026-03-28T10:00:00+09:00"
  },
  "transaction": {
    "date": "2026-03-28",
    "amount": 10000,
    "amount_type": "tax_included|tax_excluded",
    "description": "摘要テキスト",
    "partner_name": "取引先名（推定含む）",
    "raw_text": "OCR/元データの生テキスト"
  },
  "classification": {
    "estimated_account": "外注費",
    "estimated_tax_class": "課税10%",
    "invoice_class": "適格",
    "confidence_score": 82,
    "confidence_rank": "High",
    "score_breakdown": {
      "keyword_match": 25,
      "past_pattern": 30,
      "amount_validity": 12,
      "tax_rule_clarity": 10,
      "description_quality": 5
    },
    "tax_flags": ["R08"],
    "special_flags": [],
    "routing": "auto_register|kintone_review|exclude",
    "routing_reason": "判定理由のテキスト"
  },
  "client": {
    "company_id": 474381,
    "client_name": "あしたの会計事務所税理士法人"
  }
}
```

### 4-3. 帳簿チェックフロー

```
[データ取得]           [チェック実行]              [出力]

freee試算表(BS) ──┐                             ┌─▶ Excelレポート（全件）
freee試算表(PL) ──┤                             │
freee取引データ ──┼─▶ 帳簿チェック32手続 ──────┼─▶ Kintone（要確認のみ）
freee固定資産台帳 ┤      │                      │
freee勘定科目 ────┘      ▼                      └─▶ ログ（処理記録）
                   🔴要対応 / 🟡要確認 / 🟢OK
```

### 4-4. 学習フィードバックフロー

```
[Kintone修正データ]              [分析]                    [改善]

修正科目 ──────┐                                         ┌─▶ 辞書更新提案
修正税区分 ────┼─▶ pattern-analyzer ─▶ 修正パターン ───┼─▶ ルール更新提案
修正理由 ──────┤      分析                               ├─▶ 除外キーワード追加
判定理由 ──────┘                                         └─▶ 精度レポート生成
                                                               │
                                                               ▼
                                                          人が確認して承認
                                                               │
                                                               ▼
                                                       辞書/ルールファイル更新
```

---

## 5. 判定設計（高確度/中低確度/除外）

### 5-1. 信頼度スコア（既存設計を継承・拡張）

5要素×重み付け → 100点満点（既存: `references/accounting/confidence-score-rules.md`）

| 要素 | 配点 | 説明 |
|------|------|------|
| キーワード辞書マッチ | 30pt | 摘要が勘定科目キーワード辞書にマッチ |
| 過去仕訳パターン一致 | 30pt | freeeの過去仕訳で同一取引先・類似摘要の実績 |
| 金額の妥当性 | 15pt | 科目別の通常金額レンジ内か |
| 消費税ルール明確さ | 15pt | R01〜R12で一意に判定できるか |
| 摘要の情報量 | 10pt | 取引先名・内容・数量等の情報充実度 |

### 5-2. 振り分けルール

| ランク | スコア | 処理 | 条件（追加） |
|--------|--------|------|-------------|
| **高確度** | 75〜100 | 自動登録候補 | 消費税指摘(R01〜R12)なし、特殊フラグなし、除外キーワードなし |
| **中確度** | 45〜74 | Kintone若手レビュー | 判定は出たがスコアが閾値未満 |
| **低確度** | 0〜44 | Kintone経験者レビュー | 判定困難、または消費税指摘あり |
| **除外** | — | 登録せず別管理 | 除外キーワードにマッチ、重複取引、対象外取引 |

**重要**: 高確度であっても、以下の場合は自動登録せずKintoneへ回す:
- 初回取引先（過去実績なし）
- 10万円以上の取引（固定資産化の可能性）
- 消費税指摘フラグが1つでもある
- 顧問先別例外ルールに該当

### 5-3. 判定理由の記録形式

全ての仕訳候補に以下の判定理由を付与する:

```json
{
  "routing": "kintone_review",
  "routing_reason": "中確度（スコア62点）: キーワード「AWS」が外注費・通信費の両方にマッチ（候補2つ）。過去仕訳で通信費の実績あり（2件）。",
  "score_detail": "キーワード15pt（候補2つ） + 過去パターン20pt（2件） + 金額12pt + 税ルール10pt + 情報量5pt = 62pt",
  "matched_rules": ["R08: リバースチャージの確認"],
  "matched_keywords": {
    "外注費": ["AWS"],
    "通信費": ["AWS"]
  },
  "past_patterns": [
    { "date": "2025-11-15", "account": "通信費", "amount": 5000 },
    { "date": "2025-10-15", "account": "通信費", "amount": 5000 }
  ]
}
```

### 5-4. 除外ルール

以下に該当する取引は「除外」として処理しない:

| 除外条件 | 例 |
|----------|-----|
| freee内部振替 | 口座間の振替、クレジットカード引落 |
| 重複取引 | 同日・同額・同摘要の取引が既に登録済み |
| 除外キーワード | 「振替」「相殺」「戻入」「取消」等 |
| 顧問先別除外 | 顧問先ごとに設定された除外ルール |

---

## 6. Kintoneアプリ設計

### 6-1. アプリ構成（3アプリ）

単一アプリでは取引レビュー・帳簿チェック・学習フィードバックが混在して見づらくなるため、
用途ごとに3アプリに分割する。

| # | アプリ名 | 用途 | 1レコード |
|---|---------|------|-----------|
| 1 | **仕訳レビュー** | 仕訳候補の確認・承認・修正 | 1取引（1仕訳候補） |
| 2 | **帳簿チェック** | 帳簿チェック結果の確認・対応 | 1指摘事項 |
| 3 | **学習フィードバック** | 辞書・ルール改善の管理 | 1改善提案 |

### 6-2. 仕訳レビューアプリ（詳細は `references/operations/kintone-review-app-spec.md`）

フィールド設計: 20フィールド（既存仕様を継承）

拡張フィールド（v2で追加検討）:

| # | フィールド名 | フィールドコード | 説明 |
|---|-------------|-----------------|------|
| 21 | 元データ種別 | source_type | excel/csv/image/freee_unprocessed |
| 22 | 証憑リンク | document_link | freeeファイルボックスのURL |
| 23 | 判定理由 | routing_reason | なぜこのルーティングになったかの説明 |
| 24 | スコア内訳 | score_detail | 5要素の得点内訳 |
| 25 | freee登録状態 | freee_status | 未登録/登録済み/登録エラー |
| 26 | freee取引ID | freee_deal_id_registered | 登録後のfreee取引ID |
| 27 | 上長確認 | manager_check | 未確認/確認済み |
| 28 | 学習反映要否 | need_learning | 要/不要/反映済み |

プロセス管理（ステータス遷移）:
```
未レビュー → レビュー中 → 承認済み → freee登録済み → 上長確認済み
                       → 修正済み → freee登録済み → 上長確認済み
                       → 却下
```

一覧（ビュー）:
1. **若手レビュー一覧**: High/Medium + 未レビュー（スコア降順）
2. **経験者レビュー一覧**: Low + 消費税指摘あり（優先表示）
3. **進捗管理一覧**: 顧問先別ステータス俯瞰
4. **freee登録待ち一覧**: 承認済み/修正済みでfreee未登録のもの
5. **上長確認一覧**: freee登録済みで上長未確認のもの

### 6-3. 帳簿チェックアプリ

| # | フィールド名 | フィールドコード | 説明 |
|---|-------------|-----------------|------|
| 1 | 顧問先名 | client_name | 対象の顧問先 |
| 2 | チェック日 | check_date | チェック実行日 |
| 3 | チェック種別 | check_type | 月次/決算前/面談前/スポット |
| 4 | 対象期間 | target_period | 例: 2025/10〜2026/03 |
| 5 | 重要度 | severity | 🔴要対応 / 🟡要確認 / 🔵参考 |
| 6 | 分野 | check_category | BS残高/PL変動/消費税/固定資産/人件費等 |
| 7 | 指摘内容 | finding_detail | 具体的な指摘テキスト |
| 8 | 関連勘定科目 | related_account | 指摘に関連する勘定科目 |
| 9 | 関連金額 | related_amount | 指摘に関連する金額 |
| 10 | 対応状況 | action_status | 未対応/対応中/対応済み/対応不要 |
| 11 | 対応内容 | action_detail | 担当者が記入する対応内容 |
| 12 | 担当者 | assignee | 対応担当者 |
| 13 | Excelレポートリンク | report_link | 詳細レポートのファイルパス |
| 14 | 備考 | notes | その他メモ |

### 6-4. 学習フィードバックアプリ

| # | フィールド名 | フィールドコード | 説明 |
|---|-------------|-----------------|------|
| 1 | 提案日 | proposed_date | 改善提案の生成日 |
| 2 | 改善種別 | improvement_type | 辞書追加/辞書修正/ルール追加/ルール修正/除外追加 |
| 3 | 対象辞書/ルール | target_file | 対象のファイルパス |
| 4 | 改善内容 | proposal_detail | 具体的な変更内容 |
| 5 | 根拠データ | evidence | 修正データ件数、パターン等 |
| 6 | 影響範囲 | impact_scope | この改善で影響を受ける取引の推定件数 |
| 7 | 承認状況 | approval_status | 提案中/承認/却下/反映済み |
| 8 | 承認者 | approver | 承認した担当者 |
| 9 | 反映日 | applied_date | 実際に反映した日 |

---

## 7. 辞書・ルール管理の方針

### 7-1. 辞書とルールの分離原則

| 区分 | 定義 | 配置先 | 例 |
|------|------|--------|-----|
| **辞書** | 「何と何が対応するか」のマッピング | `references/dictionaries/` | 「AWS → 通信費」 |
| **ルール** | 「どう判定するか」のロジック・閾値 | `references/rules/` | 「スコア75点以上なら自動登録」 |
| **知識** | 「なぜそう判断するか」の根拠 | `references/tax/`, `references/accounting/` | 「R08: リバースチャージ」 |

### 7-2. 辞書一覧

| 辞書名 | ファイル | 内容 | 更新頻度 |
|--------|---------|------|----------|
| 勘定科目キーワード辞書 | `dictionaries/account-keywords.md` | 摘要キーワード→勘定科目のマッピング | 月次（学習反映時） |
| 取引先辞書 | `dictionaries/partner-dictionary.md` | 取引先名→科目・税区分・インボイス情報 | 新規取引先発生時 |
| 税区分辞書 | `dictionaries/tax-class-dictionary.md` | 科目×条件→消費税区分のマッピング | 法改正時 |
| 書類種別辞書 | `dictionaries/document-type-dictionary.md` | ファイル名パターン→書類種別 | 必要時 |
| 除外キーワード辞書 | `dictionaries/exclusion-keywords.md` | 除外すべき摘要キーワード | 必要時 |

> **既存資産の移行**: 現在 `references/accounting/account-dictionary.md`（16科目）を
> `references/dictionaries/account-keywords.md` に移行・拡張する。

### 7-3. ルール一覧

| ルール名 | ファイル | 内容 | 更新頻度 |
|----------|---------|------|----------|
| 自動登録可否判定 | `rules/auto-register-rules.md` | 高確度でも自動登録しない条件 | Phase 3開始時 |
| 信頼度閾値 | `rules/confidence-threshold.md` | High/Medium/Low/除外の閾値定義 | 精度レポート分析時 |
| Kintone送信ルール | `rules/kintone-routing-rules.md` | どのビューに振り分けるか | 運用改善時 |
| 顧問先別例外 | `rules/client-exceptions/{name}.md` | 顧問先固有の判定例外 | 顧問先追加時 |
| 帳簿チェック | `rules/verify-checklist.md` | チェック項目と閾値 | 運用改善時 |

### 7-4. 辞書の段階的拡張方針

```
Phase 1: 既存の16科目辞書をそのまま使用
         ↓
Phase 2: 取引先辞書を新規作成（freee過去仕訳から自動生成）
         除外キーワード辞書を新規作成
         ↓
Phase 3: Kintone修正データから辞書更新提案を自動生成
         月次で精度レポートを出し、辞書を改善
         ↓
Phase 4: 顧問先別の辞書カスタマイズ
         書類種別辞書の高度化（OCR結果からの自動分類）
```

---

## 8. 開発フェーズと実装優先順位

### Phase 1: 帳簿チェック + Kintone出力（現在 → 1〜2ヶ月）

**目的**: 既存の最も完成度の高い機能を完成させ、実務投入する。

| タスク | 詳細 | 状態 |
|--------|------|------|
| freee APIデータ取得 | 3期分のBS/PL/取引データ取得 | ✅ 実装済み |
| 消費税区分チェック | R01〜R12 + 海外サービスチェック | ✅ 実装済み |
| 取引レベルチェック | 固定資産化、修繕費、外注費等 | ✅ 実装済み |
| 財務分析 | BS/PL 3期比較、月次推移 | ✅ 実装済み |
| Excelレポート出力 | チェック結果の全件レポート | ✅ 実装済み |
| **Kintoneレビューアプリ構築** | フィールド・ビュー・プロセス管理の設定 | 🔲 未着手 |
| **帳簿チェックアプリ構築** | 指摘事項の一覧管理アプリ | 🔲 未着手 |
| **Kintone連携スクリプト** | チェック結果の要確認事項をKintoneへ登録 | 🔲 未着手 |
| **@kintone/rest-api-client 導入** | npm install + kintone-client.js 作成 | 🔲 未着手 |

**Phase 1のゴール**:
- `/freee-auto-keiri` 実行 → Excelレポート + Kintone要確認事項が自動出力される
- 担当者がKintoneで要確認事項を確認・対応記録できる

### Phase 2: 証憑整理 + 明細標準化 + 候補提示（2〜4ヶ月）

**目的**: 入力の多様性に対応し、仕訳候補を提示できるようにする。

| タスク | 詳細 |
|--------|------|
| 書類種別分類 | Claude Visionで領収書/請求書/通帳等を判定 |
| OCR補完 | freee OCRで処理できない書類をClaude Visionで補完 |
| Excel経費精算パース | 顧問先別フォーマットに対応 |
| CSV/TSV変換 | 通帳CSV・カード明細等の標準化 |
| 仕訳候補生成 | 辞書＋ルール＋freee過去仕訳で候補を生成 |
| 信頼度スコア実装 | confidence-scorer.js の本実装 |
| Kintone仕訳レビュー連携 | 中低確度の候補をKintoneへ登録 |
| 取引先辞書の初期構築 | freee過去仕訳から自動生成 |

**Phase 2のゴール**:
- 証憑・明細から仕訳候補が自動生成され、Kintoneでレビューできる
- 高確度候補は「自動登録候補」としてフラグが付く（まだ自動登録はしない）

### Phase 3: 高確度の自動登録（4〜6ヶ月）

**目的**: 十分な実績データが溜まった段階で、高確度案件の自動登録を開始する。

| タスク | 詳細 |
|--------|------|
| 自動登録可否ルールの策定 | Phase 2の実績データから閾値を決定 |
| dry-run機能 | 自動登録候補の事前検証 |
| freee取引登録 | API経由での自動登録実装 |
| Kintone→freee反映 | 承認済み案件のfreee自動登録 |
| 登録結果の記録 | Kintoneにfreee登録状態を反映 |
| 上長確認フロー | 自動登録結果の上長確認プロセス |
| 学習フィードバック | 修正データの自動収集・分析開始 |
| 精度レポート | 月次精度レポートの自動生成 |

**Phase 3のゴール**:
- 高確度案件がfreeeに自動登録される
- 自動登録結果を上長がKintoneで確認できる
- 月次精度レポートで改善サイクルが回る

### Phase 4: 高度化（6ヶ月〜）

**目的**: 運用実績を元にシステム全体を最適化する。

| タスク | 詳細 |
|--------|------|
| OCR精度向上 | 書類種別ごとの専用パース |
| ファイルボックス連携強化 | 証憑と取引の自動紐づけ |
| スケジュール実行 | 定期チェック・定期取込の自動化 |
| 顧問先別カスタマイズ | 顧問先ごとの辞書・ルール分岐 |
| 辞書自動更新 | 学習提案の半自動反映 |
| マルチ顧問先対応 | 複数顧問先の一括処理 |

---

## 9. Phase 1 PoC構成案

### 9-1. 最小構成で安全にPoCする

Phase 1では **既存の帳簿チェック機能をKintone連携する** ことに集中する。
新規コードは最小限にし、既存の実績ある機能を活かす。

```
既存（そのまま使う）:
  ├── /freee-auto-keiri スキル（データ取得〜チェック〜レポート）
  ├── /monthly-verify スキル（Excelレポート生成）
  ├── references/ 配下の知識ベース
  └── data/ 配下の分析結果

新規開発（Phase 1で作るもの）:
  ├── src/shared/kintone-client.js      ← Kintone API クライアント
  ├── src/review/kintone-sender.js      ← チェック結果→Kintone登録
  └── Kintoneアプリ設定                 ← GUI上で手動設定
```

### 9-2. PoC実行フロー

```
Step 1: /freee-auto-keiri で帳簿チェック実行（既存）
    ↓
Step 2: 分析結果（analysis/*.json）が生成される（既存）
    ↓
Step 3: /monthly-verify でExcelレポート生成（既存）
    ↓
Step 4: kintone-sender.js が🔴🟡の指摘をKintoneに登録（新規）
    ↓
Step 5: 担当者がKintoneで確認・対応記録（Kintone GUI）
```

### 9-3. PoC時の安全策

| 安全策 | 内容 |
|--------|------|
| **freee書き込みなし** | Phase 1ではfreeeへの書き込みは一切行わない（読み取り専用） |
| **dry-run標準** | 全ての処理にdry-runオプションを用意 |
| **ログ全記録** | 処理結果をdata/配下にJSON保存 + logs/にテキストログ |
| **自社テスト** | まず自社（あしたの会計事務所）のデータでテスト |
| **手動実行のみ** | スケジュール実行はPhase 4まで導入しない |
| **Kintone読み書き確認** | まず1件手動登録→取得のテストから始める |

### 9-4. Phase 1 実装手順

```
1. @kintone/rest-api-client をインストール
2. .env に KINTONE_BASE_URL, KINTONE_API_TOKEN を設定
3. Kintoneで「帳簿チェック」アプリを手動作成（フィールド設定）
4. src/shared/kintone-client.js を実装（接続・認証）
5. テスト: 1件レコード登録→取得→更新
6. src/review/kintone-sender.js を実装（analysis/*.json → Kintoneレコード変換）
7. テスト: 自社データでチェック→Kintone登録の一気通貫テスト
8. 運用テスト: 実際の月次チェック業務で使用
```

---

## 補足: Claude Code の技術的制約と対策

| 制約 | 対策 |
|------|------|
| 常駐プロセスが作れない | スケジュール実行（cron/Scheduled Tasks）でポーリング |
| セッション間で状態を保持できない | ファイルベースの状態管理（data/, logs/） |
| リアルタイムイベント駆動ができない | 定期実行でメール/ドライブをチェック |
| MCPサーバーの同時接続数に制限がある | 処理をフェーズ分割し、必要なMCPのみ接続 |
| 長時間実行でタイムアウトの可能性 | バッチサイズを制限（1回50件等） |
| freee APIレートリミット（300回/5分） | 取得結果をローカルにキャッシュ、ページネーション制御 |

---

## 付録: 既存資産の整理マッピング

### 移行が必要なファイル

| 現在の場所 | 移行先 | 理由 |
|-----------|--------|------|
| `references/accounting/account-dictionary.md` | `references/dictionaries/account-keywords.md` にコピー・拡張 | 辞書とルールの分離 |
| `references/accounting/confidence-score-rules.md` | 内容を `references/rules/confidence-threshold.md` に統合 | ルール系に整理 |
| `_old_rules/` 配下 | 削除検討（referencesに移行済み） | 整理完了 |

### Notion→Kintone 移行状況

| 項目 | 状態 |
|------|------|
| CLAUDE.md の参照更新 | ✅ 完了 |
| kintone-review-app-spec.md 作成 | ✅ 完了 |
| source-document-intake/SKILL.md のNotion参照 | ✅ Kintoneに更新済み |
| confidence-score-rules.md のNotion参照 | ✅ Kintoneに更新済み |
| docs/architecture.md のNotion参照 | ✅ この v2 ドキュメントで置き換え |
