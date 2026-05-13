"""V1-3-21 check-invoice-special-rules: メイン checker。

インボイス特例群 (帳簿保存のみで仕入税額控除を許容する例外群) の主検出
(IS-01a/b, IS-02a/b, IS-03a, IS-04a) を dispatch する薄いエントリポイント。
本 skill は check-consumption-tax 経由でのみ起動される想定 (run.py を持たない)。

業務哲学 (038-survey §0.3):
    false positive world に属する skill。「過剰確認を減らす」が主目的。
    既存 V1-3-10/11 (false negative world = 見落としを減らす) と対をなす。

対象特例 (4 系統 6 検出 ID):
    IS-01a 少額特例適用可能性 (1万円未満、期間内、advisory)
    IS-01b 少額特例期間外発動 (R11/10 以降の negative warning)
    IS-02a 公共交通機関特例適用可能性 (3万円未満、鉄道/バス/船舶)
    IS-02b 公共交通機関特例対象外 (タクシー等の negative)
    IS-03a 自販機特例適用可能性 (3万円未満、自販機 KW)
    IS-04a 出張旅費特例適用可能性 (従業員精算、旅費交通費)

法令引用構造:
    消費税法 第30条第7項 (帳簿のみ保存特例の根拠)
    ├─ 施行令 第49条第1項第1号
    │   ├─ イ → 施行令第70条の9第2項第1号 (公共交通機関特例 = IS-02)
    │   └─ ニ → 施行規則 第15条の4
    │       ├─ 第1号 → 施行規則 第26条の6第1号 (自販機 = IS-03)
    │       └─ 第2号 (出張旅費 = IS-04)
    └─ 平成28年改正法附則 第53条の2 (少額特例 = IS-01、経過措置)

V1-3-11 と同型の importlib + 独立 sys.modules キー (`v1_3_21_*`) で
checks/*.py をロード (V1-3-10/11 の `checks` パッケージ衝突回避)。

設計メモ: 038-survey 報告書 §3.2 + 039 impl
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checker.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_CHECKS_DIR = Path(__file__).parent / "checks"


def _load_check_module(name: str):
    """checks/{name}.py を独立した sys.modules キーでロードする。

    モジュール名を `v1_3_21_{name}` で登録することで、V1-3-10/11 の
    `checks` パッケージとの衝突を回避する。

    Args:
        name: ファイル名 (拡張子なし、例: "is01_small_amount")

    Returns:
        ロードされたモジュール
    """
    mod_key = f"v1_3_21_{name}"
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

    4 つの check モジュールを順次実行し、findings を結合する。
    """
    findings: list = []

    # IS-01: 少額特例 (a 適用判定漏れ + b 期間外発動)
    is01 = _load_check_module("is01_small_amount")
    findings.extend(is01.run(ctx))

    # IS-02: 公共交通機関特例 (a 適用 + b タクシー除外 warning)
    is02 = _load_check_module("is02_public_transport")
    findings.extend(is02.run(ctx))

    # IS-03: 自販機特例 (a 適用判定)
    is03 = _load_check_module("is03_vending_machine")
    findings.extend(is03.run(ctx))

    # IS-04: 出張旅費特例 (a 適用判定、IS-04b 通常必要範囲超過は 039 スコープ外)
    is04 = _load_check_module("is04_travel_expense")
    findings.extend(is04.run(ctx))

    return findings
