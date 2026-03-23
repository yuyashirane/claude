# freee自動仕訳プロジェクト

freee会計の未処理明細を自動判定し、信頼度スコア付きの仕訳候補を生成するシステム。
設計原則：**freeeファースト**（freeeネイティブ機能を最大限活用し、Claude Codeは補完役）。

## 技術スタック
- Node.js（freee MCP経由でAPIアクセス）
- Gmail MCP（添付ファイル検知）
- Google Drive MCP（書類フォルダ監視）
- Notion MCP（レビューダッシュボード連携）
- freee MCP（明細取得・仕訳登録・ファイルボックス操作）

## フォルダ構成
```
freee-auto/
├── CLAUDE.md              ← このファイル
├── src/
│   ├── input/             ← INPUT段階: 書類取込・変換
│   │   ├── gmail-watcher.js
│   │   ├── drive-watcher.js
│   │   ├── excel-parser.js
│   │   └── filebox-uploader.js
│   ├── classify/          ← CLASSIFY段階: 仕訳判定
│   │   ├── unprocessed-fetcher.js  ← freee未処理明細の取得
│   │   ├── tax-classifier.js       ← 消費税区分の判定
│   │   ├── account-matcher.js      ← 勘定科目のマッチング
│   │   ├── confidence-scorer.js    ← 信頼度スコア算出
│   │   └── invoice-checker.js      ← インボイス区分判定
│   ├── verify/            ← VERIFY段階: 月次チェック
│   │   ├── monthly-checker.js
│   │   └── report-generator.js
│   └── shared/            ← 共通ユーティリティ
│       ├── freee-client.js
│       ├── notion-client.js
│       └── logger.js
├── rules/                 ← 仕訳判定ルール（CLAUDE.mdから分離）
│   ├── tax-classification.md      ← 消費税区分ルール R01〜R12
│   ├── account-keywords.md        ← 勘定科目キーワード辞書（16科目）
│   └── invoice-rules.md           ← インボイス判定ルール
├── tests/                 ← テスト
├── logs/                  ← 処理ログ（.gitignore対象）
└── docs/                  ← 設計ドキュメント
    └── architecture.md    ← 業務フロー設計図の詳細版
```

## 消費税区分ルール（R01〜R12）

判定時は必ず `@rules/tax-classification.md` を参照すること。
以下は概要のみ（詳細はルールファイルに記載）：

| ID | ルール | 重要度 |
|----|--------|--------|
| R01 | 売上高が非課税・不課税になっていないか | 高 |
| R02 | 土地・住宅関連が課税になっていないか | 高 |
| R03 | 給与・法定福利費が課税になっていないか | 高 |
| R04 | 受取利息・配当金が課税になっていないか | 高 |
| R05 | 保険金・補助金が課税になっていないか | 高 |
| R06 | 軽減税率8%の適用漏れ（飲食料品・新聞） | 中 |
| R07 | 輸出免税の適用漏れ | 中 |
| R08 | リバースチャージの確認 | 中 |
| R09 | 支払利息・保険料が課税になっていないか | 中 |
| R10 | 租税公課が課税になっていないか | 中 |
| R11 | 通勤手当の課税仕入処理漏れ | 低 |
| R12 | 福利厚生費の課税/不課税の混在 | 低 |

## 信頼度スコア（Confidence Score）

5要素の重み付けで100点満点を算出：

| 要素 | 配点 | 説明 |
|------|------|------|
| キーワード辞書マッチ | 30pt | 摘要が `@rules/account-keywords.md` のキーワードにマッチ |
| 過去仕訳パターン一致 | 30pt | freeeの過去仕訳で同一取引先・類似摘要の実績あり |
| 金額の妥当性 | 15pt | 科目別の通常金額レンジ内か |
| 消費税ルール明確さ | 15pt | R01〜R12で一意に判定できるか |
| 摘要の情報量 | 10pt | 摘要に十分な情報（取引先名・内容・数量等）があるか |

**判定閾値**:
- **High（75点以上）**: 自動承認候補 → Notionに「承認待ち」で登録
- **Medium（45〜74点）**: 若手レビュー対象 → Notionの🌱若手ビューへ
- **Low（44点以下）**: 経験者レビュー対象 → Notionの💼経験者ビューへ

## インボイス制度対応

課税仕入の取引には必ずインボイス区分を付与する：
- **適格**: 取引先マスタで登録番号あり → 全額控除
- **非適格（経過措置80%）**: 2026/9/30まで → 80%控除
- **非適格（経過措置50%）**: 2029/9/30まで → 50%控除
- **不要**: 国外取引、3万円未満の公共交通機関等
- **要確認**: 上記で判定できない場合 → 人間レビューへ

## Notionレビューダッシュボード

- DB ID: 74d23a3c...（実際のIDに置き換える）
- 3ビュー構成:
  - 🌱 若手ビュー: High/Mediumをスコア降順
  - 💼 経験者ビュー: Low＋消費税指摘をカンバン
  - 📊 進捗管理: 顧問先別のAI精度率・未レビュー件数
- プロパティ（20項目）: 取引日、金額、摘要、推定勘定科目、推定消費税区分、信頼度スコア、信頼度ランク、インボイス区分、消費税指摘（R01〜R12）、レビューステータス、レビュー担当、修正科目、修正税区分、修正理由、顧問先名、freee明細ID、処理日時、承認者、承認日時、備考

## 開発の進め方（フェーズ）

### Phase 1（現在）: 土台構築
- [x] freee MCP接続・動作確認
- [ ] フォルダ構成の整備（このCLAUDE.mdの配置）
- [ ] rules/ 配下のルールファイル作成
- [ ] Notionレビューダッシュボードの構築

### Phase 2: CLASSIFY段階の実装
- [ ] unprocessed-fetcher.js: freee未処理明細の取得
- [ ] tax-classifier.js + account-matcher.js: 仕訳判定ロジック
- [ ] confidence-scorer.js: 信頼度スコア算出
- [ ] invoice-checker.js: インボイス区分判定
- [ ] Notion連携: 判定結果をレビューダッシュボードに登録

### Phase 3: INPUT段階の実装
- [ ] gmail-watcher.js: Gmail添付ファイル検知
- [ ] drive-watcher.js: Google Driveフォルダ監視
- [ ] excel-parser.js: Excel経費精算→明細変換
- [ ] filebox-uploader.js: freeeファイルボックスへアップロード

### Phase 4: VERIFY段階の実装
- [ ] monthly-checker.js: 月次チェック32手続の自動実行
- [ ] report-generator.js: チェックレポート生成

## コマンド
```bash
# 開発
npm run dev          # 開発サーバー起動
npm test             # テスト実行
npm run test:single  # 単一テスト実行

# freee操作（テスト用）
npm run freee:fetch  # 未処理明細の取得テスト
npm run freee:dry    # ドライラン（実際の登録はしない）

# Notion操作
npm run notion:sync  # Notionダッシュボードとの同期テスト
```

## 重要な注意事項
- freeeへの書き込み操作は必ず `--dry-run` オプション付きでテストしてから実行
- 消費税区分の最終判断は税理士が行う（AIはあくまで候補提示）
- 顧問先の実データでテストする場合は、自社アカウントのみ使用
- ルール変更時は必ず `rules/` 配下のファイルを更新し、CLAUDE.mdの概要も同期する
