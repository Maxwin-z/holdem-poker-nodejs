/**
 * Trust levels for strategy advice: how the recommendation was produced.
 *
 * Surfaced to learners so chart-backed guidance is distinguishable from
 * approximations — a tutorial must not present a heuristic as solver truth.
 */

export type AdviceTrust =
  | "chart" // precomputed GreenCharts2024 chart data
  | "chart-fallback" // authored / generic approximate chart
  | "solved" // locally solved (e.g. Nash push/fold)
  | "rule" // simplified deterministic rule
  | "model" // distilled neural-net policy
  | "heuristic"; // transparent range-vs-equity heuristic

export const ADVICE_TRUST_LABEL_CN: Record<AdviceTrust, string> = {
  chart: "图表数据",
  "chart-fallback": "近似图表",
  solved: "本地求解",
  rule: "简化规则",
  model: "蒸馏模型",
  heuristic: "启发式",
};

/** Short explanation per trust level, for tooltips / tutorial copy. */
export const ADVICE_TRUST_DETAIL_CN: Record<AdviceTrust, string> = {
  chart: "来自预计算的 GTO 图表数据，可信度最高",
  "chart-fallback": "该局面无精确图表，使用本地近似表",
  solved: "由本地求解器计算的均衡策略",
  rule: "简化规则推导，非精确 GTO",
  model: "蒸馏神经网络近似（约 84% 求解器动作一致性）",
  heuristic: "范围-权益启发式近似，非精确均衡",
};
