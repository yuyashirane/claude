"""tests/unit 配下の追加 conftest。

check-tax-classification/ 配下を sys.path に追加し、
`from checks.tc03_payroll import run` の import を成立させる。

Phase 1 の tests/conftest.py は変更禁止のため、本ファイルで責務を分担する。
"""
import sys
from pathlib import Path

_CTC_DIR = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification"
)
if str(_CTC_DIR) not in sys.path:
    sys.path.insert(0, str(_CTC_DIR))
