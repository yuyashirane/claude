# check-consumption-tax

## 概要

V1-3 ルール系の消費税関連 checker (V1-3-10 税区分チェック, V1-3-20 インボイス
登録状態チェック, ...) を統合実行し、1 ファイルで Excel レポートを出力する skill。

「Skill 単位の Findings を、業務論点単位で再統合する」という設計思想に基づく
V1-3 統合基盤の第 1 弾。会計実務上「1 仕訳 → 複数論点」は自然なため、両論点
の findings を 1 つの Excel に並べて顧問先に提示することで、税理士事務所の
レビュー効率を向上させる。

## Trigger phrase

- 「○○の消費税チェックして」
- 「○○の V1-3 統合チェック」
- 「○○の課税取引・インボイスをまとめてレポート」

## 使い方

CLI 起動例 (V1-3-10 / V1-3-20 と同様の引数体系):

```bash
# 期間指定モード
python -m skills.verify.V1-3-rule.check-consumption-tax.run \
    --company-id 10794380 \
    --period-start 2025-06 \
    --period-end 2025-12

# 対象月モード (累積)
python -m skills.verify.V1-3-rule.check-consumption-tax.run \
    --company-id 10794380 \
    --target-month 2025-12

# 対象月モード (単月)
python -m skills.verify.V1-3-rule.check-consumption-tax.run \
    --company-id 10794380 \
    --target-month 2025-12 --single-month
```

引数は内部で V1-3-10 / V1-3-20 と同じ JSON ファイル群 (`tests/e2e/<company_id>/<period_end>/`)
を参照する。fetch は SKILL.md エージェント側 (Claude Code) が freee MCP 経由で
事前に保存する責務。

## 出力

**ファイル名**: `消費税チェック_<事業所名>_<期間>_<タイムスタンプ>.xlsx`

例: `消費税チェック_株式会社デイリーユニフォーム_2025年6月〜2025年12月_20260510_142233.xlsx`

**配置**: `reports/<事業所ID>_<事業所名>/`

**シート構成** (TC_template.xlsx 由来):

- サマリー
- A4 家賃・地代 (V1-3-10 TC-02 該当があれば)
- A5 人件費 (V1-3-10 TC-03 該当があれば)
- A8 売上 (V1-3-10 TC-01 該当があれば)
- A10 その他経費 (V1-3-10 TC-05b/d/e, TC-07 該当があれば)
- A11 営業外・特別損益 (V1-3-10 TC-04, TC-05a/c 該当があれば)
- A12 税金 (V1-3-10 TC-06 該当があれば)
- A14 インボイス (V1-3-20 該当があれば)
- 参考 (テンプレ静的)

## 内部 checker

現在組み込まれている checker:

- **V1-3-10** (`check-tax-classification`): 消費税区分の整合性チェック (TC-01〜TC-07)
- **V1-3-20** (`check-invoice-registration-status`): インボイス登録状態チェック

両 checker は内部で `build_check_context` を **1 回だけ** 呼んで同じ ctx を共有する
(freee API/JSON 読み込みコストの重複を回避)。findings は単純 list 連結で結合し、
共通 schema (`skills/_common/schema.py`) で型整合する。

## 障害分離

複数 checker のうち一部が失敗した場合の動作 (戦略 Claude 判断 B):

- **部分失敗**: 失敗した checker の findings は反映されないが、成功した checker の
  findings で Excel を生成する。**EXIT_OK** で終了し、stderr に警告ログを出力。
- **全 checker 失敗**: Excel 出力をスキップし、**EXIT_UNEXPECTED** で終了。

これにより「部分結果でも顧問先報告に使える」業務要求を満たす。

## 将来拡張

### 追加 checker (V1-3-11/12/13/14/21/30/40 等)

本 skill は V1-3 統合基盤として設計されており、以下の checker 追加が将来想定
されている:

- V1-3-11 軽減税率
- V1-3-12 軽油引取税
- V1-3-13 海外サービス
- V1-3-14 輸出入
- V1-3-21 少額特例
- V1-3-30 源泉 (税目が異なるが、消費税レポートに含めるかは将来判断)
- V1-3-40 定期同額 (同上)

新規 V1-3-XX checker を追加する手順:

1. 新規 skill 作成 (例: `skills/verify/V1-3-rule/check-XX-YY/`)
2. 本 skill の `run.py` 内 `_INTERNAL_CHECKERS` に 1 行追加
3. テンプレに必要な area シート追加 (該当があれば)
4. 本 SKILL.md の「内部 checker」リストに追記

### finding correlation layer

将来構想: 同一 deal_id の異なる観点 finding を関連マークで紐付け、業務上の
根本原因が共通であることを示唆する機能。

例: 「売上の税区分誤り」(V1-3-10 由来) と「取引先未登録」(V1-3-20 由来) が
同一仕訳で検出された場合、"関連 finding あり" マークを表示。

現在は両方表示のみで correlation 表示は未実装。会計実務上「1 仕訳 → 複数
論点」は自然なため、両方表示自体に十分な価値がある。correlation 機能は
finding 数が増えて業務上の必要性が顕在化してから実装する方針。

### サマリーシート拡張 (Phase 2)

Phase 1 (本 skill 初版) ではサマリーシートは既存 (上段 TC 別件数 + 下段
area×tc 集計) のまま。Phase 2 で以下を予定:

- A1 二層構造 (要修正/要判断 + 要確認/参考)
- A3 観点別集計 (severity × tc_code)
- A4 動的ナビゲーション (シート削除と整合する内部リンク)

TC_template.xlsx の改修は悠皓側で並行実施予定。

### Plugin 化対応

本 skill は office-claude の Plugin 化方針 (将来 `office-claude-plugin/` への
移行) と整合するよう、以下の設計ルールに準拠:

- ディレクトリ構造: 既存 skill 階層を踏襲、機械的移送可能
- パス: プロジェクトルート相対
- 命名: 英語 kebab-case、namespace 付き呼び出し
  (`/office-claude:check-consumption-tax`) でも違和感なし
- MCP 設定 / 認証情報を含まない

## 関連ファイル

- 内部 checker: `skills/verify/V1-3-rule/check-tax-classification/`,
  `skills/verify/V1-3-rule/check-invoice-registration-status/`
- 出力エンジン: `skills/export/excel_report/`
- ctx 構築: `scripts/e2e/freee_to_context.py`
- Finding schema: `skills/_common/schema.py` (V1-3-10/20 共通)

## 既存 V1-3-10/20 との関係

本 skill が新設されても、既存の `check-tax-classification` / `check-invoice-registration-status`
は **無変更** で残存する。単独実行 (デバッグ用途) や本 skill が壊れた場合の
fallback として継続して利用可能。
