/**
 * Street-by-street villain range tracking.
 *
 * Instead of rebuilding a generic board-only continuing range every street,
 * the tracker starts from what the villain's PREFLOP chart role says they
 * arrived with (opened UTG, 3bet the CO, flatted in the BB, limped, ...)
 * and filters that concrete combo set through each completed street's
 * action: bets/raises keep top-pair-or-better and strong draws, calls keep
 * pairs and draws, checks keep everything.
 *
 * Filters are binary keep/drop at combo granularity. When the tracked range
 * collapses below MIN_TRACKED_COMBOS the caller falls back to the generic
 * board-only model — an over-tight range would produce overconfident folds.
 */

import { CardId, createDeck, rankOf, suitOf } from "./cards";
import { evaluateHand, HAND_CATEGORY } from "./hand-eval";
import { resolveChart, normalizeCell } from "../preflop/lookup";
import { expandRange, handScore } from "../preflop/hand";
import type { Chart, ChartPosition } from "../preflop/types";

export const MIN_TRACKED_COMBOS = 20;

export type VillainPreflopRole =
  | { kind: "open" }
  | { kind: "3bet"; openerPosition: ChartPosition }
  | { kind: "call-vs-open"; openerPosition: ChartPosition }
  | { kind: "limp" }
  | { kind: "bb-check" }
  | { kind: "unknown" };

export type VillainStreetAction = "bet" | "raise" | "allin" | "call" | "check";

export interface VillainTrack {
  /** Villain's normalized 6-max chart position. */
  chartPosition: ChartPosition;
  preflop: VillainPreflopRole;
  /** Villain's postflop actions, street-ordered (1=flop, 2=turn, 3=river). */
  streetActions: { round: 1 | 2 | 3; action: VillainStreetAction }[];
}

const RANK_CHARS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

/** Canonical class key ("AKs" / "AKo" / "TT") for a concrete combo. */
function classKeyOf(a: CardId, b: CardId): string {
  const ra = rankOf(a);
  const rb = rankOf(b);
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  if (hi === lo) return RANK_CHARS[hi] + RANK_CHARS[lo];
  const suited = suitOf(a) === suitOf(b);
  return RANK_CHARS[hi] + RANK_CHARS[lo] + (suited ? "s" : "o");
}

/** Chart cells whose mass includes the given actions (>= 25% combined). */
function classesWithAction(
  chart: Chart | null,
  actions: Array<"raise" | "call" | "allin">
): Set<string> {
  const out = new Set<string>();
  if (!chart) return out;
  for (const [hand, cell] of Object.entries(chart)) {
    if (!cell) continue;
    const w = normalizeCell(cell);
    let mass = 0;
    for (const action of actions) mass += w.actions[action] || 0;
    if ((w.weight * mass) / 100 >= 25) {
      for (const key of expandRange(hand)) out.add(key);
    }
  }
  return out;
}

/** All 169 class keys. */
function allClassKeys(): Set<string> {
  const keys = new Set<string>();
  for (let hi = 12; hi >= 0; hi--) {
    for (let lo = hi; lo >= 0; lo--) {
      if (hi === lo) keys.add(RANK_CHARS[hi] + RANK_CHARS[lo]);
      else {
        keys.add(RANK_CHARS[hi] + RANK_CHARS[lo] + "s");
        keys.add(RANK_CHARS[hi] + RANK_CHARS[lo] + "o");
      }
    }
  }
  return keys;
}

/** Preflop class range for the villain's chart role. Null = unknown. */
export function preflopClassRange(
  chartPosition: ChartPosition,
  role: VillainPreflopRole
): Set<string> | null {
  try {
    switch (role.kind) {
      case "open": {
        const chart = resolveChart("unopened", chartPosition).chart;
        return classesWithAction(chart, ["raise", "allin"]);
      }
      case "3bet": {
        const chart = resolveChart(
          "vs-open",
          chartPosition,
          role.openerPosition
        ).chart;
        return classesWithAction(chart, ["raise", "allin"]);
      }
      case "call-vs-open": {
        const chart = resolveChart(
          "vs-open",
          chartPosition,
          role.openerPosition
        ).chart;
        return classesWithAction(chart, ["call"]);
      }
      case "limp": {
        // Limps are hands playable by Chen score that the seat would NOT
        // have open-raised.
        const rfi = classesWithAction(
          resolveChart("unopened", chartPosition).chart,
          ["raise", "allin"]
        );
        const out = new Set<string>();
        allClassKeys().forEach((key) => {
          if (!rfi.has(key) && handScore(key) >= 4.5) out.add(key);
        });
        return out;
      }
      case "bb-check": {
        // The BB checks its entire option except the iso-raise hands.
        const iso = classesWithAction(resolveChart("iso", "BB").chart, [
          "raise",
          "allin",
        ]);
        const out = new Set<string>();
        allClassKeys().forEach((key) => {
          if (!iso.has(key)) out.add(key);
        });
        return out;
      }
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}

interface ComboStrength {
  category: number;
  overpair: boolean;
  topPair: boolean;
  flushDraw: boolean;
  openEnded: boolean;
}

function comboStrengthOn(
  a: CardId,
  b: CardId,
  boardSlice: CardId[]
): ComboStrength {
  const category = Math.floor(
    evaluateHand([a, b, ...boardSlice]) / 1_000_000
  );
  const boardRanks = boardSlice.map(rankOf);
  const top = Math.max(...boardRanks);
  const ra = rankOf(a);
  const rb = rankOf(b);
  const pocket = ra === rb;
  let overpair = false;
  let topPair = false;
  if (category === HAND_CATEGORY.PAIR) {
    if (pocket) {
      overpair = ra > top;
    } else {
      const paired = boardRanks.includes(ra)
        ? ra
        : boardRanks.includes(rb)
        ? rb
        : -1;
      topPair = paired === top;
    }
  }

  let flushDraw = false;
  let openEnded = false;
  if (boardSlice.length < 5 && category < HAND_CATEGORY.FLUSH) {
    for (let suit = 0; suit < 4; suit++) {
      const hole = (suitOf(a) === suit ? 1 : 0) + (suitOf(b) === suit ? 1 : 0);
      const onBoard = boardSlice.filter((c) => suitOf(c) === suit).length;
      if (hole >= 1 && hole + onBoard === 4) flushDraw = true;
    }
    if (category < HAND_CATEGORY.STRAIGHT) {
      const present = new Set<number>([ra, rb, ...boardRanks]);
      if (present.has(12)) present.add(-1); // wheel ace
      for (let lo = -1; lo <= 9 && !openEnded; lo++) {
        let run = true;
        let usesHole = false;
        for (let k = 0; k < 4; k++) {
          const r = lo + k;
          if (!present.has(r)) {
            run = false;
            break;
          }
          if (r === ra || r === rb) usesHole = true;
        }
        // Open-ended needs room on both sides of the 4-run.
        if (run && usesHole && lo > -1 && lo + 3 < 12) openEnded = true;
      }
    }
  }
  return { category, overpair, topPair, flushDraw, openEnded };
}

/** Would this combo continue with the given action on this board slice? */
function comboContinues(
  a: CardId,
  b: CardId,
  boardSlice: CardId[],
  action: VillainStreetAction
): boolean {
  if (action === "check") return true;
  const s = comboStrengthOn(a, b, boardSlice);
  if (s.category >= HAND_CATEGORY.TWO_PAIR) return true;
  const strongDraw = s.flushDraw || s.openEnded;
  if (action === "bet" || action === "raise" || action === "allin") {
    return s.overpair || s.topPair || strongDraw;
  }
  // call: any pair, or a strong draw.
  return s.category >= HAND_CATEGORY.PAIR || strongDraw;
}

/**
 * Build the tracked villain range: preflop chart role -> concrete combos ->
 * filtered by every recorded street action on the board as it stood then.
 * Returns null when the role is unknown or the range collapses.
 */
export function trackedVillainRange(
  heroCards: [CardId, CardId],
  board: CardId[],
  track: VillainTrack
): [CardId, CardId][] | null {
  const classRange = preflopClassRange(track.chartPosition, track.preflop);
  if (!classRange || classRange.size === 0) return null;

  const blocked = new Set<CardId>([...heroCards, ...board]);
  const deck = createDeck().filter((c) => !blocked.has(c));
  let combos: [CardId, CardId][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (classRange.has(classKeyOf(deck[i], deck[j]))) {
        combos.push([deck[i], deck[j]]);
      }
    }
  }

  // Board as it stood on each street: flop 3 cards, turn 4, river 5.
  for (const { round, action } of track.streetActions) {
    const sliceLength = round === 1 ? 3 : round === 2 ? 4 : 5;
    if (board.length < sliceLength) continue;
    const slice = board.slice(0, sliceLength);
    combos = combos.filter(([a, b]) => comboContinues(a, b, slice, action));
    if (combos.length < MIN_TRACKED_COMBOS) return null;
  }

  return combos.length >= MIN_TRACKED_COMBOS ? combos : null;
}
