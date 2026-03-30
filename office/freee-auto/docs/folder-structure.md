# フォルダ構成

freee-auto/
├── CLAUDE.md                         ← プロジェクトの憲法（骨格のみ）
├── .env.example                      ← 環境変数テンプレート
├── package.json
│
├── .claude/skills/                   ← スキル定義（Claude Codeの実行手順書）
│   ├── freee-auto-keiri/SKILL.md     ← 経理チェックスキル
│   ├── monthly-verify/SKILL.md       ← 月次レポート生成
│   ├── source-document-intake/SKILL.md ← 証憑取込
│   ├── transaction-register/SKILL.md ← 取引登録パイプライン
│   └── feedback-learn/SKILL.md       ← 学習改善（Phase 3）
│
├── src/
│   ├── input/                        ← INPUT: 外部データの取り込み（入口）
│   │   ├── save-api-data.js          ← freee APIデータの保存・読込
│   │   ├── excel-reader.js           ← Excelファイル読み込み → 生データ配列
│   │   ├── csv-reader.js             ← CSVファイル読み込み → 生データ配列
│   │   ├── gmail-watcher.js          ← Gmail添付ファイル検知（Phase 4）
│   │   ├── drive-watcher.js          ← Google Drive監視（Phase 4）
│   │   └── filebox-uploader.js       ← freeeファイルボックス連携（Phase 4）
│   │
│   ├── normalize/                    ← NORMALIZE: 生データの標準化（整形）
│   │   └── format-standardizer.js    ← 全角→半角、日付正規化、StandardRow変換
│   │
│   ├── classify/                     ← CLASSIFY: 仕訳判定
│   │   ├── account-matcher.js        ← 勘定科目マッチング + 消費税判定 + 信頼度スコア
│   │   ├── routing-decider.js        ← 振り分けロジック
│   │   ├── unprocessed-processor.js  ← パイプライン統合
│   │   │   ※ 将来の分割予定（account-matcher.js が大きくなった場合）:
│   │   │   ├── tax-classifier.js     ← 消費税区分判定を分離
│   │   │   ├── confidence-scorer.js  ← 信頼度スコア算出を分離
│   │   │   └── invoice-checker.js    ← インボイス区分判定を分離
│   │
│   ├── review/                       ← REVIEW: Kintone連携
│   │   └── kintone-sender.js         ← App①レビュー項目・App②チェック指摘送信
│   │
│   ├── register/                     ← REGISTER: freee登録
│   │   └── deal-creator.js           ← 取引登録（ドライラン/本番）
│   │
│   ├── verify/                       ← VERIFY: 帳簿チェック・レポート
│   │   ├── processing-report.js      ← 処理結果4シートExcelレポート
│   │   └── generate-audit-report.js  ← 帳簿チェックレポート
│   │
│   ├── learn/                        ← LEARN: 学習改善（Phase 3）
│   │
│   └── shared/                       ← 共通ユーティリティ
│       ├── kintone-client.js         ← Kintone REST APIラッパー
│       ├── overseas-services.js      ← 海外サービスDB（23サービス）
│       ├── rules.js                  ← 閾値・キーワード定義
│       └── period-utils.js           ← 期間計算
│
├── references/                       ← 知識・ルール（判断材料）
│   ├── dictionaries/                 ← 辞書: 「何と何が対応するか」（学習で育てる）
│   │   ├── account-keywords.md       ← 勘定科目キーワード辞書
│   │   └── partner-dictionary.md     ← 取引先辞書（Phase 3）
│   ├── tax/                          ← 税務知識: 「なぜそう判断するか」（法改正時更新）
│   │   ├── tax-classification-rules.md ← 消費税区分ルール R01〜R12
│   │   └── invoice-rules.md          ← インボイス判定ルール
│   ├── accounting/                   ← 会計知識
│   │   ├── account-dictionary.md     ← 勘定科目辞書
│   │   ├── confidence-score-rules.md ← 信頼度スコア算出ルール
│   │   ├── finance-analyzer.md       ← 財務分析ルール
│   │   └── monthly-check-rules.md    ← 記帳チェックリスト
│   ├── rules/                        ← ルール: 「どう判定するか」（運用で調整）
│   │   ├── routing-rules.md          ← 振り分けルール
│   │   ├── auto-register-safety.md   ← 自動登録の安全条件
│   │   └── client-exceptions/        ← 顧問先別例外ルール
│   ├── operations/                   ← 運用仕様
│   │   ├── kintone-app-spec.md       ← Kintone 2アプリ仕様
│   │   ├── freee-update-procedure.md ← freee本番更新手順
│   │   └── freee-web-links.md        ← freee Webリンク生成
│   └── clients/                      ← 顧問先別情報
│
├── tests/                            ← テスト（94件）
├── data/                             ← 処理データ（{company_id}/{date}/）
├── reports/                          ← 出力レポート
├── templates/                        ← テンプレート
├── docs/                             ← 設計ドキュメント
│   ├── architecture-v2.md            ← 全体アーキテクチャ設計書
│   ├── development-roadmap.md        ← 開発フェーズ・ロードマップ
│   └── folder-structure.md           ← このフォルダ構成（自己参照）
├── logs/                             ← 処理ログ（.gitignore対象）
└── tmp/                              ← 一時ファイル（.gitignore対象）

## 辞書とルールの分離原則

- **辞書**（references/dictionaries/）: 「何と何が対応するか」→ 学習で育てる
- **ルール**（references/rules/）: 「どう判定するか」→ 運用で調整する
- **知識**（references/tax/, references/accounting/）: 「なぜそう判断するか」→ 法改正時に更新

## 命名規則

| 対象 | ルール | 例 |
|------|--------|-----|
| ファイル名 | kebab-case | account-matcher.js |
| 関数名 | camelCase | classifyTransaction() |
| 定数 | UPPER_SNAKE_CASE | FREEE_ACCOUNT_IDS |
| フォルダ名 | kebab-case | freee-auto |
| Kintoneフィールドコード | snake_case | confidence_score |
