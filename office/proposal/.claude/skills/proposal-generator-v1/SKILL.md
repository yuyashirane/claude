---
name: proposal-generator-v1
description: "【v1】税務顧問サービスの提案書（.docx）を自動生成するスキル（v1版）。v2移行後のフォールバック用。「v1で提案書」「v1で生成」で発動する。"
---

# 提案書自動生成スキル

顧客情報（config.json）と料金表（pricing-table-v1.json）をもとに、
税務顧問サービスの提案書（.docx）を自動生成する。

## 前提条件
- 顧客設定ファイル（config_xxx.json）が references/pricing/ にあること
- 料金表（pricing-table-v1.json）が references/pricing/ にあること

## 処理フロー
1. 顧客設定ファイルを読み込み（会社名・業種・年商・仕訳数等）
2. 料金表から該当プランの月額を算出
3. 提案書テンプレートに流し込み
4. .docx ファイルとして出力

## 料金算出ロジック
- references/pricing/pricing-table-v1.json の仕訳数別月額テーブルを参照
- 顧客の年間仕訳数から該当レンジを特定
- オプション（記帳代行・給与計算等）があれば加算

## 出力
- ファイル名: 提案書_{会社名}_{日付}.docx
- 出力先: プロジェクトルート

## 注意事項
- 料金表の金額は税抜表示
- 最終的な料金は代表（yuya）が確認・調整する
