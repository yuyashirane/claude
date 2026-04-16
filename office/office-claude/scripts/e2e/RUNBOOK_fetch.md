# RUNBOOK: freee データ取得手順

**対象**: Claude Code セッション内で実行  
**目的**: 指定会社・指定月のデータを freee-MCP から取得し、adapter が読める 4 ファイルを保存する  
**出力先**: `data/e2e/<company_id>/YYYYMM/`（自動作成される）

---

## 前提と必要情報

| 項目 | 例 |
|---|---|
| 対象会社の `company_id` | アントレッド株式会社 = `3525430` |
| 取得対象月 | `202512`（2025年12月） |
| 出力先 | `data/e2e/3525430/202512/` |

**出力ファイル 4 点**:

| ファイル名 | 形式 | 備考 |
|---|---|---|
| `company_info.json` | 単一 dict（6 キー必須） | Step 1 で保存 |
| `account_items_all.json` | 配列（ラップなし） | Step 2 で保存 |
| `partners_all.json` | 配列（ラップなし） | Step 3 で保存 |
| `deals_202512.json` | `{"deals": [...], "meta": {...}}` | Step 4 で保存 |

---

## Step 1 — 会社情報取得 → `company_info.json`

**MCP 呼び出し:**

```python
mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/companies/3525430"
)
```

**保存データの構築**: レスポンスの `company` オブジェクトから以下 6 キーを抽出し、単一 dict を組み立てる。`fiscal_years` 配列の最後のエントリを現在の会計期とみなす。

```python
from scripts.e2e.freee_fetch import save_json
from pathlib import Path

company = response["company"]
fy = company["fiscal_years"][-1]  # 最新の会計期

info = {
    "company_id": company["id"],
    "company_name": company["display_name"],
    "fiscal_year_id": fy["id"],
    "fiscal_year_start": fy["start_date"],
    "fiscal_year_end": fy["end_date"],
    "target_yyyymm": "202512",
}

save_json(info, Path("data/e2e/3525430/202512/company_info.json"))
```

**完了基準**:
- レスポンスに `fiscal_years` 配列が含まれる
- 上記 6 キーが揃った dict が構築できている
- `company_info.json` が保存されている

---

## Step 2 — 勘定科目マスタ取得 → `account_items_all.json`

**MCP 呼び出し（1回のみ）:**

```python
mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/account_items",
    params={"company_id": 3525430}
)
```

**保存:**

```python
from scripts.e2e.freee_fetch import save_json
from pathlib import Path

# レスポンスの account_items 配列をそのまま保存（ラップなし）
account_items = response["account_items"]
save_json(account_items, Path("data/e2e/3525430/202512/account_items_all.json"))
```

**完了基準**:
- 配列の件数が想定範囲（200 件前後）
- 各要素に `id` / `name` が含まれる
- `account_items_all.json` が保存されている

---

## Step 3 — 取引先マスタ取得（全件ループ）→ `partners_all.json`

**取得パターン**: `offset=0, limit=100` から開始し、空レスポンス（`partners=[]`）が返るまでループ。

```python
mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/partners",
    params={"company_id": 3525430, "offset": 0, "limit": 100}
)
# → 結果を蓄積

mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/partners",
    params={"company_id": 3525430, "offset": 100, "limit": 100}
)
# → partners=[] になったら終了
```

**保存:**

```python
from scripts.e2e.freee_fetch import normalize_partners, save_json
from pathlib import Path

# raw_pages = [page1_response, page2_response, ..., empty_page_response]
partners_list = normalize_partners(raw_pages)
save_json(partners_list, Path("data/e2e/3525430/202512/partners_all.json"))
```

**完了基準**:
- `normalize_partners()` 後の件数が想定範囲（250 件前後）
- `partners_all.json` が保存されている（配列形式、`{"partners": [...]}` ラップなし）
- 空レスポンスを受信した時点で即終了（過剰リクエスト禁止）

---

## Step 4 — 取引（deals）取得（月次）→ `deals_202512.json`

**取得パターン**: `meta.total_count` を確認しながら全件取得。

```python
# 1 ページ目（total_count 確認）
mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/deals",
    params={
        "company_id": 3525430,
        "start_issue_date": "2025-12-01",
        "end_issue_date": "2025-12-31",
        "offset": 0,
        "limit": 100,
    }
)
# → meta.total_count を記録

# 2 ページ目（100 件超の場合）
mcp__freee-mcp__freee_api_get(
    service="accounting",
    path="/api/1/deals",
    params={
        "company_id": 3525430,
        "start_issue_date": "2025-12-01",
        "end_issue_date": "2025-12-31",
        "offset": 100,
        "limit": 100,
    }
)
```

**保存:**

```python
from scripts.e2e.freee_fetch import merge_deals_pages, validate_completeness, save_json
from pathlib import Path

# pages = [page1_response, page2_response, ...]
merged = merge_deals_pages(pages)

report = validate_completeness(merged)
print(report)  # warnings があれば内容を確認・記録

save_json(merged, Path("data/e2e/3525430/202512/deals_202512.json"))
```

**完了基準**:
- `len(merged["deals"]) == merged["meta"]["total_count"]`（`merge_deals_pages` 内で検証済み）
- `validate_completeness()` の `warnings` を確認・報告
- `deals_202512.json` が保存されている（全ページマージ後の単一 dict）

---

## 最終検証

**4 ファイルの確認:**

```python
from pathlib import Path
import json

base = Path("data/e2e/3525430/202512")
for fname in ["company_info.json", "account_items_all.json", "partners_all.json", "deals_202512.json"]:
    path = base / fname
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    print(f"{fname}: OK (読み込み成功)")
```

**チェック項目**:
- `data/e2e/3525430/202512/` に 4 ファイルが存在する
- 各ファイルが UTF-8 で読み戻せる（漢字が正しく表示される）
- `validate_completeness` の `warnings` があれば報告書に記載する

---

## 運用 Tips

1. **ディレクトリは自動作成**: `save_json()` が `parents=True` で作成するため、事前に手動作成不要。
2. **再実行は上書き**: 2 回目以降の実行は既存ファイルを上書きする。データ再取得のつもりで使う。
3. **partners のループは自動停止**: 空レスポンス（`partners=[]`）を受信した時点で終了。手動停止は不要。
4. **レート制限は未確認**: 連続して大量リクエストを送ると制限を受ける可能性があるため、ループ間に短い間隔を設けることを推奨。
5. **別会社・別月への適用**: `company_id` と `target_yyyymm`（および日付範囲）を変更するだけで同じ手順が使える。出力先は自動的に `data/e2e/<company_id>/YYYYMM/` になる。
