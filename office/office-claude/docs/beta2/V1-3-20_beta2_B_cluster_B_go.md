# クラスタ B GO（β2-B 後半）

クラスタ A の実装、確認しました。承認します。

## 特に評価できる点

### 自発判断 5 件（指示書要求外、品質向上に貢献）

1. `TestBeta1RemovalCheck` 5 件で削除そのものをテスト化（削除保証の機械的担保）
2. `TestInvoiceCheckRowTaxCode` 2 件で tax_code 拡張フィールドの基本動作担保
3. `TestClassificationEnum` で 6 値の同一性担保
4. classification_counts の 6 値必須化（setdefault、β2-D 観察精度向上）
5. 既存テスト 7 件を skip + コメント保留（β2-B クラスタ B 着手時の誤削除防止）

### 方針 3 点の徹底遵守

- 方針 1（None は False）: 境界テストで担保
- 方針 2（NONE の意味）: TestClassifyTransaction 12 件で網羅
- 方針 3（必ず 1 つ返す）: main() に不変条件チェック `sum(counts) == total_rows` を実装、違反時 EXIT_UNEXPECTED

## 想定外論点 3 件の判断（明示）

### 想定外論点 1：Classification のスキーマ間二重ロード対応

✅ **承認、レベル B 妥当**

β1 で確立した sys.modules キャッシュ規約の再利用、新規発明ではない。

### 想定外論点 2：main() の 5 分類化をクラスタ A で実施

✅ **レベル B 承認、指示書設計不備として戦略 Claude 側で記録済み**

`find_candidates` 削除と main() 改修は **論理的に不可分** だった。Claude Code が独断で進めず判断委譲してくれたのは完璧な対応。

main() の踏み込み内容は指示書 §6.2 の仕様にほぼ完全準拠で、**クラスタ B で書き直す必要なし**。

→ クラスタ B では **「テスト書き換え + `_normalize_deals` の tax_code 取得対応 + 実データ検証」** に集中してください（Claude Code の整理通り）。

### 想定外論点 3：classification_counts の 6 値必須化

✅ **承認、レベル B 妥当**

β2-D 観察精度向上の予防措置として優れている。指示書 §6.2 の例 JSON とも整合。

## 次のタスク

クラスタ B（テスト書き換え + `_normalize_deals` 改修 + 実データ検証）に進んでください。

## クラスタ B 実装スコープ（クラスタ A 踏み込みを踏まえた更新）

### 1. `_normalize_deals` 改修（指示書 §6.1）

deals[].details[].tax_code を InvoiceCheckRow.tax_code にマッピング。

### 2. 既存テスト書き換え（指示書 §6.3 + §6.6）

#### 7 件の skip 解除と意図継承書き換え

##### TestInvoiceCandidatesAlpha 5 件 → 5 分類体系へ書き換え

β2-A メモ §6.1 の意図継承マッピングに従って書き換え：

| 既存テスト | 書き換え後の意図 |
|---|---|
| `test_all_three_conditions_met` | 5 分類のうち nonqualified_but_full_deduction_tax の正常パス |
| `test_qualified_invoice_excluded` | 適格 × 通常課税仕入 → expected_full_deduction_tax<br>適格 × 経過措置 → qualified_but_transitional_tax |
| `test_non_taxable_purchase_excluded` | 非課税仕入は 5 分類のいずれにも該当しない（NONE） |
| `test_amount_threshold_boundary` | パターン②と partner_unknown の 20 万円境界 |
| `test_mixed_rows_preserve_order` | classify_transaction のリスト処理での順序保持 |

クラス名を `TestClassifyTransactionLegacyIntents` 等に変更してよい（任意）。

##### TestExitZeroEndToEnd 2 件 → 出力 JSON 構造変更対応

クラスタ A で main() が β2 仕様に置き換わったため、β1 仕様の `candidates_count` キーは消えています。新仕様の `classification_counts` + `findings_count` + `findings` を期待する形に書き換え。

### 3. TestNormalizeDeals 9 件の書き換え（指示書 §6.6）

`_normalize_deals` の出力に `tax_code` フィールドが含まれるようテストを書き換え。

### 4. 新規テスト追加（指示書 §6.4）

クラスタ A で既に追加済みのテスト（TestClassifyTransaction 12 件、TestTransitionalTaxBoundary 5 件、TestFullDeductionTaxBoundary 8 件等）に加えて、必要なら以下を追加：

- TestEndToEndClassificationCounts: 5 分類すべてが含まれる deals JSON で classification_counts が正しく出る end-to-end テスト
- TestAmountThresholdInClassification: 20 万円境界（クラスタ A の TestClassifyTransaction で部分的にカバー済みなので、不足分のみ追加）

### 5. 実データ検証（指示書 §6.7）

#### 検証対象

**3525430 / 2025-12 のみ**（K4 案 Z 確定、3 社観察は β2-D）

#### 検証コマンド

```bash
PYTHONIOENCODING=utf-8 py -3 skills/verify/V1-3-rule/check-invoice-registration-status/run.py \
  --company-id 3525430 --target-month 2025-12
```

#### 検証観点

- exit 0 で正常終了
- stdout に `"status": "ok"` の JSON
- `classification_counts` の 6 キーすべてが出力（0 件キー含む、setdefault 対応確認）
- `findings_count` が 3 分類の合計と一致
- **`classification_counts` の合計が `_normalize_deals` の出力件数と一致**（方針 3 担保、不一致なら即報告レベル A）

**重要**：件数の妥当性は β2-D で評価する。β2-B では「正しく動いているか」のみ確認。0 件でも多すぎてもエラーにしない（ただし合計件数の整合性は必ずチェック）。

## 守ること

### 禁止事項

1. **manual_journals に手を出さない**（β2-D で判断）
2. **Finding 構造の classification 組み込みをしない**（β2-C スコープ）
3. **Finding の message 改修をしない**（β2-C スコープ）
4. **FindingGroup を作らない**（β2-C 以降）
5. **checker.py を改修しない**（β2-C スコープ）
6. **SKILL.md を改訂しない**（β2-C で改訂判断）
7. **クラスタ A で実装した main() を再改修しない**（書き直す必要なし）
8. **クラスタ A で追加した自発判断（Test*RemovalCheck / 6 値必須化等）を削除しない**
9. **3 社検証をしない**（β2-D で実施、β2-B では 3525430 のみ）
10. **件数妥当性の議論をしない**（β2-D 観察フェーズ）
11. **想定外論点を独断で進めない**（運用原則 12）

### 重要な実装方針（再掲）

- **判定は止めない / 推定して前に進める / 修正アクションを出す**
- **判定ロジックは「壊れないこと」を最優先**
- **解釈 X（推定吸収）**：partner 不明 × 通常課税仕入 × 20 万以上は `nonqualified_but_full_deduction_tax` に吸収
- **方針 3（必ず 1 つ返す）**: 件数整合チェック `sum(counts) == total_rows` が常に成立

### マスタに無い code の扱い（持ち越し論点）

実データ検証中に「マスタに無い tax_code の deals」が出てきた場合、独断で進めずレベル A で報告すること。

## 完了報告で含めること

```
クラスタ B 完了

影響ファイル:
- {ファイル名} ({新設 / 改変 / 不変})

テスト結果:
- 全 {N} tests passed (skip 0 件、書き換え完了)
- 内訳: 既存書き換え {M} 件 + 新規追加 {L} 件 + 不変通過 {K} 件

確認事項:
- _normalize_deals に tax_code 取得追加完了
- 既存 7 件 skip → 書き換え完了
- TestNormalizeDeals 9 件 → tax_code 対応書き換え完了
- 実データ検証結果（3525430 / 2025-12）

実データ検証結果（必須）:
- exit code: 0
- classification_counts の 6 キー値（5 分類 + none）
- findings_count
- 合計件数の整合確認: sum(counts) == total_rows

分類別サンプル（必須、各 1 件）:
- qualified_but_transitional_tax (Finding 化)
- nonqualified_but_full_deduction_tax (Finding 化)
- partner_unknown (Finding 化)
- expected_transitional_tax (Finding 化しない、観察用)
- expected_full_deduction_tax (Finding 化しない、観察用)

想定外論点（該当あれば）:
- {内容、レベル A 即時報告 / レベル B 後で相談}
```

## 最重要文（再掲）

> **β2-B は判定ロジックの全面置き換え。β1 の 3 条件 AND は削除し、5 分類体系で deals だけ動かす最小経路を通す。**

クラスタ B 完了で β2-B が完結します。クラスタ A の踏み込みのおかげで、クラスタ B は当初想定より軽量化しています（main() 改修不要）。

クラスタ B 完了 + 実データ検証結果の報告をお待ちしています。
