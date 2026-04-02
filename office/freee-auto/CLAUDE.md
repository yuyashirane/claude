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

| ステージ | フォルダ | 役割 |
|---------|---------|------|
| INPUT | `src/input/` | freee API・Excel・CSV・Gmail・Driveからデータ取り込み |
| NORMALIZE | `src/normalize/` | 全角→半角、日付正規化、StandardRow形式へ変換 |
| CLASSIFY | `src/classify/` | 勘定科目推定、消費税R01-R12判定、信頼度スコア、振り分け |
| REVIEW | `src/review/` | 中低確度→Kintone App①登録 |
| REGISTER | `src/register/` | 自動登録ルールCSV生成（freeeにインポートして消込付き登録）。High信頼度+安全→「取引を登録する」ルール（完全自動）、Medium信頼度→「取引を推測する」ルール（科目プリセット→ワンクリック確認）、Low/除外→CSVに含めずKintone App①で人間レビュー。deal-creator.jsは口座連携のない取引（現金等）用に残す |
| VERIFY | `src/verify/` | 4シートExcelレポート、帳簿チェック |
| LEARN | `src/learn/` | 修正→辞書改善（Phase 3） |

---

## Kintone構成（2アプリ）

freeeが正本。Kintoneは例外管理のみ。全件同期は行わない。

| アプリ | 用途 |
|--------|------|
| App① 未処理明細・証憑確認 | Claude Codeが処理できなかった明細 |
| App② 帳簿チェック指摘事項 | 🔴🟡フラグの指摘事項 |

顧客リストと `freee_company_id` でルックアップ連携。

---

## テスト事業所

あしたの会計事務所税理士法人（freee ID: 474381、9月決算）
`FREEE_ACCOUNT_IDS` は事業所固有。他社はAPI動的取得が必要。

---

## テスト: 132件通過（npm test）+ excel-csv-parser(21)

pipeline(50) + deal-creator(14) + report(9) + freee-links(5) + kintone-to-freee(17) + rule-csv-generator(37)

---

## 注意事項

- freee書き込みは必ずドライランから
- 消費税区分の最終判断は税理士
- 過去パターン(30pt)未実装 → 現在のスコア上限70pt、自動登録は実質未稼働
- 顧問先テストは自社アカウント(474381)のみ

---

## 詳細リファレンス

CLAUDE.mdには骨格のみ記載。詳細は以下を参照:

| 内容 | 参照先 |
|------|--------|
| 信頼度スコア（5要素・算出ロジック） | `references/accounting/confidence-score-rules.md` |
| 振り分けルール（閾値・条件） | `references/rules/routing-rules.md` |
| 自動登録の安全条件（8条件） | `references/rules/auto-register-safety.md` |
| 消費税区分ルール R01〜R12 | `references/tax/tax-classification-rules.md` |
| インボイス制度（5区分・少額特例） | `references/tax/invoice-rules.md` |
| 勘定科目キーワード辞書（22科目） | `references/dictionaries/account-keywords.md` |
| freee本番更新手順 | `references/operations/freee-update-procedure.md` |
| Kintone 2アプリ仕様 | `references/operations/kintone-app-spec.md` |
| 開発フェーズ・ロードマップ | `docs/development-roadmap.md` |
| 全体アーキテクチャ | `docs/architecture-v2.md` |
| フォルダ構成・命名規則 | `docs/folder-structure.md` |
| 自動登録ルールCSVフォーマット仕様 | `references/operations/freee-rule-csv-spec.md` |
| freee Webリンク生成 | `references/operations/freee-web-links.md` |
| freee Webリンク生成（コード） | `src/shared/freee-links.js` |
| Kintone承認→freee登録 | `src/register/kintone-to-freee.js` |
| 海外サービスDB | `src/shared/overseas-services.js` |
| 閾値・定数定義 | `src/shared/rules.js` |

### タグ・入力ルール
- `references/rules/input-general-rules.md` — 文字種・命名・法人格略称ルール
- `references/rules/partner-tag-rules.md` — 取引先タグの付与・命名ルール
- `references/rules/item-tag-rules.md` — 品目タグ一覧・付与ルール・自動判定キーワード
- `references/rules/department-memo-tag-rules.md` — 部門タグ・メモタグルール
- `references/rules/remarks-rules.md` — 備考欄の記載ルール・閾値

---

## コマンド

npm test                              # 全テスト（132件）
npm run freee:register                # 取引登録（DRY_RUN設定に従う）
npm run rule-csv                      # ルールCSV生成
node src/register/rule-csv-generator.js <result.json>  # ルールCSV生成（CLI直接）
npm run kintone:test                  # Kintone接続テスト
npm run report                        # 処理結果レポート生成
