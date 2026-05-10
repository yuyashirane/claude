"""check-consumption-tax (V1-3 統合 skill) Phase 1 単体テスト。

Phase 1 で検証する範囲:
    1. skill 起動 smoke: argparse 解釈、--help、必須引数欠如時のエラー
    2. findings 結合 + 障害分離: 1 つの checker が失敗しても他の findings は反映される
    3. ファイル名生成: 期間日本語形式 + company_name fallback + タイムスタンプ形式

Phase 1 では実 Excel 出力は行わない (export_to_excel を mock)。
ハイフン区切りディレクトリへのアクセスは importlib 経由 (V1-3-20 既存テスト規約に準拠)。
"""
from __future__ import annotations

import importlib.util
import io
import json
import re
import subprocess
import sys
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ─────────────────────────────────────────────────────────────
# テスト対象モジュールの import (importlib 経由、ハイフン入りパス対応)
# ─────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).resolve().parents[2]  # office-claude/
_SKILL_DIR = (
    _PROJECT_ROOT
    / "skills"
    / "verify"
    / "V1-3-rule"
    / "check-consumption-tax"
)
_RUN_PATH = _SKILL_DIR / "run.py"


def _load_run_module():
    """run.py を一意な名前で動的ロード (テスト間での state 共有を避ける)。"""
    module_name = "check_consumption_tax_run_under_test"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, _RUN_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"{_RUN_PATH} をロードできません")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def run_module():
    """check-consumption-tax/run.py をロードして返す fixture。"""
    return _load_run_module()


# ═════════════════════════════════════════════════════════════
# テスト 1: skill 起動 smoke (引数解釈)
# ═════════════════════════════════════════════════════════════

class TestSkillStartupSmoke:
    """skill の CLI 起動と引数解釈の smoke テスト。"""

    def test_help_exits_zero(self):
        """--help は exit code 0 で正常終了する。"""
        result = subprocess.run(
            [sys.executable, str(_RUN_PATH), "--help"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert result.returncode == 0
        # usage 行が含まれること
        assert "check-consumption-tax" in result.stdout
        assert "--company-id" in result.stdout

    def test_missing_required_arg_returns_error(self, run_module):
        """--company-id を欠いた場合は EXIT_ARGS で終了し、JSON エラーを stdout に出す。"""
        # main() を直接呼ぶ。argparse は SystemExit(EXIT_ARGS) を投げる。
        buf_out = io.StringIO()
        with redirect_stdout(buf_out), redirect_stderr(io.StringIO()):
            with pytest.raises(SystemExit) as ex_info:
                run_module.main(["--period-start", "2025-06", "--period-end", "2025-12"])
        assert ex_info.value.code == run_module.EXIT_ARGS

        # stdout に JSON エラーが出ていること
        out = buf_out.getvalue().strip()
        assert out, "EXIT_ARGS 時は JSON エラーを stdout に出すべき"
        payload = json.loads(out.splitlines()[-1])
        assert payload["status"] == "error"
        assert payload["exit_code"] == run_module.EXIT_ARGS
        assert payload["error_stage"] == "args"

    def test_period_logic_violation_returns_args_error(self, run_module):
        """--period-start > --period-end は EXIT_ARGS。"""
        buf_out = io.StringIO()
        with redirect_stdout(buf_out), redirect_stderr(io.StringIO()):
            with pytest.raises(SystemExit) as ex_info:
                run_module.main(
                    [
                        "--company-id", "999999",
                        "--period-start", "2025-12",
                        "--period-end", "2025-06",
                    ]
                )
        assert ex_info.value.code == run_module.EXIT_ARGS

    def test_internal_checkers_declared(self, run_module):
        """_INTERNAL_CHECKERS に V1-3-10 / V1-3-20 / V1-3-11 が登録されている (将来拡張点の確認)。"""
        names = [name for name, _ in run_module._INTERNAL_CHECKERS]
        assert "V1-3-10" in names
        assert "V1-3-20" in names
        assert "V1-3-11" in names
        # 各 entry が (name, callable) であること
        for name, fn in run_module._INTERNAL_CHECKERS:
            assert callable(fn), f"{name} の runner_fn が callable でない"


# ═════════════════════════════════════════════════════════════
# テスト 2: findings 結合 + 障害分離
# ═════════════════════════════════════════════════════════════

class TestFindingsCombineAndIsolation:
    """findings 結合の正当性と障害分離 (1 つの checker 失敗時の継続) を検証。

    実 ctx / 実 checker / 実 Excel 出力は使わず、main() 内のループ部分を
    mock checker で動かす。具体的には _INTERNAL_CHECKERS を一時差し替え、
    build_check_context と export_to_excel を mock する。
    """

    def _make_mock_finding(self, tc_code: str, area: str, sub_code: str = "x"):
        """テスト用 Finding mock (必須属性のみセット)。"""
        f = MagicMock()
        f.tc_code = tc_code
        f.area = area
        f.sub_code = sub_code
        f.severity = "🔴 Critical"
        return f

    def _build_main_args(self, tmp_e2e_dir: Path, company_id: int = 88888888) -> list[str]:
        """tmp e2e ディレクトリを CHECK_CONSUMPTION_TAX_PROJECT_ROOT 経由で
        参照させるための引数。実装側は env override を尊重する。"""
        return [
            "--company-id", str(company_id),
            "--period-start", "2025-06",
            "--period-end", "2025-12",
        ]

    def test_combine_both_checkers(self, run_module, tmp_path, monkeypatch):
        """両 checker が成功した場合、findings は順序付きで結合される。"""
        # tmp e2e dir を準備 (空 JSON でも build_check_context は mock するので OK)
        e2e = tmp_path / "tests" / "e2e" / "88888888" / "2025-12"
        e2e.mkdir(parents=True)
        for name in [
            "company_info.json",
            "account_items_all.json",
            "partners_all.json",
            "taxes_codes.json",
            "deals_2025-06_to_2025-12.json",
        ]:
            (e2e / name).write_text("{}", encoding="utf-8")
        # PROJECT_ROOT override
        monkeypatch.setenv("CHECK_CONSUMPTION_TAX_PROJECT_ROOT", str(tmp_path))
        # PROJECT_ROOT は module load 時の定数なので、直接書き換える
        monkeypatch.setattr(run_module, "PROJECT_ROOT", tmp_path)
        monkeypatch.setattr(run_module, "V1_3_10_DIR", tmp_path / "_dummy_v1_3_10")
        monkeypatch.setattr(run_module, "V1_3_20_DIR", tmp_path / "_dummy_v1_3_20")

        # mock ctx
        mock_ctx = MagicMock()
        mock_ctx.company_name = "テスト株式会社"

        # mock build_check_context
        fake_module = MagicMock()
        fake_module.build_check_context = MagicMock(return_value=mock_ctx)
        monkeypatch.setitem(sys.modules, "scripts.e2e.freee_to_context", fake_module)

        # mock export_to_excel
        fake_export_module = MagicMock()
        captured = {}

        def _fake_export(findings, output_path, **kw):
            captured["findings"] = list(findings)
            captured["output_path"] = output_path
            captured["kwargs"] = kw
            return output_path

        fake_export_module.export_to_excel = _fake_export
        monkeypatch.setitem(
            sys.modules, "skills.export.excel_report.exporter", fake_export_module
        )

        # mock _INTERNAL_CHECKERS
        f10_a = self._make_mock_finding("TC-01", "A8", "TC-01a")
        f10_b = self._make_mock_finding("TC-03", "A5", "TC-03a")
        f20_a = self._make_mock_finding("V1-3-20", "A14", "V1-3-20-nonqualified_full")
        runner_v1310 = MagicMock(return_value=[f10_a, f10_b])
        runner_v1320 = MagicMock(return_value=[f20_a])
        monkeypatch.setattr(
            run_module,
            "_INTERNAL_CHECKERS",
            [("V1-3-10", runner_v1310), ("V1-3-20", runner_v1320)],
        )

        # 実行
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            rc = run_module.main(self._build_main_args(tmp_path))

        assert rc == run_module.EXIT_OK
        # combined findings が 3 件
        assert len(captured["findings"]) == 3
        # tc_code 分布が両 checker から
        tc_codes = [f.tc_code for f in captured["findings"]]
        assert tc_codes.count("TC-01") == 1
        assert tc_codes.count("TC-03") == 1
        assert tc_codes.count("V1-3-20") == 1

    def test_partial_failure_still_succeeds(self, run_module, tmp_path, monkeypatch):
        """1 つの checker が例外を投げても、他の checker の findings で Excel が生成される。

        戦略 Claude 判断 B (障害分離): 部分失敗は EXIT_OK + stderr 警告。
        """
        e2e = tmp_path / "tests" / "e2e" / "77777777" / "2025-12"
        e2e.mkdir(parents=True)
        for name in [
            "company_info.json",
            "account_items_all.json",
            "partners_all.json",
            "taxes_codes.json",
            "deals_2025-06_to_2025-12.json",
        ]:
            (e2e / name).write_text("{}", encoding="utf-8")
        monkeypatch.setattr(run_module, "PROJECT_ROOT", tmp_path)

        mock_ctx = MagicMock()
        mock_ctx.company_name = "障害分離テスト社"
        fake_module = MagicMock()
        fake_module.build_check_context = MagicMock(return_value=mock_ctx)
        monkeypatch.setitem(sys.modules, "scripts.e2e.freee_to_context", fake_module)

        captured: dict = {}
        fake_export = MagicMock()
        fake_export.export_to_excel = lambda findings, output_path, **kw: (
            captured.update(findings=list(findings), output_path=output_path) or output_path
        )
        monkeypatch.setitem(
            sys.modules, "skills.export.excel_report.exporter", fake_export
        )

        # V1-3-10 は成功、V1-3-20 が例外を投げる
        f10 = self._make_mock_finding("TC-01", "A8")
        runner_v1310 = MagicMock(return_value=[f10])
        runner_v1320 = MagicMock(side_effect=RuntimeError("V1-3-20 は壊れています"))
        monkeypatch.setattr(
            run_module,
            "_INTERNAL_CHECKERS",
            [("V1-3-10", runner_v1310), ("V1-3-20", runner_v1320)],
        )

        buf_out = io.StringIO()
        buf_err = io.StringIO()
        with redirect_stdout(buf_out), redirect_stderr(buf_err):
            rc = run_module.main(
                ["--company-id", "77777777", "--period-start", "2025-06",
                 "--period-end", "2025-12"]
            )

        # 部分失敗でも EXIT_OK
        assert rc == run_module.EXIT_OK
        # V1-3-10 の findings は反映
        assert len(captured["findings"]) == 1
        # 警告ログが stderr に出ていること
        err_text = buf_err.getvalue()
        assert "V1-3-20" in err_text and "WARN" in err_text
        # JSON 出力に checker_results が含まれること
        out_payload = json.loads(buf_out.getvalue().strip().splitlines()[-1])
        assert out_payload["status"] == "ok"
        assert out_payload["checker_results"]["V1-3-10"]["status"] == "ok"
        assert out_payload["checker_results"]["V1-3-20"]["status"] == "error"

    def test_all_checkers_failed_returns_unexpected(
        self, run_module, tmp_path, monkeypatch
    ):
        """全 checker 失敗時は EXIT_UNEXPECTED で abort し Excel は出さない。"""
        e2e = tmp_path / "tests" / "e2e" / "66666666" / "2025-12"
        e2e.mkdir(parents=True)
        for name in [
            "company_info.json",
            "account_items_all.json",
            "partners_all.json",
            "taxes_codes.json",
            "deals_2025-06_to_2025-12.json",
        ]:
            (e2e / name).write_text("{}", encoding="utf-8")
        monkeypatch.setattr(run_module, "PROJECT_ROOT", tmp_path)

        mock_ctx = MagicMock()
        mock_ctx.company_name = "全滅テスト社"
        fake_module = MagicMock()
        fake_module.build_check_context = MagicMock(return_value=mock_ctx)
        monkeypatch.setitem(sys.modules, "scripts.e2e.freee_to_context", fake_module)

        # 両方失敗
        runner_a = MagicMock(side_effect=RuntimeError("A 失敗"))
        runner_b = MagicMock(side_effect=ValueError("B 失敗"))
        monkeypatch.setattr(
            run_module,
            "_INTERNAL_CHECKERS",
            [("V1-3-10", runner_a), ("V1-3-20", runner_b)],
        )

        # export_to_excel が呼ばれないことを確認するため mock を仕込む
        fake_export = MagicMock()
        fake_export.export_to_excel = MagicMock()
        monkeypatch.setitem(
            sys.modules, "skills.export.excel_report.exporter", fake_export
        )

        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            rc = run_module.main(
                ["--company-id", "66666666", "--period-start", "2025-06",
                 "--period-end", "2025-12"]
            )

        assert rc == run_module.EXIT_UNEXPECTED
        # Excel 出力は呼ばれていない
        fake_export.export_to_excel.assert_not_called()


# ═════════════════════════════════════════════════════════════
# テスト 3: ファイル名生成
# ═════════════════════════════════════════════════════════════

class TestOutputPathBuilder:
    """_build_output_path / _format_period_jp の単体テスト。"""

    def test_format_period_jp_range(self, run_module):
        """期間が異なる場合は '〜' で繋ぐ日本語形式。"""
        assert run_module._format_period_jp("2025-06", "2025-12") == "2025年6月〜2025年12月"
        assert run_module._format_period_jp("2024-01", "2024-03") == "2024年1月〜2024年3月"

    def test_format_period_jp_same_month(self, run_module):
        """単月指定の場合は単一年月を返す。"""
        assert run_module._format_period_jp("2025-08", "2025-08") == "2025年8月"

    def test_build_output_path_contains_required_parts(self, run_module):
        """ファイル名に '消費税チェック' / 事業所名 / 期間日本語形式 が含まれる。"""
        path = run_module._build_output_path(
            company_id=10794380,
            company_name="株式会社デイリーユニフォーム",
            period_start="2025-06",
            period_end="2025-12",
            timestamp="20260510_142233",
        )
        # ファイル名チェック
        name = path.name
        assert name.startswith("消費税チェック_株式会社デイリーユニフォーム_")
        assert "2025年6月〜2025年12月" in name
        assert "20260510_142233" in name
        assert name.endswith(".xlsx")
        # 親ディレクトリチェック (reports/<id>_<name>/)
        assert path.parent.name == "10794380_株式会社デイリーユニフォーム"

    def test_build_output_path_company_name_fallback(self, run_module):
        """company_name が空文字の場合は 'unknown' にフォールバックする。"""
        path = run_module._build_output_path(
            company_id=99999999,
            company_name="",
            period_start="2025-06",
            period_end="2025-06",
            timestamp="20260101_000000",
        )
        assert "unknown" in path.name
        assert path.parent.name == "99999999_unknown"

    def test_build_output_path_timestamp_format(self, run_module):
        """timestamp 省略時は YYYYMMDD_HHMMSS 形式で生成される。"""
        path = run_module._build_output_path(
            company_id=11111111,
            company_name="テスト",
            period_start="2025-06",
            period_end="2025-12",
        )
        # ファイル名から TS を抽出 ('_<TS>.xlsx' で終わる)
        m = re.search(r"_(\d{8}_\d{6})\.xlsx$", path.name)
        assert m is not None, f"TS パターンが含まれていない: {path.name}"
