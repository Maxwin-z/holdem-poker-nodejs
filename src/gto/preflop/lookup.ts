/**
 * Chart resolution: maps a (scenario, hero, villain) tuple onto the
 * precomputed GreenCharts2024 data, with authored fallbacks for the two
 * uncovered 6-max pairs and stack-independent calibration adjustments.
 */

import { charts as greenline } from "./data/greenline";
import { CO_VS_OPEN_MP, MP_VS_OPEN_UTG } from "./data/fallback";
import { HAND_ORDER, comboCount, handScore, normalizeHandKey } from "./hand";
import type {
  Chart,
  ChartCell,
  ChartPosition,
  Looseness,
  PreflopAction,
  PreflopScenario,
  WeightedCell,
} from "./types";

const CHART_POSITIONS: ChartPosition[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

/** Normalize any chart cell into an explicit weight + action split. */
export function normalizeCell(cell: ChartCell | undefined): WeightedCell {
  if (!cell) return { weight: 0, actions: { fold: 100 } };
  if (typeof cell === "string") {
    return { weight: 100, actions: { [cell]: 100 } as WeightedCell["actions"] };
  }
  if (Array.isArray(cell)) {
    return { weight: 100, actions: { [cell[0]]: 50, [cell[1]]: 50 } };
  }
  return cell;
}

export interface ResolvedChart {
  chart: Chart | null;
  source: string;
  /** Authored fallback used (informational). */
  fallbackNote?: string;
  /** True when the response is computed by rules instead of chart data. */
  ruleBased: boolean;
}

/**
 * Resolve the base chart for a situation. Returns null when the correct
 * preflop action is "check" (BB with an unopened pot).
 */
export function resolveChart(
  scenario: PreflopScenario,
  hero: ChartPosition,
  villain?: ChartPosition
): ResolvedChart {
  if (villain && !CHART_POSITIONS.includes(villain)) {
    throw new Error(`无效的对手位置：${villain}`);
  }

  const get = (key: string): Chart | null => greenline[key] || null;

  switch (scenario) {
    case "unopened": {
      if (hero === "BB") {
        return { chart: null, source: "rule", ruleBased: false };
      }
      const chart = get(`${hero}-RFI`);
      return {
        chart,
        source: "GreenCharts2024 RFI",
        ruleBased: false,
      };
    }
    case "iso": {
      if (hero === "UTG") {
        // UTG cannot face limpers in a normal hand; fall back to RFI.
        const chart = get("UTG-RFI");
        return {
          chart,
          source: "GreenCharts2024 RFI",
          fallbackNote: "UTG 无 ISO 图表，按 RFI 处理",
          ruleBased: false,
        };
      }
      const chart = get(`${hero}-ISO`);
      return { chart, source: "GreenCharts2024 ISO", ruleBased: false };
    }
    case "vs-open": {
      if (!villain) throw new Error("面对加注（vs-open）需要提供 villainPosition");
      if (hero === "UTG") {
        throw new Error("UTG 不可能面对翻前加注");
      }
      const key = `${hero}-vs-open-${villain}`;
      const chart = get(key);
      if (chart) return { chart, source: "GreenCharts2024 vs-open", ruleBased: false };
      if (hero === "MP" && villain === "UTG") {
        return {
          chart: MP_VS_OPEN_UTG,
          source: "authored fallback",
          fallbackNote: "MP vs UTG 使用本地标准近似表",
          ruleBased: false,
        };
      }
      if (hero === "CO" && villain === "MP") {
        return {
          chart: CO_VS_OPEN_MP,
          source: "authored fallback",
          fallbackNote: "CO vs MP 使用本地标准近似表",
          ruleBased: false,
        };
      }
      throw new Error(`不支持的翻前位置对：${hero} vs ${villain} 的开池加注`);
    }
    case "vs-3bet": {
      if (!villain) throw new Error("面对 3bet 需要提供 villainPosition");
      const chart = get(`${hero}-vs-3bet-${villain}`);
      if (chart) return { chart, source: "GreenCharts2024 vs-3bet", ruleBased: false };
      throw new Error(`不支持的翻前位置对：${hero} 面对 ${villain} 的 3bet`);
    }
    case "vs-4bet": {
      if (!villain) throw new Error("面对 4bet 需要提供 villainPosition");
      if (hero === "SB" || hero === "BB") {
        // The pack's "SB|BB vs 4bet" charts are stored under BB keys.
        const chart = get(`BB-vs-4bet-${villain}`);
        if (chart) {
          return {
            chart,
            source: "GreenCharts2024 vs-4bet (blind defense)",
            ruleBased: false,
          };
        }
      }
      // IP heroes facing a 4bet: rule-based 5bet-jam / fold (see advice.ts).
      return {
        chart: null,
        source: "rule-based vs-4bet",
        ruleBased: true,
      };
    }
    default:
      throw new Error(`未知场景：${scenario}`);
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Multiway tightening: each extra player in the pot reduces the weight of
 * marginal (mixed / pure-call) hands. Value raises and jams are untouched.
 */
export function applyMultiwayTightening(
  chart: Chart,
  extraPlayers: number
): Chart {
  if (extraPlayers <= 0) return chart;
  const out: Chart = {};
  for (const [hand, cell] of Object.entries(chart)) {
    if (!cell) continue;
    const w = normalizeCell(cell);
    const aggressive = (w.actions.raise || 0) + (w.actions.allin || 0);
    const call = w.actions.call || 0;
    const pureRaise = aggressive === 100;
    const pureAllin = (w.actions.allin || 0) === 100;
    if (pureRaise || pureAllin) {
      out[hand] = cell;
      continue;
    }
    if (call === 100) {
      const newWeight = round1(100 * Math.pow(0.9, extraPlayers));
      if (newWeight < 50) continue; // fold entirely
      out[hand] = { weight: newWeight, actions: { call: 100 } };
      continue;
    }
    // Mixed cell: shift part of the weight toward folding.
    const newAgg = aggressive * Math.pow(0.7, extraPlayers);
    const newCall = call * Math.pow(0.9, extraPlayers);
    const folded = 100 - newAgg - newCall;
    if (folded >= 85) continue;
    const actions: WeightedCell["actions"] = {};
    if (newAgg > 0.5) actions.raise = round1(newAgg);
    if (newCall > 0.5) actions.call = round1(newCall);
    if (folded > 0.5) actions.fold = round1(folded);
    out[hand] = { weight: 100, actions };
  }
  return out;
}

/**
 * Calibration: "loose" adds the strongest absent hands to RFI/ISO charts;
 * "tight" removes the weakest 10% of hands from any chart.
 */
export function applyCalibration(
  chart: Chart,
  looseness: Looseness,
  scenario: PreflopScenario
): Chart {
  if (looseness === "standard" || !chart) return chart;
  if (looseness === "tight") {
    const byScore = Object.keys(chart).sort((a, b) => handScore(a) - handScore(b));
    const removeCount = Math.max(1, Math.floor(byScore.length * 0.1));
    const remove = new Set(byScore.slice(0, removeCount));
    const out: Chart = {};
    for (const [hand, cell] of Object.entries(chart)) {
      if (!remove.has(hand)) out[hand] = cell;
    }
    return out;
  }
  // loose
  const out: Chart = { ...chart };
  const addAction: PreflopAction =
    scenario === "unopened" || scenario === "iso" ? "raise" : "call";
  let added = 0;
  for (const hand of HAND_ORDER) {
    if (added >= 8) break;
    const key = normalizeHandKey(hand);
    if (!out[key]) {
      out[key] = addAction;
      added++;
    }
  }
  return out;
}

/** Total number of combos in a chart (for tests / display). */
export function chartCombos(chart: Chart): number {
  let total = 0;
  for (const [hand, cell] of Object.entries(chart)) {
    if (!cell) continue;
    total += (comboCount(hand) * normalizeCell(cell).weight) / 100;
  }
  return total;
}
