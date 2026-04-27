---
name: check-invoice-registration-status
description: |
  V1-3-20 インボイス登録状況チェック (α 解像度・最小実装)。freee 会計の取引
  データから「適格マークなし × 課税仕入 × 20 万円以上」の 3 条件 AND を満たす
  候補仕訳のみを抽出する。

  発動トリガー:
    - 「V1-3-20」「check-invoice-registration-status」というコード/名称
    - 「インボイス登録状況チェック」「適格請求書の確認」
    - 「インボイス未登録の仕入を抽出」

  α 解像度のため、以下は本リリースのスコープ外:
    - 登録番号の妥当性チェック
    - 経過措置 (80%/50%) の判定
    - 少額特例 / 公共交通費特例
    - 顧客別の閾値カスタム
    - 実行時の金額閾値指定 (20 万円固定)
    - Excel レポート出力

  V1-3-10 (check-tax-classification) と独立した最小スキル。本格判定は β 以降。
---

# V1-3-20 インボイス登録状況チェック (α)

## 概要

freee 会計の取引データから、インボイス制度上の登録番号未確認 (適格マーク
なし) で課税仕入として処理されている 20 万円以上の仕訳を抽出します。

**実装の正本**: `skills/verify/V1-3-rule/check-invoice-registration-status/run.py`

本 SKILL.md は `.claude/skills/` への登録用エントリで、α 実装は run.py の
`find_candidates(rows)` 関数のみを公開します。

## 発動条件

以下のような依頼で発動してください:

- 「V1-3-20 を実行」
- 「インボイス登録状況をチェックして」
- 「適格マークなしの仕入を抽出」

**誤発動の回避**: 消費税区分の妥当性 (課税/非課税の判定) は
`check-tax-classification` (V1-3-10) の責務です。本スキルはインボイス制度の
登録状況に特化します。

## fetch 責務の分離

V1-3-10 と同様、freee MCP の呼び出しは **Claude Code エージェント (あなた)**
の責務です。run.py は MCP を呼びません。

α 実装では、fetch 層が freee の deals レスポンスを以下の `InvoiceCheckRow`
型に正規化して `find_candidates(rows)` に渡す想定です:

| フィールド | 型 | 内容 |
|---|---|---|
| `wallet_txn_id` | str | 一意の取引ID (必須) |
| `transaction_date` | date \| None | 取引日 |
| `partner` | str | 取引先名 |
| `description` | str | 摘要 |
| `tax_label` | str | 税区分名 (例: `課対仕入10%`) |
| `debit_amount` | Decimal | 借方金額 |
| `credit_amount` | Decimal | 貸方金額 |
| `is_qualified_invoice` | bool | 適格マークの有無 |

## 3 条件 AND フィルタ

`find_candidates(rows)` は以下すべてを満たす行のみ返します:

1. **適格マークなし**: `is_qualified_invoice == False`
2. **課税仕入**: `tax_label` が `課対仕入` または `課税仕入` で始まる
3. **20 万円以上**: `debit_amount >= 200000`

順序は入力順を保ちます。

## 動作確認

```python
from decimal import Decimal
import sys
sys.path.insert(0, "skills/verify/V1-3-rule/check-invoice-registration-status")
from run import InvoiceCheckRow, find_candidates

rows = [
    InvoiceCheckRow(
        wallet_txn_id="t1",
        partner="未登録ベンダー",
        tax_label="課対仕入10%",
        debit_amount=Decimal("250000"),
        is_qualified_invoice=False,
    ),
]
print(find_candidates(rows))  # → [InvoiceCheckRow(...)]
```

## 今後の拡張

β 以降で以下を予定:
- 登録番号 (T 番号) の妥当性チェック
- 経過措置 (80%/50% 控除) の判定ロジック
- 少額特例 / 公共交通費特例の例外
- Excel レポート出力 (V1-3-10 と同形式)
