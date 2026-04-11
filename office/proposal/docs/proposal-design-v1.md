# proposal-generator 改善設計書 v2.0

**作成日**: 2026-04-08
**対象プロジェクト**: `C:\Users\yuya_\claude\office\proposal\`
**目的**: 提案書生成スキルの料金構造刷新・複数出力モード対応・テンプレート改善

---

## 1. 背景と現状の課題

### 1.1 現状把握の経緯

漢宇商運（海運代理業、売上2億円・粗利1千万円）の提案書を現行スキルで生成し、以下の課題が判明した。

### 1.2 主な課題

| # | 課題 | 重要度 | 改善領域 |
|---|---|---|---|
| 1 | 単一プラン提案（お任せ型）と複数プラン提案（4択型）の使い分けができない | 高 | 出力モード |
| 2 | 売上1億円超の案件で個別見積りが必要だが、自動算出を試みてしまう | 高 | 料金構造 |
| 3 | 出精値引き・ご紹介値引きがconfig化されていない | 高 | 料金構造 |
| 4 | 料金体系が「サービスモジュール単位」で分離されていない | 高 | 料金構造 |
| 5 | 課題とサービスの1対1対応構造がない | 中 | テンプレート |
| 6 | 自計化プランの「初年度のみ」「2年目以降」の分離表示ができない | 中 | テンプレート |
| 7 | 議事録から outputMode（お任せ型/4択型）を自動判定する仕組みがない | 中 | 抽出精度 |

### 1.3 スコープ

**実装する**
- 新 `pricing-table.json`（モジュール式）
- 新 `config.json` スキーマ v2.0
- 出力モード2種: `proposal_single`（お任せ型）/ `proposal_multi`（4択型）
- 1億円超の個別見積りフラグ
- 値引きの手動設定（紹介・出精）
- 課題とサービスの1対1対応構造

**実装しない（今回は対象外）**
- 簡易見積書モード（`quick_quote`）→ 後日
- 業種別テンプレート → 業種バラエティが多いため作り込まない方針
- 事業計画書の自動抽出 → レアケース、Claude Code個別対応で十分
- PDFのOCR自動化 → 個別対応で十分

---

## 2. 料金体系の理解（あしたの会計事務所の現行料金表）

### 2.1 基本構造

料金は「**売上クラス × 仕訳数**」のマトリックスで決まる。

**売上クラス**
- A: 売上1,000万円未満
- B: 売上3,000万円未満
- C: 売上5,000万円未満
- D: 売上1億円未満
- **OVER: 売上1億円以上 → 個別見積り**（料金表に存在しない、他事務所参考に判断）

### 2.2 経理サポート（記帳代行）月次料金

| 仕訳数 | A | B | C | D |
|---|---|---|---|---|
| 100仕訳まで | 25,000 | 30,000 | 30,000 | 35,000 |
| 200仕訳まで | 30,000 | 35,000 | 35,000 | 40,000 |
| 200仕訳超 | 100仕訳ごとに +5,000円/月 |

### 2.3 経理サポート（自計化）月次料金

| 仕訳数 | A | B | C | D |
|---|---|---|---|---|
| 100仕訳まで | 10,000 | 11,000 | 13,000 | 15,000 |
| 200仕訳まで | 12,000 | 14,000 | 16,000 | 20,000 |
| 200仕訳超 | 100仕訳ごとに +3,000円/月 |

### 2.4 自計化の初期指導料金

- 法人: 100,000円 / 3か月（約5時間）
- 個人: 50,000円 / 2か月（約2.5時間）
- 追加: 20,000円 / 1時間

### 2.5 相談サポート（オプション）月次料金

| クラス | A | B | C | D |
|---|---|---|---|---|
| 基本料金 | 7,000 | 8,000 | 9,000 | 10,000 |

定例会議は年2回ベース。+2,000円/月で1回追加可。

### 2.6 年次料金

**法人税・事業税等申告報酬**
| クラス | A | B | C | D |
|---|---|---|---|---|
| 法人 | 120,000 | 140,000 | 160,000 | 180,000 |
| 個人 | 80,000 | 100,000 | 120,000 | 140,000 |

**消費税申告報酬**
| 計算方法 | A | B | C | D |
|---|---|---|---|---|
| 簡易課税 | 30,000 | 30,000 | 40,000 | - |
| 原則課税 | 50,000~ | 50,000~ | 60,000~ | 70,000~ |

**その他**
- 年末調整: 5名まで 20,000円、+1,000円/名
- 法定調書: 支払調書5枚まで 10,000円、+1,000円/枚
- 給与支払報告書: 1自治体 2,000円
- 償却資産申告: 15,000円
- 英文財務諸表作成: 20,000円
- 監査対応: 80,000円

### 2.7 給与サポート（オプション）

- 給与管理: 基本2,000円/月 + 200円/人
- 給与計算・賞与計算: 基本10,000円/月 + 1,000円/人
- 住民税更新処理: 200円/人（6月単月）
- 算定・月額変更処理: 500円/人（7月単月）

### 2.8 値引き

**自動値引き（条件で適用）**
- 銀行同期: -1,000円/月
- クレジットカード同期: -1,000円/月
- 人事労務freee利用: -1,000円/月
- 現金出納帳作成: -1,000円/月
- 納品頻度値引き（記帳代行のみ）:
  - 4ヶ月に1回: -6,000円/月
  - 3ヶ月に1回: -5,000円/月
  - 2ヶ月に1回: -4,000円/月

**手動値引き（案件ごとに判断）**
- ご紹介値引き: 紹介経由案件、金額は案件ごと
- 出精値引き: 取引先数・仕訳数等を考慮、金額は案件ごと

### 2.9 割増し

- 人事労務freee・給与計算代行未利用割増: +1,000円/月（社会保険加入の場合）
- 発生主義オプション: 3,000円~/月
- 月次特急オプション: 5,000円~/月

---

## 3. 出力モードの仕様

### 3.1 Mode B: `proposal_single`（お任せ型・主流7割）

事務所が決め打ちで1案を提案するスタイル。

**サンプル**: Bangkok Solar Power Japan、MegaSolar1456-EC、企業経営サポート宮崎、日本アンプル電力

**特徴**
- 1プランのみ提示
- 月次料金 / 年次料金 / 出精値引きの3点セット
- ページ数: 6-10ページ
- 課題認識セクションでお客様固有の課題を3-5項目提示
- サービス内容セクションで課題に対応するサービスを提示
- 値引きは「出精値引き」が主（紹介経由でない場合）

### 3.2 Mode C: `proposal_multi`（4択型・3割）

お客様に選んでもらう4プラン併記スタイル。

**サンプル**: 合同会社Back UP

**特徴**
- 4プラン併記:
  - A1: 記帳代行のみ
  - A2: 記帳代行 + 相談サポート
  - B1: 自計化のみ
  - B2: 自計化 + 相談サポート
- 共通の年次料金
- 自計化プランのみ「初年度のみ」セクション（初期指導報酬）
- 年間費用サマリー表（4プラン横並び比較）
- ページ数: 8-10ページ
- 値引きは「ご紹介値引き」が主（紹介経由案件）

### 3.3 モードの判定ロジック

議事録から自動判定する優先順位：

1. **議事録に明示的な指示がある** → それに従う
2. **「複数プラン見たい」「比較したい」「選びたい」発言** → `proposal_multi`
3. **顧客が記帳代行か自計化か明確に決めている** → `proposal_single`
4. **判断つかない** → `proposal_single`（デフォルト）

判定理由は config.json の `meta.outputModeReason` に記録する。

---

## 4. 新スキーマ定義

### 4.1 新 `pricing-table.json` v2.0

```json
{
  "version": "2.0",
  "lastUpdated": "2026-04-08",
  "currency": "JPY",
  "taxNote": "上記金額に別途消費税がかかります",

  "salesClasses": {
    "A": { "label": "売上1,000万円未満", "max": 10000000 },
    "B": { "label": "売上3,000万円未満", "max": 30000000 },
    "C": { "label": "売上5,000万円未満", "max": 50000000 },
    "D": { "label": "売上1億円未満", "max": 100000000 },
    "OVER": {
      "label": "売上1億円以上",
      "max": null,
      "requiresManualPricing": true,
      "note": "個別見積り対象。他事務所の料金表を参考に判断"
    }
  },

  "modules": {
    "bookkeeping": {
      "label": "経理サポート（記帳代行）",
      "description": "freeeを活用した記帳代行。あなたの経理担当・経理部長",
      "monthlyMatrix": {
        "100": { "A": 25000, "B": 30000, "C": 30000, "D": 35000 },
        "200": { "A": 30000, "B": 35000, "C": 35000, "D": 40000 }
      },
      "overage": {
        "per100": 5000,
        "note": "200仕訳超は100仕訳ごとに+5,000円/月"
      },
      "deliveryDiscount": {
        "monthly": 0,
        "every2months": -4000,
        "every3months": -5000,
        "every4months": -6000,
        "every6months": -8000
      }
    },

    "selfBookkeeping": {
      "label": "経理サポート（自計化）",
      "description": "お客様自身での記帳。3か月毎にチェック",
      "monthlyMatrix": {
        "100": { "A": 10000, "B": 11000, "C": 13000, "D": 15000 },
        "200": { "A": 12000, "B": 14000, "C": 16000, "D": 20000 }
      },
      "overage": {
        "per100": 3000,
        "note": "200仕訳超は100仕訳ごとに+3,000円/月"
      },
      "initialGuidance": {
        "corporate": {
          "amount": 100000,
          "duration": "3か月",
          "hours": "約5時間",
          "label": "クラウド会計導入支援"
        },
        "individual": {
          "amount": 50000,
          "duration": "2か月",
          "hours": "約2.5時間"
        },
        "additional": { "amount": 20000, "unit": "1時間" }
      }
    },

    "consultation": {
      "label": "相談サポート",
      "description": "あなたの総務部長・経営企画部長",
      "monthlyByClass": { "A": 7000, "B": 8000, "C": 9000, "D": 10000 },
      "extraMeeting": {
        "amount": 2000,
        "unit": "1回追加",
        "note": "定例会議年2回がベース、+2,000円/月で1回追加可"
      }
    }
  },

  "annualFees": {
    "corporateTax": {
      "label": "法人税・事業税等申告報酬",
      "byClass": { "A": 120000, "B": 140000, "C": 160000, "D": 180000 }
    },
    "individualTax": {
      "label": "個人事業申告報酬",
      "byClass": { "A": 80000, "B": 100000, "C": 120000, "D": 140000 }
    },
    "consumptionTax": {
      "label": "消費税等申告報酬",
      "simplified": { "A": 30000, "B": 30000, "C": 40000, "D": null },
      "principle": {
        "A": { "base": 50000, "label": "50,000円~" },
        "B": { "base": 50000, "label": "50,000円~" },
        "C": { "base": 60000, "label": "60,000円~" },
        "D": { "base": 70000, "label": "70,000円~" }
      },
      "note": "簡易課税のDクラスは適用外"
    },
    "yearEndAdjustment": {
      "label": "年末調整報酬",
      "base": { "amount": 20000, "covers": "5人まで" },
      "additional": { "amount": 1000, "unit": "1名増ごと" }
    },
    "statutoryReports": {
      "label": "法定調書報酬",
      "base": { "amount": 10000, "covers": "支払調書5枚まで" },
      "additional": { "amount": 1000, "unit": "1枚増ごと" }
    },
    "salaryReport": {
      "label": "給与支払報告書",
      "amount": 2000,
      "unit": "1自治体につき"
    },
    "fixedAssetReport": {
      "label": "償却資産申告報酬",
      "amount": 15000
    },
    "englishFS": {
      "label": "英文財務諸表作成報酬",
      "amount": 20000
    },
    "auditSupport": {
      "label": "監査対応報酬",
      "amount": 80000,
      "note": "金額は案件ごとに調整"
    }
  },

  "salaryServices": {
    "management": {
      "label": "給与管理プラン",
      "base": 2000,
      "perPerson": 200,
      "description": "社会保険を含めた給与の管理。基本的な給与計算は事業者様"
    },
    "calculation": {
      "label": "給与計算・賞与計算プラン",
      "base": 10000,
      "perPerson": 1000,
      "description": "弊社にて給与・賞与計算を実施"
    },
    "residentTaxUpdate": {
      "label": "住民税更新処理",
      "amount": 200,
      "unit": "1人",
      "note": "6月単月作業"
    },
    "monthlyAdjustment": {
      "label": "算定・月額変更処理",
      "amount": 500,
      "unit": "1人",
      "note": "7月単月作業"
    }
  },

  "automaticDiscounts": {
    "bankSync": {
      "amount": -1000,
      "label": "銀行同期値引き",
      "condition": "メインの預金通帳を会計ソフトと同期"
    },
    "creditCardSync": {
      "amount": -1000,
      "label": "クレジットカード値引き",
      "condition": "メインのクレジットカードを会計ソフトと同期"
    },
    "freeeHRUse": {
      "amount": -1000,
      "label": "人事労務freee利用値引き",
      "condition": "人事労務freeeをご利用"
    },
    "cashBookManual": {
      "amount": -1000,
      "label": "現金出納帳作成値引き",
      "condition": "現金出納帳を所定フォーマットに入力"
    }
  },

  "manualDiscounts": {
    "introduction": {
      "label": "ご紹介値引き",
      "type": "manual",
      "appliesTo": ["monthly", "annual"],
      "note": "紹介経由案件に適用、金額は案件ごとに判断"
    },
    "volume": {
      "label": "出精値引き",
      "type": "manual",
      "appliesTo": ["monthly", "annual"],
      "note": "取引先数・仕訳数等を考慮、金額は案件ごとに判断"
    }
  },

  "surcharges": {
    "freeeHRNotUsed": {
      "amount": 1000,
      "label": "人事労務freee・給与計算代行未利用割増",
      "condition": "社会保険加入で人事労務freeeまたは給与計算代行を利用しない"
    },
    "accrualBasisOption": {
      "amount": 3000,
      "label": "発生主義オプション",
      "note": "金額は案件により変動（3,000円~）"
    },
    "expressDeliveryOption": {
      "amount": 5000,
      "label": "月次特急オプション",
      "note": "金額は案件により変動（5,000円~）"
    }
  }
}
```

### 4.2 新 `config.json` スキーマ v2.0

```json
{
  "meta": {
    "version": "2.0",
    "outputMode": "proposal_single",
    "outputModeReason": "顧客が自計化を明確に希望しているため単一プラン",
    "outputPath": "G:\\共有ドライブ\\06_見込み客\\20260408_漢宇商運\\提案書_漢宇商運_v1.docx",
    "generatedAt": "2026-04-08T10:00:00+09:00"
  },

  "client": {
    "name": "漢宇商運株式会社",
    "nameEn": "GRAND MARINE CO., LTD.",
    "honorific": "御中",
    "industry": "海運代理業",
    "businessDescription": "用船事業、船舶運航・代理事業、船舶売買事業",
    "established": "2026-03-18",
    "fiscalMonth": 2,
    "capital": 20000000,
    "employees": 4,
    "address": "東京都台東区東上野1-12-1 東上野ミヤマビル4階",
    "representative": "加藤 慶彦",
    "annualRevenue": 200000000,
    "annualRevenueNote": "1年目見込み2億円（粗利1千万円）",
    "monthlyTransactions": 30,
    "salesClass": "OVER",
    "requiresManualPricing": true,
    "manualPricingReason": "売上1億円超のため料金表対象外、個別見積り"
  },

  "proposal": {
    "date": "2026-04-08",
    "introduction": {
      "useDefault": false,
      "customParagraphs": [
        "貴社は2026年3月に設立され、用船事業・船舶運航代理事業・船舶売買事業の3本柱で海運代理業を展開されようとしています。",
        "取引の99%以上がドル建てとなる特殊な事業構造の中、freeeを活用した自計化体制の構築から、外貨建取引の処理、消費税還付対応まで、貴社のバックオフィス業務を全面的にサポートいたします。"
      ]
    }
  },

  "challenges": [
    {
      "id": "ch01",
      "title": "ドル建て取引の処理",
      "detail": "取引の99%以上がドル建てのため、為替換算・外貨建債権債務の処理が重要です。",
      "linkedServiceIds": ["sv01", "sv02"]
    },
    {
      "id": "ch02",
      "title": "消費税還付対応",
      "detail": "輸出免税取引が大半となるため、消費税の還付申告が発生します。原則課税での適切な処理が必要です。",
      "linkedServiceIds": ["sv03"]
    },
    {
      "id": "ch03",
      "title": "freee自計化体制の構築",
      "detail": "freeeを導入されたばかりのため、初期設定・運用フローの構築をサポートいたします。",
      "linkedServiceIds": ["sv04"]
    }
  ],

  "services": [
    {
      "id": "sv01",
      "name": "記帳チェック・月次レビュー",
      "detail": "freeeでの自計化に対し、3か月ごとに記帳内容をチェックし試算表をレビュー。"
    },
    {
      "id": "sv02",
      "name": "外貨建取引の処理サポート",
      "detail": "ドル建て取引の換算レート選択、外貨建債権債務の評価をサポート。"
    },
    {
      "id": "sv03",
      "name": "消費税対応",
      "detail": "原則課税に基づく消費税申告、還付申告対応、インボイス対応。"
    },
    {
      "id": "sv04",
      "name": "freee導入支援",
      "detail": "アカウント設定・口座連携・勘定科目マッピングの初期設定。"
    },
    {
      "id": "sv05",
      "name": "決算申告",
      "detail": "法人税・消費税・地方税の確定申告書作成・提出まで一貫対応。"
    },
    {
      "id": "sv06",
      "name": "税務届出・手続代行",
      "detail": "税務届出、納税関連の各種手続き等を代行。"
    }
  ],

  "pricing": {
    "selectedModules": {
      "bookkeeping": false,
      "selfBookkeeping": true,
      "consultation": false
    },

    "manualPricing": {
      "enabled": true,
      "reason": "売上1億円超のため料金表対象外",
      "monthly": {
        "base": 35000,
        "baseLabel": "経理サポート（自計化） 売上規模・取引量を考慮"
      },
      "annual": {
        "corporateTax": 200000,
        "consumptionTax": 70000
      }
    },

    "deliveryFrequency": "every3months",

    "automaticDiscounts": {
      "bankSync": false,
      "creditCardSync": false,
      "freeeHRUse": false,
      "cashBookManual": false
    },

    "manualDiscounts": {
      "introduction": {
        "monthly": 0,
        "annual": 0
      },
      "volume": {
        "monthly": -10000,
        "monthlyReason": "取引先数・仕訳数が少量のため",
        "annual": -50000,
        "annualReason": "取引先数・仕訳数が少量のため"
      }
    },

    "annualOptions": {
      "yearEndAdjustment": { "enabled": true, "people": 1 },
      "statutoryReports": { "enabled": true, "sheets": 5 },
      "salaryReport": { "enabled": false, "municipalities": 0 },
      "fixedAssetReport": { "enabled": false },
      "englishFS": { "enabled": false },
      "auditSupport": { "enabled": false }
    },

    "consumptionTaxMethod": "principle",

    "notes": [
      "上記金額に別途消費税がかかります。",
      "消費税の計算方法が簡易課税の場合、消費税等申告報酬は30,000円（税別）となります。",
      "売上規模は1億円超のため、取引先数・仕訳数を考慮した個別見積りとなっております。"
    ]
  },

  "contractFlow": {
    "useDefault": false,
    "customSteps": [
      { "step": 1, "content": "本提案書のご確認・ご契約", "note": "内容にご同意いただければ契約へ。" },
      { "step": 2, "content": "履歴事項全部証明書PDFのご提供", "note": "貴社にてご手配をお願いいたします。" },
      { "step": 3, "content": "顧問契約書の締結", "note": "当事務所よりドラフトをお送りします。" },
      { "step": 4, "content": "freeeアカウント設定・連携", "note": "口座連携・勘定科目マッピングを設定。" },
      { "step": 5, "content": "外貨建取引フローの整備", "note": "ドル建て取引の処理ルールを整理。" },
      { "step": 6, "content": "2026年3月分からの記帳開始", "note": "freeeでの自計化を開始。" },
      { "step": 7, "content": "3か月ごとの記帳チェック", "note": "以降、定期的なレビューを継続。" }
    ]
  }
}
```

### 4.3 `config.json` スキーマ v2.0（4択型の追加例）

`outputMode: proposal_multi` の場合、`pricing.plans` を配列で持つ：

```json
"pricing": {
  "outputMode": "proposal_multi",
  "plans": [
    {
      "id": "A1",
      "label": "プランA1｜経理サポート（記帳代行）プラン",
      "selectedModules": { "bookkeeping": true, "selfBookkeeping": false, "consultation": false },
      "manualDiscounts": { "introduction": { "monthly": -10000 } }
    },
    {
      "id": "A2",
      "label": "プランA2｜経理サポート（記帳代行）+ 相談サポートプラン",
      "selectedModules": { "bookkeeping": true, "selfBookkeeping": false, "consultation": true },
      "manualDiscounts": { "introduction": { "monthly": -12000 } }
    },
    {
      "id": "B1",
      "label": "プランB1｜経理サポート（自計化）プラン",
      "selectedModules": { "bookkeeping": false, "selfBookkeeping": true, "consultation": false },
      "manualDiscounts": { "introduction": { "monthly": -3000 } }
    },
    {
      "id": "B2",
      "label": "プランB2｜経理サポート（自計化）+ 相談サポートプラン",
      "selectedModules": { "bookkeeping": false, "selfBookkeeping": true, "consultation": true },
      "manualDiscounts": { "introduction": { "monthly": -5000 } }
    }
  ],
  "commonAnnual": {
    "corporateTax": { "amount": 220000, "manualOverride": true },
    "consumptionTax": { "method": "principle", "amount": 70000 },
    "yearEndAdjustment": { "enabled": true, "people": 5 },
    "statutoryReports": { "enabled": true, "sheets": 5 },
    "salaryReport": { "enabled": true, "municipalities": 1 },
    "manualDiscounts": {
      "introduction": { "annual": -30000 }
    }
  },
  "selfBookkeepingFirstYearOnly": {
    "initialGuidance": 100000,
    "manualDiscounts": { "volume": { "annual": -50000 } }
  }
}
```

---

## 5. 議事録抽出ルール

### 5.1 抽出すべき情報

**必須項目**
- 会社名（法人格含む）
- 業種・事業内容
- 売上規模（年商）
- 月間仕訳数（おおよそ）
- 決算月
- 経理体制の希望（記帳代行 / 自計化）
- 紹介経由かどうか

**推奨項目**
- 設立日
- 資本金
- 従業員数
- 代表者名
- 所在地
- 顧客の予算感
- 課題・要望（自由記述）

### 5.2 outputMode の判定ロジック

```
IF 議事録に「複数プラン」「比較したい」「選びたい」発言あり:
  → proposal_multi
ELIF 議事録に「記帳代行で」「自計化で」と明確な希望あり:
  → proposal_single
ELIF 紹介経由案件:
  → proposal_multi（紹介者向けに選択肢を提示する慣習）
ELSE:
  → proposal_single（デフォルト）
```

### 5.3 売上クラス判定

```
annualRevenue < 10,000,000  → A
annualRevenue < 30,000,000  → B
annualRevenue < 50,000,000  → C
annualRevenue < 100,000,000 → D
annualRevenue >= 100,000,000 → OVER（requiresManualPricing = true）
```

`OVER` の場合、`config.json` に以下を必ず含める：
- `client.requiresManualPricing: true`
- `pricing.manualPricing.enabled: true`
- `pricing.manualPricing.reason`
- 提案書生成時に「個別見積り対象」の警告コメントを出力

### 5.4 値引きの判定

**ご紹介値引き**: 議事録に紹介者の名前・「〜さんからのご紹介」等の発言があれば適用候補。金額は手動入力。

**出精値引き**: 議事録に「予算が厳しい」「他社と比較中」等の発言、または取引量が料金表クラスに対して明らかに少ない場合に適用候補。金額は手動入力。

→ どちらも `manualDiscounts` フィールドに格納。スタッフが最終調整可能にする。

---

## 6. テンプレート構造

### 6.1 共通セクション（全モード共通）

1. **表紙**: 会社名 / 提案書日付 / 事務所名 / コンセプト
2. **はじめに**: 拝啓挨拶 + 会社固有の事業説明（custom or default）
3. **貴社の課題認識**: 表形式（課題 / 詳細）
4. **サービス内容**: 表形式（サービス項目 / 内容）
5. **料金プラン**: モードによって構造が変わる（後述）
6. **備考・補足事項**: 経理サポートについて / 相談サポートについて / コミュニケーション体制 / 有効期限・支払条件
7. **ご契約後の流れ**: STEP表（custom or default）
8. **当事務所の概要**: 事務所情報

### 6.2 料金プランセクションの分岐

#### Mode B: `proposal_single`

```
■ 月次料金
| 項目 | 内訳 | 料金（税別） |
| 経理サポート（XXX） | 売上Xクラス | XXX,XXX円 |
| 納品頻度値引き | 3ヶ月に1回納品 | -X,XXX円 |
| 出精値引き | 取引先数・仕訳数が少量のため | -XX,XXX円 |
| 月次料金 合計 | | XX,XXX円 |

■ 年次料金
| 項目 | 内訳 | 料金（税別） |
| 法人税・事業税等申告報酬 | 売上Xクラス | XXX,XXX円 |
| 消費税等申告報酬 | 原則課税 | XX,XXX円 |
| 年末調整報酬 | X名 | XX,XXX円 |
| 法定調書報酬 | | XX,XXX円 |
| 給与支払報告書 | 自治体ごと | X,XXX円 |
| 出精値引き | | -XX,XXX円 |
| 年次料金 合計 | | XXX,XXX円 |
```

#### Mode C: `proposal_multi`

```
プラン A1 ｜ 経理サポート（記帳代行）プラン
■ 月次料金
（A1の月次料金表）

プラン A2 ｜ 経理サポート（記帳代行）+ 相談サポートプラン
■ 月次料金
（A2の月次料金表）

プラン A1、A2 共通
■ 年次料金（毎期）
（共通の年次料金表）

プラン B1 ｜ 経理サポート（自計化）プラン
■ 月次料金
（B1の月次料金表）

プラン B2 ｜ 経理サポート（自計化）+ 相談サポートプラン
■ 月次料金
（B2の月次料金表）

プラン B1、B2 共通
■ 年次料金（毎期）
（共通の年次料金表 = A1/A2と同じ）

■ 年次料金（初年度のみ）※自計化プランのみ
| 項目 | 内訳 | 料金（税別） |
| 初期指導報酬 | クラウド会計導入支援 | 100,000円 |
| 出精値引き | | -50,000円 |
| 年次料金 合計 | | 50,000円 |

■ 年間費用サマリー（税別）
| | プランA1 | プランA2 |
| 月次料金 × 12ヶ月 | XXX,XXX円 | XXX,XXX円 |
| 年次料金 | XXX,XXX円 | XXX,XXX円 |
| 年間合計 | XXX,XXX円 | XXX,XXX円 |

| | プランB1 | プランB2 |
| 月次料金 × 12ヶ月 | XXX,XXX円 | XXX,XXX円 |
| 年次料金（毎期） | XXX,XXX円 | XXX,XXX円 |
| 年次料金（初年度のみ） | XX,XXX円 | XX,XXX円 |
| 年間合計 | XXX,XXX円 | XXX,XXX円 |
```

---

## 7. 既存コードへの影響分析

### 7.1 影響を受けるファイル

| ファイル | 影響度 | 変更内容 |
|---|---|---|
| `references/pricing/pricing-table.json` | 全面刷新 | v1 → v2 スキーマ移行 |
| `src/create-proposal.js` | 大幅改修 | 出力モード分岐、新スキーマ対応 |
| `.claude/skills/proposal-generator/SKILL.md` | 改訂 | 新フローの記述、議事録抽出ルール追加 |
| `references/pricing/config_*.json`（既存） | 移行検討 | 既存案件は v1 のまま、新規は v2 |

### 7.2 後方互換性の方針：v1とv2の並行運用

**方針: v1（現行スキル）をバックアップとして残し、v2を新規追加する並行運用**

リスクヘッジを最優先とし、現行スキルは温存する。

**運用ルール**
- 既存の `proposal-generator` スキルを **`proposal-generator-v1`** にリネームして保持
- 新しい v2 スキルを **`proposal-generator-v2`** として新規作成
- 両方のスキルが共存し、どちらでも提案書を生成可能
- 切り替えはスタッフが指示する際に「v2で生成して」「v1で生成して」と明示
- 当面はv2をメインに使い、v1はフォールバック用途
  - v2で問題が出たとき
  - 過去案件と同じ形式で再生成したいとき
  - スタッフがv2に慣れる前の安全網
- v2が完全に信頼できると判断できたタイミングで、v1の削除を検討

**メリット**
- v2に問題があっても即座にv1で生成可能（リスクゼロ）
- 過去案件と同じ形式の提案書を再現できる
- スタッフへの段階的な移行が可能

### 7.3 ファイル構成（変更後）

```
proposal/
├── .claude/skills/
│   ├── proposal-generator-v1/        ← 現行スキル（リネームのみ）
│   │   ├── SKILL.md
│   │   └── ...
│   └── proposal-generator-v2/        ← 新規作成
│       ├── SKILL.md
│       └── ...
├── src/
│   ├── v1/                            ← 現行コードを移動
│   │   └── create-proposal.js
│   └── v2/                            ← 新規作成
│       ├── create-proposal.js
│       ├── modes/
│       │   ├── proposal-single.js
│       │   └── proposal-multi.js
│       ├── pricing-calculator.js
│       └── extractors/
│           └── transcript-parser.js
├── references/
│   ├── pricing/
│   │   ├── pricing-table.json         ← v2用（新規）
│   │   └── pricing-table-v1.json      ← v1用（リネーム）
│   ├── samples/
│   │   ├── config-v2-single-example.json
│   │   └── config-v2-multi-example.json
│   └── ...
├── docs/
│   └── redesign-v2.md（本ドキュメント）
└── ...
```

### 7.4 v1からv2への移行作業（フェーズ1の最初に実施）

1. `.claude/skills/proposal-generator/` を `.claude/skills/proposal-generator-v1/` にリネーム
2. `src/` 配下の現行ファイルを `src/v1/` に移動
3. `references/pricing/pricing-table.json` を `references/pricing/pricing-table-v1.json` にリネーム
4. v1スキルのSKILL.md内のパス参照を `src/v1/`、`pricing-table-v1.json` に更新
5. v1で既存案件（漢宇商運）の提案書生成を1回テストし、リネーム後も動作することを確認
6. その後、v2の新規ファイル作成に着手

---

## 8. 段階的実装プラン

### フェーズ1: v1バックアップ + 料金構造（pricing-table.json更新）

**作業内容**

**ステップ0: v1のバックアップ（最優先）**
1. `.claude/skills/proposal-generator/` → `.claude/skills/proposal-generator-v1/` にリネーム
2. `src/` 配下の現行ファイルを `src/v1/` に移動
3. `references/pricing/pricing-table.json` → `pricing-table-v1.json` にリネーム
4. v1スキル内のパス参照を更新
5. v1で漢宇商運の提案書を1回再生成し、リネーム後も動作することを確認

**ステップ1: v2の料金構造を新規作成**
1. 新 `references/pricing/pricing-table.json` v2.0 を作成
2. `src/v2/pricing-calculator.js` を新規作成
   - `calculateMonthlyFee(salesClass, transactionCount, module, deliveryFrequency, discounts)` 関数
   - `calculateAnnualFees(salesClass, options, discounts)` 関数
   - `requiresManualPricing(salesClass)` 判定関数
3. ユニットテスト: 既存4社の料金を再現できるか検証
   - Bangkok Solar: 月50,000円 / 年397,000円
   - MegaSolar: 月25,000円 / 年245,000円
   - 企業経営サポート宮崎: 月20,000円 / 年205,000円
   - 日本アンプル: 月12,000円 / 年175,000円

**成果物**: 新 pricing-table.json + pricing-calculator.js + テストレポート

**完了条件**: 4社全てで既存提案書の料金と一致

---

### フェーズ2: configスキーマ移行

**作業内容**
1. 新 `config.json` v2.0 スキーマの JSON Schema 定義を作成
2. 既存4社 + Back UP + 漢宇商運 のサンプル `config.json` を v2.0 で作成
   - `config-v2-bangkok-solar.json`
   - `config-v2-megasolar.json`
   - `config-v2-kigyou-keiei-miyazaki.json`
   - `config-v2-nihon-ample.json`
   - `config-v2-backup-multi.json`（4択型サンプル）
   - `config-v2-kanuu-shoun.json`（個別見積りサンプル）
3. SKILL.md を改訂し、議事録から v2.0 config.json を生成するフローを記述
4. 議事録抽出ルール（outputMode判定、値引き判定、1億円超フラグ）を SKILL.md に追記

**成果物**: 6つのサンプル config.json + 改訂版 SKILL.md

**完了条件**: 既存提案書を再現できる config.json が揃う

---

### フェーズ3: 2モードテンプレート実装

**作業内容**
1. `src/modes/proposal-single.js` を新規作成
   - 8セクションを生成する関数群
   - フェーズ1の `pricing-calculator.js` を呼び出して料金算出
   - 単一プラン提案用のテーブル構造
2. `src/modes/proposal-multi.js` を新規作成
   - 8セクションを生成する関数群
   - 4プラン併記、年間費用サマリー対応
   - 自計化プランの「初年度のみ」セクション対応
3. `src/create-proposal.js` を改修
   - `meta.outputMode` で分岐
   - 共通セクション（表紙〜備考）と料金プランセクションを分離
4. エンドツーエンドテスト
   - フェーズ2で作った6サンプル全てで提案書を生成
   - 既存提案書（PDFサンプル）と内容比較
   - 漢宇商運のv2提案書を生成し、v1との改善を確認

**成果物**: 動作する v2.0 proposal-generator + 6社分のテスト生成物

**完了条件**: 既存提案書が忠実に再現でき、漢宇商運のv2提案書が生成される

---

## 9. テストケース

### 9.1 料金計算の再現テスト（フェーズ1）

**注意**: 以下のサンプル4社は、いずれも海外関連の特殊案件であり、年次料金に「英文財務諸表作成報酬 20,000円」を含む。
通常の標準案件では英文FSは含まれないため、テストケース実装時はサンプル案件の特殊オプションを正確に反映すること。

| 案件 | プラン | 売上クラス | 仕訳 | 月次期待 | 年次期待 | 含まれる特殊オプション |
|---|---|---|---|---|---|---|
| MegaSolar1456-EC | 記帳代行 | D（売上1億未満として扱い） | 30件 | 25,000 | 245,000 | 償却資産申告(15,000)、英文FS(20,000) |
| 企業経営サポート宮崎 | 記帳代行 | C（5,000万未満） | 不明 | 20,000 | 205,000 | 償却資産申告(15,000)、英文FS(20,000) |
| 日本アンプル | 記帳代行 | A（休眠状態） | ほぼなし | 12,000 | 175,000 | 償却資産申告(15,000)、英文FS(20,000) |
| Bangkok Solar | 記帳代行 | OVER（1.4億） | 不明 | 50,000 | 397,000 | 償却資産申告(15,000)、英文FS(20,000)、監査対応(80,000) |

**期待値の内訳**

各案件の年次料金内訳（PDFサンプルを参照）:

**MegaSolar1456-EC（年次合計 245,000円）**
- 法人税・事業税等申告報酬（売上1億未満）: 180,000
- 消費税等申告報酬（原則課税）: 70,000
- 法定調書報酬: 10,000
- 償却資産申告報酬: 15,000
- 英文財務諸表作成報酬: 20,000
- 出精値引き: -50,000
- 合計: 245,000

**企業経営サポート宮崎（年次合計 205,000円）**
- 法人税・事業税等申告報酬（売上5,000万未満）: 160,000
- 消費税等申告報酬（原則課税）: 60,000
- 法定調書報酬: 10,000
- 償却資産申告報酬: 15,000
- 英文財務諸表作成報酬: 20,000
- 出精値引き: -60,000
- 合計: 205,000

**日本アンプル電力（年次合計 175,000円）**
- 法人税・事業税等申告報酬（売上1,000万未満）: 120,000
- 消費税等申告報酬（原則課税）: 50,000
- 法定調書報酬: 10,000
- 償却資産申告報酬: 15,000
- 英文財務諸表作成報酬: 20,000
- 出精値引き: -40,000
- 合計: 175,000

**Bangkok Solar Power Japan（年次合計 397,000円）**
- 法人税・事業税等申告報酬（売上3億円未満 ※料金表外、個別見積り）: 250,000
- 消費税等申告報酬（原則課税）: 80,000
- 年末調整報酬（1名）: 20,000
- 法定調書報酬: 10,000
- 給与支払報告書: 2,000
- 償却資産申告報酬: 15,000
- 英文財務諸表作成報酬: 20,000
- 監査対応報酬: 80,000
- 出精値引き: -80,000
- 合計: 397,000

**Bangkok Solarについての注記**: 売上1.4億円のため売上クラスは `OVER` となり、料金マトリクスの対象外。`manualPricing` モードで個別見積りを行う。テストはフェーズ2の `manualPricing` 機能実装時に実施する。

**Back UP（4択型サンプル）**

| プラン | 月次期待 | 年次期待 | 備考 |
|---|---|---|---|
| Back UP A1（記帳代行のみ） | 55,000 | 292,000 | ご紹介値引き適用 |
| Back UP A2（記帳代行+相談） | 65,000 | 292,000 | ご紹介値引き適用 |
| Back UP B1（自計化のみ） | 32,000 | 292,000 + 50,000(初年度) | ご紹介値引き適用 |
| Back UP B2（自計化+相談） | 42,000 | 292,000 + 50,000(初年度) | ご紹介値引き適用 |

**注**: Back UPは売上2億円のため売上クラスは `OVER`。料金マトリクスではなく `manualPricing` モードで再現する。フェーズ2で `proposal_multi` モード実装時にテスト実施。

### 9.2 提案書生成のエンドツーエンドテスト（フェーズ3）

各サンプルで提案書を生成し、以下を確認:
- セクション構成が既存提案書と一致
- 料金が一致
- 課題・サービスがconfig通りに表示
- 出力モードが正しく分岐

---

## 10. 将来の拡張余地

今回スコープ外だが、将来的に検討する項目:

- **Mode A: `quick_quote`（簡易見積書）**: 武市様サンプルのような契約前確認書スタイル
- **業種別ボイラープレート**: 課題・サービスの初期値テンプレート
- **事業計画書の自動抽出**: 画像PDFのOCR対応
- **過去案件からの類似度マッチング**: 似た規模・業種の過去案件を参考に値引き額を提案
- **G:\共有ドライブからの自動入力**: フォルダ指定だけで議事録・事業計画書を自動取得

---

## 11. 設計上の重要な原則

1. **データと表現の分離**: 料金計算（pricing-calculator）、案件情報（config）、出力（modes/）は完全分離
2. **手動入力の優先**: スタッフが最終調整できる箇所を残す（出精値引き・紹介値引き・manualPricing）
3. **失敗の見える化**: 1億円超やデータ不足は警告し、勝手に推測しない
4. **既存運用への配慮**: G:\共有ドライブ\06_見込み客\{YYYYMMDD}_{お客様名}\ の運用フローを尊重
5. **議事録は唯一の信頼源ではない**: 抽出できなかった項目は「不明」と明示し、スタッフに判断を委ねる

---

**設計書ここまで**
