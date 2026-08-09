/**
 * Postflop decision engine (ported from gto-poker-overlay).
 *
 * Heads-up spots use the distilled neural-net policy (with the lead/c-bet
 * policy replacing the net's weak bet-vs-check head, the anti-punt pot-odds
 * floor, and the flush-board guard). Multiway / fallback uses the transparent
 * range-aware heuristic, which measures hero equity against a concrete
 * villain continuing range. Every decision passes through the soundness gate
 * and is legalized (sizing capped to the hero's remaining stack).
 *
 * Unlike the reference bot (which samples one action), this engine returns a
 * deterministic recommendation: the action with the highest probability in
 * the equilibrium mix.
 */

import { CardId, handGroupName } from "./cards";
import { evaluateHand, HAND_CATEGORY } from "./hand-eval";
import { equityVsRange } from "./equity";
import { villainContinuingRange } from "./range";
import { leadBetProbability } from "./lead";
import { evaluateSoundness } from "./soundness";
import { predictPostflop } from "./policy";
import { deterministicEquity, Spot } from "./features";
import { analyzeBoard, BoardAnalysis } from "./board";
import {
  BoardTexture,
  PostflopAction,
  PostflopSituation,
  PostflopStreet,
} from "./types";

export interface PostflopMixedStrategy {
  fold: number;
  check: number;
  call: number;
  /** Bet/raise options: amount in chips, probability 0-1. */
  bets: { amount: number; probability: number }[];
}

export interface PostflopDecision {
  action: PostflopAction;
  amount?: number;
  confidence: number;
  reasoning: string;
  mixedStrategy: PostflopMixedStrategy;
  equityVsRange?: number;
  equityRangeCombos?: number;
  /** Hand-group keys of the villain combos actually evaluated (≤ 160). */
  equityRange?: string[];
}

/** Cap the continuing-range combo count for bounded server latency. */
const MAX_RANGE_COMBOS = 160;

const pct = (x: number) => `${Math.round(x * 100)}%`;

function roundToStake(amount: number, bb: number): number {
  if (Number.isInteger(bb) && bb >= 1) return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

function niceStep(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const f = x / base;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * base;
}

function prettyBet(
  amount: number,
  bb: number,
  minAmt: number = 0
): number {
  if (amount <= 0) return 0;
  const step = niceStep(bb / 4);
  let r = roundToStake(Math.round(amount / step) * step, bb);
  if (minAmt > 0 && r < minAmt) {
    r = roundToStake(Math.ceil(minAmt / step) * step, bb);
  }
  return r;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Board-texture + street + hand-strength bet sizing (pot fractions). */
export function chooseBetSize(
  pot: number,
  texture: BoardTexture,
  street: PostflopStreet,
  bb: number,
  heroCat: number
): number {
  let frac: number;
  switch (texture) {
    case "dry":
    case "paired_dry":
      frac = 0.6;
      break;
    case "monotone":
      frac = 0.55;
      break;
    case "semi_wet":
      frac = 0.66;
      break;
    case "wet":
      frac = 0.75;
      break;
    case "very_wet":
    case "paired_wet":
      frac = 0.85;
      break;
    default:
      frac = 0.66;
  }
  if (street === "river") {
    if (heroCat >= HAND_CATEGORY.TWO_PAIR) frac = 0.9;
    else if (heroCat === HAND_CATEGORY.PAIR) frac = 0.5;
    else frac = 0.8;
  }
  return Math.max(bb, roundToStake(pot * frac, bb));
}

export function decidePostflop(sit: PostflopSituation): PostflopDecision {
  const facingBet = sit.toCall > 0;
  const board = analyzeBoard(sit.board);
  const heroCat =
    sit.board.length >= 3
      ? Math.floor(
          evaluateHand([sit.heroCards[0], sit.heroCards[1], ...sit.board]) /
            1_000_000
        )
      : HAND_CATEGORY.HIGH_CARD;
  const dangerousFlush = isDangerousFlushBoard(
    sit.heroCards,
    sit.board
  );
  const equityVsRandom = deterministicEquity(sit.heroCards, sit.board);

  let decision: PostflopDecision;
  if (sit.activeVillainCount === 1) {
    decision =
      decidePostflopNet(sit, board, heroCat, dangerousFlush, equityVsRandom) ||
      decidePostflopRanged(sit, board, heroCat, dangerousFlush);
  } else {
    decision = decidePostflopRanged(sit, board, heroCat, dangerousFlush);
  }

  // Never fold when a check is free.
  if (decision.action === "fold" && !facingBet) {
    decision = {
      ...decision,
      action: "check",
      confidence: 1,
      reasoning: `${decision.reasoning} [free check]`,
      mixedStrategy: { fold: 0, check: 1, call: 0, bets: [] },
    };
  }

  // Soundness gate: veto punts on every path.
  decision = applySoundnessGate(decision, sit, equityVsRandom);

  // Legalize sizing: never bet/raise more than hero can put in.
  decision = legalizeDecision(decision, sit);

  // Deterministic recommendation: argmax of the mix (allin kept as-is).
  const finalAction =
    decision.action === "allin"
      ? "allin"
      : argmaxAction(decision.mixedStrategy, facingBet);
  const result = { ...decision, action: finalAction };
  // The recommended action may be a check/call/fold while the mixed strategy
  // still contains a bet/raise branch. Carry that branch's (legalized) size
  // so advice cards can render both lines, e.g. "过牌 50% / 下注 11 筹码 50%".
  if (result.amount === undefined && result.mixedStrategy.bets.length > 0) {
    const branchAmount = result.mixedStrategy.bets[0].amount;
    if (Number.isFinite(branchAmount)) result.amount = branchAmount;
  }
  return result;
}

function argmaxAction(
  m: PostflopMixedStrategy,
  facingBet: boolean
): PostflopAction {
  const betProb = m.bets.reduce((s, b) => s + b.probability, 0);
  const candidates: { action: PostflopAction; p: number }[] = [
    { action: "fold", p: m.fold },
    { action: "check", p: m.check },
    { action: "call", p: m.call },
    { action: facingBet ? "raise" : "bet", p: betProb },
  ];
  let best = candidates[0];
  for (const c of candidates) {
    if (c.p > best.p) best = c;
  }
  return best.action;
}

// ============================================================
// Distilled-net path (heads-up)
// ============================================================

function decidePostflopNet(
  sit: PostflopSituation,
  board: BoardAnalysis,
  heroCat: number,
  dangerousFlush: boolean,
  equityVsRandom: number
): PostflopDecision | null {
  const facingBet = sit.toCall > 0;
  const pot = Math.max(1, sit.pot);
  const bb = sit.bigBlind || 1;

  const spot: Spot = {
    holeCards: sit.heroCards,
    board: sit.board,
    street: sit.street,
    heroPos: sit.heroInPosition ? "IP" : "OOP",
    facingBet,
    isPreflopAggressor: sit.isPreflopAggressor,
    facedRaiseThisStreet: sit.facedRaiseThisStreet,
    streetBetCount: sit.streetBetCount,
    toCallFrac: sit.toCall / pot,
    offeredSizeFrac: facingBet ? sit.toCall / pot : 0.66,
    canCheck: !facingBet,
    canBet: !facingBet,
    canCall: facingBet,
    canRaise: facingBet,
    canFold: facingBet,
    threeBetPot: sit.threeBetPot,
  };

  let pred;
  try {
    pred = predictPostflop(spot);
  } catch (e) {
    console.warn("[GTO] postflop net failed, using ranged fallback", e);
    return null;
  }
  const probs = pred.probs;
  let finalAction = pred.action;

  const betSize = chooseBetSize(
    sit.pot,
    board.texture,
    sit.street,
    bb,
    heroCat
  );
  const raiseSize = Math.max(
    roundToStake(sit.currentBet * 2.5, bb),
    sit.currentBet + betSize
  );

  // Flush-board guard: never bet/raise a hand that can't beat a flush.
  if (
    (finalAction === "bet" || finalAction === "raise") &&
    dangerousFlush &&
    heroCat < HAND_CATEGORY.FLUSH
  ) {
    finalAction = facingBet ? "call" : "check";
  }

  let eqR: number | undefined;
  let eqCombos: number | undefined;
  let eqRange: string[] | undefined;

  // Anti-punt pot-odds floor facing a bet.
  if (facingBet && finalAction !== "fold") {
    const r = equityVsContinuingRange(sit, true);
    eqR = r.eqR;
    eqCombos = r.combos;
    eqRange = r.range;
    const potOdds = sit.toCall / (sit.pot + sit.toCall);
    if (eqR < potOdds + 0.02) {
      return {
        action: "fold",
        confidence: 1 - eqR,
        reasoning: `fold ${sit.toCall} (${pct(eqR)} vs range < ${pct(potOdds)} pot odds) [anti-punt]`,
        mixedStrategy: { fold: 1, check: 0, call: 0, bets: [] },
        equityVsRange: eqR,
        equityRangeCombos: eqCombos,
        equityRange: eqRange,
      };
    }
    if (finalAction === "raise" && eqR < 0.6) finalAction = "call";
  }

  // Lead / c-bet policy when first to act.
  if (!facingBet) {
    const isAggressor = sit.preflopHasRaise
      ? sit.isPreflopAggressor
      : sit.heroInPosition;
    const veryWetOrMono =
      board.texture === "very_wet" || board.isMonotone;
    const pBet = leadBetProbability({
      isAggressor,
      isIP: sit.heroInPosition,
      heroCat,
      equity: equityVsRandom,
      street: sit.street,
      veryWetOrMono,
      dangerousFlush,
    });
    const role = isAggressor ? "c-bet" : "lead";
    const reasoning = `${role} ${betSize} (${board.texture}, ${pct(equityVsRandom)} eq, p${pct(pBet)}) [lead-policy]`;
    return {
      action: pBet >= 0.5 ? "bet" : "check",
      amount: pBet >= 0.5 ? betSize : undefined,
      confidence: pBet >= 0.5 ? pBet : 1 - pBet,
      reasoning,
      mixedStrategy: {
        fold: 0,
        check: round1(1 - pBet),
        call: 0,
        bets: [{ amount: betSize, probability: round1(pBet) }],
      },
    };
  }

  const betProb = probs.bet + probs.raise;
  const downgraded =
    facingBet && pred.action === "raise" && finalAction === "call";
  const guarded =
    (pred.action === "bet" || pred.action === "raise") &&
    (finalAction === "check" || finalAction === "call");
  const reasoning = `net ${pred.action} (f${pct(probs.fold)} k${pct(probs.check)} c${pct(probs.call)} b${pct(probs.bet)} r${pct(probs.raise)})`;
  let mixedStrategy: PostflopMixedStrategy;
  if (guarded || downgraded) {
    // The net wanted to bet/raise but a guard downgraded it: fold the bet
    // probability into the final action and clear the bet options so the mix
    // and the recommended action stay consistent.
    mixedStrategy = {
      fold: round1(probs.fold * 100) / 100,
      check:
        finalAction === "check"
          ? round1((probs.check + betProb) * 100) / 100
          : round1(probs.check * 100) / 100,
      call:
        finalAction === "call"
          ? round1((probs.call + betProb) * 100) / 100
          : round1(probs.call * 100) / 100,
      bets: [],
    };
  } else {
    mixedStrategy = {
      fold: round1(probs.fold * 100) / 100,
      check: round1(probs.check * 100) / 100,
      call: round1(probs.call * 100) / 100,
      bets:
        betProb > 0.005
          ? [{ amount: raiseSize, probability: round1(betProb) }]
          : [],
    };
  }
  let confidence: number;
  if (finalAction === "bet" || finalAction === "raise") {
    confidence = betProb;
  } else {
    confidence = mixedStrategy[finalAction] || 0;
  }

  return {
    action: finalAction,
    amount: finalAction === "raise" ? raiseSize : undefined,
    confidence,
    reasoning,
    mixedStrategy,
    equityVsRange: eqR,
    equityRangeCombos: eqCombos,
    equityRange: eqRange,
  };
}

// ============================================================
// Range-aware heuristic path (multiway / fallback)
// ============================================================

function decidePostflopRanged(
  sit: PostflopSituation,
  board: BoardAnalysis,
  heroCat: number,
  dangerousFlush: boolean
): PostflopDecision {
  const facingBet = sit.toCall > 0;
  const aggression = facingBet;
  const { eqR, combos, range } = equityVsContinuingRange(sit, aggression);
  const pairedBoard = board.isPaired;
  const twoPairType = heroCat === HAND_CATEGORY.TWO_PAIR;
  const dominatedByBoard = dangerousFlush || (pairedBoard && twoPairType);

  if (facingBet) {
    return rangedFacingBet(sit, eqR, combos, range, dominatedByBoard, heroCat);
  }
  return rangedFirstToAct(sit, eqR, combos, range, board, dangerousFlush, heroCat);
}

function rangedFacingBet(
  sit: PostflopSituation,
  eqR: number,
  combos: number,
  range: string[],
  dominatedByBoard: boolean,
  heroCat: number
): PostflopDecision {
  const pot = sit.pot;
  const bb = sit.bigBlind || 1;
  const callThreshold = sit.toCall / (pot + sit.toCall);
  const buffer = 0.02;

  // Value raise: high equity vs range and not dominated by the board.
  if (eqR >= 0.7 && !dominatedByBoard) {
    const raiseTo = roundToStake(sit.currentBet * 2.5, bb);
    const raiseFreq = eqR >= 0.82 ? 0.8 : 0.6;
    return {
      action: "raise",
      amount: raiseTo,
      confidence: eqR,
      reasoning: `value raise to ${raiseTo} (${pct(eqR)} vs range)`,
      mixedStrategy: {
        fold: 0,
        check: 0,
        call: round1(1 - raiseFreq),
        bets: [{ amount: raiseTo, probability: raiseFreq }],
      },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  // Bluff raise (low frequency): low equity but blockers/draws.
  if (
    eqR < callThreshold &&
    eqR > 0.2 &&
    sit.street !== "river" &&
    heroCat <= HAND_CATEGORY.PAIR &&
    !dominatedByBoard
  ) {
    const raiseTo = roundToStake(sit.currentBet * 2.5, bb);
    const bluffFreq = 0.1;
    return {
      action: "fold",
      amount: undefined,
      confidence: 1 - bluffFreq,
      reasoning: `bluff raise to ${raiseTo} (${pct(eqR)} vs range, blockers/draw)`,
      mixedStrategy: {
        fold: round1(1 - bluffFreq),
        check: 0,
        call: 0,
        bets: [{ amount: raiseTo, probability: bluffFreq }],
      },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  // Call: equity beats pot odds (+ buffer).
  if (eqR >= callThreshold + buffer) {
    return {
      action: "call",
      confidence: eqR,
      reasoning: `call ${sit.toCall} (${pct(eqR)} vs range > ${pct(callThreshold)} odds)`,
      mixedStrategy: { fold: 0, check: 0, call: 1, bets: [] },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  return {
    action: "fold",
    confidence: 1 - eqR,
    reasoning: `fold (${pct(eqR)} vs range < ${pct(callThreshold)} pot odds)`,
    mixedStrategy: { fold: 1, check: 0, call: 0, bets: [] },
    equityVsRange: eqR,
    equityRangeCombos: combos,
    equityRange: range,
  };
}

function rangedFirstToAct(
  sit: PostflopSituation,
  eqR: number,
  combos: number,
  range: string[],
  board: BoardAnalysis,
  dangerousFlush: boolean,
  heroCat: number
): PostflopDecision {
  const bb = sit.bigBlind || 1;
  const wet =
    board.texture === "wet" ||
    board.texture === "very_wet" ||
    board.texture === "semi_wet" ||
    board.isMonotone;
  const sizeFrac = wet ? 0.66 : 0.33;
  const betSize = Math.max(bb, roundToStake(sit.pot * sizeFrac, bb));
  const sizeLabel = wet ? "2/3" : "1/3";

  // Anti-blunder: on a dangerous flush board without the flush, never
  // value-bet a non-nut made hand.
  if (dangerousFlush && heroCat < HAND_CATEGORY.FLUSH) {
    return {
      action: "check",
      confidence: 1,
      reasoning: `check (behind range on flush board, ${pct(eqR)} vs range)`,
      mixedStrategy: { fold: 0, check: 1, call: 0, bets: [] },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  // Value bet.
  if (eqR >= 0.62) {
    return {
      action: "bet",
      amount: betSize,
      confidence: eqR,
      reasoning: `value bet ${sizeLabel} (${pct(eqR)} vs range)`,
      mixedStrategy: {
        fold: 0,
        check: 0.1,
        call: 0,
        bets: [{ amount: betSize, probability: 0.9 }],
      },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  // Semi-bluff with draw equity.
  const alpha = betSize / (betSize + sit.pot);
  const hasDrawEquity =
    eqR >= 0.3 && eqR < 0.55 && heroCat <= HAND_CATEGORY.PAIR;
  if (hasDrawEquity && sit.street !== "river" && !dangerousFlush) {
    return {
      action: alpha >= 0.5 ? "bet" : "check",
      amount: alpha >= 0.5 ? betSize : undefined,
      confidence: alpha >= 0.5 ? alpha : 1 - alpha,
      reasoning: `semi-bluff ${sizeLabel} (${pct(eqR)} vs range, draw, alpha=${pct(alpha)})`,
      mixedStrategy: {
        fold: 0,
        check: round1(1 - alpha),
        call: 0,
        bets: [{ amount: betSize, probability: round1(alpha) }],
      },
      equityVsRange: eqR,
      equityRangeCombos: combos,
      equityRange: range,
    };
  }

  return {
    action: "check",
    confidence: 1,
    reasoning: `check (${pct(eqR)} vs range, medium/no value)`,
    mixedStrategy: { fold: 0, check: 1, call: 0, bets: [] },
    equityVsRange: eqR,
    equityRangeCombos: combos,
    equityRange: range,
  };
}

// ============================================================
// Shared helpers
// ============================================================

function equityVsContinuingRange(
  sit: PostflopSituation,
  aggression: boolean
): { eqR: number; combos: number; range: string[] } {
  const range = villainContinuingRange(sit.heroCards, sit.board, {
    aggression,
    multiway: sit.activeVillainCount > 1,
  });
  let evalRange = range;
  if (range.length > MAX_RANGE_COMBOS) {
    const stride = Math.ceil(range.length / MAX_RANGE_COMBOS);
    evalRange = range.filter((_, i) => i % stride === 0);
  }
  const res = equityVsRange(sit.heroCards, sit.board, evalRange, 3000);
  return {
    eqR: res.equity,
    combos: res.combos,
    range: evalRange.map(([a, b]) => handGroupName(a, b)),
  };
}

function heroHoldsRelevantFlush(
  heroCards: [CardId, CardId],
  board: CardId[]
): boolean {
  const suitCount = [0, 0, 0, 0];
  for (const c of board) suitCount[c % 4]++;
  const flushSuit = suitCount.findIndex((n) => n >= 3);
  if (flushSuit < 0) return false;
  const heroSuited = heroCards.filter((c) => c % 4 === flushSuit).length;
  const onBoard = suitCount[flushSuit];
  if (onBoard >= 5) return true;
  if (onBoard === 4) return heroSuited >= 1;
  return heroSuited >= 2;
}

function isFourFlushBoard(board: CardId[]): boolean {
  const suitCount = [0, 0, 0, 0];
  for (const c of board) suitCount[c % 4]++;
  return suitCount.some((n) => n >= 4);
}

/** Monotone / 4-flush board on which hero holds no flush. */
export function isDangerousFlushBoard(
  heroCards: [CardId, CardId],
  board: CardId[]
): boolean {
  const analysis = analyzeBoard(board);
  return (
    (analysis.isMonotone || isFourFlushBoard(board)) &&
    !heroHoldsRelevantFlush(heroCards, board)
  );
}

function applySoundnessGate(
  decision: PostflopDecision,
  sit: PostflopSituation,
  equityVsRandom: number
): PostflopDecision {
  if (!["call", "allin", "bet", "raise"].includes(decision.action)) {
    return decision;
  }
  const facingBet = sit.toCall > 0;
  const pot = sit.pot || 0;
  const potOdds = facingBet ? sit.toCall / (pot + sit.toCall) : 0;
  const heroRemaining = Math.max(1, sit.heroRemaining);
  let commit: number;
  if (decision.action === "allin") {
    commit = 1;
  } else if (decision.action === "call") {
    commit = Math.min(1, sit.toCall / heroRemaining);
  } else {
    const additional = Math.max(0, (decision.amount || 0) - sit.heroBet);
    commit = Math.min(1, additional / heroRemaining);
  }

  let eqVsRange = decision.equityVsRange;
  if (eqVsRange === undefined) {
    const r = equityVsContinuingRange(sit, facingBet);
    eqVsRange = r.eqR;
    decision = {
      ...decision,
      equityVsRange: r.eqR,
      equityRangeCombos: r.combos,
      equityRange: r.range,
    };
  }

  const result = evaluateSoundness({
    action: decision.action,
    street: sit.street,
    facingBet,
    potOdds,
    commit,
    effStackBB: sit.effectiveStackBB,
    eqVsRange,
  });
  if (result.override && (result.action === "fold" || result.action === "check")) {
    const safe = result.action;
    return {
      action: safe,
      confidence: decision.confidence,
      reasoning: `${decision.reasoning} | ${result.reason}`,
      mixedStrategy:
        safe === "check"
          ? { fold: 0, check: 1, call: 0, bets: [] }
          : { fold: 1, check: 0, call: 0, bets: [] },
      equityVsRange: decision.equityVsRange,
      equityRangeCombos: decision.equityRangeCombos,
    };
  }
  void equityVsRandom;
  return decision;
}

function legalizeDecision(
  decision: PostflopDecision,
  sit: PostflopSituation
): PostflopDecision {
  const heroRemaining = sit.heroRemaining;
  if (heroRemaining <= 0) return decision;
  const maxTo = sit.heroBet + heroRemaining; // total committed if all-in
  const facingBet = sit.toCall > 0;
  const minRaiseTo = Math.max(sit.currentBet * 2, sit.currentBet + sit.bigBlind);

  if (decision.action === "bet" && facingBet) {
    decision = { ...decision, action: "raise" };
  }

  const clampBet = (amt: number): number => {
    if (amt === Infinity) return Infinity;
    const floored = facingBet ? Math.max(amt, minRaiseTo) : amt;
    const pretty = prettyBet(floored, sit.bigBlind, facingBet ? minRaiseTo : 0);
    return pretty >= maxTo ? Infinity : pretty;
  };

  if (
    (decision.action === "raise" || decision.action === "bet") &&
    decision.amount
  ) {
    let amt = decision.amount;
    if (facingBet) amt = Math.max(amt, minRaiseTo);
    const pretty = prettyBet(amt, sit.bigBlind, facingBet ? minRaiseTo : 0);
    if (pretty >= maxTo) {
      decision = {
        ...decision,
        action: "allin",
        amount: maxTo,
        reasoning: `${decision.reasoning} (all-in: capped to stack)`,
      };
    } else {
      decision = { ...decision, amount: pretty };
    }
  } else if (decision.action === "allin") {
    decision = { ...decision, amount: maxTo };
  }

  if (decision.mixedStrategy.bets.length > 0) {
    decision = {
      ...decision,
      mixedStrategy: {
        ...decision.mixedStrategy,
        bets: decision.mixedStrategy.bets.map((b) => ({
          probability: b.probability,
          amount: clampBet(b.amount),
        })),
      },
    };
  }
  return decision;
}

/** Hand category names (Chinese) for display. */
export const HAND_CATEGORY_CN: Record<number, string> = {
  [HAND_CATEGORY.HIGH_CARD]: "高牌",
  [HAND_CATEGORY.PAIR]: "一对",
  [HAND_CATEGORY.TWO_PAIR]: "两对",
  [HAND_CATEGORY.THREE_OF_A_KIND]: "三条",
  [HAND_CATEGORY.STRAIGHT]: "顺子",
  [HAND_CATEGORY.FLUSH]: "同花",
  [HAND_CATEGORY.FULL_HOUSE]: "葫芦",
  [HAND_CATEGORY.FOUR_OF_A_KIND]: "四条",
  [HAND_CATEGORY.STRAIGHT_FLUSH]: "同花顺",
};
