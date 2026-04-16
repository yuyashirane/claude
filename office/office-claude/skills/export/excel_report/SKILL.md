# Skill: excel-report

## 概要

`Finding[]` を受け取り、税務分類チェック結果を `.xlsx` ファイルに変換して出力する。

## エントリポイント

```python
from skills.export.excel_report.exporter import export_to_excel

path = export_to_excel(
    findings=findings,      # list[Finding]
    output_path=Path("report.xlsx"),
    company_name="株式会社〇〇",
    period="2026年2月期",
)
```

## 出力構成(仕様書 §11.2 C案ハイブリッド)

| シート | 条件 |
|---|---|
| サマリー | 常に生成(findings 空でも空の集計表) |
| A4 家賃・地代 | TC-02 の Finding が存在する場合のみ |
| A5 人件費 | TC-03 の Finding が存在する場合のみ |
| A8 売上 | TC-01 の Finding が存在する場合のみ |
| A10 その他経費 | TC-05b/d/e, TC-07 の Finding が存在する場合のみ |
| A11 営業外・特別損益 | TC-04, TC-05a/c の Finding が存在する場合のみ |
| A12 税金 | TC-06 の Finding が存在する場合のみ |

## 制約(Phase 6)

- freee リンク URL 生成は **Phase 7 以降**のスコープ。Phase 6 では URL 列は空欄。
- 判定ロジックは含まない(出力専用)。
- openpyxl のみ使用(pandas / xlsxwriter は不使用)。
