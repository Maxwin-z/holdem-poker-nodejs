import type { Card } from "../ApiType";
import type { PreflopAdvice } from "../gto/preflop/types";
import type { PostflopAdvice } from "../gto/postflop/types";
import type { BotStyle } from "../server/bot/types";

export type ReplayStreet = "preflop" | "flop" | "turn" | "river";
export type ReplayActorType = "human" | "bot";
export type ReplayActionOrigin =
  | "human"
  | "timeout"
  | "bot"
  | "safe-fallback";

export type AiReplaySizeClassification = "matched" | "minor" | "major";
export type AiReplayDeviationLevel =
  | "close"
  | "minor"
  | "notable"
  | "severe"
  | "unscored";

/**
 * Grade bet/raise sizing by its proportional distance from the GTO size.
 * Small rounding differences stay green; ordinary sizing differences are a
 * warning; only a size more than 50% away is treated as a major deviation.
 */
export function classifyAiReplaySize(
  actualSize?: number,
  recommendedSize?: number
): AiReplaySizeClassification | undefined {
  if (
    actualSize === undefined ||
    recommendedSize === undefined ||
    recommendedSize <= 0
  ) {
    return undefined;
  }
  const differenceRatio = Math.abs(actualSize - recommendedSize) / recommendedSize;
  if (differenceRatio <= 0.1) return "matched";
  if (differenceRatio <= 0.5) return "minor";
  return "major";
}

export interface AiReplayParticipant {
  id: string;
  name: string;
  type: ReplayActorType;
  position: string;
  cards: Card[];
  startingStack: number;
  endingStack?: number;
  botStyle?: BotStyle;
}

export interface AiReplayPlayerState {
  id: string;
  name: string;
  type: ReplayActorType;
  position: string;
  stack: number;
  committed: number;
  streetBet: number;
  remaining: number;
  folded: boolean;
  allIn: boolean;
}

export interface AiReplayDecisionContext {
  board: Card[];
  potBefore: number;
  amountToCall: number;
  minimumRaiseTo: number;
  currentBet: number;
  raiseCount: number;
  players: AiReplayPlayerState[];
}

export interface AiReplayAction {
  action: string;
  amountTo?: number;
  delta?: number;
  origin: ReplayActionOrigin;
}

export interface AiReplayComparison {
  recommendedAction?: string;
  recommendedSizeChips?: number;
  recommendedSizeBB?: number;
  actualActionProbability?: number;
  actionMatch: boolean;
  sizeDifferenceBB?: number;
  sizeDifferenceRatio?: number;
  sizeClassification?: AiReplaySizeClassification;
  classification:
    | "recommended"
    | "mixed-acceptable"
    | "low-frequency"
    | "deviation"
    | "unscored";
  reasons: string[];
}

export interface AiReplayBotStrategy {
  source: string;
  style?: BotStyle;
  diagnostics?: Record<string, unknown>;
  rawChoices?: unknown[];
  canonicalChoices?: unknown[];
  sample?: number;
  selected?: unknown;
  expectedTarget?: number;
}

export interface AiReplayDecision {
  id: number;
  sequence: number;
  street: ReplayStreet;
  actorId: string;
  actorType: ReplayActorType;
  actorName: string;
  position: string;
  actual: AiReplayAction;
  context: AiReplayDecisionContext;
  advice?: PreflopAdvice | PostflopAdvice;
  botStrategy?: AiReplayBotStrategy;
  comparison: AiReplayComparison;
  createdAt: number;
}

export interface AiReplayDecisionDeviation {
  actionScore: number;
  sizeScore?: number;
  score: number;
}

export interface AiReplayHandDeviation {
  deviationScore: number | null;
  deviationLevel: AiReplayDeviationLevel;
  scoredDecisionCount: number;
  severeDecisionCount: number;
  maxDecisionDeviation: number | null;
}

const AGGRESSIVE_REPLAY_ACTIONS = new Set(["bet", "raise", "allin"]);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number) {
  return Math.round(clampScore(value) * 10) / 10;
}

export function classifyAiReplayDeviation(
  score: number | null
): AiReplayDeviationLevel {
  if (score === null || !Number.isFinite(score)) return "unscored";
  if (score <= 10) return "close";
  if (score <= 30) return "minor";
  if (score <= 60) return "notable";
  return "severe";
}

/**
 * Measures how far the chosen action frequency is below the most frequent
 * action in the reference strategy. This is a strategy-frequency proxy, not
 * an EV-loss calculation.
 */
export function calculateAiReplayActionDeviation(
  actualProbability: number,
  bestProbability: number
) {
  if (!Number.isFinite(bestProbability) || bestProbability <= 0) return 0;
  return roundScore(
    ((bestProbability - Math.max(0, actualProbability)) / bestProbability) * 100
  );
}

/**
 * Sizing differences up to 10% are accepted. The score then rises linearly
 * and reaches 100 when the actual size is at least 50% away from reference.
 */
export function calculateAiReplaySizeDeviation(
  actualSize?: number,
  recommendedSize?: number
): number | undefined {
  if (
    actualSize === undefined ||
    recommendedSize === undefined ||
    recommendedSize <= 0
  ) {
    return undefined;
  }
  const differenceRatio = Math.abs(actualSize - recommendedSize) / recommendedSize;
  if (differenceRatio <= 0.1) return 0;
  if (differenceRatio >= 0.5) return 100;
  return roundScore(((differenceRatio - 0.1) / 0.4) * 100);
}

export function calculateAiReplayDecisionDeviation(
  decision: Pick<AiReplayDecision, "actual" | "advice" | "comparison">
): AiReplayDecisionDeviation | null {
  const advice = decision.advice;
  if (!advice || decision.comparison.classification === "unscored") return null;
  const actualAction = advice.kind === "preflop" && decision.actual.action === "check"
    ? "call"
    : decision.actual.action;
  const distribution = advice.kind === "preflop" && advice.hero
    ? advice.hero.actionDistribution
    : advice.actionDistribution;
  const probabilities = Object.values(distribution).map(Number).filter(Number.isFinite);
  const bestProbability = probabilities.length ? Math.max(...probabilities) : 0;
  if (bestProbability <= 0) return null;
  const actualProbability = Number(
    (distribution as unknown as Record<string, number>)[actualAction] || 0
  );
  const actionScore = calculateAiReplayActionDeviation(
    actualProbability,
    bestProbability
  );

  let recommendedSize = decision.comparison.recommendedSizeChips;
  if (recommendedSize === undefined && advice.kind === "preflop") {
    recommendedSize = advice.actions.find(
      (candidate) => candidate.action === actualAction
    )?.sizeChips;
  }
  if (
    recommendedSize === undefined &&
    advice.recommended === actualAction
  ) {
    recommendedSize = advice.recommendedSizeChips;
  }
  const sizeScore = AGGRESSIVE_REPLAY_ACTIONS.has(actualAction)
    ? calculateAiReplaySizeDeviation(decision.actual.amountTo, recommendedSize)
    : undefined;
  const score = sizeScore === undefined
    ? actionScore
    : actionScore + (100 - actionScore) * 0.35 * (sizeScore / 100);

  return {
    actionScore,
    sizeScore,
    score: roundScore(score),
  };
}

export function calculateAiReplayHandDeviation(
  decisions: Array<Pick<AiReplayDecision, "actorType" | "actual" | "advice" | "comparison">>
): AiReplayHandDeviation {
  const scores = decisions
    .filter((decision) => decision.actorType === "human")
    .map(calculateAiReplayDecisionDeviation)
    .filter((result): result is AiReplayDecisionDeviation => result !== null)
    .map((result) => result.score);
  if (!scores.length) {
    return {
      deviationScore: null,
      deviationLevel: "unscored",
      scoredDecisionCount: 0,
      severeDecisionCount: 0,
      maxDecisionDeviation: null,
    };
  }
  const deviationScore = roundScore(Math.sqrt(
    scores.reduce((total, score) => total + score * score, 0) / scores.length
  ));
  return {
    deviationScore,
    deviationLevel: classifyAiReplayDeviation(deviationScore),
    scoredDecisionCount: scores.length,
    severeDecisionCount: scores.filter((score) => score > 60).length,
    maxDecisionDeviation: Math.max(...scores),
  };
}

export interface AiReplaySettlementPlayer {
  participantId: string;
  profit: number;
  winner: boolean;
  folded: boolean;
  handType?: string;
}

export interface AiReplayRunout {
  board: Card[];
  players: AiReplaySettlementPlayer[];
}

export interface AiReplaySummary {
  publicId: string;
  completedAt: number;
  handSeq: number;
  heroName: string;
  heroPosition: string;
  heroCards: Card[];
  board: Card[];
  botCount: number;
  bigBlind: number;
  heroProfitChips: number;
  heroProfitBB: number;
  result: "win" | "loss" | "tie";
  decisionCount: number;
  deviationScore: number | null;
  deviationLevel: AiReplayDeviationLevel;
  scoredDecisionCount: number;
  severeDecisionCount: number;
  maxDecisionDeviation: number | null;
}

export interface AiReplayHand extends AiReplaySummary {
  startedAt: number;
  smallBlind: number;
  participants: AiReplayParticipant[];
  runouts: AiReplayRunout[];
  decisions: AiReplayDecision[];
  schemaVersion: number;
  strategyVersion: string;
}

export interface AiReplayListResponse {
  items: AiReplaySummary[];
  total: number;
}
