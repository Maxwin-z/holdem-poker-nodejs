/**
 * Types for the preflop GTO guidance engine.
 *
 * The strategy data is precomputed (GreenCharts2024, 6-max, 100bb baseline).
 * Positions of 2-9 handed games are normalized onto the 6-max chart keys.
 */

export type PreflopAction = "fold" | "call" | "raise" | "allin";

/** Weighted chart cell used after adjustments (weight 0-100). */
export interface WeightedCell {
  /** Share of the hand's combos that are in range (0-100). */
  weight: number;
  /** Action split over the in-range portion. */
  actions: Partial<Record<PreflopAction, number>>;
}

/**
 * A chart cell:
 * - "fold" | "call" | "raise" | "allin"  -> 100% weight, single action
 * - ["raise", "fold"]                     -> 100% weight, 50/50 split
 * - WeightedCell                          -> explicit weight / action split
 */
export type ChartCell = PreflopAction | [PreflopAction, PreflopAction] | WeightedCell;

/** Sparse chart: hand key (e.g. "AKs") -> action. Absent hands fold. */
export type Chart = Partial<Record<string, ChartCell>>;

/** Chart keys supported by the underlying 6-max data. */
export type ChartPosition = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

/** Human friendly position label for 2-9 handed games. */
export type PositionLabel =
  | "BTN"
  | "SB"
  | "BB"
  | "CO"
  | "HJ"
  | "LJ"
  | "MP"
  | "UTG+1"
  | "UTG";

export type PreflopScenario =
  | "unopened"
  | "iso"
  | "vs-open"
  | "vs-3bet"
  | "vs-4bet";

export type Looseness = "tight" | "standard" | "loose";

export interface PreflopSituation {
  /** Number of active players. 2..10, where 10 is treated as 9. */
  playerCount: number;
  /** Canonical chart position of the hero. */
  heroPosition: ChartPosition;
  /** Optional display label (e.g. "UTG+1" for 9-max). Defaults to heroPosition. */
  heroPositionLabel?: string;
  /** Effective stack in big blinds (min of involved stacks). */
  effectiveStackBB: number;
  scenario: PreflopScenario;
  /** Raiser position (required for vs-open / vs-3bet / vs-4bet). */
  villainPosition?: ChartPosition;
  /** Size of the open raise faced (in bb), for vs-open / vs-3bet. */
  openSizeBB?: number;
  /** Size of the 3bet faced (in bb), for vs-4bet. */
  threeBetSizeBB?: number;
  /** Number of limpers, for iso. */
  limpers?: number;
  /** Number of cold callers between hero and the aggressor. */
  callers?: number;
  /** Optional hero hole cards: class ("AKs") or concrete ("AhKh"). */
  heroHand?: string;
  /** Optional big blind in chips, to also produce chip amounts. */
  bigBlindChips?: number;
  /** Strategy calibration. Defaults to "standard". */
  looseness?: Looseness;
}

export interface ActionDistribution {
  /** Combo-weighted percentage of the range taking each action. Sums to 100. */
  fold: number;
  call: number;
  raise: number;
  allin: number;
}

/** Action code for range-grid cells. */
export const GRID_ACTION = {
  fold: 0,
  call: 1,
  raise: 2,
  allin: 3,
} as const;

/**
 * 13x13 preflop range grid. Rows and columns are ranks high-to-low
 * (A,K,Q,J,T,9,...,2). Cell (i,j):
 * - i === j: pair
 * - i <  j: suited (row rank > col rank)
 * - i >  j: offsuit
 * Values use GRID_ACTION codes (0=fold, 1=call, 2=raise, 3=allin).
 */
export interface PreflopGrid {
  rows: string[];
  cols: string[];
  cells: number[][];
}

export interface AdviceAction {
  action: PreflopAction;
  /** Frequency of this action across the reference range (0-100). */
  frequency: number;
  /** Raise-to total size in bb (raise / allin only). */
  sizeBB?: number;
  /** Raise-to total size in chips (raise / allin only). */
  sizeChips?: number;
}

export interface HeroAdvice {
  hand: string;
  action: PreflopAction;
  /** Action frequency for this exact hand (0-100, mixed cells split 50/50). */
  frequency: number;
  /** Raise-to total size in bb, when the action is raise / allin. */
  sizeBB?: number;
  /** Raise-to total size in chips, when the action is raise / allin. */
  sizeChips?: number;
  message: string;
}

export interface PreflopAdvice {
  kind: "preflop";
  playerCount: number;
  heroPosition: ChartPosition;
  heroPositionLabel: string;
  stackBB: number;
  scenario: PreflopScenario;
  villainPosition?: ChartPosition;
  potBB: number;
  potChips?: number;
  actionDistribution: ActionDistribution;
  /** Most recommended action: hero's hand action if provided, else the
   *  most frequent action across the range. */
  recommended: PreflopAction;
  recommendedSizeBB?: number;
  recommendedSizeChips?: number;
  actions: AdviceAction[];
  /** Reference ranges by primary action (hand keys). */
  ranges: Partial<Record<PreflopAction, string[]>>;
  /** 13x13 grid of the chart used for this spot (after adjustments). */
  rangeGrid: PreflopGrid;
  /** Standard RFI grids per position (looseness-calibrated), for browsing. */
  rfiGrids: Partial<Record<ChartPosition, PreflopGrid>>;
  /** Normalized hero hand key, for marking on the grid (when provided). */
  heroHandKey?: string;
  hero?: HeroAdvice;
  notes: string[];
  /** 哪些部分是近似 / 简化（当前局面下适用）。 */
  limitations: string[];
  /** 实际游戏相对 GTO 基线的偏移建议。 */
  adjustments: string[];
  dataSource: string;
}
