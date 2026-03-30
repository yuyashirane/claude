# 振り分けルール

## 信頼度スコアによる振り分け

| ランク | スコア | 振り分け先 | 担当 |
|--------|--------|-----------|------|
| High | 85点以上 | 自動登録候補 | — |
| Medium | 45〜84点 | Kintone App① スタッフレビュー | 若手スタッフ |
| Low | 0〜44点 | Kintone App① シニアレビュー | 経験者 |
| Excluded | — | 除外ログ | — |

閾値は `.env CONFIDENCE_THRESHOLD_HIGH=85` で設定。

## 除外条件（Excludedに振り分け）

以下に該当する明細は仕訳判定せず除外ログに記録:

- freee自動登録ルールでマッチ済み（rule_matched=true / status=2）
- 除外キーワード該当: 振替, 振込, 相殺, 戻入, 取消, キャンセル, 口座間, 立替, 預り, 仮受, 仮払, 資金移動
- 金額0円

## Highでも自動登録しないケース

→ `references/rules/auto-register-safety.md` を参照

## 実装ファイル

- `src/classify/routing-decider.js` — decideRoute(), routeAll()
