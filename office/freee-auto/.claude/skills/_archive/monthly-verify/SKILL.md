---
name: "monthly-verify"
description: "月次チェック・レポート生成スキル。freee経理チェック（freee-auto-keiri）の結果を検証し、Excelまたはスプレッドシートとしてレポート出力する。"
---

# 月次チェック・レポート生成スキル

経理チェック結果の検証と、プロフェッショナルなレポート出力を行う。

## 使い方

```
/monthly-verify [会社名またはcompany_id] [対象期間]
```

---

## Step 1: チェック対象の確認

以下を確認：
- **対象事業所**: company_idまたは会社名
- **対象期間**: 開始年月と終了年月
- **freee-auto-keiriの実行済みデータ**: `data/{company_id}/{date}/` が存在するか確認
  - 存在しない場合は `/freee-auto-keiri` を先に実行するよう案内

---

## Step 2: 分析データの読み込みと検証

`data/{company_id}/{date}/analysis/` 配下の各ファイルを読み込み、整合性を検証：

- `flagged_transactions.json` - 取引レベルのチェック結果
- `financial_findings.json` - BS/PL変動等の指摘
- `bs_comparison.json` - BS 3期比較データ
- `pl_comparison.json` - PL 3期比較データ
- `monthly_analysis.json` - 月次推移・異常値データ
- `ratio_analysis.json` - 財務指標3期比較データ
- `overseas_service_tax_findings.json` - 海外サービスチェック結果（存在する場合）
- `overseas_service_tax_summary.json` - 海外サービスサマリー（存在する場合）

---

## Step 3: 月次チェック手続の実行

`references/accounting/monthly-check-rules.md` の15分野に基づき、以下を確認：

### 3-1. BS残高チェック
- 現預金: マイナス残高がないか、通帳残高との整合性
- 売掛金・買掛金: 長期滞留、マイナス残高
- 仮払金・仮受金・立替金: 残高がゼロであるべき科目の確認
- 諸口: 残高がゼロであること

### 3-2. PL科目チェック
- 役員報酬: 定期同額のチェック
- 雑費・雑損失: 構成比が高すぎないか
- 前期比大幅変動（30%超）の科目

### 3-3. 消費税チェック
- 消費税区分の誤り件数と金額
- 海外サービスの税区分チェック結果

---

## Step 4: 指摘事項の優先度付け

全指摘を以下の4段階に分類：

| レベル | アイコン | 基準 |
|--------|---------|------|
| 要対応（Critical） | 🔴 | 即修正が必要。金額影響大または税務リスク |
| 要確認（Warning） | 🟡 | 担当者による確認が必要 |
| 良好（OK） | 🟢 | 問題なし |
| 参考情報（Info） | 🔵 | 把握しておくべき事項 |

---

## Step 5: レポート生成

チェック結果をExcel(.xlsx)またはGoogleスプレッドシートに出力する。

### 5-1. 出力先の判定

| ユーザーの指示 | 出力先 |
|---------------|--------|
| 「Excelに」「xlsxで」「ファイルに」またはデフォルト | **Excel (.xlsx)** |
| 「スプレッドシートに」「Googleスプレッドシートに」「GSに」 | **Googleスプレッドシート** |

指定がない場合は **Excel (.xlsx)** をデフォルトとする。

### 5-2. ファイル命名規則

```
reports/{会社名}_{スキル名}_{対象期間開始}_{対象期間終了}_{実行日}_{実行時刻}.xlsx
```

例:
```
reports/あしたの会計事務所税理士法人_勘定科目チェック_2024-10-01_2025-12-31_2026-03-20T1037.xlsx
```

スキル名の対応:
| 元スキル | レポート名 |
|---------|-----------|
| freee-auto-keiri（全体） | 勘定科目チェック |
| 消費税チェックのみ | 消費税区分チェック |
| 海外サービスのみ | 海外サービス消費税チェック |
| 財務分析のみ | 財務分析 |

### 5-3. 共通スタイル

```python
# カラーパレット
DARK_BLUE = "1F3864"    # メインヘッダー背景
MID_BLUE = "2E75B6"     # セクションヘッダー背景
LIGHT_BLUE = "D6E4F0"   # 小計・合計行の背景
WHITE = "FFFFFF"         # ヘッダーフォント色

RED_BG = "FCE4EC"        # 要対応項目の背景
RED_TEXT = "C62828"       # 要対応項目のテキスト
YELLOW_BG = "FFF9C4"     # 要確認項目の背景
YELLOW_TEXT = "F57F17"    # 要確認項目のテキスト
GREEN_BG = "E8F5E9"      # 良好項目の背景
GREEN_TEXT = "2E7D32"     # 良好項目のテキスト
BLUE_INFO_BG = "E3F2FD"  # 参考情報の背景
BLUE_INFO_TEXT = "1565C0" # 参考情報のテキスト

LIGHT_GRAY = "F5F5F5"    # 情報セクション背景
BORDER_COLOR = "BDBDBD"  # 罫線色
```

### フォント
- メインフォント: `Yu Gothic`（日本語対応）、フォールバック: `Arial`
- ヘッダー: 10-16pt, Bold
- 本文: 10pt
- 備考・注記: 9pt

### レイアウトルール
1. シートタブに色をつける（内容に応じた色）
2. 1行目: レポートタイトル（16pt, Bold, 結合セル）
3. セクションヘッダー: 結合セル、MID_BLUE背景、白文字
4. テーブルヘッダー: DARK_BLUE背景、白文字、中央揃え
5. 数値: 右揃え、カンマ区切り（`#,##0`）
6. パーセント: `0.0%` 形式
7. 合計行: LIGHT_BLUE背景、Bold
8. 罫線: 全セルに thin border（BORDER_COLOR）
9. 印刷設定: 横向き、幅を1ページに収める

### 5-4. シート構成（勘定科目チェックの場合）

| シート名 | 内容 |
|---------|------|
| 監査サマリー | 会社情報、結果サマリー（要対応/要確認/参考の件数）、優先度一覧 |
| 財務概要 | PL比較（通期・Q1当期・Q1前期）、BS概要、主要財務指標 |
| 要対応事項 | 各指摘の詳細（科目・残高・問題・対応・影響） |
| 要確認事項 | 各確認事項の詳細 |
| 販管費明細 | 販管費の科目別比較（通期・Q1・前期Q1・前年比・備考） |
| BS明細 | 資産・負債・純資産の科目別明細（期末・期首・増減・構成比・備考） |

### 5-5. シート構成（消費税区分チェックの場合）

| シート名 | 内容 |
|---------|------|
| チェックサマリー | 会社情報、チェック結果概要 |
| 要修正仕訳 | 消費税区分の誤りが疑われる仕訳一覧 |
| 要確認仕訳 | 確認が必要な仕訳一覧 |
| 科目別集計 | 勘定科目別の消費税区分集計 |

### 5-6. シート構成（財務分析の場合）

| シート名 | 内容 |
|---------|------|
| 分析サマリー | 会社情報、分析結果概要 |
| PL分析 | 損益計算書の詳細分析 |
| BS分析 | 貸借対照表の詳細分析 |
| エラー検出 | 検出されたエラー・異常値一覧 |
| 財務指標 | 主要財務指標の一覧と評価 |

### 5-7. 汎用（その他）の場合

| シート名 | 内容 |
|---------|------|
| サマリー | 実行コマンド名、対象データ、結果概要 |
| 詳細結果 | 結果の全項目を表形式で出力 |
| 参考情報 | 補足データ、指標、注記 |

### 5-8. Pythonコードテンプレート

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import openpyxl
from datetime import datetime

# カラー定数
DARK_BLUE = "1F3864"
MID_BLUE = "2E75B6"
LIGHT_BLUE = "D6E4F0"
WHITE = "FFFFFF"
RED_BG = "FCE4EC"
RED_TEXT = "C62828"
YELLOW_BG = "FFF9C4"
YELLOW_TEXT = "F57F17"
GREEN_BG = "E8F5E9"
GREEN_TEXT = "2E7D32"
BLUE_INFO_BG = "E3F2FD"
BLUE_INFO_TEXT = "1565C0"
LIGHT_GRAY = "F5F5F5"
BORDER_COLOR = "BDBDBD"
BLACK = "000000"

NUM_FMT = '#,##0;(#,##0);"-"'
PCT_FMT = '0.0%;(0.0%);"-"'

thin_border = Border(
    left=Side(style='thin', color=BORDER_COLOR),
    right=Side(style='thin', color=BORDER_COLOR),
    top=Side(style='thin', color=BORDER_COLOR),
    bottom=Side(style='thin', color=BORDER_COLOR)
)

def style_cell(ws, row, col, value="", font_name="Yu Gothic", font_size=10, bold=False,
               font_color=BLACK, bg_color=None, align_h="left", align_v="center",
               border=True, wrap=True, num_fmt=None):
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = Font(name=font_name, size=font_size, bold=bold, color=font_color)
    if bg_color:
        cell.fill = PatternFill("solid", fgColor=bg_color)
    cell.alignment = Alignment(horizontal=align_h, vertical=align_v, wrap_text=wrap)
    if border:
        cell.border = thin_border
    if num_fmt:
        cell.number_format = num_fmt
    return cell

def header_row(ws, row, col_start, values, bg=DARK_BLUE, fc=WHITE, font_size=10):
    for i, v in enumerate(values):
        style_cell(ws, row, col_start + i, v, bold=True, font_color=fc, bg_color=bg,
                   align_h="center", font_size=font_size)

def section_title(ws, row, col_start, col_end, title, bg=MID_BLUE, fc=WHITE):
    ws.merge_cells(start_row=row, start_column=col_start, end_row=row, end_column=col_end)
    style_cell(ws, row, col_start, title, bold=True, font_color=fc, bg_color=bg, font_size=11)
    for c in range(col_start + 1, col_end + 1):
        style_cell(ws, row, c, "", bg_color=bg)

def setup_print(ws):
    ws.sheet_properties.pageSetUpPr = openpyxl.worksheet.properties.PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.orientation = 'landscape'
    ws.page_margins.left = 0.5
    ws.page_margins.right = 0.5

def generate_filename(company_name, skill_name, period_start, period_end):
    now = datetime.now()
    time_str = now.strftime("%Y-%m-%dT%H%M")
    return f"reports/{company_name}_{skill_name}_{period_start}_{period_end}_{time_str}.xlsx"
```

### 5-9. Excel生成手順

1. 会話コンテキスト・分析ファイルからデータを収集
2. `mkdir -p reports` でディレクトリ確認
3. 上記テンプレートでExcelファイルを生成
   - 数式が使える箇所はExcel数式を使用（ハードコードしない）
   - 合計行にはSUM関数を使用
4. 命名規則に従ったファイル名で `reports/` に保存

### 5-10. Googleスプレッドシート出力の場合

1. Excel出力と同じデータ収集を行う
2. Google Sheets APIを使用（MCP経由でGoogle Drive連携が利用可能な場合）
   - 新規スプレッドシートを作成 → シート構成・データ・書式を設定 → 共有リンクを生成
3. MCP未接続の場合
   - Excelファイルとして出力し、「Googleドライブにアップロードしてスプレッドシートとして開いてください」と案内

---

## Step 6: 結果の通知

ユーザーに以下を報告：
1. チェック結果のサマリー（🔴🟡🔵🟢の件数）
2. 🔴要対応項目の概要
3. 出力ファイルのパス（またはスプレッドシートのURL）
4. シート数・主要データ件数

---

## 注意事項

- 元のチェック結果に含まれる全ての指摘事項・データを漏れなく出力すること
- 数値の桁区切り、パーセント表示などの書式を必ず適用すること
- 日本語フォント（Yu Gothic）を使用し、文字化けを防ぐこと
- セル幅は内容に応じて適切に設定すること
- 印刷時に見切れないよう、印刷設定を必ず適用すること

## 参照ファイル

- `references/accounting/monthly-check-rules.md` - 月次チェック15分野の詳細
- `references/accounting/finance-analyzer.md` - 財務分析ルール
- `src/verify/04-generate-report.js` - 既存レポート生成スクリプト
- `src/verify/generate-audit-report.js` - 監査レポート生成スクリプト
