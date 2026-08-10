/**
 * Transparent villain continuing-range model (ported from gto-poker-overlay).
 *
 * Given a board and a coarse context (aggression? multiway?), enumerate a
 * plausible list of villain hole-card combos that would "continue". Hero's
 * equity is then measured against THIS range, which is what stops the engine
 * from value-betting hands that are crushed (e.g. non-flush made hands on a
 * flush-heavy board).
 */

import { CardId, createDeck, rankOf, suitOf } from "./cards";

export interface RangeContext {
  /** Villain bet/raised into us (tighter, more made-hand heavy range). */
  aggression: boolean;
  /** Multiway pots tighten the continuing range further. */
  multiway: boolean;
}

export function villainContinuingRange(
  heroCards: [CardId, CardId],
  board: CardId[],
  ctx: RangeContext
): [CardId, CardId][] {
  const blocked = new Set<CardId>([...heroCards, ...board]);
  const deck = createDeck().filter((c) => !blocked.has(c));

  const boardRanks = board.map(rankOf);
  const boardRankSet = new Set(boardRanks);

  const boardSuitCount = [0, 0, 0, 0];
  for (const c of board) boardSuitCount[suitOf(c)]++;
  const flushSuit = boardSuitCount.findIndex((n) => n >= 3);
  const flushBoard = flushSuit >= 0;

  const sortedBoardRanks = [...new Set(boardRanks)].sort((a, b) => a - b);
  const boardSpan =
    sortedBoardRanks.length >= 2
      ? sortedBoardRanks[sortedBoardRanks.length - 1] - sortedBoardRanks[0]
      : 0;
  const straightBoard = sortedBoardRanks.length >= 3 && boardSpan <= 4;

  const combos: [CardId, CardId][] = [];
  const seen = new Set<string>();
  const add = (a: CardId, b: CardId) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo},${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    combos.push([lo, hi]);
  };

  // 1. Made flushes (only on a flush board).
  if (flushBoard) {
    const flushCards = deck.filter((c) => suitOf(c) === flushSuit);
    for (let i = 0; i < flushCards.length; i++) {
      for (let j = i + 1; j < flushCards.length; j++) {
        add(flushCards[i], flushCards[j]);
      }
    }
    if (boardSuitCount[flushSuit] >= 4) {
      const offSuit = deck.filter((c) => suitOf(c) !== flushSuit);
      for (const fc of flushCards) {
        for (const oc of offSuit) add(fc, oc);
      }
    }
  }

  // 2. Pocket pairs. Sets and overpairs always continue; low pocket pairs
  // only continue heads-up with no aggression to face — multiway pots and
  // bets fold them out of the continuing range.
  for (let r = 0; r < 13; r++) {
    const ofRank = deck.filter((c) => rankOf(c) === r);
    for (let i = 0; i < ofRank.length; i++) {
      for (let j = i + 1; j < ofRank.length; j++) {
        const isSet = boardRankSet.has(r);
        const isOverpair = boardRanks.every((br) => r > br);
        if (isSet || isOverpair) {
          add(ofRank[i], ofRank[j]);
        } else if (!ctx.aggression && !ctx.multiway) {
          add(ofRank[i], ofRank[j]);
        }
      }
    }
  }

  // 3. Hands that pair the board (top pair+, two pair, trips). Aggression
  // or a multiway pot restricts continues to the top two board ranks, and
  // multiway aggression additionally demands a T+ kicker.
  const topBoardRank = sortedBoardRanks[sortedBoardRanks.length - 1] ?? -1;
  const secondBoardRank = sortedBoardRanks[sortedBoardRanks.length - 2] ?? -1;
  const minKickerRank = ctx.aggression && ctx.multiway ? 8 : 6;
  for (const br of sortedBoardRanks) {
    if (
      (ctx.aggression || ctx.multiway) &&
      br !== topBoardRank &&
      br !== secondBoardRank
    ) {
      continue;
    }
    const pairCards = deck.filter((c) => rankOf(c) === br);
    for (const pc of pairCards) {
      const kickers = deck.filter(
        (c) =>
          c !== pc &&
          (rankOf(c) >= minKickerRank || boardRankSet.has(rankOf(c)))
      );
      for (const k of kickers) add(pc, k);
    }
  }

  // 4. Made straights (only on connected boards).
  if (straightBoard) {
    const lowEnd = Math.max(0, sortedBoardRanks[0] - 2);
    const highEnd = Math.min(12, sortedBoardRanks[sortedBoardRanks.length - 1] + 2);
    const windowCards = deck.filter((c) => {
      const r = rankOf(c);
      return r >= lowEnd && r <= highEnd && !boardRankSet.has(r);
    });
    for (let i = 0; i < windowCards.length; i++) {
      for (let j = i + 1; j < windowCards.length; j++) {
        add(windowCards[i], windowCards[j]);
      }
    }
  }

  // 5. Strong draws (only when no aggression to face).
  if (!ctx.aggression) {
    const drawSuit = boardSuitCount.findIndex((n) => n === 2);
    if (drawSuit >= 0) {
      const fd = deck.filter((c) => suitOf(c) === drawSuit);
      for (let i = 0; i < fd.length; i++) {
        for (let j = i + 1; j < fd.length; j++) add(fd[i], fd[j]);
      }
    }
  }

  return combos;
}
