/**
 * Bridge between game-engine state and the preflop GTO engine.
 *
 * Pure logic: takes plain seat/bet/stack/card data (no Room/User classes),
 * reconstructs the preflop scenario (unopened / iso / vs-open / vs-3bet /
 * vs-4bet), maps seats to chart positions, and returns the advice.
 */

import { getPreflopAdvice } from "./advice";
import {
  chartPositionByActionOrder,
  positionForDistance,
} from "./positions";
import type { ChartPosition, PreflopAdvice, PreflopSituation } from "./types";

export interface GamePlayerState {
  /** Chips committed this preflop round. */
  bet: number;
  /** Total stack in chips, including committed bets. */
  stack: number;
  isFolded: boolean;
  hands: { num: number; suit: string }[];
}

export interface PreflopGameStateInput {
  /** Seat order: index 0 = SB, 1 = BB, last = button (when > 2 players). */
  sortedUsers: string[];
  players: Record<string, GamePlayerState>;
  /** Big blind in chips. */
  bbChips: number;
  actingToken: string;
  /** Token of the player who made the last raise (optional, derived from
   *  the game's raiseUser when available). */
  lastRaiserToken?: string;
  /** Number of raise actions this preflop round so far, including the last
   *  raise the acting player is facing (optional). When absent the builder
   *  falls back to inferring levels from the current bet amounts. */
  raiseCount?: number;
}

function rankChar(num: number): string {
  if (num === 14) return "A";
  if (num === 13) return "K";
  if (num === 12) return "Q";
  if (num === 11) return "J";
  if (num === 10) return "T";
  return String(num);
}

/**
 * 翻前行动顺序序号：0 = 第一个行动者。
 * 本牌局从 sortedUsers[2] 开始行动（CO），然后是 3..n-1（直到 BTN），
 * 最后回到 sortedUsers[0]（SB）、sortedUsers[1]（BB）。
 */
function actorIndexOf(sortedUsers: string[], token: string): number {
  const n = sortedUsers.length;
  const idx = sortedUsers.indexOf(token);
  if (idx < 0) return -1;
  return idx >= 2 ? idx - 2 : n - 2 + idx;
}

function chartPositionAt(
  sortedUsers: string[],
  count: number,
  token: string
): { chart: ChartPosition; label: string } {
  const n = sortedUsers.length;
  const idx = sortedUsers.indexOf(token);
  const buttonIndex = n > 2 ? n - 1 : 0;
  const dist = (idx - buttonIndex + n) % n;
  // 展示标签沿用牌局自己的座位名（CO/MP/UTG...），图表键按行动顺序映射。
  const seat = positionForDistance(count, Math.min(dist, count - 1));
  return {
    chart: chartPositionByActionOrder(n, actorIndexOf(sortedUsers, token)),
    label: seat.label,
  };
}

/**
 * Build (and solve, via precomputed lookup) the preflop advice for the
 * acting player. Returns null when the state is not a valid preflop spot
 * (e.g. not preflop, missing cards, or the actor made the last raise).
 */
export function buildPreflopAdvice(
  input: PreflopGameStateInput
): PreflopAdvice | null {
  const { sortedUsers, players, bbChips, actingToken } = input;
  const n = sortedUsers.length;
  if (n < 2 || !(bbChips > 0)) return null;
  const hero = players[actingToken];
  if (!hero || hero.hands.length !== 2) return null;

  const count = Math.min(Math.max(n, 2), 9);
  const seat = chartPositionAt(sortedUsers, count, actingToken);

  const inHand = sortedUsers.filter((t) => !players[t].isFolded);
  if (inHand.length < 2) return null;
  // 决策深度（bb）：单挑时取双方较小筹码（即有效筹码）；多人局中，短码玩家
  // 只限制他自己能投入的注量，开池/加注尺寸和短码判断应以英雄自身筹码为准
  // （若英雄自己就是最短筹码，则两者相等，行为不变）。
  const effectiveStackBB =
    inHand.length === 2
      ? Math.min(...inHand.map((t) => players[t].stack)) / bbChips
      : hero.stack / bbChips;

  const bets = sortedUsers.map((t) => players[t].bet);
  const maxBet = Math.max(...bets);
  const heroBet = hero.bet;

  const isBlind = (t: string) => t === sortedUsers[0] || t === sortedUsers[1];
  const limpers = sortedUsers.filter(
    (t) =>
      t !== actingToken &&
      t !== input.lastRaiserToken &&
      !players[t].isFolded &&
      !isBlind(t) &&
      players[t].bet > 0 &&
      players[t].bet <= bbChips
  ).length;

  const callers =
    maxBet > bbChips
      ? sortedUsers.filter(
          (t) =>
            t !== actingToken &&
            t !== input.lastRaiserToken &&
            !players[t].isFolded &&
            players[t].bet === maxBet
        ).length
      : 0;

  const lastRaiser =
    input.lastRaiserToken ||
    (maxBet > bbChips
      ? sortedUsers.find(
          (t) => players[t].bet === maxBet && t !== actingToken
        )
      : undefined);

  let scenario: PreflopSituation["scenario"];
  let villainPosition: ChartPosition | undefined;
  let openSizeBB: number | undefined;
  let threeBetSizeBB: number | undefined;

  if (maxBet <= bbChips) {
    scenario = limpers > 0 ? "iso" : "unopened";
  } else {
    if (heroBet >= maxBet || !lastRaiser) return null;
    const villainSeat = chartPositionAt(
      sortedUsers,
      count,
      lastRaiser
    );
    villainPosition = villainSeat.chart;
    // Prefer the game's raise counter when available: it stays correct even
    // when a re-raise/all-in overwrites the opener's earlier bet and erases
    // a level from the distinct-bet set (e.g. open 3bb -> 3bet 14bb ->
    // 4bet jam 100bb, where the 3bb open is no longer a distinct amount).
    let raises = input.raiseCount;
    if (raises === undefined) {
      // Legacy fallback: betting levels with the BB post as level 1 (it can
      // be hidden inside a blind's total bet once they raise), then each
      // distinct amount >= BB.
      const levels = Array.from(
        new Set([bbChips, ...bets.filter((b) => b >= bbChips)])
      ).sort((a, b) => a - b);
      raises = levels.indexOf(heroBet) + 1;
    }
    if (heroBet <= bbChips) {
      if (raises >= 3) {
        // Hero only has a blind in but faces a 4bet (cold 4bet spot).
        scenario = "vs-4bet";
        openSizeBB = heroBet / bbChips;
        threeBetSizeBB = maxBet / bbChips;
      } else {
        scenario = "vs-open";
        openSizeBB = maxBet / bbChips;
      }
    } else if (raises === 2) {
      // Hero made the first raise (or called the open) and faces a 3bet.
      scenario = "vs-3bet";
      openSizeBB = heroBet / bbChips;
      threeBetSizeBB = maxBet / bbChips;
    } else if (raises >= 3) {
      // Hero 3bet (or opened) and now faces a 4bet.
      scenario = "vs-4bet";
      openSizeBB = heroBet / bbChips;
      threeBetSizeBB = maxBet / bbChips;
    } else {
      return null;
    }
  }

  const handStr = hero.hands
    .map((c) => rankChar(c.num) + c.suit)
    .join("");

  const situation: PreflopSituation = {
    playerCount: count,
    heroPosition: seat.chart,
    heroPositionLabel: seat.label,
    effectiveStackBB,
    scenario,
    villainPosition,
    openSizeBB,
    threeBetSizeBB,
    limpers: limpers > 0 ? limpers : undefined,
    callers: callers > 0 ? callers : undefined,
    heroHand: handStr,
    bigBlindChips: bbChips,
  };

  return getPreflopAdvice(situation);
}
