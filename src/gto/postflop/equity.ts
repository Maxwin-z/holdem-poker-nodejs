/**
 * Monte-Carlo equity calculators (ported from gto-poker-overlay, MIT).
 *
 * equityVsRange is the workhorse of the postflop engine: hero's equity is
 * measured against a CONCRETE villain continuing range instead of a random
 * hand, which is what stops value-betting hands that are crushed by the
 * range that actually continues (e.g. two pair on a three-flush board).
 */

import { CardId, createDeck, removeCards, shuffleDeck } from "./cards";
import { evaluateHand } from "./hand-eval";

export interface EquityResult {
  equity: number; // 0-1
  win: number;
  tie: number;
  lose: number;
  samples: number;
}

export function equityVsRandom(
  heroCards: [CardId, CardId],
  board: CardId[],
  numSimulations: number = 5000
): EquityResult {
  const knownCards = [...heroCards, ...board];
  const remainingDeck = removeCards(createDeck(), knownCards);
  const cardsNeeded = 5 - board.length;
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let i = 0; i < numSimulations; i++) {
    const shuffled = shuffleDeck([...remainingDeck]);
    const villainCards: [CardId, CardId] = [shuffled[0], shuffled[1]];
    const fullBoard = [...board];
    for (let j = 0; j < cardsNeeded; j++) {
      fullBoard.push(shuffled[2 + j]);
    }

    const heroRank = evaluateHand([...heroCards, ...fullBoard]);
    const villainRank = evaluateHand([...villainCards, ...fullBoard]);

    if (heroRank > villainRank) wins++;
    else if (heroRank < villainRank) losses++;
    else ties++;
  }

  return {
    equity: (wins + ties * 0.5) / numSimulations,
    win: wins / numSimulations,
    tie: ties / numSimulations,
    lose: losses / numSimulations,
    samples: numSimulations,
  };
}

export interface RangeEquityResult {
  equity: number; // hero win probability (ties count as half), 0..1
  combos: number; // number of villain combos actually evaluated
  samples: number; // total hero-vs-villain showdowns evaluated
}

/**
 * Hero's equity against a defined villain range.
 *
 * - River: exact one-shot showdown per combo.
 * - Turn / flop: enumerates every remaining runout exactly (deterministic,
 *   no variance). `iterations` is only used when 3+ cards remain to come.
 */
export function equityVsRange(
  heroCards: [CardId, CardId],
  board: CardId[],
  villainCombos: [CardId, CardId][],
  iterations: number = 3000
): RangeEquityResult {
  const blocked = new Set<CardId>([...heroCards, ...board]);
  const valid = villainCombos.filter(
    ([a, b]) => a !== b && !blocked.has(a) && !blocked.has(b)
  );
  if (valid.length === 0) {
    return { equity: 0.5, combos: 0, samples: 0 };
  }

  const cardsToCome = 5 - board.length;
  let totalScore = 0; // win=1, tie=0.5, lose=0
  let totalSamples = 0;

  const enumerate = cardsToCome <= 2;
  const samplesPerCombo = Math.max(1, Math.floor(iterations / valid.length));

  for (const villain of valid) {
    const known = [...heroCards, ...board, villain[0], villain[1]];
    const remaining = removeCards(createDeck(), known);

    if (cardsToCome === 0) {
      const hero = evaluateHand([...heroCards, ...board]);
      const vill = evaluateHand([...villain, ...board]);
      totalScore += hero > vill ? 1 : hero < vill ? 0 : 0.5;
      totalSamples += 1;
    } else if (enumerate && cardsToCome === 1) {
      for (const c of remaining) {
        const full = [...board, c];
        const hero = evaluateHand([...heroCards, ...full]);
        const vill = evaluateHand([...villain, ...full]);
        totalScore += hero > vill ? 1 : hero < vill ? 0 : 0.5;
        totalSamples += 1;
      }
    } else if (enumerate && cardsToCome === 2) {
      for (let i = 0; i < remaining.length; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          const full = [...board, remaining[i], remaining[j]];
          const hero = evaluateHand([...heroCards, ...full]);
          const vill = evaluateHand([...villain, ...full]);
          totalScore += hero > vill ? 1 : hero < vill ? 0 : 0.5;
          totalSamples += 1;
        }
      }
    } else {
      for (let s = 0; s < samplesPerCombo; s++) {
        const shuffled = shuffleDeck([...remaining]);
        const full = [...board];
        for (let k = 0; k < cardsToCome; k++) full.push(shuffled[k]);
        const hero = evaluateHand([...heroCards, ...full]);
        const vill = evaluateHand([...villain, ...full]);
        totalScore += hero > vill ? 1 : hero < vill ? 0 : 0.5;
        totalSamples += 1;
      }
    }
  }

  return {
    equity: totalSamples > 0 ? totalScore / totalSamples : 0.5,
    combos: valid.length,
    samples: totalSamples,
  };
}
