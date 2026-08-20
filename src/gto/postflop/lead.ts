/**
 * Lead / c-bet / barrel policy for "first to act, bet or check" spots
 * (ported from gto-poker-overlay).
 *
 * The distilled net is reliable FACING A BET, but the bet-or-check lead
 * decision is rare in its training data (~6%) and it extrapolates badly, so
 * when not facing a bet we use this sound policy instead: who took the
 * initiative + position + made-hand strength + equity + texture + street.
 *
 * Measured on 3000 sampled heads-up first-to-act spots with a realistic
 * preflop hole-card range, the net's bet frequency is INVERTED against hand
 * strength and blind to initiative:
 *
 *   equity 0-30%   -> net bets 71.3%   (this policy: 14.7%)
 *   equity 45-60%  -> net bets 40.0%   (this policy: 27.1%)
 *   two pair       -> net bets 44.2%   (this policy: 63.7%)
 *   preflop aggressor 48.2% vs non-aggressor 47.7% -> no signal at all
 *
 * Facing a bet the same net is monotone and sane (0-30% equity folds 99.9%,
 * 75%+ equity raises 69.5%), which is why only this branch is rule-based.
 * Fixing it properly means retraining upstream (ml/train.py + PokerBench),
 * not reweighting here.
 */

import { HAND_CATEGORY } from "./hand-eval";

export interface LeadInput {
  isAggressor: boolean;
  isIP: boolean;
  heroCat: number;
  equity: number;
  street: "flop" | "turn" | "river";
  veryWetOrMono: boolean;
  dangerousFlush: boolean;
}

export function leadBetProbability(i: LeadInput): number {
  if (i.dangerousFlush && i.heroCat < HAND_CATEGORY.FLUSH) return 0;

  const pos = i.isIP ? 1.0 : 0.82;
  const river = i.street === "river";
  const turn = i.street === "turn";

  if (!i.isAggressor) {
    if (i.heroCat >= HAND_CATEGORY.TWO_PAIR) return 0.42;
    if (i.heroCat >= HAND_CATEGORY.PAIR && i.equity >= 0.72) return 0.16;
    return 0.04;
  }

  if (i.heroCat >= HAND_CATEGORY.TWO_PAIR) {
    return Math.min(0.92, 0.86 * pos + 0.08);
  }

  if (i.heroCat >= HAND_CATEGORY.PAIR) {
    if (river) return 0.18 * pos;
    if (turn) return (i.veryWetOrMono ? 0.3 : 0.5) * pos;
    return (i.veryWetOrMono ? 0.35 : 0.7) * pos;
  }

  if (river) return (i.veryWetOrMono ? 0.12 : 0.26) * pos;
  let base = (i.veryWetOrMono ? 0.18 : 0.4) * pos;
  if (turn) base *= 0.85;
  if (i.equity >= 0.5) return Math.min(0.7, base + 0.18);
  return base;
}
