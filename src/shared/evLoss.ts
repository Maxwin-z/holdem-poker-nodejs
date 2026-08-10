/**
 * EV-loss estimation for grading a player's action against strategy advice.
 *
 * Principles:
 * - In an equilibrium mix, every action played at meaningful frequency is
 *   (near-)indifferent, so any action inside the reference mixed strategy
 *   gets FULL CREDIT (0 EV loss) instead of a frequency-shortfall penalty.
 * - Where the advice carries real equity data (postflop equity vs the
 *   modeled continuing range) call/fold mistakes are priced with the
 *   pot-odds EV formula: EV(call) = eq × (pot + call) − call.
 * - Everything else falls back to a frequency-shortfall proxy scaled by the
 *   pot. The `basis` field always says which method produced the number so
 *   the UI never presents a proxy as an exact solver EV.
 *
 * All results are in big blinds and non-negative.
 */

import type { PreflopAdvice } from "../gto/preflop/types";
import type { PostflopAdvice } from "../gto/postflop/types";

export type EvLossBasis =
  | "recommended" // matches the top recommendation (only sizing can lose EV)
  | "indifference" // inside the reference mix at meaningful frequency
  | "pot-odds" // priced from equity vs range and pot odds
  | "frequency"; // frequency-shortfall proxy scaled by the pot

export interface EvLossEstimate {
  /** Estimated EV lost vs the reference strategy, in big blinds (>= 0). */
  evLossBB: number;
  basis: EvLossBasis;
}

/** Actions at or above this frequency (%) in a mixed reference get full credit. */
export const MIXED_CREDIT_MIN_FREQUENCY = 15;

/** Hard cap: a single decision is never graded worse than this (bb). */
const MAX_EV_LOSS_BB = 25;

/** Sizing-error weight: fraction of the bb distance charged as EV loss. */
const SIZE_LOSS_WEIGHT = 0.25;

const AGGRESSIVE_ACTIONS = new Set(["bet", "raise", "allin"]);

const round2 = (x: number) => Math.round(x * 100) / 100;

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

export const EV_BASIS_LABEL_CN: Record<EvLossBasis, string> = {
  recommended: "与推荐一致",
  indifference: "混合策略内（视为无损）",
  "pot-odds": "按底池赔率估算",
  frequency: "按频率近似估算",
};

function heroDistribution(
  advice: PreflopAdvice | PostflopAdvice
): Record<string, number> {
  if (advice.kind === "preflop" && advice.hero) {
    return advice.hero.actionDistribution as unknown as Record<string, number>;
  }
  return advice.actionDistribution as unknown as Record<string, number>;
}

/** Big blind in chips, recovered from the advice's own chip/bb pair. */
function bigBlindChipsOf(
  advice: PreflopAdvice | PostflopAdvice
): number | undefined {
  const potChips = advice.potChips;
  const potBB = advice.potBB;
  if (potChips && potBB && potChips > 0 && potBB > 0) return potChips / potBB;
  return undefined;
}

/** Reference raise-to size in bb for the actual action, when advertised. */
function referenceSizeBB(
  advice: PreflopAdvice | PostflopAdvice,
  action: string
): number | undefined {
  if (!AGGRESSIVE_ACTIONS.has(action)) return undefined;
  if (advice.kind === "preflop" && Array.isArray(advice.actions)) {
    const branch = advice.actions.find(
      (candidate) => candidate.action === action
    );
    if (branch && branch.sizeBB !== undefined) return branch.sizeBB;
  }
  if (AGGRESSIVE_ACTIONS.has(advice.recommended)) {
    return advice.recommendedSizeBB;
  }
  return undefined;
}

export interface EvLossInput {
  advice: PreflopAdvice | PostflopAdvice;
  /** Actual action, normalized (preflop check recorded as call). */
  action: string;
  /** Actual raise-to amount in chips, for sizing loss on aggressive actions. */
  amountToChips?: number;
  /** Big blind in chips; derived from the advice when omitted. */
  bigBlindChips?: number;
  /**
   * Frequency deviation 0-100 from gradeAiReplayAction, already softened for
   * deterministic charts. Used by the frequency-proxy branch. When absent the
   * plain shortfall vs the most frequent action is used.
   */
  actionScore?: number;
}

/**
 * Estimate the EV lost by `action` relative to the advice's reference
 * strategy, in big blinds. Returns null when the advice carries no usable
 * action distribution.
 */
export function estimateEvLossBB(input: EvLossInput): EvLossEstimate | null {
  const { advice, action } = input;
  const distribution = heroDistribution(advice);
  const probabilities = Object.keys(distribution)
    .map((key) => Number(distribution[key]))
    .filter((value) => Number.isFinite(value));
  const bestProbability = probabilities.length
    ? Math.max(...probabilities)
    : 0;
  if (bestProbability <= 0) return null;
  const probability = Number(distribution[action] || 0);

  const potBB = Math.max(0, advice.potBB || 0);
  const toCallBB =
    advice.kind === "preflop"
      ? Math.max(0, advice.amountToCallBB || 0)
      : Math.max(0, advice.toCallBB || 0);

  // Sizing loss: applies whenever the actual action is an advertised
  // aggressive branch and both sizes are known.
  let sizeLossBB = 0;
  const referenceBB = referenceSizeBB(advice, action);
  const bbChips = input.bigBlindChips || bigBlindChipsOf(advice);
  if (
    referenceBB !== undefined &&
    referenceBB > 0 &&
    input.amountToChips !== undefined &&
    bbChips &&
    bbChips > 0
  ) {
    const actualBB = input.amountToChips / bbChips;
    sizeLossBB = Math.min(
      0.5 * Math.max(1, potBB),
      SIZE_LOSS_WEIGHT * Math.abs(actualBB - referenceBB)
    );
  }

  const finish = (lossBB: number, basis: EvLossBasis): EvLossEstimate => ({
    evLossBB: round2(clamp(lossBB, 0, MAX_EV_LOSS_BB)),
    basis,
  });

  if (action === advice.recommended) {
    return finish(sizeLossBB, "recommended");
  }
  if (probability >= MIXED_CREDIT_MIN_FREQUENCY) {
    return finish(sizeLossBB, "indifference");
  }

  // Pot-odds EV: available when facing a bet with a measured equity vs the
  // continuing range (postflop only; preflop advice carries no equity).
  const equity = advice.kind === "postflop" ? advice.equityVsRange : undefined;
  if (equity !== undefined && toCallBB > 0) {
    const evCallBB = equity * (potBB + toCallBB) - toCallBB;
    const recommended = advice.recommended;
    if (action === "fold" && recommended !== "fold") {
      // Folding forfeits at least the calling EV (a lower bound when the
      // reference action was a raise).
      return finish(Math.max(0, evCallBB), "pot-odds");
    }
    if (action === "call" && recommended === "fold") {
      return finish(Math.max(0, -evCallBB), "pot-odds");
    }
    if (AGGRESSIVE_ACTIONS.has(action) && recommended === "fold") {
      // Raising a hand the reference folds: at least the negative calling
      // EV is burned (fold equity may recover some — treated as a bound).
      return finish(Math.max(0, -evCallBB) + sizeLossBB, "pot-odds");
    }
  }

  // Frequency proxy: shortfall vs the most frequent reference action,
  // scaled by the pot the decision is contesting.
  const shortfall =
    input.actionScore !== undefined
      ? clamp(input.actionScore, 0, 100)
      : ((bestProbability - Math.max(0, probability)) / bestProbability) * 100;
  const potScaleBB = 0.5 * clamp(Math.max(potBB, toCallBB), 1, 30);
  return finish((shortfall / 100) * potScaleBB + sizeLossBB, "frequency");
}
