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

## 2プラン形式と4プラン形式

v1スクリプトは2つのconfig形式に対応している。

### 2プラン形式（従来）
- `pricing.planA` / `pricing.planB` を使用
- 各プランに `monthly` と `annual` を持つ
- `pricing.summary` で年間サマリーを2列比較
- 例: `references/pricing/config_kobayu.json`

### 4プラン形式（v2 proposal_multi 用）
- `pricing.planA1` が存在すると自動判定で4プランモードに切り替わる
- `planA1` / `planA2`: 記帳代行系（monthlyのみ）
- `planB1` / `planB2`: 自計化系（monthlyのみ）
- `commonAnnualA`: A1・A2共通の年次料金
- `commonAnnualB`: B1・B2共通の年次料金
- `firstYearOnlyB`: B1・B2の初年度のみ年次料金（クラウド会計導入支援等）
- `summaryA`: A1/A2のサマリー（`planA`, `planB` キーで2列比較）
- `summaryB`: B1/B2のサマリー（`firstYearOnlyTotal` があれば初年度行を自動追加）
- 例: `references/pricing/config_industrieight_v1.json`

## 出力
- ファイル名: 提案書_{会社名}_{日付}.docx
- 出力先: プロジェクトルート

## 注意事項
- 料金表の金額は税抜表示
- 最終的な料金は代表（yuya）が確認・調整する
