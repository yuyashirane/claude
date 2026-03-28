# freee自動仕訳プロジェクト

freee会計における証憑整理・明細作成・取引登録・帳簿チェックの自動化支援システム。
人の判断を最小限にしながら、処理品質とスピードを上げることを目的とする。

## 設計原則

1. **freeeファースト** — freeeの標準機能で処理できるものはfreeeに任せる。Claude Codeは前処理・補助判断・チェック・連携ハブとして機能する
2. **人確認は必要最小限** — 高確度は自動処理、中低確度と例外のみ人が確認する
3. **Kintoneが確認フローの中心** — 要確認案件はKintoneに集約し、担当者確認→承認→freee反映→辞書改善の流れを作る
4. **説明可能な判定** — なぜその候補になったかを常に記録する
5. **安全性重視** — 候補提示・確認フロー・ログ保存を優先。自動登録は段階的に開放
6. **学習可能な構造** — 人の修正結果を辞書・ルール改善に反映し、精度を継続的に向上する

## 技術スタック

- Node.js（freee MCP経由でAPIアクセス）
- Gmail MCP（添付ファイル検知）
- Google Drive MCP（書類フォルダ監視）
- Kintone REST API / @kintone/rest-api-client（レビューアプリ連携）
- freee MCP（明細取得・仕訳登録・ファイルボックス操作）
- Claude Vision（OCR補完・書類種別判定）
- ExcelJS / openpyxl（レポート出力）

## パイプライン構成

```
INPUT → NORMALIZE → CLASSIFY → REVIEW → REGISTER → VERIFY → LEARN
書類取込  明細標準化   仕訳判定   人間確認   freee登録  帳簿チェック 学習改善
```

## フォルダ構成

```
freee-auto/
├── CLAUDE.md                 ← このファイル（プロジェクトの憲法）
├── .claude/skills/           ← スキル定義
│   ├── freee-auto-keiri/     ← 経理チェックスキル
│   ├── monthly-verify/       ← 月次レポート生成
│   ├── source-document-intake/ ← 証憑取込
│   ├── transaction-register/ ← 取引登録（Phase 3）
│   └── feedback-learn/       ← 学習改善（Phase 3）
├── src/
│   ├── input/                ← INPUT: 書類取込・転送
│   │   ├── gmail-watcher.js
│   │   ├── drive-watcher.js
│   │   ├── excel-parser.js
│   │   └── filebox-uploader.js
│   ├── normalize/            ← NORMALIZE: 明細標準化（Phase 2）
│   ├── classify/             ← CLASSIFY: 仕訳判定
│   │   ├── unprocessed-fetcher.js  ← freee未処理明細の取得
│   │   ├── tax-classifier.js       ← 消費税区分の判定
│   │   ├── account-matcher.js      ← 勘定科目のマッチング
│   │   ├── confidence-scorer.js    ← 信頼度スコア算出
│   │   └── invoice-checker.js      ← インボイス区分判定
│   ├── review/               ← REVIEW: Kintone連携（Phase 1）
│   ├── register/             ← REGISTER: freee登録（Phase 3）
│   ├── verify/               ← VERIFY: 帳簿チェック
│   │   ├── monthly-checker.js
│   │   └── report-generator.js
│   ├── learn/                ← LEARN: フィードバック（Phase 3）
│   └── shared/               ← 共通ユーティリティ
│       ├── freee-client.js
│       ├── kintone-client.js
│       ├── config-loader.js
│       ├── logger.js
│       └── error-handler.js
├── references/
│   ├── dictionaries/         ← 辞書（何と何が対応するか）
│   ├── rules/                ← ルール（どう判定するか）
│   │   ├── tax-classification.md      ← 消費税区分ルール R01〜R12
│   │   ├── account-keywords.md        ← 勘定科目キーワード辞書（16科目）
│   │   ├── confidence-score-rules.md  ← 信頼度スコア算出ルール
│   │   ├── invoice-rules.md           ← インボイス区分判定ルール
│   │   └── monthly-check-rules.md     ← 月次チェックルール
│   ├── tax/                  ← 税務知識（R01〜R12、インボイス）
│   ├── accounting/           ← 会計知識（科目辞書、チェックリスト）
│   ├── operations/           ← 運用仕様（Kintoneアプリ仕様等）
│   └── clients/              ← 顧問先別情報
├── data/                     ← 処理データ（{company_id}/{date}/）
├── reports/                  ← 出力レポート
├── templates/                ← テンプレート
├── tests/                    ← テスト
├── docs/                     ← 設計ドキュメント
│   └── architecture-v2.md    ← 全体アーキテクチャ設計書
├── logs/                     ← 処理ログ（.gitignore対象）
└── tmp/                      ← 一時ファイル（.gitignore対象）
```

### 辞書とルールの分離原則

- **辞書**（`references/dictionaries/`）: 「何と何が対応するか」のマッピング → 学習で育てる
- **ルール**（`references/rules/`）: 「どう判定するか」のロジック・閾値 → 運用で調整する
- **知識**（`references/tax/`, `references/accounting/`）: 「なぜそう判断するか」の根拠 → 法改正時に更新

## 消費税区分ルール（R01〜R12）

判定時は必ず `references/tax/tax-classification-rules.md` を参照すること。

| ID  | ルール                                 | 重要度 |
| --- | -------------------------------------- | ------ |
| R01 | 売上高が非課税・不課税になっていないか | 高     |
| R02 | 土地・住宅関連が課税になっていないか   | 高     |
| R03 | 給与・法定福利費が課税になっていないか | 高     |
| R04 | 受取利息・配当金が課税になっていないか | 高     |
| R05 | 保険金・補助金が課税になっていないか   | 高     |
| R06 | 軽減税率8%の適用漏れ（飲食料品・新聞） | 中     |
| R07 | 輸出免税の適用漏れ                     | 中     |
| R08 | リバースチャージの確認                 | 中     |
| R09 | 支払利息・保険料が課税になっていないか | 中     |
| R10 | 租税公課が課税になっていないか         | 中     |
| R11 | 通勤手当の課税仕入処理漏れ             | 低     |
| R12 | 福利厚生費の課税/不課税の混在          | 低     |

## 信頼度スコア（Confidence Score）

5要素の重み付けで100点満点を算出（詳細: `references/accounting/confidence-score-rules.md`）:

| 要素                 | 配点 | 説明                                               |
| -------------------- | ---- | -------------------------------------------------- |
| キーワード辞書マッチ | 30pt | 摘要が勘定科目キーワード辞書にマッチ               |
| 過去仕訳パターン一致 | 30pt | freeeの過去仕訳で同一取引先・類似摘要の実績あり    |
| 金額の妥当性         | 15pt | 科目別の通常金額レンジ内か                         |
| 消費税ルール明確さ   | 15pt | R01〜R12で一意に判定できるか                       |
| 摘要の情報量         | 10pt | 摘要に十分な情報（取引先名・内容・数量等）があるか |

**振り分けルール**:

- **高確度（75点以上）**: 自動登録候補（Phase 3まではKintone経由で確認）
- **中確度（45〜74点）**: Kintone若手レビュー一覧へ
- **低確度（0〜44点）**: Kintone経験者レビュー一覧へ
- **除外**: 登録せず除外ログに記録（内部振替、重複、除外キーワード該当）

高確度でも以下の場合はKintoneへ回す:

- 初回取引先（過去実績なし）
- 10万円以上（固定資産化の可能性）
- 消費税指摘フラグあり
- 顧問先別例外ルールに該当

## インボイス制度対応

課税仕入の取引には必ずインボイス区分を付与する:

- **適格**: 取引先マスタで登録番号あり → 全額控除
- **非適格（経過措置80%）**: 2026/9/30まで → 80%控除
- **非適格（経過措置50%）**: 2029/9/30まで → 50%控除
- **不要**: 国外取引、3万円未満の公共交通機関等
- **要確認**: 上記で判定できない場合 → 人間レビューへ

## Kintoneアプリ構成（3アプリ）

| アプリ                 | 用途                       | 詳細仕様                                           |
| ---------------------- | -------------------------- | -------------------------------------------------- |
| **仕訳レビュー**       | 仕訳候補の確認・承認・修正 | `references/operations/kintone-review-app-spec.md` |
| **帳簿チェック**       | 帳簿チェック指摘事項の管理 | `docs/architecture-v2.md` §6-3                     |
| **学習フィードバック** | 辞書・ルール改善提案の管理 | `docs/architecture-v2.md` §6-4                     |

接続情報:

- サブドメイン: （事務所のサブドメイン）.cybozu.com
- APIトークン: 環境変数 `KINTONE_API_TOKEN` に設定
- クライアント: `src/shared/kintone-client.js`

## 開発フェーズ

### Phase 1（現在）: 明細→取引登録

- [x] freee MCP接続・動作確認
- [x] @kintone/rest-api-client 導入
- [x] Kintone連携基盤（kintone-client.js, kintone-sender.js）
- [ ] 明細標準化（Excel/CSV/スプレッドシート→標準フォーマット変換）
- [ ] 仕訳候補生成（勘定科目・税区分の推定 + 信頼度スコア）
- [ ] freee CSV取込 or API登録（高確度→自動、中低確度→Kintone）
- [ ] Kintone仕訳レビューアプリ構築
- [ ] Kintone承認→freee登録フロー

### Phase 2: freee帳簿チェック + Kintone出力

- [x] freee APIデータ取得（3期分BS/PL/取引）
- [x] 消費税区分チェック（R01〜R12 + 海外サービス）
- [x] 取引レベルチェック（固定資産化、修繕費等）
- [x] 財務分析（BS/PL 3期比較、月次推移）
- [x] Excelレポート出力
- [ ] Kintone帳簿チェックアプリ構築
- [ ] チェック結果の要確認事項をKintoneへ登録
- [ ] 定期実行 / 個別実行の切り替え対応

### Phase 3: 証憑整理

- [ ] 画像/PDF読み取り（Claude Vision OCR）
- [ ] 書類種別の分類（領収書/請求書/通帳等）
- [ ] ファイル名変更・フォルダ振り分け
- [ ] OCRテキスト抽出→標準フォーマット変換

### Phase 4: 証憑→取引登録 + 高度化

- [ ] 領収書・請求書からの仕訳候補生成
- [ ] freeeファイルボックスへのアップロード
- [ ] freee OCR補完（Claude Vision）
- [ ] 不確実なものはKintone確認へ
- [ ] 学習フィードバック（修正データ収集・分析・辞書更新提案）
- [ ] スケジュール実行・顧問先別カスタマイズ

## コマンド

```bash
# 開発
npm run dev          # 開発サーバー起動

# freee操作
npm run freee:fetch    # 未処理明細の取得テスト
npm run freee:dry      # ドライラン（実際の登録はしない）

# Kintone操作
npm run kintone:sync   # Kintoneレビューアプリとの同期テスト

# テスト
npm test               # テスト実行
npm run test:single    # 単一テスト実行

```

## 重要な注意事項

- freeeへの書き込み操作は必ず `--dry-run` オプション付きでテストしてから実行
- 消費税区分の最終判断は税理士が行う（AIはあくまで候補提示）
- 顧問先の実データでテストする場合は、自社アカウントのみ使用
- 辞書変更時は `references/dictionaries/` を更新
- ルール変更時は `references/rules/` を更新
- 全体設計の詳細は `docs/architecture-v2.md` を参照

## 参照ファイル

### 設計ドキュメント

- `docs/architecture-v2.md` — 全体アーキテクチャ設計書（9項目）

### 税務知識

- `references/tax/tax-classification-rules.md` — 消費税区分ルール R01〜R12
- `references/tax/invoice-rules.md` — インボイス判定ルール

### 会計知識

- `references/accounting/account-dictionary.md` — 勘定科目キーワード辞書（16科目）
- `references/accounting/confidence-score-rules.md` — 信頼度スコア算出ルール
- `references/accounting/finance-analyzer.md` — 財務分析ルール
- `references/accounting/monthly-check-rules.md` — 記帳チェックリスト（15分野）

### 運用仕様

- `references/operations/kintone-review-app-spec.md` — Kintone仕訳レビューアプリ仕様

### 共通モジュール

- `src/shared/overseas-services.js` — 海外サービスデータベース
- `src/shared/period-utils.js` — 期間計算ユーティリティ
- `src/shared/rules.js` — 勘定科目チェックルール定義
