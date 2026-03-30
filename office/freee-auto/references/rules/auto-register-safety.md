# 自動登録の安全条件

## 基本閾値

信頼度 **85点以上**（`.env CONFIDENCE_THRESHOLD_HIGH=85`）

## 85点以上でも自動登録しないケース

| # | 条件 | 理由 | 振り分け先 |
|---|------|------|-----------|
| 1 | 高額取引（10万円以上） | 固定資産化の可能性 | kintone_staff |
| 2 | 初出取引先（過去実績なし） | パターン未学習 | kintone_staff |
| 3 | インボイス判定が絡む | 適格/非適格の確認必要 | kintone_staff |
| 4 | 固定資産の可能性（20万以上の修繕・購入） | 資本的支出判定 | kintone_staff |
| 5 | 役員貸借・仮払仮受・交際費の論点 | 税務リスク | kintone_staff |
| 6 | 既存ルールと矛盾する分類 | 過去実績との不整合 | kintone_senior |
| 7 | 🔴 重要税務フラグ（R03給与課税、R10租税課税等） | 即修正が必要 | kintone_senior |
| 8 | 🟡 警告フラグ（R06軽減税率等） | 要確認 | kintone_staff |
| 9 | 勘定科目＝雑費 | 安易な分類を防止 | kintone_staff |

## freee本番更新の手順

→ `references/operations/freee-update-procedure.md` を参照

## 実装ファイル

- `src/classify/routing-decider.js` — decideRoute() 内で上記条件をチェック
