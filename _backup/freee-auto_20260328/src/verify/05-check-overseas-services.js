// ============================================================
// 海外インターネットサービス 消費税区分チェックエンジン
// freeeの取引データから海外サービスを検出し、消費税区分の適正性を検証
// ============================================================

const fs = require('fs');
const path = require('path');
const rules = require('../shared/rules');
const {
  OVERSEAS_SERVICES,
  ADVERTISING_KEYWORDS,
  TAX_TREATMENT_TO_FREEE_CODES,
  SMALL_AMOUNT_THRESHOLD,
} = require('../shared/overseas-services');

class OverseasServiceTaxChecker {
  constructor(dataDir, options = {}) {
    this.dataDir = dataDir;
    this.rawDir = path.join(dataDir, 'raw');
    this.analysisDir = path.join(dataDir, 'analysis');

    if (!fs.existsSync(this.analysisDir)) {
      fs.mkdirSync(this.analysisDir, { recursive: true });
    }

    // Load config
    this.config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    this.companyId = this.config.company_id;
    this.freeeBaseUrl = 'https://secure.freee.co.jp';

    // 課税売上割合（デフォルト95%以上と仮定）
    this.taxableSalesRatio = options.taxableSalesRatio || 95;
    this.isRatioAbove95 = this.taxableSalesRatio >= 95;

    // Load account items mapping
    this.accountItems = this.loadAccountItems();

    // Findings array
    this.findings = [];
    // マッチしたサービスのサマリー
    this.matchedServices = {};
  }

  loadAccountItems() {
    const filePath = path.join(this.rawDir, 'account_items.json');
    if (!fs.existsSync(filePath)) {
      console.warn('Warning: account_items.json not found');
      return {};
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const items = data.account_items || data;
    const map = {};
    (Array.isArray(items) ? items : []).forEach(item => {
      map[item.id] = {
        name: item.name,
        category: item.account_category || '',
        defaultTaxCode: item.default_tax_code || item.tax_code,
      };
    });
    return map;
  }

  loadDeals(type) {
    const deals = [];
    const singleFile = path.join(this.rawDir, `deals_${type}.json`);
    if (fs.existsSync(singleFile)) {
      const data = JSON.parse(fs.readFileSync(singleFile, 'utf-8'));
      deals.push(...(data.deals || data));
    }
    for (let i = 1; i <= 100; i++) {
      const pageFile = path.join(this.rawDir, `deals_${type}_p${i}.json`);
      if (!fs.existsSync(pageFile)) break;
      const data = JSON.parse(fs.readFileSync(pageFile, 'utf-8'));
      deals.push(...(data.deals || data));
    }
    return deals;
  }

  loadManualJournals() {
    const filePath = path.join(this.rawDir, 'manual_journals.json');
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data.manual_journals || data;
  }

  getAccountName(id) {
    return this.accountItems[id]?.name || `不明(${id})`;
  }

  containsKeyword(text, keywords) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  // 取引テキストからサービスをマッチング
  matchService(deal, detail) {
    const desc = (detail.description || '').toLowerCase();
    const partner = (deal.partner_name || detail.partner_name || '').toLowerCase();
    const itemName = (detail.item_name || '').toLowerCase();
    const combined = `${desc} ${partner} ${itemName}`;

    for (const service of OVERSEAS_SERVICES) {
      // キーワードマッチ（摘要・品目名）
      const keywordMatch = service.keywords.some(kw => combined.includes(kw.toLowerCase()));
      // 取引先名マッチ
      const partnerMatch = service.partnerKeywords.some(kw => partner.includes(kw.toLowerCase()));

      if (keywordMatch || partnerMatch) {
        return service;
      }
    }
    return null;
  }

  // 期待される税区分コードかどうかを判定
  isExpectedTaxCode(taxCode, service) {
    const treatment = this.isRatioAbove95
      ? service.expectedTaxTreatment
      : service.expectedTaxTreatmentUnder95;

    if (treatment === 'check_required') return null; // 判定不能

    const expectedCodes = TAX_TREATMENT_TO_FREEE_CODES[treatment] || [];

    // リバースチャージは特殊処理（コードが会社設定依存）
    if (treatment === 'reverse_charge') return null;

    if (expectedCodes.length === 0) return null;
    return expectedCodes.includes(taxCode);
  }

  // 取引の期待される消費税区分の説明テキスト
  getExpectedTreatmentLabel(service) {
    const treatment = this.isRatioAbove95
      ? service.expectedTaxTreatment
      : service.expectedTaxTreatmentUnder95;

    const labels = {
      taxable_10: '課対仕入10%',
      taxable_domestic: '課対仕入10%（国内取引）',
      non_taxable: '対象外',
      no_credit: '対象外（仕入税額控除不可）',
      reverse_charge: 'リバースチャージ方式',
      check_required: '要確認',
    };
    return labels[treatment] || treatment;
  }

  addFinding(severity, category, deal, detail, issue, explanation, service) {
    const dealType = deal._type || 'deal';
    let freeeLink;
    if (dealType === 'manual_journal') {
      freeeLink = `${this.freeeBaseUrl}/reports/journals?manual_journal_id=${deal.id}&company_id=${this.companyId}`;
    } else {
      freeeLink = `${this.freeeBaseUrl}/reports/journals?deal_id=${deal.id}&company_id=${this.companyId}`;
    }

    this.findings.push({
      severity,
      category,
      date: deal.issue_date,
      dealId: deal.id,
      dealType,
      accountName: this.getAccountName(detail.account_item_id),
      partnerName: deal.partner_name || detail.partner_name || '',
      itemName: detail.item_name || '',
      amount: detail.amount,
      taxCode: detail.tax_code,
      taxCodeName: rules.TAX_CODE_NAMES[detail.tax_code] || `code:${detail.tax_code}`,
      description: detail.description || deal.description || '',
      entrySide: detail.entry_side,
      issue,
      explanation,
      freeeLink,
      // 海外サービス固有
      matchedServiceId: service?.id || null,
      matchedServiceName: service?.serviceName || null,
      serviceType: service?.serviceType || null,
      invoiceRegistered: service?.invoiceRegistered || null,
      invoiceNumber: service?.invoiceNumber || null,
      expectedTreatment: service ? this.getExpectedTreatmentLabel(service) : null,
    });
  }

  // ============================================================
  // メインチェック: 海外サービス取引の消費税区分検証
  // ============================================================
  checkOverseasServiceTax(deals) {
    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;

        const service = this.matchService(deal, det);
        if (!service) return;

        // サービスマッチのサマリー記録
        if (!this.matchedServices[service.id]) {
          this.matchedServices[service.id] = {
            service,
            transactions: [],
            totalAmount: 0,
          };
        }
        this.matchedServices[service.id].transactions.push({
          date: deal.issue_date,
          dealId: deal.id,
          amount: det.amount,
          taxCode: det.tax_code,
        });
        this.matchedServices[service.id].totalAmount += det.amount;

        const taxCodeName = rules.TAX_CODE_NAMES[det.tax_code] || `code:${det.tax_code}`;
        const expectedLabel = this.getExpectedTreatmentLabel(service);
        const isCorrect = this.isExpectedTaxCode(det.tax_code, service);

        // === ケース1: 国内事業者経由のサービス ===
        if (service.isDomestic) {
          if (isCorrect === false) {
            this.addFinding('🔴', '海外サービス税区分', deal, det,
              `${service.serviceName}: 国内取引ですが税区分が「${taxCodeName}」になっています`,
              `${service.provider}は国内法人です。国内取引として「${expectedLabel}」で処理してください。${service.notes}`,
              service
            );
          } else {
            this.addFinding('🔵', '海外サービス税区分', deal, det,
              `${service.serviceName}: 国内取引・税区分「${taxCodeName}」（正常）`,
              `${service.provider}（${service.country}）。${service.notes}`,
              service
            );
          }
          return;
        }

        // === ケース2: 事業者向けサービス ===
        if (service.serviceType === 'business') {
          if (this.isRatioAbove95) {
            // 課税売上割合95%以上 → 対象外
            if (det.tax_code !== 2) {
              this.addFinding('🔴', '海外サービス税区分', deal, det,
                `${service.serviceName}: 事業者向け電気通信利用役務ですが税区分が「${taxCodeName}」になっています`,
                `${service.provider}（${service.country}）の事業者向けサービスです。課税売上割合95%以上のため「対象外」として処理してください。特定課税仕入れはなかったものとみなされます。${service.notes}`,
                service
              );
            } else {
              this.addFinding('🔵', '海外サービス税区分', deal, det,
                `${service.serviceName}: 事業者向け・対象外（正常）`,
                `${service.provider}（${service.country}）。課税売上割合95%以上のため対象外。${service.notes}`,
                service
              );
            }
          } else {
            // 課税売上割合95%未満 → リバースチャージ
            this.addFinding('🟡', '海外サービス税区分', deal, det,
              `${service.serviceName}: 事業者向け電気通信利用役務（リバースチャージ対象）`,
              `${service.provider}（${service.country}）。課税売上割合${this.taxableSalesRatio}%（95%未満）のため、リバースチャージ方式での申告が必要です。仮受消費税・仮払消費税の両建て計上を確認してください。${service.notes}`,
              service
            );
          }
          return;
        }

        // === ケース3: 消費者向けサービス ===
        if (service.serviceType === 'consumer') {
          if (service.invoiceRegistered === true) {
            // インボイス登録済 → 課税取引
            if (isCorrect === false) {
              this.addFinding('🔴', '海外サービス税区分', deal, det,
                `${service.serviceName}: 登録国外事業者ですが税区分が「${taxCodeName}」になっています`,
                `${service.provider}（${service.country}）はインボイス登録済（${service.invoiceNumber || '番号要確認'}）です。「${expectedLabel}」で処理してください。消費者向け電気通信利用役務の提供として仕入税額控除が可能です。${service.notes}`,
                service
              );
            } else {
              this.addFinding('🔵', '海外サービス税区分', deal, det,
                `${service.serviceName}: 消費者向け・登録済・税区分「${taxCodeName}」（正常）`,
                `${service.provider}（${service.country}）。インボイス登録済（${service.invoiceNumber || '番号要確認'}）。${service.notes}`,
                service
              );
            }
          } else if (service.invoiceRegistered === false) {
            // 未登録 → 仕入税額控除不可
            const isTaxed = det.tax_code !== 2;
            const isSmallAmount = det.amount < SMALL_AMOUNT_THRESHOLD;

            if (isTaxed && !isSmallAmount) {
              this.addFinding('🔴', '海外サービス税区分', deal, det,
                `${service.serviceName}: 未登録国外事業者ですが課税仕入（${taxCodeName}）で処理されています`,
                `${service.provider}（${service.country}）はインボイス未登録の国外事業者です。消費者向け電気通信利用役務の提供ですが、仕入税額控除はできません（国外事業者のため80%控除の経過措置も適用不可）。「対象外」で処理してください。${service.notes}`,
                service
              );
            } else if (isTaxed && isSmallAmount) {
              this.addFinding('🟡', '海外サービス税区分', deal, det,
                `${service.serviceName}: 未登録国外事業者（${det.amount.toLocaleString()}円・少額特例適用可能性あり）`,
                `${service.provider}（${service.country}）はインボイス未登録ですが、税込1万円未満のため少額特例の対象です。ただし、少額特例の適用要件（基準期間の課税売上高1億円以下等）を満たしているか確認してください。${service.notes}`,
                service
              );
            } else {
              this.addFinding('🔵', '海外サービス税区分', deal, det,
                `${service.serviceName}: 未登録国外事業者・対象外（正常）`,
                `${service.provider}（${service.country}）。インボイス未登録のため仕入税額控除不可。${service.notes}`,
                service
              );
            }
          } else {
            // 登録状況不明 → 要確認
            this.addFinding('🟡', '海外サービス税区分', deal, det,
              `${service.serviceName}: 登録状況要確認（現在の税区分: ${taxCodeName}）`,
              `${service.provider}（${service.country}）のインボイス登録状況を確認してください。登録済であれば課税取引、未登録であれば仕入税額控除不可です。登録国外事業者名簿で確認: https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf ${service.notes}`,
              service
            );
          }
          return;
        }

        // === ケース4: mixed（サービスにより異なる） ===
        if (service.serviceType === 'mixed') {
          this.addFinding('🟡', '海外サービス税区分', deal, det,
            `${service.serviceName}: 利用プラン・サービスにより消費税区分が異なります（現在: ${taxCodeName}）`,
            `${service.provider}（${service.country}）。${service.notes} 利用しているプラン・サービスの内容を確認し、事業者向けか消費者向けかを判定してください。`,
            service
          );
        }
      });
    });
  }

  // ============================================================
  // 広告費の追加チェック: 広告宣伝費科目で海外サービスが未検出の場合
  // ============================================================
  checkUnmatchedAdvertising(deals) {
    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const accountName = this.getAccountName(det.account_item_id);

        // 広告宣伝費関連科目のみ
        if (!accountName.includes('広告') && !accountName.includes('販売促進')) return;

        const service = this.matchService(deal, det);
        if (service) return; // 既にマッチ済みはスキップ

        // 海外っぽいキーワードがあるか
        const desc = (det.description || '') + ' ' + (deal.partner_name || '');
        const foreignKeywords = [
          'inc.', 'ltd.', 'corp.', 'llc', 'pte', 'b.v.', 'gmbh',
          'usa', 'us', 'singapore', 'ireland', 'uk',
          'tiktok', 'ティックトック', 'linkedin', 'リンクトイン',
          'pinterest', 'ピンタレスト', 'snapchat', 'スナップチャット',
        ];

        if (this.containsKeyword(desc, foreignKeywords)) {
          this.addFinding('🟡', '海外サービス税区分', deal, det,
            `海外事業者の可能性がある広告費: ${det.amount.toLocaleString()}円（${deal.partner_name || '取引先未設定'}）`,
            `広告宣伝費に海外事業者と思われる取引があります。インターネット広告は事業者向け電気通信利用役務の提供に該当する可能性が高いです。課税売上割合95%以上の場合は「対象外」、95%未満の場合は「リバースチャージ方式」での処理が必要です。取引先と税区分を確認してください。`,
            null
          );
        }
      });
    });
  }

  // ============================================================
  // サマリー生成
  // ============================================================
  generateSummary() {
    const summary = {
      checkDate: new Date().toISOString().split('T')[0],
      companyId: this.companyId,
      period: `${this.config.period_start} ~ ${this.config.period_end}`,
      taxableSalesRatio: this.taxableSalesRatio,
      isRatioAbove95: this.isRatioAbove95,
      totalFindings: this.findings.length,
      findingsBySeverity: {
        red: this.findings.filter(f => f.severity === '🔴').length,
        yellow: this.findings.filter(f => f.severity === '🟡').length,
        blue: this.findings.filter(f => f.severity === '🔵').length,
      },
      matchedServices: Object.entries(this.matchedServices).map(([id, data]) => ({
        serviceId: id,
        serviceName: data.service.serviceName,
        provider: data.service.provider,
        country: data.service.country,
        serviceType: data.service.serviceType,
        invoiceRegistered: data.service.invoiceRegistered,
        invoiceNumber: data.service.invoiceNumber,
        expectedTreatment: this.getExpectedTreatmentLabel(data.service),
        transactionCount: data.transactions.length,
        totalAmount: data.totalAmount,
      })),
      rules: {
        description: '電気通信利用役務の提供に関する消費税チェック',
        referenceUrl: 'https://www.nta.go.jp/publication/pamph/shohi/cross/touroku.pdf',
        keyRules: [
          '事業者向け（広告・ECプラットフォーム等）: 課税売上割合95%以上→対象外、95%未満→リバースチャージ',
          '消費者向け・インボイス登録済: 課対仕入10%（仕入税額控除可能）',
          '消費者向け・インボイス未登録（国外事業者）: 対象外（仕入税額控除不可、80%控除経過措置も不可）',
          '消費者向け・インボイス未登録（国内事業者）: 少額特例あり、80%控除経過措置あり',
          '少額特例: 税込1万円未満の取引は帳簿のみで仕入税額控除可能（基準期間の課税売上高1億円以下等の要件あり）',
        ],
      },
    };
    return summary;
  }

  // ============================================================
  // メイン実行
  // ============================================================
  run() {
    console.log('=== 海外インターネットサービス 消費税区分チェック開始 ===');
    console.log(`対象期間: ${this.config.period_start} ~ ${this.config.period_end}`);
    console.log(`課税売上割合: ${this.taxableSalesRatio}%（${this.isRatioAbove95 ? '95%以上' : '95%未満'}）`);

    // データ読み込み
    const expenseDeals = this.loadDeals('expense');
    const incomeDeals = this.loadDeals('income');
    const manualJournals = this.loadManualJournals();

    expenseDeals.forEach(d => { d._type = 'deal'; });
    incomeDeals.forEach(d => { d._type = 'deal'; });
    manualJournals.forEach(j => { j._type = 'manual_journal'; });

    const allDeals = [...expenseDeals, ...incomeDeals];

    console.log(`取引データ: 支出${expenseDeals.length}件, 収入${incomeDeals.length}件, 振替伝票${manualJournals.length}件`);

    // チェック実行
    console.log('海外サービス消費税区分チェック中...');
    this.checkOverseasServiceTax(allDeals);
    this.checkOverseasServiceTax(manualJournals);
    this.checkUnmatchedAdvertising(allDeals);

    // サマリー生成
    const summary = this.generateSummary();

    // 結果出力
    const findingsPath = path.join(this.analysisDir, 'overseas_service_tax_findings.json');
    const summaryPath = path.join(this.analysisDir, 'overseas_service_tax_summary.json');

    fs.writeFileSync(findingsPath, JSON.stringify(this.findings, null, 2), 'utf-8');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    // コンソールサマリー
    console.log('\n=== 海外サービス消費税チェック結果 ===');
    console.log(`🔴 要修正: ${summary.findingsBySeverity.red}件`);
    console.log(`🟡 要確認: ${summary.findingsBySeverity.yellow}件`);
    console.log(`🔵 参考情報: ${summary.findingsBySeverity.blue}件`);
    console.log(`合計: ${summary.totalFindings}件`);

    if (summary.matchedServices.length > 0) {
      console.log('\n--- 検出された海外サービス ---');
      summary.matchedServices.forEach(s => {
        const invoiceStatus = s.invoiceRegistered === true ? '登録済' :
          s.invoiceRegistered === false ? '未登録' : '要確認';
        console.log(`  ${s.serviceName} (${s.provider})`);
        console.log(`    区分: ${s.serviceType} / インボイス: ${invoiceStatus} / 期待税区分: ${s.expectedTreatment}`);
        console.log(`    取引数: ${s.transactionCount}件 / 合計: ${s.totalAmount.toLocaleString()}円`);
      });
    }

    console.log(`\n結果保存: ${findingsPath}`);
    console.log(`サマリー: ${summaryPath}`);

    return { findings: this.findings, summary };
  }
}

// CLI実行
if (require.main === module) {
  const args = process.argv.slice(2);
  const dataDir = args[0];
  const taxableSalesRatio = args[1] ? parseFloat(args[1]) : 95;

  if (!dataDir) {
    console.error('Usage: node 05-check-overseas-services.js <data-dir> [課税売上割合(%)]]');
    console.error('  e.g., node 05-check-overseas-services.js data/474381/2025-03-20');
    console.error('  e.g., node 05-check-overseas-services.js data/474381/2025-03-20 80');
    process.exit(1);
  }

  const checker = new OverseasServiceTaxChecker(dataDir, { taxableSalesRatio });
  checker.run();
}

module.exports = OverseasServiceTaxChecker;
