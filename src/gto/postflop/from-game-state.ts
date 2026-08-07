/**
 * Bridge between game-engine state and the postflop GTO engine.
 *
 * Pure logic: takes plain seat/bet/stack/card/action data (no Room/User
 * classes), reconstructs the postflop spot (street, pot, facing bet,
 * position, preflop aggressor, street betting context) and returns advice.
 */

import { getPostflopAdvice } from "./advice";
import { cardToId } from "./cards";
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

  const situation: PostflopSituation = {
    street,
    heroCards: [cardToId(hero.hands[0]), cardToId(hero.hands[1])],
    board: input.boardCards.map(cardToId),
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
  };

  return getPostflopAdvice(situation);
}
