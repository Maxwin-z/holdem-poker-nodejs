/**
 * Authored fallback charts for the two (hero, villain) pairs not covered by
 * the GreenCharts2024 data in 6-max:
 * - MP facing an UTG open
 * - CO facing an MP open
 *
 * These follow the same "3bet-or-fold IP / call-or-raise OOP" style as the
 * rest of the pack and are standard 100bb approximations.
 */

import type { Chart } from "../types";

/** MP vs UTG open (3bb, 100bb). */
export const MP_VS_OPEN_UTG: Chart = {
  AA: "raise", KK: "raise", QQ: "raise", AKs: "raise", AKo: "raise",
  A5s: "raise", A4s: "raise", KQs: "raise",
  JJ: "call", TT: "call", "99": "call", "88": "call", "77": "call",
  "66": "call", "55": "call", "44": "call", "33": "call", "22": "call",
  AQs: "call", AJs: "call", ATs: "call", KJs: "call", KTs: "call",
  QJs: "call", QTs: "call", JTs: "call", T9s: "call", "98s": "call",
  "87s": "call", "76s": "call", "65s": "call",
};

/** CO vs MP open (2.5bb, 100bb): 3bet-or-fold style. */
export const CO_VS_OPEN_MP: Chart = {
  AA: "raise", KK: "raise", QQ: "raise", JJ: "raise", TT: "raise", "99": "raise",
  AKs: "raise", AKo: "raise", AQs: "raise", AQo: "raise",
  AJs: "raise", ATs: "raise", A9s: "raise", A8s: "raise",
  A5s: "raise", A4s: "raise", A3s: "raise", A2s: "raise",
  KQs: "raise", KJs: "raise", KTs: "raise", K9s: "raise", KQo: "raise",
  QJs: "raise", QTs: "raise", Q9s: "raise",
  JTs: "raise", J9s: "raise", T9s: "raise", T8s: "raise",
  "98s": "raise", "97s": "raise", "87s": "raise", "86s": "raise",
  "76s": "raise", "65s": "raise", "54s": "raise",
  "55": "raise", "44": "raise",
};

/**
 * 通用 vs-open 兜底表（100bb）：3bet-or-fold / 跟注的平衡近似。
 * 用于图表数据未覆盖的位置对（例如标准 6-max 里 CO 面对 UTG 开池，
 * 以及按行动顺序近似映射后仍未命中的组合），保证任何局面都有建议。
 */
export const GENERIC_VS_OPEN: Chart = {
  AA: "raise", KK: "raise", QQ: "raise", JJ: "raise", TT: "raise",
  AKs: "raise", AKo: "raise", AQs: "raise", AQo: "raise",
  AJs: "raise", KQs: "raise",
  A5s: "raise", A4s: "raise",
  "99": "call", "88": "call", "77": "call", "66": "call", "55": "call",
  ATs: "call", KJs: "call", KTs: "call", QJs: "call", QTs: "call",
  JTs: "call", T9s: "call", "98s": "call", "87s": "call", "76s": "call",
  "65s": "call",
};

/**
 * 通用 vs-3bet 兜底表（100bb）：强牌 4bet/全下，中强牌跟注。
 * 覆盖图表数据缺失的位置对（例如 BTN 面对 MP 的 3bet）。
 */
export const GENERIC_VS_3BET: Chart = {
  AA: "raise", KK: "raise", QQ: "raise", JJ: "raise", TT: "raise",
  AKs: "raise", AKo: "raise",
  AQs: "call", AJs: "call", ATs: "call",
  KQs: "call", KJs: "call",
  "99": "call", "88": "call", "77": "call", "66": "call",
  QJs: "call", JTs: "call", T9s: "call", "98s": "call",
};
