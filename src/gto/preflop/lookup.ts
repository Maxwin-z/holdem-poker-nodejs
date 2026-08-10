/**
 * Chart resolution: maps a (scenario, hero, villain) tuple onto the
 * precomputed GreenCharts2024 data, with authored fallbacks for the two
 * uncovered 6-max pairs and stack-independent calibration adjustments.
 */

import { charts as greenline } from "./data/greenline";
import {
  CO_VS_OPEN_MP,
  GENERIC_VS_3BET,
  GENERIC_VS_OPEN,
  MP_VS_OPEN_UTG,
} from "./data/fallback";
import {
  HAND_ORDER,
  comboCount,
  handScore,
  handStrength,
  impliedOddsClass,
  normalizeHandKey,
} from "./hand";
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
      return {
        chart: GENERIC_VS_OPEN,
        source: "generic fallback",
        fallbackNote: "该位置对不在 6-max 参考表中，按通用 3bet-or-fold 参考范围近似",
        ruleBased: false,
      };
    }
    case "vs-3bet": {
      if (!villain) throw new Error("面对 3bet 需要提供 villainPosition");
      const chart = get(`${hero}-vs-3bet-${villain}`);
      if (chart) return { chart, source: "GreenCharts2024 vs-3bet", ruleBased: false };
      return {
        chart: GENERIC_VS_3BET,
        source: "generic fallback",
        fallbackNote: "该位置对不在 6-max 参考表中，按通用 4bet/跟注参考范围近似",
        ruleBased: false,
      };
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

/** Remove the weakest `fraction` of a chart's hands by preflop score. */
function removeWeakestFraction(chart: Chart, fraction: number): Chart {
  if (fraction <= 0) return chart;
  const byScore = Object.keys(chart).sort(
    (a, b) => handScore(a) - handScore(b)
  );
  const removeCount = Math.min(
    byScore.length,
    Math.max(1, Math.floor(byScore.length * fraction))
  );
  const remove = new Set(byScore.slice(0, removeCount));
  const out: Chart = {};
  for (const [hand, cell] of Object.entries(chart)) {
    if (!remove.has(hand)) out[hand] = cell;
  }
  return out;
}

/**
 * Full-ring early positions must open tighter than the 6-max charts the
 * data pack provides: a true 9-max UTG range is meaningfully narrower than
 * a 6-max UTG range. Approximated by removing the weakest fraction of the
 * opening chart, scaled by table size and seat.
 *
 * Only applies to open-raise scenarios (unopened / iso); defense charts
 * keep the 6-max baseline.
 */
export function fullRingTightenFraction(
  playerCount: number,
  heroLabel: string
): number {
  if (playerCount < 7) return 0;
  const label = heroLabel.toUpperCase();
  if (playerCount >= 9) {
    if (label === "UTG") return 0.3;
    if (label === "UTG+1") return 0.2;
    if (label === "MP") return 0.1;
    if (label === "LJ") return 0.05;
    return 0;
  }
  if (playerCount === 8) {
    if (label === "UTG") return 0.2;
    if (label === "MP") return 0.08;
    if (label === "LJ") return 0.05;
    return 0;
  }
  // 7-handed
  if (label === "UTG") return 0.12;
  if (label === "MP") return 0.05;
  return 0;
}

/** Apply the full-ring early-position tightening to an opening chart. */
export function applyFullRingTightening(
  chart: Chart,
  scenario: PreflopScenario,
  playerCount: number,
  heroLabel: string
): { chart: Chart; removedFraction: number } {
  if (scenario !== "unopened" && scenario !== "iso") {
    return { chart, removedFraction: 0 };
  }
  const fraction = fullRingTightenFraction(playerCount, heroLabel);
  if (fraction <= 0) return { chart, removedFraction: 0 };
  return { chart: removeWeakestFraction(chart, fraction), removedFraction: fraction };
}

/** Stack-depth buckets between push/fold (<=20bb) and the 100bb baseline. */
export type DepthBucket = 25 | 40 | 60 | null;

export function depthBucketOf(stackBB: number): DepthBucket {
  if (stackBB <= 20) return null; // push/fold territory, handled separately
  if (stackBB <= 30) return 25;
  if (stackBB <= 50) return 40;
  if (stackBB <= 75) return 60;
  return null;
}

/** Call-weight multipliers per depth bucket. */
const DEPTH_CALL_FACTORS: Record<
  25 | 40 | 60,
  { smallPair: number; speculative: number; vs3betNonPremium: number }
> = {
  // 60bb: implied odds are mildly worse; trim speculative calls a little.
  60: { smallPair: 0.85, speculative: 0.85, vs3betNonPremium: 0.85 },
  // 40bb: set mining and low suited connectivity no longer pay full price.
  40: { smallPair: 0.5, speculative: 0.6, vs3betNonPremium: 0.6 },
  // 25bb: speculative flatting is mostly gone; play tighter or jam.
  25: { smallPair: 0, speculative: 0.3, vs3betNonPremium: 0.35 },
};

/**
 * Depth adjustment for 20-75bb stacks: the 100bb charts overvalue
 * implied-odds calls (small pairs, low suited connectors) and vs-3bet
 * continues when stacks are shallow. Raise/jam branches are untouched;
 * only call weight is reduced, with the difference folding.
 */
export function applyDepthAdjustment(
  chart: Chart,
  scenario: PreflopScenario,
  stackBB: number
): { chart: Chart; bucket: DepthBucket } {
  const bucket = depthBucketOf(stackBB);
  if (!bucket) return { chart, bucket: null };
  if (scenario !== "vs-open" && scenario !== "vs-3bet") {
    return { chart, bucket: null };
  }
  const factors = DEPTH_CALL_FACTORS[bucket];
  const out: Chart = {};
  for (const [hand, cell] of Object.entries(chart)) {
    if (!cell) continue;
    const w = normalizeCell(cell);
    const callShare = w.actions.call || 0;
    if (callShare <= 0) {
      out[hand] = cell;
      continue;
    }
    let factor = 1;
    if (scenario === "vs-3bet") {
      factor = handStrength(hand) === "strong" ? 1 : factors.vs3betNonPremium;
    } else {
      const klass = impliedOddsClass(hand);
      if (klass === "small-pair") factor = factors.smallPair;
      else if (klass === "speculative-suited") factor = factors.speculative;
    }
    if (factor >= 1) {
      out[hand] = cell;
      continue;
    }
    // Convert to combo-mass space: reduce only the calling mass.
    const weight = Math.max(0, Math.min(100, w.weight));
    const callMass = (weight * callShare) / 100;
    const keptCallMass = callMass * factor;
    const otherMass = weight - callMass;
    const newWeight = otherMass + keptCallMass;
    if (newWeight < 1) continue; // folds entirely
    const actions: WeightedCell["actions"] = {};
    for (const [action, share] of Object.entries(w.actions)) {
      if (!share || action === "fold") continue;
      const mass = action === "call" ? keptCallMass : (weight * share) / 100;
      if (mass <= 0.05) continue;
      actions[action as PreflopAction] = round1((mass / newWeight) * 100);
    }
    out[hand] = { weight: round1(newWeight), actions };
  }
  return { chart: out, bucket };
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
    return removeWeakestFraction(chart, 0.1);
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
