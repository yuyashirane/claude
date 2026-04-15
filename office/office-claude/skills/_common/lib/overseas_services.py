"""海外サービス判定(V1-3-40 用スケルトン)。

出典: v1.2.2 §13.4.5（ファイル名のみ定義）
配置: skills/_common/lib/overseas_services.py (§13.4.5 準拠)

V1-3-10 では使用しない。V1-3-40（海外サービス消費税 Skill）着手時に、
既存 freee-auto/shared/overseas-services.js のロジックを Python に移植する。

Phase 1 では最小スケルトンのみ配置する。
"""

# V1-3-40 着手時に実装予定。
# 既存 Node.js 版のデータ構造:
#   { provider: str, isDomestic: bool,
#     invoiceRegistered: bool, invoiceNumber: str }
#
# 移植時の参照先:
#   - freee-auto/shared/overseas-services.js
#   - _common/references/overseas-services.json（Part 1 で placeholder 配置済み）
