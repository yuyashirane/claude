# VERIFY ステージ設計書 v3

作成日: 2026-04-02（v1初版）
更新日: 2026-04-04（v2.1: TC/WT/AT追加 + report-config分離 + スキル定義）
更新日: 2026-04-07（**v3: PL月次推移バグ修正 + 総勘定元帳リンク統一 + freee-verify-monthlyスキル + 実務投入完了 + 改善ロードマップ**）
対象プロジェクト: freee-auto（`C:\Users\yuya_\claude\office\freee-auto\`）
前提: REGISTERパラダイムシフト完了、「大胆に登録 → 事後チェックで修正」方針

---

## v3 での主な変更点

| 変更 | 概要 |
|------|------|
| ★ PL月次推移バグ修正 | 19個の集計行が `accounts["undefined"]` に上書きされる問題を解消 |
| ★ PL_SECTIONS 定義 | 決算書フォーマット階層構造（売上高→売上原価→売上総利益→販管費→営業利益→...） |
| ★ 総勘定元帳リンクに統一 | 仕訳帳リンク（`/journals?...`）を廃止し、全リンクを `/general_ledgers/show?...` に統一 |
| ★ URL仕様の確定 | パラメータは `name`, `start_date`, `end_date`, `fiscal_year_id` の4つのみ |
| ★ fiscal_year_id 動的取得 | `monthly-data-fetcher.js` で会社・対象月から動的取得 |
| ★ URL長制限対応 | Excel HYPERLINK 255文字制限を考慮、最長科目で235文字（余裕20文字） |
| ★ freee-verify-monthly スキル | 旧 monthly-verify を `_archive/` に退避、新スキルを配置 |
| ★ 実務投入完了 | 2026-04-07 に2月決算11社の一括チェックを完走 |
| ★ 改善ロードマップ | 11社チェックで判明した改善テーマを Phase 6 として追加 |

---

## 1. VERIFYステージの位置づけ

### パイプライン全体像

```
INPUT → NORMALIZE → CLASSIFY → REVIEW → REGISTER → VERIFY → LEARN
                                                      ✅実務投入  次フェーズ
```

### なぜVERIFYが生命線か

「大胆登録方針」により、除外条件を2つ（複合仕訳・10万円以上）に絞り、それ以外は積極的に自動登録する。
この方針は登録率84.6%という成果を生んだが、誤登録リスクを事後チェックで担保する必要がある。

VERIFYの役割:
- 自動登録された取引の品質保証（科目・税区分・取引先の正しさ）
- 帳簿全体の整合性チェック（月次チェックリスト F-1〜HC-4 の自動実行）
- 異常・例外の早期発見と人への適切なエスカレーション
- **決算前レビューの効率化**（v3 実証: 11社チェックを2時間以内で完走）

### 既存資産との関係

| 既存モジュール | 状態 | VERIFYでの位置づけ |
|---------------|------|-------------------|
| `src/verify/processing-report.js` | ✅ 稼働中 | パイプライン処理結果レポート（4シートExcel）。そのまま活用 |
| `src/verify/generate-audit-report.js` | ✅ 残存（B案） | monthly-checker.js に機能的に置き換え済み |
| `references/accounting/monthly-check-rules.md` | ✅ 整備済 | 15分野のチェック知識ベース |
| `references/accounting/finance-analyzer.md` | ✅ 整備済 | 財務分析・異常値検出の知識ベース |
| Kintone App②（ID:448） | ✅ 稼働中 | 指摘事項の送付先 |

---

## 2. VERIFY の2つのモード

### モード A: パイプライン直後チェック（post-register-checker） ✅ 実装済み

**タイミング**: REGISTER完了直後に自動実行
**対象**: 今回のパイプライン実行で登録/推測された取引
**目的**: 登録直後の品質チェック（科目・税区分・タグの妥当性）
**チェック数**: 22チェック（A-01〜N-02）

### モード B: 月次帳簿チェック（monthly-checker） ✅ 実装済み・実務投入完了

**タイミング**: 月次・決算前に手動実行
**対象**: 対象月の全取引、BS/PL残高、過去比較
**目的**: 帳簿全体の整合性・異常値・税務リスクの検出
**チェック数**: 70チェック（17モジュール）
**起動方法**:
1. 自然言語: スタッフが「○○の○月の帳簿チェックして」（freee-verify-monthly スキルが発動）
2. CLI直接: `node src/verify/monthly-checker.js --company-name "○○" --month YYYY-MM --no-dry-run`

---

## 3. モードA: パイプライン直後チェック ✅ 実装済み

（v2から変更なし。詳細は v2 を参照）

### 3.1 ファイル構成

```
src/verify/post-register-checker/
├── account-checker.js      A-01〜A-07
├── tax-checker.js          T-01〜T-05
├── tag-checker.js          G-01〜G-04
├── amount-checker.js       N-01〜N-02
├── partner-checker.js      P-01〜P-04
└── index.js                オーケストレーター
```

### 3.2 Finding 型

```typescript
type Finding = {
  checkCode: string;       // 'A-01', 'CD-02', 'BA-01' 等
  category: string;        // 'データ品質', '残高異常' 等
  severity: '🔴' | '🟡' | '🔵';
  description: string;     // 指摘内容
  currentValue?: string;   // 現在の値
  suggestedValue?: string; // 推奨値
  freeeLink?: string;      // freeeへのリンク
  details?: Detail[];      // 子行展開用（オプション）
};
```

---

## 4. モードB: 月次帳簿チェック ✅ 実装済み

### 4.1 ファイル構成（実装完了状態）

```
src/verify/
├── monthly-checker.js                    # オーケストレーター（CLI実行エントリ）
├── monthly-data-fetcher.js               # freee-MCP データ取得 + fiscal_year_id 取得
├── monthly-report-generator.js           # Excelレポート生成（951行）
├── report-config/                        # スタイル・ラベル・リンク設定
│   ├── styles.js                         # 87行
│   ├── labels.js                         # 198行
│   └── link-mappings.js                  # 133行
└── monthly-checks/                       # 17モジュール
    ├── trial-helpers.js                  # 共通ヘルパー
    ├── data-quality.js                   # DQ-01〜03
    ├── cash-deposit.js                   # CD-01〜04
    ├── balance-anomaly.js                # BA-01〜05
    ├── period-allocation.js              # PA-01〜08
    ├── extraordinary-tax.js              # ET-01〜07
    ├── loan-lease.js                     # LL-01〜03
    ├── officer-loan.js                   # OL-01〜04
    ├── fixed-asset.js                    # FA-01〜03
    ├── rent.js                           # RT-01〜03
    ├── payroll.js                        # PY-01〜04
    ├── outsource.js                      # OS-01〜02
    ├── revenue-receivable.js             # RR-01〜03
    ├── purchase-payable.js               # PP-01〜04
    ├── tax-classification.js             # TC-01〜08
    ├── withholding-tax.js                # WT-01〜06
    └── advance-tax-payment.js            # AT-01〜03
```

### 4.2 monthly-checker.js（オーケストレーター）

実行コマンド:
```bash
# 顧問先名で実行
node src/verify/monthly-checker.js --company-name "あしたの会計事務所" --month 2026-03 --no-dry-run

# company ID で実行
node src/verify/monthly-checker.js --company 474381 --month 2026-03 --no-dry-run
```

CLIフラグ:
- `--no-dry-run`: 本番モード（Excelレポート生成 + Kintone送付）
- `--dry-run`（デフォルト）: 確認モード、ファイル生成なし

処理フロー:
1. company-resolver で会社ID解決（local → Kintone → freee-MCP → 自動登録）
2. monthly-data-fetcher で freee API からデータ取得 + キャッシュ
3. 17モジュールのチェック実行
4. monthly-report-generator で Excel 生成
5. 結果サマリー表示

### 4.3 freee-MCPデータ取得仕様（v3更新）

`monthly-data-fetcher.js` が取得・キャッシュするデータ:

```
{
  trialBs,              // 試算表BS（対象月）
  trialBsByItem,        // 試算表BS（品目別）
  trialBsByPartner,     // 試算表BS（取引先別）
  trialPl,              // 試算表PL（対象月、YTD累計）
  trialPlByPartner,     // 試算表PL（取引先別）
  deals,                // 取引一覧（最大500件）
  walletTxns,           // 明細一覧（最大100件）
  accountItems,         // 勘定科目マスタ
  partners,             // 取引先マスタ
  prevMonth,            // 前月データ（比較用）
  prevYearMonth,        // 前年同月データ（比較用）
  historicalBs,         // 過去最大5期分のBS（動的start_date判定用）
  fiscalYearId,         // ★v3追加: 対象月が属する会計年度のID
  fiscalYear,           // 会計年度（年）
  fiscalStartMonth,     // 期首月
}
```

キャッシュパス: `data/{companyId}/monthly/{targetMonth}/monthly-data.json`
TTL: 24時間

### 4.4 各チェックモジュールの仕様

（17モジュールの詳細は v2 を参照。v3では仕様変更なし）

---

## 5. freeeリンク生成システム ★v3で大幅改訂

### 5.1 リンク先の統一（v3変更）

**v2まで**: 仕訳帳リンクと総勘定元帳リンクを使い分け
**v3以降**: **すべて総勘定元帳リンクに統一**

理由:
- 実務観点で、決算レビューでは「該当科目の元帳を見たい」というニーズが圧倒的に多い
- リンク先が直接元帳になっていれば1クリック減る
- URL長の管理が単純化される（仕訳帳URLは長い）

| 指摘の種類 | リンク先 | URL形式 |
|-----------|---------|---------|
| 残高（科目）単位 | 総勘定元帳 | `/reports/general_ledgers/show?name=...&start_date=...&end_date=...&fiscal_year_id=...` |
| 取引（仕訳）単位 | 取引詳細 | `/deals/edit/...` または `walletTxnLink` 等 |

### 5.2 総勘定元帳URL仕様（v3確定）

**確定形式**:
```
https://secure.freee.co.jp/reports/general_ledgers/show
  ?name={URLエンコード済科目名}
  &start_date=YYYY-MM-DD
  &end_date=YYYY-MM-DD
  &fiscal_year_id={会計年度ID}
```

**必須パラメータ（4つのみ）**:
- `name`: URLエンコード済の勘定科目名（フィルター必須）
- `start_date`: 期間開始日（YYYY-MM-DD）
- `end_date`: 期間終了日（YYYY-MM-DD）
- `fiscal_year_id`: 会計年度ID（**会社・期ごとに異なる、動的取得必須**）

**禁止パラメータ**:
- `adjustment` — 期間指定を無効化するため絶対に付与しない
- `page`, `per_page`, `order_by`, `direction` — freeeデフォルトで代替可能、URL長節約のため省略
- `account_item_id` — `name` と機能重複
- `fiscal_year` — `fiscal_year_id` と機能重複
- `source_type`, `gl_summation_method`, `straddled_fiscal_year` — freeeが自動判定

**重要な制約**:
- freeeの総勘定元帳は **1会計年度内の日付しか指定できない**（年度をまたぐとエラー）
- `fiscal_year_id` は **会社ごと・期ごとに異なる**（過去期にアクセスするには過去期のIDが必要）
- `name` を省略するとフィルターが効かず、全科目が表示される

### 5.3 URL長制限の考慮

**Excel HYPERLINK 関数のURL引数には255文字の制限**がある。これを超えると `#VALUE!` エラー。

**最長想定の科目名で計算**:
- 「法人税・住民税及び事業税」（URLエンコード後 108文字）
- URL全体: **235文字**（255制限まで余裕20文字）

**潜在リスク**:
- `fiscal_year_id` が9桁になった場合 +1文字
- もっと長い科目名（例: 「貸倒引当金繰入額（販売費及び一般管理費）」）の存在
- freeeの仕様変更で別パラメータ追加の可能性

**対策**:
- URL長チェックの単体テストを必須化（`tests/test-freee-links.js` に追加済み）
- 250文字超過時は警告
- 将来的には ExcelJS のセルハイパーリンク属性方式（HYPERLINK関数を使わない）への切り替えを検討

### 5.4 動的 start_date 判定（determineLinkStartDate）

残高の推移状況に応じて、リンクの検索開始日を動的に決定する。

```
当期: opening ≠ closing → 当期首
当期: opening === closing → 過去期のBSを遡って探索
  前期: opening ≠ closing → 前期首
  前期: opening === closing → さらに前の期を確認
    → 最大5期前まで遡る
    → 5期遡っても不変 or データなし → 最も古い取得可能期の期首
```

過去期BSデータ: `fetchHistoricalBs()` で最大5期分を一括取得
キャッシュ: `data/{companyId}/monthly/{targetMonth}/historical-bs.json`

**v3注意点**: 過去期にアクセスする場合、その期の `fiscal_year_id` が必要。
当期データ取得時に historical_fiscal_year_ids も一緒に取得しておくこと。

### 5.5 共通関数（src/shared/freee-links.js）

```
FREEE_BASE                    — 'https://secure.freee.co.jp'
generalLedgerLink()           — 総勘定元帳リンク（v3でメイン関数）
walletTxnLink()               — 口座明細リンク
receiptLink()                 — 証憑リンク
dealLink()                    — 取引リンク
buildBalanceLink()            — 残高系指摘の最適リンク自動選択
determineLinkStartDate()      — 動的start_date判定
formatFiscalStartDate()       — 期首日フォーマット
```

**v3で削除/廃止された関数**:
- `journalsByAccountLink()` — 仕訳帳リンクは使用しないため
- `journalDealLink()` — 同上
- `TAX_CODE_TO_URL_PARAMS`, `generalLedgerLinkWithTaxFilter()` — 一旦削除（必要なら将来再追加）

### 5.6 generalLedgerLink() 関数仕様

```javascript
/**
 * freee総勘定元帳リンクを生成する
 * @param {object} params
 * @param {string} params.accountName - 勘定科目名（URLエンコード前）
 * @param {string} params.startDate - 開始日（YYYY-MM-DD）
 * @param {string} params.endDate - 終了日（YYYY-MM-DD）
 * @param {string} params.fiscalYearId - 会計年度ID
 * @returns {string} URL文字列
 */
function generalLedgerLink({ accountName, startDate, endDate, fiscalYearId }) {
  const params = new URLSearchParams({
    name: accountName,
    start_date: startDate,
    end_date: endDate,
    fiscal_year_id: fiscalYearId,
  });
  return `https://secure.freee.co.jp/reports/general_ledgers/show?${params}`;
}
```

**重要**: パラメータは上記4つのみ。良かれと思って `adjustment`, `source_type` 等を追加しないこと。
（v3開発時に `adjustment=all` を独自追加して期間指定が無効化されるバグが発生した教訓）

---

## 6. Excelレポート仕様 ✅ 実装済み

### 出力先

`reports/{companyId}/{事業所名}_帳簿チェック_{targetMonth}_{timestamp}.xlsx`

### 実装構成

```
src/verify/
├── monthly-report-generator.js     951行（シート生成ロジック本体）
└── report-config/
    ├── styles.js                   87行 — COLORS, FONTS, BORDER_THIN, 重要度ソート順
    ├── labels.js                   198行 — CATEGORY_LABELS, CATEGORY_ORDER, CHECK_GROUPS, CHECK_CODE_LABELS
    └── link-mappings.js            133行 — CODE_TO_ACCOUNT, inferFreeeLink, getMonthRange
```

### デザイン基準

源泉チェックレポートをベンチマーク。クライアント提出可能なクオリティ。
- ヘッダー色: `FF2F5496`（紺色）、白文字
- フォント: Meiryo UI 10pt
- 数値: #,##0（3桁区切り）
- 長文セル: wrapText有効

### シート構成（11シート）

#### シート1: サマリーダッシュボード
- タイトル、対象月、チェック実行日
- 重要度別件数（🔴🟡🔵）
- カテゴリ別内訳テーブル

#### シート2: 指摘一覧
- 列: 重要度 / コード / カテゴリ / 指摘内容 / 現在の値 / 推奨値 / freeeリンク
- ソート: 🔴→🟡→🔵
- autoFilter、フリーズ A2
- details子行展開対応

#### シート3〜8: カテゴリ別指摘シート（6グループ）
- 消費税区分チェック（TC系）
- 源泉所得税チェック（WT系）
- 予定納税チェック（AT系）
- BS残高指摘
- PL・期間配分チェック
- データ品質・その他

#### シート9: BS残高チェック
- 全BS科目の残高一覧
- マイナス残高に薄赤背景ハイライト
- 元帳リンク付き

#### シート10: PL月次推移 ★v3で大幅改訂

**v2の問題**:
- 19個の集計行（売上総損益金額、営業損益金額等）が `account_item_id` を持たないため、すべて `accounts["undefined"]` に上書きされていた
- 結果として、売上高の下に「科目名空欄、売上高と同じ数値」の行が8行も並ぶ表示バグが発生

**v3の修正**:
- `monthly-data-fetcher.js`: 集計行を `__summary__${category}` キーで格納
- `monthly-report-generator.js`: PL_SECTIONS 定義に基づく構造化PL表示

**PL_SECTIONS 構造**:
```
売上高                 ← 集計行（太字+背景色）
  仕入高               ← 明細（インデント、残高ある月のみ表示）
売上原価 計            ← 集計行
売上総利益             ← 小計行（太字+薄緑背景）
  役員報酬             ← 明細
  給料手当             ← 明細
  ...（販管費明細）
販売管理費 計          ← 小計行
営業利益               ← 小計行
  受取利息             ← 営業外収益明細
  雑収入               ← 営業外収益明細
営業外収益 計          ← 集計行
  支払利息             ← 営業外費用明細
営業外費用 計          ← 集計行
経常利益               ← 小計行
特別利益 計            ← 集計行
特別損失 計            ← 集計行
税引前当期純利益       ← 小計行
  法人税・住民税及び事業税 ← 明細
法人税等 計            ← 集計行
当期純利益             ← 最終行
```

- 列: 科目名 / 期首月 / ... / 対象月 / 累計（SUM式）/ 元帳リンク
- 各月の金額セル: その月の総勘定元帳リンクを HYPERLINK 関数で埋め込み
- 全月ゼロの明細科目はスキップ（行数削減）
- 集計行は背景色 + 太字で視覚的に階層化

#### シート11: 取引先別残高
- 列: 科目名 / 取引先名 / 残高 / 滞留判定
- 滞留セルに黄色背景

---

## 7. Kintone App② 送付仕様

（v2から変更なし）

---

## 8. 異常値検出の基準

（v2から変更なし）

---

## 8b. スキル定義 ★v3で更新

### 現役スキル

#### freee-verify-monthly.md ★v3で新規配置

**配置パス**: `.claude/skills/freee-verify-monthly.md`
**役割**: 月次・決算帳簿チェック＋Excelレポート生成（メインスキル）

**発動条件**:
- 「○○（顧問先名）のチェックをして」「○○の帳簿見て」
- 「月次チェック」「決算レビュー」「記帳チェック」
- 「○月決算の会社をチェックして」（複数社一括）
- 「レポートを作って」「Excelで出して」（帳簿関連の文脈で）

**実行フロー**:
1. 必要情報の確認（顧問先名 + 対象月）
2. 事業所IDの解決
   - data/company-map.json 部分一致検索
   - Kintone顧客カルテ（App 206）検索
   - freee-MCP `freee_list_companies` または `freee_api_get` で全事業所取得
   - **`name` 空欄の場合は `display_name` フィールドも検索**（v3で判明した重要ポイント）
   - 解決したら Kintone書き込み + company-map.json追加
3. monthly-checker.js 実行
4. 結果サマリー報告
5. フォローアップ対応（深掘り、カテゴリ別表示など）

**複数社一括対応**: バッチ実行 + 全社サマリー

### 退避済みスキル

#### `_archive/monthly-verify/SKILL.md` ★v3で退避

旧設計（Python + openpyxl + freee-auto-keiri 前提）。
現在の monthly-checker.js + monthly-report-generator.js には関与していないため `_archive/` に退避。

### 整理対象スキル

#### monthly-check-execution.md

freee-verify-monthly と役割重複しているため、次フェーズで退避予定。

---

## 9. 実装状態（2026-04-07時点）

### Phase 1: モードA ✅ 完了

22チェック実装済み。

### Phase 2: モードB ✅ 完了

17モジュール・70チェックコード実装済み。

### Phase 3: Excelレポート ✅ 完了

11シート構成。report-config分離済み。**v3でPL月次推移バグ修正完了**。

### Phase 4: CLI・スキル拡張 ✅ 完了

- `--company-name` オプション
- freee-verify-monthly スキル配置（v3）
- monthly-verify 旧スキル退避（v3）

### Phase 5: 実務投入 ✅ 完了 ★v3で達成

**実施日**: 2026-04-07
**実施内容**: 2月決算11社の一括帳簿チェック

**実施結果**:

| # | 顧問先名 | freee ID | 🔴 | 🟡 | 🔵 | 合計 |
|---|---------|---------|-----|-----|-----|------|
| 1 | 株式会社SOHA | 10019752 | 2 | 24 | 13 | 39 |
| 2 | リーグソリューションズ | 1359780 | 3 | 26 | 10 | 39 |
| 3 | 株式会社A-Life | 11251782 | 4 | 12 | 10 | 26 |
| 4 | 株式会社ALIVE | 1813536 | 1 | 31 | 8 | 40 |
| 5 | 合同会社CEI | 3698909 | 2 | 53 | 12 | 67 |
| 6 | 株式会社輝陽 | 1062190 | 5 | 25 | 7 | 37 |
| 7 | 株式会社RenK'z | 1390875 | 5 | 33 | 7 | 45 |
| 8 | 株式会社ファンドネクスト | 952466 | 3 | 33 | 9 | 45 |
| 9 | ゼタル株式会社 | 1417172 | 2 | 12 | 13 | 27 |
| 10 | キャラクターアニメーションスタジオ | 10938380 | 1 | 3 | 0 | 4 |
| 11 | ハッピーアドバンス合同会社 | 11461332 | 1 | 12 | 8 | 21 |
| **合計** | | | **29** | **264** | **97** | **390** |

⚠️ キャラクターアニメーションスタジオは7月決算で2月は期中。Kintone情報の精査が必要。

**実証された運用品質**:
- 自然言語指示でのスキル発動 ✅
- 未知会社の自動ID解決 ✅
- 想定外問題への自力対処 ✅（freee `name` 空欄問題）
- 税法根拠付きの実務分析 ✅
- 業種別の傾向把握 ✅

### Phase 6: 改善フェーズ（次フェーズ）★v3で新規追加

11社チェックで判明した改善テーマ。優先度高い順:

#### 6-1. メッセージ重複・画一化問題

**症状**: 全11社で同じメッセージが出ているケースがあり、各社の個別状況が見えにくい

**具体例1: 未処理明細100件問題**
- 11/11社で「未処理の明細が 100 件残っています」と表示
- すべて100件ぴったりなのは、freee API取得上限（500件/月）のキャップの可能性
- 真の未処理件数が分からない

**改善方針**:
- API取得上限を撤廃 or 拡大
- 真の件数を取得できない場合は「100件以上」と明示
- 件数だけでなく、未処理明細の内訳（科目別、金額帯別）も表示

**具体例2: 法定福利費率の異常**
- 異常に高い社（30〜57%）と異常に低い社（5〜10%）が混在
- 同じメッセージで出ているが原因と対処が真逆

**改善方針**:
- 高い場合: 「二重計上、退職金混入の可能性 → 計上内訳の確認」
- 低い場合: 「社保未加入、計上漏れ → 給与計算の確認」

#### 6-2. 重複指摘の整理

複数のチェッカーが同じ事象を別コードで指摘するケース:

| 事象 | 関連コード |
|------|-----------|
| 未払金（白根裕也）マイナス | OL-04 + BA-01 |
| PayPay銀行マイナス | CD-02 + BA-01 |
| 役員借入金マイナス（実質貸付金） | LL-01 + BA-01 |

**改善方針**:
- 同一事象を1つの指摘にまとめる
- または「グループ化」して表示
- カテゴリ別シートとサマリー件数の整合性を保つルール明確化

#### 6-3. company-resolver.js の display_name 検索恒久対応

**現状**: freee API の `freee_list_companies` ツールが `name` フィールドしか返さない場合がある。
SOHA社、A-Life社等で発生し、Claude Codeが自力で `freee_api_get` → 全フィールド検索 → display_name で発見、という対処をしている。

**改善方針**:
- `company-resolver.js` 自体に display_name 検索ロジックを実装
- Claude Codeが毎回自力解決する必要をなくす

#### 6-4. 業種別カスタマイズ

11社チェックで判明した業種別傾向:

| 業種カテゴリ | 該当社例 | 特有の注意点 |
|------------|---------|------------|
| IT/コンテンツ系 | CEI, リーグ, SOHA, ファンドネクスト | 売掛金滞留・外注費変動・海外サービス税区分 |
| サービス/飲食系 | RenK'z, ALIVE, ゼタル | 現金管理・仮払金滞留・売上税区分混在 |
| 新設法人 | A-Life, ハッピーアドバンス | 記帳の遅れ・基礎科目設定 |

**改善方針**:
- 業種マスタをKintone顧客カルテと連動
- 業種別のチェック項目重み付け
- 業種特有の指摘メッセージ

#### 6-5. 決算月の自動整合性チェック

**問題**: ユーザー認識と freee 設定の決算月にズレがある場合がある（キャラクターアニメーションスタジオ社で発生）

**改善方針**:
- バッチ実行前にKintone決算月とfreee決算月の整合性チェック
- 不整合があればユーザーに警告

#### 6-6. URL長の余裕確保（将来対策）

**現状**: 法人税科目で235文字（255制限まで余裕20文字）

**潜在リスク**: `fiscal_year_id` 9桁化、より長い科目名、仕様変更

**改善方針**:
- 250文字超過時の代替手段（ExcelJSセルハイパーリンク属性方式）の準備
- 長すぎる科目名の事前検知メカニズム

#### 6-7. monthly-check-execution.md の整理

freee-verify-monthly と役割重複しているスキルの退避。

---

## 9b. 全社共通課題（事務所運営レベル）★v3で新規追加

11社チェック結果から、事務所全体で取り組むべき共通課題が3つ見えた:

### 課題A: 未処理明細問題（11/11社）

全社が100件上限に達している状態。月次の登録作業が滞っているか、API側の取得制限の問題かの切り分けが必要。

### 課題B: 法定福利費率の標準化

11社中7社で異常値（高すぎor低すぎ）。事務所内で計上ルールが標準化されていない可能性。

### 課題C: 自社（あしたの会計事務所）への支払の源泉徴収

10/11社で同じ指摘。事務所側の請求書フォーマットや処理プロセスの問題の可能性。

---

## 10. テスト状態（v3更新）

### npm test（323件＋）

| テストファイル | 件数 |
|--------------|------|
| test-pipeline.js | 50 |
| test-deal-creator.js | 14 |
| test-processing-report.js | 9 |
| test-freee-links.js | 42+ ★v3でURL長チェック追加 |
| test-kintone-to-freee.js | 17 |
| test-rule-csv-generator.js | 53 |
| test-post-register-checker.js | 49 |
| test-monthly-checker.js | 65 |
| test-monthly-report.js | 24 |

### 個別実行（93件）

| テストファイル | 件数 |
|--------------|------|
| test-balance-anomaly.js | 32 |
| test-report-details.js | 7 |
| test-period-allocation.js | 20 |
| test-withholding-tax.js | 24 |
| test-tax-classification.js | 29 |
| test-advance-tax-payment.js | 17 |

### 合計: 416件以上

---

## 11. 設計上の原則

### 既存コード変更ゼロの原則

- 新規チェックモジュールは全て新規ファイル
- monthly-checker.js への変更は require + findings.push の追加のみ

### DRY_RUN原則

- `--dry-run` でKintone送付・レポート生成をスキップ
- `--no-dry-run` で本番実行
- CLIデフォルトは dryRun=true

### テスト保護

- 新規モジュール追加時は最低10件/モジュールのテスト
- npm test で全テスト通過を必ず確認

### details パターン

- Finding に `details` 配列を含める
- details が undefined / 空配列 → 後方互換動作
- details は最大10件、超過時は金額降順で上位10件 + 「他X件」

### freeeリンクのガイドライン ★v3で更新

- **すべて総勘定元帳リンク（generalLedgerLink）を使用**（v3）
- 仕訳帳リンク（journalDealLink、journalsByAccountLink）は使用しない（v3）
- パラメータは `name`, `start_date`, `end_date`, `fiscal_year_id` の4つのみ
- **「良かれと思って」追加パラメータを足さない**（v3 教訓: adjustment=all バグ）
- URL長は250文字以下を厳守（255制限への余裕5文字）

### 後退なし原則 ★v3で追加

- 既存の正常動作部分を壊さない
- 大きな変更前に必ず影響分析
- 各フェーズを確認してから次へ進む

### 実物確認の徹底 ★v3で追加

- 数字が良くても、実際にExcelを開いてリンクをクリックして確認
- 机上の理論より実際にfreeeを触っての検証

### 指示書に明記したパラメータのみ使用 ★v3で追加

- Claude Codeへの指示書では、使用すべきパラメータを明示的に列挙
- 「良かれと思って」追加するのを防ぐ

---

## 付録A: チェックコード一覧（92チェックコード）

（v2と同じ。詳細はv2を参照）

---

## 付録B: company-map.json 状態（2026-04-07時点）

主な登録会社（v3で追加分含む）:

| ID | 会社名 |
|----|--------|
| 474381 | あしたの会計事務所税理士法人 |
| 2422271 | 無限テック合同会社 |
| 10019752 | 株式会社SOHA |
| 1359780 | リーグソリューションズ株式会社 |
| 11251782 | 株式会社A-Life |
| 1813536 | 株式会社ALIVE |
| 3698909 | 合同会社CEI |
| 1062190 | 株式会社輝陽 |
| 1390875 | 株式会社RenK'z |
| 952466 | 株式会社ファンドネクスト |
| 1417172 | ゼタル株式会社 |
| 10938380 | キャラクターアニメーションスタジオ株式会社 |
| 11461332 | ハッピーアドバンス合同会社 |

---

## 付録C: v3 開発の教訓

このバージョンの開発を通じて確立された重要な教訓:

### C-1. 表面的な「動いている」を信用しない

PL月次推移のバグは、Excelを開けば一目瞭然だったが、テストが通っていたため見過ごされていた。実際にレポートを目視確認することの重要性。

### C-2. 「指示書に明記したパラメータのみ」の徹底

Claude Codeに freee リンク変更を依頼した際、独自判断で `adjustment=all` を追加したことで期間指定が無効化されるバグが発生。指示書では使用すべきパラメータを明示的に列挙し、「良かれと思って追加しない」ことを明示する必要がある。

### C-3. 実務感覚の優先

「name= パラメータを削除すれば短くなる」という机上の解決策は、実務的には「勘定科目フィルターが効かなくなる」という致命的な問題を生む。実際に freee を触って検証することが不可欠。

### C-4. ID系パラメータの動的取得

`fiscal_year_id` のような会社・期ごとに異なる ID は、ハードコードや手動管理ではなく、データ取得時に動的に取得する仕組みが必要。

### C-5. 段階的アプローチと停止ポイント

修正指示書には Step 3 や Step 4 で必ず「ユーザー確認の停止ポイント」を設けること。原因調査 → 方針提案 → ユーザー承認 → 実装、の流れを守る。

### C-6. 横断分析の価値

11社まとめてチェックすることで、「全社共通課題」「業種別傾向」が見えてきた。これは個別チェックでは得られない洞察。

---

**v3 完。次フェーズ（Phase 6: 改善活動）に進みます。**
