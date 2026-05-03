import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pathlib import Path
sys.path.insert(0, '.')
skill_dir = Path('skills/verify/V1-3-rule/check-tax-classification')
sys.path.insert(0, str(skill_dir))
from scripts.e2e.freee_to_context import build_check_context
import importlib.util
spec = importlib.util.spec_from_file_location('checker', skill_dir / 'checker.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
base = Path('data/e2e/3525430/202512')
ctx = build_check_context(
    deals_path=base / 'deals_202512.json',
    partners_path=base / 'partners_all.json',
    account_items_path=base / 'account_items_all.json',
    company_info_path=base / 'company_info.json',
    taxes_codes_path=base / 'taxes_codes.json',
)
for f in m.run(ctx):
    lh = f.link_hints
    lh_deal = lh.deal_id if lh else 'NO_LH'
    print(f'{f.sub_code}: finding.deal_id={f.deal_id!r}  lh.deal_id={lh_deal!r}')
