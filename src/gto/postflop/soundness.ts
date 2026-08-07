/**
 * The SOUNDNESS GATE (ported from gto-poker-overlay).
 *
 * A single "would a competent player actually do this?" check that every
 * decision passes through. It encodes the concrete things a good player
 * verifies on every hand — am I getting the right price, am I committing
 * chips I can't justify — and VETOES anything that fails. It only ever
 * makes a decision more conservative.
 */

import { PostflopAction, PostflopStreet } from "./types";

export interface SoundnessInput {
  action: PostflopAction;
  street: PostflopStreet;
  facingBet: boolean;
  potOdds: number;
  commit: number;
  effStackBB: number;
  eqVsRange: number;
}

export interface SoundnessResult {
  override: boolean;
  action?: PostflopAction;
  reason?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function evaluateSoundness(i: SoundnessInput): SoundnessResult {
  // RULE 1 — PRICE / COMMITMENT FLOOR ON CALLS.
  // Never call when equity vs the betting range can't beat the price. The
  // required margin grows with how much of the stack we're putting in.
  if (i.action === "call" && i.facingBet) {
    const margin = 0.01 + 0.06 * clamp01(i.commit);
    if (i.eqVsRange < 0.6 && i.eqVsRange < i.potOdds + margin) {
      return {
        override: true,
        action: "fold",
        reason: `fold: ${pct(i.eqVsRange)} eq vs range < ${pct(i.potOdds)} price +${pct(margin)} (commits ${pct(i.commit)} stack) [soundness]`,
      };
    }
  }

  // RULE 2 — DON'T STACK OFF AS THE AGGRESSOR WITH A WEAK HAND.
  // Betting/raising/jamming a large fraction of the stack with low equity vs
  // the range that will actually call is a punt. Override to CHECK when we
  // can, else FOLD. Threshold 0.65 keeps normal polar bluffs through while
  // stopping the jam/overbet-with-air punt.
  if (
    (i.action === "bet" || i.action === "raise" || i.action === "allin") &&
    i.commit >= 0.65 &&
    i.eqVsRange < 0.45
  ) {
    const safe: PostflopAction = i.facingBet ? "fold" : "check";
    return {
      override: true,
      action: safe,
      reason: `${safe}: committing ${pct(i.commit)} of stack as the aggressor with only ${pct(i.eqVsRange)} eq vs range [soundness]`,
    };
  }

  return { override: false };
}
