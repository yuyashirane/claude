# ルーティングルール

## 方針

**大胆に登録 → 事後チェックで修正**

未処理明細の80%を「取引を登録する」で自動処理し、
科目・税区分の精度は VERIFYステージの事後チェックで担保する。

---

## CSV生成用ルーティング（routeForCsv）

`src/register/rule-csv-generator.js` の `routeForCsv()` が担当。

### 除外（CSVに含めない）

| 条件 | 理由 |
|------|------|
| `cls.excluded === true`（classificationステージ） | 口座間振替・金額0等 |
| 摘要に複合仕訳キーワードを含む | 給与・借入・社保等 → 単一行登録不可 |
| `Math.abs(amount) >= 100,000` | 固定資産判定が必要 |

→ 詳細は `references/rules/auto-register-safety.md` を参照

### 自動登録（「取引を登録する」+ 部分一致）

| 条件 | 備考 |
|------|------|
| `walletable_type` が `credit_card` または `wallet` | Amazon等含む |
| `bank_account` + `amount < 10,000` | 少額は全自動 |
| `bank_account` + `10,000 <= amount < 100,000` + `past_pattern >= 20` | 過去パターンあり |

### 推測（「取引を推測する」+ 完全一致）

| 条件 | 備考 |
|------|------|
| `bank_account` + `10,000 <= amount < 100,000` + `past_pattern < 20` | パターンなし |
| `walletable_type` 不明 | フォールバック |

### 取引内容（row[3]）の選定

| マッチ条件 | 使用する値 | 理由 |
|-----------|----------|------|
| 部分一致 | 取引先名（`partnerName`） | 安定したキーワードでルールを汎用化 |
| 部分一致（取引先名なし） | 摘要から変動要素（数字・日付）を除去した文字列 | 同上 |
| 完全一致 | 摘要原文 | 一回限りの推測なので精確に合わせる |

---

## Kintone送付用ルーティング（routing-decider.js）

`src/classify/routing-decider.js` の `decideRoute()` が担当。
CSVルーティングとは独立して動作する。

| ランク | スコア | 振り分け先 | 担当 |
|--------|--------|-----------|------|
| High | 75点以上 | 自動登録候補 | — |
| Medium | 45〜74点 | Kintone App① スタッフレビュー | 若手スタッフ |
| Low | 0〜44点 | Kintone App① シニアレビュー | 経験者 |
| Excluded | — | 除外ログ | — |

### 除外される明細のKintone送付

CSV除外された明細（複合仕訳・10万以上）は Kintone App① へ送付し、
スタッフ/シニアが手動で処理する。

---

## 実装ファイル

| ファイル | 役割 |
|---------|------|
| `src/register/rule-csv-generator.js` | CSV用ルーティング（routeForCsv） |
| `src/classify/routing-decider.js` | Kintone用ルーティング（decideRoute, routeAll） |
