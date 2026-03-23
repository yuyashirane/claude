// ============================================================
// 取引分析エンジン
// freeeの取引データ(deals, manual_journals)を1件1件チェック
// ============================================================

const fs = require('fs');
const path = require('path');
const rules = require('../shared/rules');

class TransactionAnalyzer {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.rawDir = path.join(dataDir, 'raw');
    this.analysisDir = path.join(dataDir, 'analysis');

    if (!fs.existsSync(this.analysisDir)) {
      fs.mkdirSync(this.analysisDir, { recursive: true });
    }

    // Load config
    this.config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    this.companyId = this.config.company_id;
    this.freeeBaseUrl = `https://secure.freee.co.jp`;

    // Load account items mapping
    this.accountItems = this.loadAccountItems();

    // Findings array
    this.findings = [];
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
        categories: item.categories || [],
        defaultTaxCode: item.default_tax_code || item.tax_code,
        groupName: item.group_name || '',
      };
    });
    return map;
  }

  loadDeals(type) {
    const deals = [];
    // Try single file first
    const singleFile = path.join(this.rawDir, `deals_${type}.json`);
    if (fs.existsSync(singleFile)) {
      const data = JSON.parse(fs.readFileSync(singleFile, 'utf-8'));
      deals.push(...(data.deals || data));
    }
    // Also try paginated files
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

  getAccountCategory(id) {
    return this.accountItems[id]?.category || '';
  }

  isExpenseCategory(id) {
    const cat = this.getAccountCategory(id);
    return rules.EXPENSE_CATEGORIES_FOR_ASSET_CHECK.includes(cat);
  }

  isExcludedFromAssetCheck(id) {
    const name = this.getAccountName(id);
    return rules.ASSET_CHECK_EXCLUDE_ACCOUNTS.some(ex => name.includes(ex));
  }

  containsKeyword(text, keywords) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  addFinding(severity, category, deal, detail, issue, explanation) {
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
      accountCategory: this.getAccountCategory(detail.account_item_id),
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
    });
  }

  // ============================================================
  // ルール1: 高額費用の固定資産化チェック (10万円以上)
  // ============================================================
  checkFixedAssetThreshold(deals) {
    deals.forEach(deal => {
      if (deal.type !== 'expense') return;

      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        if (!this.isExpenseCategory(det.account_item_id)) return;
        if (this.isExcludedFromAssetCheck(det.account_item_id)) return;

        // 月額費用は除外
        const desc = det.description || '';
        if (this.containsKeyword(desc, rules.MONTHLY_KEYWORDS)) return;

        if (det.amount >= rules.ASSET_THRESHOLDS.HIGH) {
          this.addFinding('🔴', '固定資産化', deal, det,
            `${this.getAccountName(det.account_item_id)}に${det.amount.toLocaleString()}円の取引があります（30万円以上）`,
            '30万円以上の支出は原則として固定資産に計上すべきです。中小企業者の少額減価償却資産の特例（30万円未満）は適用できません。取得した資産の内容を確認し、適切な固定資産科目への振替を検討してください。'
          );
        } else if (det.amount >= rules.ASSET_THRESHOLDS.MEDIUM) {
          this.addFinding('🟡', '固定資産化', deal, det,
            `${this.getAccountName(det.account_item_id)}に${det.amount.toLocaleString()}円の取引があります（20万円以上）`,
            '20万円以上の支出は一括償却資産（3年均等償却）の対象です。中小企業者は少額減価償却資産の特例（年間300万円まで一括費用化）も選択可能です。'
          );
        } else if (det.amount >= rules.ASSET_THRESHOLDS.LOW) {
          this.addFinding('🔵', '固定資産化', deal, det,
            `${this.getAccountName(det.account_item_id)}に${det.amount.toLocaleString()}円の取引があります（10万円以上）`,
            '10万円以上の備品等は減価償却資産に該当する場合があります。使用可能期間が1年以上かつ取得価額が10万円以上のものは、固定資産計上を検討してください。'
          );
        }
      });
    });
  }

  // ============================================================
  // ルール2: 修繕費の資本的支出チェック
  // ============================================================
  checkRepairCapex(deals) {
    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const name = this.getAccountName(det.account_item_id);
        if (!name.includes('修繕')) return;

        if (det.amount >= rules.REPAIR_THRESHOLDS.HIGH) {
          this.addFinding('🔴', '修繕費/資本的支出', deal, det,
            `修繕費に${det.amount.toLocaleString()}円の高額取引があります`,
            '60万円以上の修繕費は資本的支出（固定資産計上）の可能性が高いです。修繕の内容を確認し、価値の増加・耐用年数の延長がある場合は固定資産に計上してください。60万円未満または取得価額の10%以下であれば修繕費として処理可能です。'
          );
        } else if (det.amount >= rules.REPAIR_THRESHOLDS.MEDIUM) {
          this.addFinding('🟡', '修繕費/資本的支出', deal, det,
            `修繕費に${det.amount.toLocaleString()}円の取引があります`,
            '20万円以上の修繕費は、資本的支出か修繕費かの判定が必要です。原状回復・維持管理の場合は修繕費、価値増加・耐用年数延長の場合は資本的支出（固定資産）です。'
          );
        }
      });
    });
  }

  // ============================================================
  // ルール3: 外注費チェック（給与区分・源泉・期間按分）
  // ============================================================
  checkOutsourcing(deals) {
    // まず外注費の取引を取引先別に集計
    const outsourcingByPartner = {};

    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const name = this.getAccountName(det.account_item_id);
        if (!this.containsKeyword(name, rules.OUTSOURCING_KEYWORDS)) return;

        const partner = deal.partner_name || det.partner_name || '(取引先未設定)';
        const month = deal.issue_date.substring(0, 7); // YYYY-MM

        if (!outsourcingByPartner[partner]) {
          outsourcingByPartner[partner] = {};
        }
        if (!outsourcingByPartner[partner][month]) {
          outsourcingByPartner[partner][month] = 0;
        }
        outsourcingByPartner[partner][month] += det.amount;

        // 高額外注費の期間按分チェック
        if (det.amount >= 500000) {
          this.addFinding('🟡', '外注費', deal, det,
            `外注費に${det.amount.toLocaleString()}円の高額取引があります（${partner}）`,
            '高額の外注費は、役務提供期間が複数月にわたる場合、期間按分（前払費用等）が必要な場合があります。契約内容と役務提供期間を確認してください。'
          );
        }
      });
    });

    // 毎月同額チェック（給与認定リスク）
    Object.entries(outsourcingByPartner).forEach(([partner, months]) => {
      const amounts = Object.values(months);
      if (amounts.length >= 3) {
        const allSame = amounts.every(a => a === amounts[0]);
        if (allSame && amounts[0] > 0) {
          this.addFinding('🟡', '外注費/給与区分', {
            issue_date: Object.keys(months)[0] + '-01',
            id: 0,
            partner_name: partner,
            _type: 'summary',
          }, {
            account_item_id: 0,
            amount: amounts[0],
            tax_code: 0,
            description: `${amounts.length}ヶ月連続で同額`,
            entry_side: 'debit',
          },
            `${partner}への外注費が${amounts.length}ヶ月連続で同額（${amounts[0].toLocaleString()}円/月）です`,
            '毎月同額の外注費は、実質的な雇用関係（給与）と認定されるリスクがあります。時間拘束性、指揮命令関係、材料・道具の提供元、成果物ベースかどうか等を確認してください。給与認定されると消費税の仕入税額控除が否認され、源泉徴収義務が発生します。'
          );
        }
      }
    });
  }

  // ============================================================
  // ルール4: ソフトウェア計上漏れチェック
  // ============================================================
  checkSoftwareMisclass(deals) {
    const targetAccounts = ['支払手数料', '通信費', '消耗品費', '雑費'];

    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const name = this.getAccountName(det.account_item_id);

        if (!targetAccounts.some(t => name.includes(t))) return;

        const desc = (det.description || '') + ' ' + (deal.partner_name || '') + ' ' + (det.item_name || '');

        if (this.containsKeyword(desc, rules.SOFTWARE_KEYWORDS)) {
          if (det.amount >= 500000) {
            this.addFinding('🔴', 'ソフトウェア計上', deal, det,
              `${name}に計上されていますが、ソフトウェア関連の取引の可能性があります（${det.amount.toLocaleString()}円）`,
              '50万円以上のソフトウェア関連支出は、無形固定資産（ソフトウェア）への計上を検討してください。自社利用ソフトウェアの耐用年数は原則5年です。SaaS等の利用料で、カスタマイズ費用を含む場合は特に注意が必要です。'
            );
          } else if (det.amount >= 100000) {
            this.addFinding('🟡', 'ソフトウェア計上', deal, det,
              `${name}にソフトウェア関連の取引があります（${det.amount.toLocaleString()}円: ${desc.trim()})`,
              'ソフトウェア関連の支出が費用科目に計上されています。月額利用料であれば費用処理で問題ありませんが、年額払いの場合は前払費用への計上、開発費・導入費の場合は無形固定資産への計上を検討してください。'
            );
          }
        }
      });
    });
  }

  // ============================================================
  // ルール5: Amazon購入の書籍チェック
  // ============================================================
  checkAmazonBooks(deals) {
    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const name = this.getAccountName(det.account_item_id);
        if (!name.includes('消耗品') && !name.includes('事務用品')) return;

        const desc = (det.description || '') + ' ' + (deal.partner_name || '');

        if (this.containsKeyword(desc, rules.AMAZON_KEYWORDS) &&
            this.containsKeyword(det.description || '', rules.BOOK_KEYWORDS)) {
          this.addFinding('🟡', '勘定科目', deal, det,
            `Amazonの書籍購入が${name}に計上されています`,
            '書籍・雑誌等の購入は「新聞図書費」に計上するのが適切です。消耗品費からの振替を検討してください。'
          );
        }
      });
    });
  }

  // ============================================================
  // ルール6: 役員報酬の定期同額チェック
  // ============================================================
  checkDirectorCompConstancy(deals) {
    const directorCompByMonth = {};

    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const name = this.getAccountName(det.account_item_id);
        if (!rules.CONSTANT_MONTHLY_ACCOUNTS.some(ca => name.includes(ca))) return;

        const month = deal.issue_date.substring(0, 7);
        if (!directorCompByMonth[month]) {
          directorCompByMonth[month] = 0;
        }
        directorCompByMonth[month] += det.amount;
      });
    });

    const months = Object.keys(directorCompByMonth).sort();
    const amounts = months.map(m => directorCompByMonth[m]);

    if (amounts.length >= 2) {
      const variations = [];
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i] !== amounts[i - 1]) {
          variations.push({
            month: months[i],
            from: amounts[i - 1],
            to: amounts[i],
          });
        }
      }

      if (variations.length > 0) {
        variations.forEach(v => {
          this.addFinding('🔴', '役員報酬', {
            issue_date: v.month + '-01',
            id: 0,
            _type: 'summary',
          }, {
            account_item_id: 0,
            amount: v.to,
            tax_code: 2,
            description: `${v.from.toLocaleString()}円 → ${v.to.toLocaleString()}円に変動`,
            entry_side: 'debit',
          },
            `役員報酬が${v.month}に変動しています（${v.from.toLocaleString()}円 → ${v.to.toLocaleString()}円）`,
            '定期同額給与の要件を満たさない場合、差額が損金不算入となります。期首から3ヶ月以内の改定（定時株主総会後）、業績悪化改定事由、臨時改定事由に該当する場合は認められます。議事録の整備を確認してください。'
          );
        });
      }

      // 月次サマリーも出力
      this.addFinding('🔵', '役員報酬', {
        issue_date: months[0] + '-01',
        id: 0,
        _type: 'summary',
      }, {
        account_item_id: 0,
        amount: amounts.reduce((s, a) => s + a, 0),
        tax_code: 2,
        description: `月次: ${months.map((m, i) => `${m}: ${amounts[i].toLocaleString()}`).join(', ')}`,
        entry_side: 'debit',
      },
        `役員報酬の月次推移: ${variations.length === 0 ? '定期同額（問題なし）' : `${variations.length}回の変動あり`}`,
        `期間中の月次金額: ${months.map((m, i) => `${m.substring(5)}月: ${amounts[i].toLocaleString()}円`).join(' / ')}`
      );
    }
  }

  // ============================================================
  // ルール7: 雑勘定の使いすぎチェック
  // ============================================================
  checkMiscAccountOveruse(deals) {
    let totalExpense = 0;
    const miscTotals = {};

    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        if (!this.isExpenseCategory(det.account_item_id)) return;

        totalExpense += det.amount;

        const name = this.getAccountName(det.account_item_id);
        if (rules.MISC_ACCOUNTS.some(m => name.includes(m))) {
          if (!miscTotals[name]) miscTotals[name] = 0;
          miscTotals[name] += det.amount;
        }
      });
    });

    Object.entries(miscTotals).forEach(([name, total]) => {
      const ratio = totalExpense > 0 ? (total / totalExpense * 100) : 0;
      if (ratio > 5 || total > 500000) {
        this.addFinding('🟡', '雑勘定', {
          issue_date: this.config.period_start,
          id: 0,
          _type: 'summary',
        }, {
          account_item_id: 0,
          amount: total,
          tax_code: 0,
          description: `経費全体の${ratio.toFixed(1)}%`,
          entry_side: 'debit',
        },
          `「${name}」の使用が多いです（${total.toLocaleString()}円、経費全体の${ratio.toFixed(1)}%）`,
          '雑費等の使用が多い場合、適切な勘定科目への振替を検討してください。税務調査でも指摘される可能性があります。'
        );
      }
    });
  }

  // ============================================================
  // ルール8: 摘要・取引先から勘定科目の妥当性をチェック
  // ============================================================
  checkDescriptionAccountMatch(deals) {
    deals.forEach(deal => {
      deal.details.forEach(det => {
        if (det.entry_side !== 'debit') return;
        const accountName = this.getAccountName(det.account_item_id);
        const desc = (det.description || '').toLowerCase();
        const partner = (deal.partner_name || det.partner_name || '').toLowerCase();
        const combined = desc + ' ' + partner;

        // 交通系ICカード（Suica/PASMO等）で旅費交通費以外の利用
        if (this.containsKeyword(combined, ['suica', 'pasmo', 'スイカ', 'パスモ', 'icoca', 'イコカ'])) {
          if (this.containsKeyword(desc, ['コンビニ', 'セブン', 'ファミリーマート', 'ローソン', '自販機', '売店'])) {
            if (accountName.includes('旅費交通')) {
              this.addFinding('🟡', '勘定科目', deal, det,
                `交通系ICカードのコンビニ等利用が旅費交通費に計上されています`,
                '交通系ICカード（Suica等）でのコンビニ・売店利用は旅費交通費ではなく、福利厚生費または消耗品費への計上が適切です。'
              );
            }
          }
        }

        // 高額な諸会費
        if (accountName.includes('諸会費') && det.amount >= 100000) {
          this.addFinding('🔵', '勘定科目', deal, det,
            `諸会費に${det.amount.toLocaleString()}円の高額取引があります`,
            '高額な会費は、内容によっては交際費や寄附金に該当する場合があります。入会金の場合は資産計上（繰延資産）の検討も必要です。'
          );
        }

        // 保険料の高額チェック（積立保険の費用計上リスク）
        if (accountName.includes('保険料') && det.amount >= 200000) {
          this.addFinding('🔵', '勘定科目', deal, det,
            `保険料に${det.amount.toLocaleString()}円の取引があります`,
            '保険料のうち積立部分がある場合は、保険積立金（資産）への計上が必要です。保険証券を確認し、掛捨部分と積立部分を区分してください。'
          );
        }
      });
    });
  }

  // ============================================================
  // 振替伝票のチェック
  // ============================================================
  checkManualJournals(journals) {
    journals.forEach(journal => {
      journal._type = 'manual_journal';

      // 諸口残高チェック用
      journal.details.forEach(det => {
        const name = this.getAccountName(det.account_item_id);

        // 高額な振替伝票
        if (det.amount >= 1000000) {
          this.addFinding('🔵', '振替伝票', journal, det,
            `高額な振替伝票: ${name} ${det.amount.toLocaleString()}円`,
            '高額な振替伝票の内容を確認してください。期末の決算整理仕訳として適切か、金額に誤りがないか確認が必要です。'
          );
        }
      });
    });
  }

  // ============================================================
  // メイン実行
  // ============================================================
  run() {
    console.log('=== 取引分析エンジン開始 ===');
    console.log(`対象期間: ${this.config.period_start} ~ ${this.config.period_end}`);

    // データ読み込み
    const expenseDeals = this.loadDeals('expense');
    const incomeDeals = this.loadDeals('income');
    const manualJournals = this.loadManualJournals();

    // deal にメタデータ追加
    expenseDeals.forEach(d => { d._type = 'deal'; });
    incomeDeals.forEach(d => { d._type = 'deal'; });

    const allDeals = [...expenseDeals, ...incomeDeals];

    console.log(`取引データ: 支出${expenseDeals.length}件, 収入${incomeDeals.length}件, 振替伝票${manualJournals.length}件`);

    // ルール適用
    console.log('ルール適用中...');
    this.checkFixedAssetThreshold(expenseDeals);
    this.checkRepairCapex(allDeals);
    this.checkOutsourcing(allDeals);
    this.checkSoftwareMisclass(allDeals);
    this.checkAmazonBooks(allDeals);
    this.checkDirectorCompConstancy(expenseDeals);
    this.checkMiscAccountOveruse(expenseDeals);
    this.checkDescriptionAccountMatch(allDeals);
    this.checkManualJournals(manualJournals);

    // 結果出力
    const outputPath = path.join(this.analysisDir, 'flagged_transactions.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.findings, null, 2), 'utf-8');

    // サマリー出力
    const redCount = this.findings.filter(f => f.severity === '🔴').length;
    const yellowCount = this.findings.filter(f => f.severity === '🟡').length;
    const blueCount = this.findings.filter(f => f.severity === '🔵').length;

    console.log('\n=== 取引チェック結果 ===');
    console.log(`🔴 要修正: ${redCount}件`);
    console.log(`🟡 要確認: ${yellowCount}件`);
    console.log(`🔵 参考情報: ${blueCount}件`);
    console.log(`合計: ${this.findings.length}件`);
    console.log(`\n結果保存: ${outputPath}`);

    return this.findings;
  }
}

// CLI実行
if (require.main === module) {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('Usage: node 02-analyze-transactions.js <data-dir>');
    console.error('  e.g., node 02-analyze-transactions.js data/474381/2025-03-20');
    process.exit(1);
  }

  const analyzer = new TransactionAnalyzer(dataDir);
  analyzer.run();
}

module.exports = TransactionAnalyzer;
