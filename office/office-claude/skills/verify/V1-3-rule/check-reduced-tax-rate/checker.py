"""V1-3-11 check-reduced-tax-rate: メイン checker。

軽減税率の主検出 (RR-01a/b/c) を dispatch する薄いエントリーポイント。
本 skill は check-consumption-tax 経由でのみ起動される想定 (run.py を持たない)。

Phase 1 (036): rr01_missing_reduced のみ統合。
Phase 2 以降: rr02_wrong_reduced (副検出) を追加予定。

設計メモ: 035-survey 報告書 §3.2.1
配置: skills/verify/V1-3-rule/check-reduced-tax-rate/checker.py

注: V1-3-10 と異なり `from checks.XX import` の形式は使わない。
理由は check-consumption-tax 経由で V1-3-10 と同時に load されたとき
`checks` パッケージ名が衝突するため。importlib で skill 配下の
checks/*.py を独立した sys.modules キーで読み込むことで衝突回避。
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_CHECKS_DIR = Path(__file__).parent / "checks"


def _load_check_module(name: str):
    """checks/{name}.py を独立した sys.modules キーでロードする。

    モジュール名を `v1_3_11_{name}` で登録することで、V1-3-10 の
    `checks` パッケージとの衝突を回避する。

    Args:
        name: ファイル名 (拡張子なし、例: "rr01_missing_reduced")

    Returns:
        ロードされたモジュール
    """
    mod_key = f"v1_3_11_{name}"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    path = _CHECKS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(mod_key, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"{path} をロードできません")
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_key] = module
    spec.loader.exec_module(module)
    return module


def run(ctx) -> list:
    """メインエントリポイント。CheckContext を受け取り、Finding のリストを返す。

    Phase 1: RR-01 (主検出) のみ実行。
    """
    findings: list = []

    # RR-01: 8% 漏れ主検出 (新聞 / 会議費系食品 / その他弱食品 KW)
    rr01 = _load_check_module("rr01_missing_reduced")
    findings.extend(rr01.run(ctx))

    # 将来: Phase 2 で rr02_wrong_reduced (副検出) を追加
    # rr02 = _load_check_module("rr02_wrong_reduced")
    # findings.extend(rr02.run(ctx))

    return findings
