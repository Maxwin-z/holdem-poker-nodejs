/**
 * Bridge between game-engine state and the postflop GTO engine.
 *
 * Pure logic: takes plain seat/bet/stack/card/action data (no Room/User
 * classes), reconstructs the postflop spot (street, pot, facing bet,
 * position, preflop aggressor, street betting context) and returns advice.
 */

import { getPostflopAdvice } from "./advice";
import { cardToId } from "./cards";
import { trackedVillainRange } from "./range-tracker";
import type {
  VillainPreflopRole,
  VillainStreetAction,
  VillainTrack,
} from "./range-tracker";
import { chartPositionByActionOrder } from "../preflop/positions";
import type {
  PostflopAdvice,
  PostflopSituation,
  PostflopStreet,
} from "./types";

export interface PostflopGamePlayerState {
  /** Chips committed this street. */
  bet: number;
  /** Total chips committed across all streets. */
  totalBets: number;
  /** Total stack in chips, including committed bets. */
  stack: number;
  isFolded: boolean;
  isAllIn: boolean;
  hands: { num: number; suit: string }[];
}

export interface PostflopActionRecord {
  /** GameRound: 0=preflop, 1=flop, 2=turn, 3=river. */
  round: number;
  /** fold / check / call / bet / raise / allin. */
  type: string;
  token: string;
  amount?: number;
}

export interface PostflopGameStateInput {
  /** GameRound: 1=flop, 2=turn, 3=river. */
  round: number;
  /** Seat order: index 0 = first to act postflop, last = button. */
  sortedUsers: string[];
  players: Record<string, PostflopGamePlayerState>;
  boardCards: { num: number; suit: string }[];
  bbChips: number;
  actingToken: string;
  /** Per-street action log recorded by the game. */
  actionHistory: PostflopActionRecord[];
  /** Optional real seat label (e.g. "BTN", "BB"). */
  heroPositionLabel?: string;
}

function roundToStreet(round: number): PostflopStreet | null {
  if (round === 1) return "flop";
  if (round === 2) return "turn";
  if (round === 3) return "river";
  return null;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

/** Preflop action-order index for a seat (0 = first actor = UTG/earliest). */
function actorIndexOf(sortedUsers: string[], token: string): number {
  const n = sortedUsers.length;
  const idx = sortedUsers.indexOf(token);
  if (idx < 0) return -1;
  return idx >= 2 ? idx - 2 : n - 2 + idx;
}

/**
 * Pick the villain whose range is worth tracking: the last aggressor on the
 * current street, else the last preflop raiser still in the hand, else the
 * first live opponent. Returns their tracker input, or null when the line
 * cannot be reconstructed.
 */
function buildVillainTrack(
  input: PostflopGameStateInput,
  inHand: string[]
): VillainTrack | null {
  const n = input.sortedUsers.length;
  if (n < 2 || n > 10) return null;
  const liveOpponents = inHand.filter((t) => t !== input.actingToken);
  if (liveOpponents.length === 0) return null;

  const isAggressive = (type: string) =>
    type === "bet" || type === "raise" || type === "allin";

  const currentStreetAggressor = [...input.actionHistory]
    .reverse()
    .find(
      (a) =>
        a.round === input.round &&
        isAggressive(a.type) &&
        liveOpponents.indexOf(a.token) >= 0
    );
  const preflopRaises = input.actionHistory.filter(
    (a) => a.round === 0 && isAggressive(a.type)
  );
  const lastPreflopRaise = preflopRaises[preflopRaises.length - 1];
  const villainToken =
    currentStreetAggressor?.token ||
    (lastPreflopRaise && liveOpponents.indexOf(lastPreflopRaise.token) >= 0
      ? lastPreflopRaise.token
      : liveOpponents[0]);

  const villainIndex = actorIndexOf(input.sortedUsers, villainToken);
  if (villainIndex < 0) return null;
  let chartPosition;
  try {
    chartPosition = chartPositionByActionOrder(n, villainIndex);
  } catch (_) {
    return null;
  }

  // Preflop role.
  let preflop: VillainPreflopRole;
  const villainRaised = preflopRaises.some((a) => a.token === villainToken);
  const villainPreflopActions = input.actionHistory.filter(
    (a) => a.round === 0 && a.token === villainToken
  );
  const openerToken = preflopRaises[0]?.token;
  let openerPosition;
  if (openerToken && openerToken !== villainToken) {
    const openerIndex = actorIndexOf(input.sortedUsers, openerToken);
    try {
      openerPosition =
        openerIndex >= 0 ? chartPositionByActionOrder(n, openerIndex) : undefined;
    } catch (_) {
      openerPosition = undefined;
    }
  }
  if (villainRaised) {
    const villainMadeFirstRaise = openerToken === villainToken;
    if (villainMadeFirstRaise) {
      preflop = { kind: "open" };
    } else if (openerPosition) {
      preflop = { kind: "3bet", openerPosition };
    } else {
      preflop = { kind: "open" };
    }
  } else if (preflopRaises.length > 0) {
    preflop = openerPosition
      ? { kind: "call-vs-open", openerPosition }
      : { kind: "unknown" };
  } else if (chartPosition === "BB") {
    preflop = { kind: "bb-check" };
  } else if (villainPreflopActions.some((a) => a.type === "call")) {
    preflop = { kind: "limp" };
  } else {
    // SB completing in an unraised pot behaves like a limp.
    preflop = chartPosition === "SB" ? { kind: "limp" } : { kind: "unknown" };
  }
  if (preflop.kind === "unknown") return null;

  const streetActions: VillainTrack["streetActions"] = [];
  for (const a of input.actionHistory) {
    if (a.token !== villainToken) continue;
    if (a.round < 1 || a.round > 3 || a.round > input.round) continue;
    if (a.type === "fold") return null;
    if (["bet", "raise", "allin", "call", "check"].indexOf(a.type) < 0) continue;
    streetActions.push({
      round: a.round as 1 | 2 | 3,
      action: a.type as VillainStreetAction,
    });
  }

  return { chartPosition, preflop, streetActions };
}

/**
 * Build (and solve, via the distilled policy / heuristic) the postflop
 * advice for the acting player. Returns null when the state is not a valid
 * postflop spot (e.g. not flop+, missing board/cards, or no opponents).
 */
export function buildPostflopAdvice(
  input: PostflopGameStateInput
): PostflopAdvice | null {
  const street = roundToStreet(input.round);
  if (!street) return null;
  const n = input.sortedUsers.length;
  if (n < 2 || !(input.bbChips > 0)) return null;
  if (!input.boardCards || input.boardCards.length < 3) return null;

  const hero = input.players[input.actingToken];
  if (!hero || hero.hands.length !== 2) return null;

  const pot = sum(
    input.sortedUsers.map((t) => input.players[t].totalBets || 0)
  );
  const currentBet = Math.max(
    ...input.sortedUsers.map((t) => input.players[t].bet || 0)
  );
  const toCall = Math.max(0, currentBet - (hero.bet || 0));
  const heroRemaining = Math.max(
    0,
    (hero.stack || 0) - (hero.totalBets || 0)
  );

  const inHand = input.sortedUsers.filter((t) => !input.players[t].isFolded);
  if (inHand.length < 2) return null;
  const effectiveStackBB =
    Math.min(...inHand.map((t) => input.players[t].stack)) / input.bbChips;
  const activeVillainCount = inHand.filter(
    (t) => t !== input.actingToken && !input.players[t].isAllIn
  ).length;

  // The last seat in sorted order acts last postflop (the button; in
  // heads-up the big blind acts last in this game's dealing order).
  const heroInPosition = input.actingToken === input.sortedUsers[n - 1];

  const preflopActions = input.actionHistory.filter((a) => a.round === 0);
  const raises = preflopActions.filter(
    (a) => a.type === "raise" || a.type === "allin"
  );
  const preflopHasRaise = raises.length > 0;
  const lastRaise = raises[raises.length - 1];
  const isPreflopAggressor =
    !!lastRaise && lastRaise.token === input.actingToken;
  const threeBetPot = raises.length >= 2;

  const streetActions = input.actionHistory.filter(
    (a) => a.round === input.round
  );
  const streetBetCount = streetActions.filter(
    (a) => a.type === "bet" || a.type === "raise" || a.type === "allin"
  ).length;
  const facedRaiseThisStreet = streetActions.some(
    (a) => a.type === "raise" || a.type === "allin"
  );

  const heroCardIds: [number, number] = [
    cardToId(hero.hands[0]),
    cardToId(hero.hands[1]),
  ];
  const boardIds = input.boardCards.map(cardToId);

  // Action-line villain range tracking; falls back to the generic model
  // inside the engine when the line can't be reconstructed or collapses.
  let villainRange: [number, number][] | undefined;
  try {
    const track = buildVillainTrack(input, inHand);
    if (track) {
      villainRange =
        trackedVillainRange(heroCardIds, boardIds, track) || undefined;
    }
  } catch (_) {
    villainRange = undefined;
  }

  const situation: PostflopSituation = {
    street,
    heroCards: heroCardIds,
    board: boardIds,
    pot,
    currentBet,
    heroBet: hero.bet || 0,
    toCall,
    heroRemaining,
    bigBlind: input.bbChips,
    effectiveStackBB,
    activeVillainCount,
    heroInPosition,
    isPreflopAggressor,
    preflopHasRaise,
    threeBetPot,
    streetBetCount,
    facedRaiseThisStreet,
    heroPositionLabel: input.heroPositionLabel,
    boardCards: input.boardCards,
    villainRange,
  };

  return getPostflopAdvice(situation);
}
