# freee-auto: 経理業務自動化システム

あしたの会計事務所の経理業務を自動化するシステム。
freee会計の未処理明細を取得し、勘定科目・消費税区分を推定、信頼度に応じて自動登録またはKintone経由で人間レビューに回す。

---

## 設計原則

1. **freeeファースト** — freeeの標準機能で処理できるものはfreeeに任せる
2. **ドライラン標準** — freee書き込みは `DRY_RUN=true` がデフォルト
3. **人確認は必要最小限** — 高確度は自動、中低確度と例外のみ人が確認
4. **説明可能な判定** — スコア内訳・マッチKW・適用ルールを常に記録
5. **安全性重視** — 候補提示→確認→ログ保存。自動登録は段階的に開放
6. **学習可能な構造** — 修正結果を辞書・ルールに反映し精度を向上

---

## 技術スタック

Node.js（CommonJS）/ ExcelJS / @kintone/rest-api-client / iconv-lite / dotenv
freee MCP / Gmail MCP（Phase 4）/ Google Drive MCP（Phase 4）

---

## パイプライン

    INPUT → NORMALIZE → CLASSIFY → REVIEW → REGISTER → VERIFY → LEARN

| ステージ  | フォルダ         | 役割                                                                                                                                                                                                                                                                                                               |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INPUT     | `src/input/`     | freee API・Excel・CSV・Gmail・Driveからデータ取り込み                                                                                                                                                                                                                                                              |
| NORMALIZE | `src/normalize/` | 全角→半角、日付正規化、StandardRow形式へ変換                                                                                                                                                                                                                                                                       |
| CLASSIFY  | `src/classify/`  | 勘定科目推定、消費税R01-R12判定、信頼度スコア、振り分け                                                                                                                                                                                                                                                            |
| REVIEW    | `src/review/`    | 中低確度→Kintone App①登録                                                                                                                                                                                                                                                                                          |
| REGISTER  | `src/register/`  | 自動登録ルールCSV生成（freeeにインポートして消込付き登録）。High信頼度+安全→「取引を登録する」ルール（完全自動）、Medium信頼度→「取引を推測する」ルール（科目プリセット→ワンクリック確認）、Low/除外→CSVに含めずKintone App①で人間レビュー。deal-creator.jsは口座連携のない取引（現金等）用に残す                  |
| VERIFY    | `src/verify/`    | 11シートExcelレポート（66チェック）、帳簿チェック（15モジュール）。post-register-checker（モードA: パイプライン直後5チェッカー22項目）+ monthly-checker（モードB: 月次15モジュール66チェック）。Excelレポートはサマリーダッシュボード・指摘一覧・カテゴリ別6シート・BS残高・PL月次推移・取引先別残高の11シート構成 |
| LEARN     | `src/learn/`     | 修正→辞書改善（Phase 3）                                                                                                                                                                                                                                                                                           |

---

## Kintone構成（2アプリ）

freeeが正本。Kintoneは例外管理のみ。全件同期は行わない。

| アプリ                    | 用途                              |
| ------------------------- | --------------------------------- |
| App① 未処理明細・証憑確認 | Claude Codeが処理できなかった明細 |
| App② 帳簿チェック指摘事項 | 🔴🟡フラグの指摘事項              |

顧客リストと `freee_company_id` でルックアップ連携。

---

## テスト事業所

あしたの会計事務所税理士法人（freee ID: 474381、10月決算）
テスト用: 無限テック合同会社（freee ID: 2422271、11月決算）
`FREEE_ACCOUNT_IDS` は事業所固有。他社はAPI動的取得が必要。

---

## テスト: 314件通過（npm test）+ 83件（個別実行）= 397件

pipeline(50) + deal-creator(14) + report(9) + freee-links(33) + kintone-to-freee(17) + rule-csv-generator(53) + post-register-checker(49) + monthly-checker(65) + monthly-report(24) = 314件（npm test）
balance-anomaly(32) + report-details(7) + period-allocation(20) + withholding-tax(24) = 83件（個別実行）

---

## 注意事項

- freee書き込みは必ずドライランから
- 消費税区分の最終判断は税理士
- 過去パターン(30pt)未実装 → 現在のスコア上限70pt、自動登録は実質未稼働
- 顧問先テストは自社アカウント(474381)のみ
- freee API の deals.partner_name は全件undefined。取引先名の取得には必ず `resolvePartnerName(deal, partners)` （`src/verify/monthly-checks/trial-helpers.js`）を使用すること
- 月次チェックモジュール追加時は `CHECK_CODE_LABELS`（`src/verify/monthly-report-generator.js`）にも追加必須

---

## 詳細リファレンス

CLAUDE.mdには骨格のみ記載。詳細は以下を参照:

| 内容                                | 参照先                                            |
| ----------------------------------- | ------------------------------------------------- |
| 信頼度スコア（5要素・算出ロジック） | `references/accounting/confidence-score-rules.md` |
| 振り分けルール（閾値・条件）        | `references/rules/routing-rules.md`               |
| 自動登録の安全条件（8条件）         | `references/rules/auto-register-safety.md`        |
| 消費税区分ルール R01〜R12           | `references/tax/tax-classification-rules.md`      |
| インボイス制度（5区分・少額特例）   | `references/tax/invoice-rules.md`                 |
| 勘定科目キーワード辞書（22科目）    | `references/dictionaries/account-keywords.md`     |
| freee本番更新手順                   | `references/operations/freee-update-procedure.md` |
| Kintone 2アプリ仕様                 | `references/operations/kintone-app-spec.md`       |
| 開発フェーズ・ロードマップ          | `docs/development-roadmap.md`                     |
| 全体アーキテクチャ                  | `docs/architecture-v2.md`                         |
| フォルダ構成・命名規則              | `docs/folder-structure.md`                        |
| 自動登録ルールCSVフォーマット仕様   | `references/operations/freee-rule-csv-spec.md`    |
| freee Webリンク生成                 | `references/operations/freee-web-links.md`        |
| freee Webリンク生成（コード）       | `src/shared/freee-links.js`                       |
| Kintone承認→freee登録               | `src/register/kintone-to-freee.js`                |
| 海外サービスDB                      | `src/shared/overseas-services.js`                 |
| 閾値・定数定義                      | `src/shared/rules.js`                             |
| freee API 連携ガイドライン          | `docs/freee-api-guide.md`                         |
| 修正系タスク指示書テンプレート      | `docs/instruction-template.md`                    |

### タグ・入力ルール

- `references/rules/input-general-rules.md` — 文字種・命名・法人格略称ルール
- `references/rules/partner-tag-rules.md` — 取引先タグの付与・命名ルール
- `references/rules/item-tag-rules.md` — 品目タグ一覧・付与ルール・自動判定キーワード
- `references/rules/department-memo-tag-rules.md` — 部門タグ・メモタグルール
- `references/rules/remarks-rules.md` — 備考欄の記載ルール・閾値

---

## スキル

| スキル                   | 用途                                              |
| ------------------------ | ------------------------------------------------- |
| `freee-verify-monthly`   | 月次帳簿チェック・Excelレポート生成（現行）       |
| `freee-auto-keiri`       | freee経理チェック（分類・登録パイプライン）       |
| `transaction-register`   | 未処理明細→取引登録                               |
| `source-document-intake` | 証憑書類取込（Gmail/Drive→freeeファイルボックス） |

注記: `.claude/skills/_archive/monthly-verify/` は古い設計（Python前提）のスキルで現在は未使用。現在の帳簿チェックは `freee-verify-monthly` スキルを使用。

---

## コマンド

npm test # 全テスト（314件）
npm run freee:register # 取引登録（DRY_RUN設定に従う）
npm run rule-csv # ルールCSV生成
node src/register/rule-csv-generator.js <result.json> # ルールCSV生成（CLI直接）
npm run kintone:test # Kintone接続テスト
npm run report # 処理結果レポート生成
node src/verify/monthly-checker.js --company 474381 --month 2026-03 --no-dry-run # 月次チェック実行

## 重要な参照ドキュメント

新しいタスクを開始する前に、関連するドキュメントを必ず読んでください。

| ドキュメント                                 | 読むべきタイミング               |
| -------------------------------------------- | -------------------------------- |
| docs/verify-stage-design-v3.md               | Verifyステージの修正・改善時     |
| docs/freee-api-guide.md                      | freee API/freee-MCP を使う時     |
| docs/instruction-template.md                 | 修正系タスクの指示書を作成する時 |
| references/accounting/monthly-check-rules.md | 月次チェックロジックの修正時     |
| references/accounting/finance-analyzer.md    | 財務分析ロジックの修正時         |

---

## 開発ガイドライン（Claude Code 行動規範）

以下の8つのガイドラインは、すべてのタスクで遵守すること。
詳細な失敗事例・コードサンプルは `docs/freee-api-guide.md` および `docs/instruction-template.md` を参照。

### GL1: パラメータの厳格な使用

- 指示書または既存コードに明示されていないパラメータを「良かれと思って」追加してはいけない
- API リクエスト、URL クエリ、関数引数、設定オブジェクトで特に注意
- 追加が必要だと判断した場合は、実装前にユーザーに提案する

### GL2: 修正後の実物確認の徹底

- テスト通過 ≠ 動作OK。生成物（Excel/PDF/HTML）は必ず開いて目視確認する
- ハイパーリンクは少なくとも2-3個実際にクリックして動作確認
- ユーザーへの動作確認依頼時は、確認すべき具体的なポイントを明示する

### GL3: 制約の事前調査

- 新しい機能を実装する前に、プラットフォーム・ライブラリ・APIの制約を必ず事前調査する
- 主要な制約: Excel HYPERLINK URL 255文字、freee APIレート制限、Kintone 100レコード/リクエスト等
- エッジケース（最長文字列、最大件数、特殊文字）を想定して設計する

### GL4: 段階的アプローチと停止ポイント

大きな変更は以下の手順で進める:

1. **現状調査** — 該当ファイル・影響範囲・制約を確認
2. **修正方針の提案** — 複数案のメリデメ提示 → **ここでユーザー確認**
3. **実装** — 承認された方針で実装
4. **検証** — 全テスト + 実物確認 + エッジケース
5. **報告** — 修正内容・テスト結果・残る懸念点

### GL5: 既存挙動を変える場合のリスク評価（後退なし原則）

- 修正前に既存テストを全実行しベースライン把握
- 修正後に同じテストが全件通過することを確認
- 共通関数を修正する場合は呼び出し元すべてを確認
- テスト期待値を変えたら、それは仕様変更（ユーザーに確認）

### GL6: ユーザーへの動作確認依頼は具体的に

- 確認手順を番号付きで明示
- 期待される結果を具体的に記述
- 失敗時の報告フォーマットを指示
- 「確認してください」だけでは不可

### GL7: API レスポンスの構造を信用しない

- 新しいAPIエンドポイントを使う前に、実際のレスポンス全文を確認する
- null/undefined/空文字列の可能性を必ず考慮
- 複数サンプル（複数会社・複数月）でレスポンス構造を確認
- 既知の罠は `docs/freee-api-guide.md` に記録する

### GL8: 複雑な修正は「指示書」を経由する

- 大きな修正はいきなり実装に入らず、指示書を作成する
- テンプレート: `docs/instruction-template.md`
- 指示書に書かれていないことは「良かれと思って」やらない
