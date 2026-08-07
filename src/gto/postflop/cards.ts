/**
 * Card utilities for the postflop GTO engine.
 *
 * Numeric encoding follows the reference implementation
 * (gto-poker-overlay, MIT): card id = rank * 4 + suit, rank 0-12
 * (2=0, 3=1, ..., K=11, A=12), suit 0-3 (h=0, d=1, c=2, s=3).
 * Our game engine stores cards as { num: 2..14, suit: "h"|"d"|"c"|"s" },
 * so cardToId maps those to the same 0-51 space.
 */

export type CardId = number;

export const RANKS = [
  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
] as const;

const SUIT_INDEX: Record<string, number> = { h: 0, d: 1, c: 2, s: 3 };
const SUIT_CHARS = ["h", "d", "c", "s"];

/** Convert a game card ({ num, suit }) into a 0-51 card id. */
export function cardToId(card: { num: number; suit: string }): CardId {
  const r = card.num === 14 ? 12 : card.num - 2;
  const s = SUIT_INDEX[card.suit];
  if (r < 0 || r > 12 || s === undefined) {
    throw new Error(`无法解析扑克牌 ${card.num}${card.suit}`);
  }
  return r * 4 + s;
}

/** Convert a 0-51 card id back into a game card. */
export function idToCard(id: CardId): { num: number; suit: string } {
  const r = (id / 4) | 0;
  const s = id % 4;
  const num = r === 12 ? 14 : r + 2;
  return { num, suit: SUIT_CHARS[s] };
}

/** Rank index of a card id (0=2 .. 12=A). */
export function rankOf(c: CardId): number {
  return (c / 4) | 0;
}

/** Suit index of a card id (0..3). */
export function suitOf(c: CardId): number {
  return c % 4;
}

/** Full 52-card deck as card ids. */
export function createDeck(): CardId[] {
  const deck: CardId[] = [];
  for (let i = 0; i < 52; i++) deck.push(i);
  return deck;
}

/** Fisher-Yates shuffle in place. */
export function shuffleDeck<T>(deck: T[]): T[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/** Remove known cards from a deck. */
export function removeCards(deck: CardId[], known: CardId[]): CardId[] {
  const knownSet = new Set(known);
  return deck.filter((c) => !knownSet.has(c));
}

/** Canonical hand group name ("AKs", "QQ", "T9o", ...). */
export function handGroupName(c1: CardId, c2: CardId): string {
  const r1 = rankOf(c1);
  const r2 = rankOf(c2);
  const s1 = suitOf(c1);
  const s2 = suitOf(c2);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const highRank = RANKS[high];
  const lowRank = RANKS[low];
  if (high === low) return `${highRank}${lowRank}`;
  return `${highRank}${lowRank}${s1 === s2 ? "s" : "o"}`;
}
