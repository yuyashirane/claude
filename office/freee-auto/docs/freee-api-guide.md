# freee API 連携ガイドライン

## 目的

このファイルは、freee API および freee-MCP を使う際に気をつけるべき仕様と既知の罠をまとめた参照ファイルです。
新しい機能を実装する前に、関連セクションを必ず読んでください。

---

## 1. 事業所一覧取得（companies）

### エンドポイント

- freee-MCP ツール: `freee_list_companies`
- freee API: `GET /api/1/companies`

### 既知の罠

#### 罠1: `name` フィールドが空欄のケースがある

**症状**: 一部の事業所で `name` フィールドが `null` または空文字列になっている。
正式名称は `display_name` フィールドにのみ入っている。

**該当事例**:
- 株式会社 SOHA (ID: 10019752) — 2026-04-07 確認
- 株式会社 A-Life (ID: 11251782) — 2026-04-07 確認

**対処方針**:
事業所検索では必ず以下のフィールドすべてを検索対象にすること:
- `name`
- `display_name`
- `name_kana`（カタカナ名）

```javascript
function searchCompany(companies, keyword) {
  const lower = keyword.toLowerCase();
  return companies.filter(c => {
    const fields = [c.name, c.display_name, c.name_kana].filter(Boolean);
    return fields.some(f => f.toLowerCase().includes(lower));
  });
}
```

#### 罠2: `freee_list_companies` ツールが name しか返さない可能性

**症状**: freee-MCP の `freee_list_companies` ツールは、レスポンスを簡略化して `name` のみ返す可能性がある。
`display_name` を取得するには `freee_api_get` で `/api/1/companies` を直接叩く必要がある。

**対処方針**:
- `freee_list_companies` で見つからなかった場合、フォールバックとして `freee_api_get` で全フィールド取得
- または、最初から `freee_api_get` を使う

```javascript
// freee-MCP 経由で全フィールド取得
const result = await mcp.freee_api_get('/api/1/companies');
const companies = JSON.parse(result.text).companies;
```

#### 罠3: 認可済み事業所のみが返る

**症状**: `freee_list_companies` は、現在のアクセストークンで認可された事業所のみを返す。
クライアントが freee 上で事業所を作成しても、こちらで認可されていなければ取得できない。

**対処方針**:
- 「事業所が見つからない」場合、まずユーザーにfreeeの認可状況を確認してもらう
- ユーザーが freee にログインして、画面右上の事業所切り替えメニューに該当事業所が表示されるか確認

---

## 2. 試算表取得（trial_bs / trial_pl）

### エンドポイント

- freee API: `GET /api/1/reports/trial_bs`, `GET /api/1/reports/trial_pl`

### 既知の罠

#### 罠1: trial_pl の集計行と明細行の混在

**症状**: `trial_pl.balances` には2種類のエントリが混在している:

1. **明細科目**: `account_item_id` + `account_item_name` あり
   - 例: 役員報酬、給料手当、地代家賃 等

2. **集計行**: `account_item_id` なし、`account_category_name` のみ
   - 例: 売上総損益金額、営業損益金額、経常損益金額、税引前当期純損益金額、当期純損益金額 等
   - 約19個存在

これらを同じキーで格納すると、集計行が `accounts["undefined"]` に上書きされ、最後の値（当期純損益）だけが残る。

**対処方針**:

集計行は専用のキー名前空間で格納する:

```javascript
function indexTrialPl(balances) {
  const accounts = {};
  for (const b of balances) {
    if (b.account_item_id) {
      // 明細科目
      accounts[b.account_item_id] = b;
    } else if (b.account_category_name) {
      // 集計行
      accounts[`__summary__${b.account_category_name}`] = b;
    }
  }
  return accounts;
}
```

集計行を取得する際は専用関数を経由:

```javascript
function getSummary(accounts, categoryName) {
  return accounts[`__summary__${categoryName}`];
}
```

#### 罠2: trial_pl は YTD 累計

**症状**: `trial_pl` のレスポンスは「期首から指定月までの累計」である。
当月単月の金額を算出するには、当月累計から前月累計を引く必要がある。

**対処方針**:

```javascript
const currentYtd = await fetchTrialPl(companyId, '2026-03');
const previousYtd = await fetchTrialPl(companyId, '2026-02');

// 当月単月 = 当月累計 - 前月累計
const monthlyAmount = currentYtd.amount - previousYtd.amount;
```

ただし、期首月の場合は前月累計がないので、当月累計をそのまま使う。

#### 罠3: deals.partner_name が全件 undefined

**症状**: `GET /api/1/deals` のレスポンスで、`deals[].partner_name` が全件 undefined になっている。
取引先名を取得するには、別途 partners マスタとJOINする必要がある。

**対処方針**:

`src/verify/monthly-checks/trial-helpers.js` の `resolvePartnerName(deal, partners)` を使う:

```javascript
const { resolvePartnerName } = require('./trial-helpers');

const partnerName = resolvePartnerName(deal, partners);
```

---

## 3. 総勘定元帳URL（仕訳帳ではなく総勘定元帳を使う）

### URL形式

**確定形式**:
```
https://secure.freee.co.jp/reports/general_ledgers/show
  ?name={URLエンコード済科目名}
  &start_date=YYYY-MM-DD
  &end_date=YYYY-MM-DD
  &fiscal_year_id={会計年度ID}
```

### 必須パラメータ（4つのみ）

| パラメータ | 必須 | 説明 |
|----------|-----|------|
| `name` | ✅ | URLエンコード済の勘定科目名（フィルター必須） |
| `start_date` | ✅ | 期間開始日（YYYY-MM-DD） |
| `end_date` | ✅ | 期間終了日（YYYY-MM-DD） |
| `fiscal_year_id` | ✅ | 会計年度ID（**会社・期ごとに異なる**） |

### 禁止パラメータ（絶対に追加しない）

| パラメータ | 理由 |
|----------|------|
| `adjustment` | 期間指定を無効化する。`adjustment=all` を追加すると `start_date`/`end_date` が機能しなくなる |
| `page`, `per_page` | freeeデフォルトで代替可能、URL長節約のため省略 |
| `order_by`, `direction` | 同上 |
| `account_item_id` | `name` と機能重複 |
| `fiscal_year` | `fiscal_year_id` と機能重複 |
| `source_type` | freeeが自動判定 |
| `gl_summation_method` | freeeが自動判定 |
| `straddled_fiscal_year` | freeeが自動判定 |

### 既知の制約

#### 制約1: Excel HYPERLINK 255文字制限

Excel HYPERLINK 関数のURL引数には **255文字の制限** がある。これを超えると `#VALUE!` エラー。

**最長想定の科目名**: 「法人税・住民税及び事業税」（URLエンコード後 108文字）
**URL全体長**: 235文字（255制限まで余裕20文字）

**対処**:
- 単体テストで境界値チェックを必須化
- `tests/test-freee-links.js` に「最長科目名でも250文字以下」のテストを追加

```javascript
test('総勘定元帳URLは最長科目名でも250文字以下', () => {
  const url = generalLedgerLink({
    accountName: '法人税・住民税及び事業税',
    startDate: '2025-10-01',
    endDate: '2025-10-31',
    fiscalYearId: '10840688',
  });
  if (url.length > 250) {
    throw new Error(`URL長超過: ${url.length}文字`);
  }
});
```

#### 制約2: 1会計年度内の日付しか指定できない

freee の総勘定元帳は、1会計年度内の日付しか指定できない。年度をまたぐとエラー:
> 「総勘定元帳の詳細の取得に失敗しました。 開始日と終了日は指定の会計年度内の日付にしてください。」

**対処**:
- `start_date` と `end_date` は必ず同じ会計年度内に収める
- 過去期にアクセスする場合は、その期の `fiscal_year_id` を使う
- 複数年度を表示したい場合は、年度ごとに別リンクにする

#### 制約3: fiscal_year_id は会社ごと・期ごとに異なる

`fiscal_year_id` は freee の内部IDで、**会社ごと・期ごとに異なる値**。
ハードコードや手動管理ではなく、必ず動的に取得すること。

**取得方法**:
`monthly-data-fetcher.js` で会社情報取得時に一緒に取得:

```javascript
const monthlyData = await fetchMonthlyData(companyId, targetMonth);
const fiscalYearId = monthlyData.fiscalYearId;
```

過去期にアクセスする場合は、過去期の `fiscal_year_id` も取得する必要がある:

```javascript
const monthlyData = await fetchMonthlyData(companyId, targetMonth);
// monthlyData.historicalFiscalYearIds = { 2024: '10519823', 2023: '...', ... }
const pastFiscalYearId = monthlyData.historicalFiscalYearIds[2024];
```

### generalLedgerLink() 関数仕様

```javascript
/**
 * freee総勘定元帳リンクを生成する
 * @param {object} params
 * @param {string} params.accountName - 勘定科目名（URLエンコード前）
 * @param {string} params.startDate - 開始日（YYYY-MM-DD）
 * @param {string} params.endDate - 終了日（YYYY-MM-DD）
 * @param {string} params.fiscalYearId - 会計年度ID
 * @returns {string} URL文字列
 */
function generalLedgerLink({ accountName, startDate, endDate, fiscalYearId }) {
  const params = new URLSearchParams({
    name: accountName,
    start_date: startDate,
    end_date: endDate,
    fiscal_year_id: fiscalYearId,
  });
  return `https://secure.freee.co.jp/reports/general_ledgers/show?${params}`;
}
```

**重要**: パラメータは上記4つのみ。良かれと思って `adjustment`, `source_type` 等を追加しないこと。

---

## 4. レート制限・取得件数制限

### deals 取得上限

`GET /api/1/deals` は1リクエストで最大500件まで取得可能。
それ以上の取引がある会社では、ページネーションが必要。

**対処**:
- 大規模事業所では `offset` パラメータでページネーション
- または、対象月を絞り込んで件数を減らす

### walletTxns 取得上限

`GET /api/1/wallet_txns` は1リクエストで最大100件まで取得可能。

**対処**:
- 全件必要な場合はページネーション
- Verifyのチェックでは「100件以上ある可能性」を警告として出すことを検討

---

## 5. freee-MCP の Windows 設定

`.mcp.json` 設定:

```json
{
  "freee-mcp": {
    "command": "cmd",
    "args": ["/c", "npx", "freee-mcp"]
  }
}
```

`command: "cmd"` および `args: ["/c", "npx", ...]` が必須（Windows特有）。

---

## 6. 大きなAPIレスポンスの取り扱い

### 問題

freee API のレスポンスが大きすぎると、Claude Code のコンテキスト制限を超える。
例: `freee_api_get /api/1/companies` のレスポンスが80,000文字を超えるケース。

### 対処

Claude Code がレスポンスをファイルに保存し、`node` または `jq` で必要部分を抽出する:

```bash
# ファイルからJSONを読み込んで処理
node -e "
const fs = require('fs');
const raw = fs.readFileSync('result.txt', 'utf8');
const arr = JSON.parse(raw);
const text = JSON.parse(arr[0].text);
const companies = text.companies;
// 必要な処理
"
```

**注意**: Python は未インストール環境のため、Node.js を使うこと。

---

## 7. 既知のリンクテキストの統一

freeeリンクのアンカーテキストは以下に統一:

| リンク種別 | アンカーテキスト |
|----------|--------------|
| 総勘定元帳 | 「元帳を開く」 |
| 取引詳細 | 「取引を開く」 |
| 口座明細 | 「明細を開く」 |
| 証憑 | 「証憑を開く」 |

「仕訳帳を開く」は廃止（仕訳帳リンクを使わなくなったため）。

---

## 8. このドキュメントの更新ルール

freee API の罠を新たに発見したら、このドキュメントに追記してください。
追記時は以下を含めること:

1. **症状**: 何が起きるか
2. **該当事例**: いつ、どの会社で発見したか
3. **対処方針**: どう対応するか
4. **コードサンプル**: 可能であれば

罠を発見した時点で記録することで、次回以降の作業者（Claude Code 含む）が同じ問題で時間を消費しないようにします。
