/**
 * Types for the postflop GTO guidance engine.
 *
 * Strategy comes from the gto-poker-overlay postflop engine: a distilled
 * neural-net policy for heads-up spots plus a transparent range-aware
 * heuristic for multiway / fallback, with a soundness gate on top.
 */

export type PostflopStreet = "flop" | "turn" | "river";

export type PostflopAction =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allin";

export type BoardTexture =
  | "dry"
  | "semi_wet"
  | "wet"
  | "very_wet"
  | "monotone"
  | "paired_dry"
  | "paired_wet";

export interface PostflopSituation {
  street: PostflopStreet;
  /** Hero hole cards as card ids (0-51). */
  heroCards: [number, number];
  /** Community cards as card ids (3, 4, or 5). */
  board: number[];
  /** Total pot in chips (all streets so far). */
  pot: number;
  /** Highest bet on the current street in chips. */
  currentBet: number;
  /** Hero's bet on the current street in chips. */
  heroBet: number;
  /** Chips needed to call this street (currentBet - heroBet, >= 0). */
  toCall: number;
  /** Chips hero can still put in this street (stack - total committed). */
  heroRemaining: number;
  /** Big blind in chips. */
  bigBlind: number;
  /** Effective stack in big blinds (min of involved stacks). */
  effectiveStackBB: number;
  /** Non-folded, non-all-in opponents still in the hand. */
  activeVillainCount: number;
  /** Hero acts last postflop. */
  heroInPosition: boolean;
  /** Hero took the preflop betting lead (last preflop raise/all-in). */
  isPreflopAggressor: boolean;
  /** Any preflop raise happened (used to fall back to position). */
  preflopHasRaise: boolean;
  /** Pot was 3-bet+ preflop. */
  threeBetPot: boolean;
  /** Bets + raises on this street before hero's action. */
  streetBetCount: number;
  /** A raise (not just a bet) happened on this street. */
  facedRaiseThisStreet: boolean;
  /** Optional display label (e.g. "BTN", "BB"). */
  heroPositionLabel?: string;
  /** Optional raw board cards for display. */
  boardCards?: { num: number; suit: string }[];
}

export interface PostflopActionDistribution {
  fold: number;
  check: number;
  call: number;
  bet: number;
  raise: number;
  allin: number;
}

export interface PostflopHeroAdvice {
  hand: string;
  action: PostflopAction;
  /** Probability of the recommended action (0-100). */
  frequency: number;
  sizeChips?: number;
  sizeBB?: number;
  message: string;
}

export interface PostflopAdvice {
  kind: "postflop";
  street: PostflopStreet;
  /** Board cards as text, e.g. ["As","Kd","7c"]. */
  board: string[];
  boardTexture: BoardTexture;
  heroPosition: "IP" | "OOP";
  heroPositionLabel: string;
  potChips: number;
  potBB: number;
  effectiveStackBB: number;
  /** Deterministic equity vs a random hand (0-1). */
  equityVsRandom: number;
  /** Equity vs the modeled continuing range (0-1). */
  equityVsRange?: number;
  /** Number of villain combos evaluated for the range equity. */
  equityRangeCombos?: number;
  heroHandKey: string;
  actionDistribution: PostflopActionDistribution;
  recommended: PostflopAction;
  recommendedSizeChips?: number;
  recommendedSizeBB?: number;
  hero?: PostflopHeroAdvice;
  notes: string[];
  /** 哪些部分是近似 / 简化（当前局面下适用）。 */
  limitations: string[];
  /** 实际游戏相对 GTO 基线的偏移建议。 */
  adjustments: string[];
  reasoning: string;
  dataSource: string;
}

export const POSTFLOP_ACTIONS: PostflopAction[] = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "allin",
];
