import type { Card } from "../../ApiType";

export type BotStyle = "standard" | "tight" | "loose";
export type BotStyleSelection = BotStyle | "random";
export type BotAction =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allin";

export interface StrategyPlayerState {
  bet: number;
  totalBets: number;
  stack: number;
  isFolded: boolean;
  isAllIn: boolean;
  hands: Card[];
}

export interface OpponentTendencies {
  sampleHands: number;
  vpip: number;
  pfr: number;
  foldToRaise: number;
  postflopFold: number;
  postflopCall: number;
  postflopAggression: number;
}

export interface BotStrategyRequest {
  round: number;
  sortedUsers: string[];
  players: Record<string, StrategyPlayerState>;
  boardCards: Card[];
  bbChips: number;
  actingToken: string;
  lastRaiserToken?: string;
  raiseCount: number;
  minimumRaiseTo: number;
  actionHistory: { round: number; type: string; token: string; amount?: number }[];
  heroPositionLabel: string;
  style: BotStyle;
  opponentTendencies?: OpponentTendencies;
}

export interface BotStrategyChoice {
  action: BotAction;
  probability: number;
  /** Total chips committed on this street after the action. */
  sizeChips?: number;
}

export interface BotStrategyResult {
  choices: BotStrategyChoice[];
  fallbackAction: BotAction;
  equityVsRange?: number;
  source: string;
  /** Structured context used to explain and audit a sampled bot decision. */
  diagnostics?: Record<string, unknown>;
}

export interface BotStrategyProvider {
  readonly id: string;
  decide(
    request: BotStrategyRequest
  ): BotStrategyResult | null | Promise<BotStrategyResult | null>;
}
