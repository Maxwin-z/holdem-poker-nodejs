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
  details: RangeComboEquityResult[];
}

export interface RangeComboEquityResult {
  cards: [CardId, CardId];
  equity: number;
  win: number;
  tie: number;
  lose: number;
  samples: number;
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
    return { equity: 0.5, combos: 0, samples: 0, details: [] };
  }

  const cardsToCome = 5 - board.length;
  let totalScore = 0; // win=1, tie=0.5, lose=0
  let totalSamples = 0;
  const details: RangeComboEquityResult[] = [];

  const enumerate = cardsToCome <= 2;
  const samplesPerCombo = Math.max(1, Math.floor(iterations / valid.length));

  for (const villain of valid) {
    const known = [...heroCards, ...board, villain[0], villain[1]];
    const remaining = removeCards(createDeck(), known);
    let comboWins = 0;
    let comboTies = 0;
    let comboLosses = 0;
    const score = (hero: number, vill: number) => {
      if (hero > vill) comboWins += 1;
      else if (hero < vill) comboLosses += 1;
      else comboTies += 1;
    };

    if (cardsToCome === 0) {
      const hero = evaluateHand([...heroCards, ...board]);
      const vill = evaluateHand([...villain, ...board]);
      score(hero, vill);
    } else if (enumerate && cardsToCome === 1) {
      for (const c of remaining) {
        const full = [...board, c];
        const hero = evaluateHand([...heroCards, ...full]);
        const vill = evaluateHand([...villain, ...full]);
        score(hero, vill);
      }
    } else if (enumerate && cardsToCome === 2) {
      for (let i = 0; i < remaining.length; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          const full = [...board, remaining[i], remaining[j]];
          const hero = evaluateHand([...heroCards, ...full]);
          const vill = evaluateHand([...villain, ...full]);
          score(hero, vill);
        }
      }
    } else {
      for (let s = 0; s < samplesPerCombo; s++) {
        const shuffled = shuffleDeck([...remaining]);
        const full = [...board];
        for (let k = 0; k < cardsToCome; k++) full.push(shuffled[k]);
        const hero = evaluateHand([...heroCards, ...full]);
        const vill = evaluateHand([...villain, ...full]);
        score(hero, vill);
      }
    }

    const comboSamples = comboWins + comboTies + comboLosses;
    const comboScore = comboWins + comboTies * 0.5;
    totalScore += comboScore;
    totalSamples += comboSamples;
    details.push({
      cards: villain,
      equity: comboSamples > 0 ? comboScore / comboSamples : 0.5,
      win: comboSamples > 0 ? comboWins / comboSamples : 0,
      tie: comboSamples > 0 ? comboTies / comboSamples : 0,
      lose: comboSamples > 0 ? comboLosses / comboSamples : 0,
      samples: comboSamples,
    });
  }

  return {
    equity: totalSamples > 0 ? totalScore / totalSamples : 0.5,
    combos: valid.length,
    samples: totalSamples,
    details,
  };
}
