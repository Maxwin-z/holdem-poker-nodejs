import { CardId } from "./cards";
import {
  lookupValue,
  NUM_EQUIV_CLASSES,
  VALUE_TO_CATEGORY,
  VALUE_TO_ORDINAL,
} from "./eval-tables";

// ============================================================
// Fast 5-7 Card Hand Evaluator (perfect-hash, lookup-based).
//
// Algorithm ported from phevaluator by Henry Lee,
//   Apache-2.0, https://github.com/HenryRLee/PokerHandEvaluator
//
// Returns category * 1_000_000 + tiebreaker, HIGHER == better.
//   Math.floor(rank / 1_000_000) === HAND_CATEGORY.*
// ============================================================

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const;

const CATEGORY_MULTIPLIER = 1_000_000;

const INTERNAL_TO_PUBLIC: Record<number, number> = {
  0: HAND_CATEGORY.HIGH_CARD,
  1: HAND_CATEGORY.PAIR,
  2: HAND_CATEGORY.TWO_PAIR,
  3: HAND_CATEGORY.THREE_OF_A_KIND,
  4: HAND_CATEGORY.STRAIGHT,
  5: HAND_CATEGORY.FLUSH,
  6: HAND_CATEGORY.FULL_HOUSE,
  7: HAND_CATEGORY.FOUR_OF_A_KIND,
  8: HAND_CATEGORY.STRAIGHT_FLUSH,
};

/** Evaluate the best 5-card hand from 5, 6, or 7 card ids. */
export function evaluateHand(cards: CardId[]): number {
  const n = cards.length;
  if (n < 5 || n > 7) {
    throw new Error(`Cannot evaluate ${n} cards`);
  }

  const quinary = new Array(13).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = (c / 4) | 0;
    const s = c % 4;
    quinary[r]++;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
  }

  let flushMask = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) {
      flushMask = suitMasks[s];
      break;
    }
  }

  const value = lookupValue(quinary, n, flushMask); // 1..7462, lower == better
  return valueToPublicRank(value);
}

function valueToPublicRank(value: number): number {
  const cat = INTERNAL_TO_PUBLIC[VALUE_TO_CATEGORY[value]];
  const tiebreak = VALUE_TO_ORDINAL[value];
  return cat * CATEGORY_MULTIPLIER + tiebreak;
}

/** Hand category name for display (English). */
export function handCategoryName(rank: number): string {
  const category = Math.floor(rank / CATEGORY_MULTIPLIER);
  const names = [
    "High Card", "Pair", "Two Pair", "Three of a Kind",
    "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush",
  ];
  return names[category] || "Unknown";
}

export { NUM_EQUIV_CLASSES };
