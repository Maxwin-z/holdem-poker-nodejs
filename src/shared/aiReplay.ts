import type { Card } from "../ApiType";
import { handStrength } from "../gto/preflop/hand";
import type { HandStrength } from "../gto/preflop/hand";
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
  /** True when a deterministic chart was widened toward range frequencies. */
  softened?: boolean;
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

const PREFLOP_REPLAY_ACTIONS = ["fold", "call", "raise", "allin"] as const;

const ACTION_AGGRESSION: Record<string, number> = {
  fold: 0,
  check: 1,
  call: 1,
  bet: 2,
  raise: 2,
  allin: 3,
};

/**
 * Severity multiplier for going against a deterministic preflop chart.
 * The binary charts pin every hand to a single action, so a plain
 * frequency comparison would grade every disagreement as a 100-point
 * deviation. Instead the penalty scales with how costly the disagreement
 * plausibly is: folding a weak hand the chart raises is a small error,
 * folding a premium (or raising junk the chart folds) stays maximal.
 */
const UNDER_AGGRESSION_SEVERITY: Record<HandStrength, number> = {
  strong: 1,
  medium: 0.6,
  weak: 0.3,
};
const OVER_AGGRESSION_SEVERITY: Record<HandStrength, number> = {
  strong: 0.3,
  medium: 0.6,
  weak: 1,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number) {
  return Math.round(clampScore(value) * 10) / 10;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export interface AiReplayActionGrading {
  /** Effective frequency of the actual action after any chart softening. */
  probability: number;
  /** 0-100 action deviation score. */
  actionScore: number;
  /** True when a deterministic chart was widened toward range frequencies. */
  softened: boolean;
}

/**
 * Grade an action against the reference strategy. For genuinely mixed
 * references this is the plain frequency shortfall. For deterministic
 * preflop charts (one action at 100%) the mismatch penalty is scaled by
 * hand strength and deviation direction, and the displayed frequency is
 * widened toward the range-wide distribution so a near-indifferent hand
 * is not reported as a maximal deviation.
 */
export function gradeAiReplayAction(
  actualAction: string,
  advice: PreflopAdvice | PostflopAdvice
): AiReplayActionGrading | null {
  const heroDistribution = (advice.kind === "preflop" && advice.hero
    ? advice.hero.actionDistribution
    : advice.actionDistribution) as unknown as Record<string, number>;
  const probabilities = Object.values(heroDistribution)
    .map(Number)
    .filter(Number.isFinite);
  const bestProbability = probabilities.length ? Math.max(...probabilities) : 0;
  if (bestProbability <= 0) return null;
  const probability = Number(heroDistribution[actualAction] || 0);

  const handKey = advice.kind === "preflop" ? advice.hero?.hand : undefined;
  const deterministic =
    advice.kind === "preflop" && Boolean(advice.hero) && bestProbability >= 99.5;
  if (!deterministic || !handKey || probability >= 99.5) {
    return {
      probability,
      actionScore: calculateAiReplayActionDeviation(probability, bestProbability),
      softened: false,
    };
  }

  const chartAction =
    PREFLOP_REPLAY_ACTIONS.find(
      (action) => Number(heroDistribution[action] || 0) >= 99.5
    ) || "fold";
  const strength = handStrength(handKey);
  const underAggression =
    (ACTION_AGGRESSION[actualAction] ?? 1) < (ACTION_AGGRESSION[chartAction] ?? 1);
  const severity = (underAggression
    ? UNDER_AGGRESSION_SEVERITY
    : OVER_AGGRESSION_SEVERITY)[strength];
  const rangeDistribution = advice.actionDistribution as unknown as Record<
    string,
    number
  >;
  const blendWeight = 0.5 * (1 - severity);
  const effectiveProbability = round1(
    (1 - blendWeight) * probability +
      blendWeight * Number(rangeDistribution[actualAction] || 0)
  );
  return {
    probability: effectiveProbability,
    actionScore: roundScore(100 * severity),
    softened: blendWeight > 0,
  };
}

/**
 * Compare an actual action against the strategy advice for the spot. Used
 * by the server when recording decisions and by the client to re-grade
 * stored replays with the current thresholds.
 */
export function buildAiReplayComparison(input: {
  action: string;
  amountTo?: number;
  advice?: PreflopAdvice | PostflopAdvice;
  bigBlind: number;
}): AiReplayComparison {
  const { advice, amountTo } = input;
  if (!advice) {
    return {
      actionMatch: false,
      classification: "unscored",
      reasons: ["当前局面没有生成可用的策略建议"],
    };
  }
  const normalizedAction =
    advice.kind === "preflop" && input.action === "check" ? "call" : input.action;
  const grading = gradeAiReplayAction(normalizedAction, advice);
  const probability = grading?.probability ?? 0;
  const recommended = advice.recommended;
  const actionMatch = normalizedAction === recommended;
  let classification: AiReplayComparison["classification"];
  if (actionMatch) classification = "recommended";
  else if (probability >= 15) classification = "mixed-acceptable";
  else if (probability > 0) classification = "low-frequency";
  else classification = "deviation";

  const aggressiveAction = AGGRESSIVE_REPLAY_ACTIONS.has(normalizedAction);
  const preflopSize =
    advice.kind === "preflop"
      ? advice.actions.find((candidate) => candidate.action === normalizedAction)
      : undefined;
  const recommendedSize = aggressiveAction
    ? preflopSize?.sizeChips ?? advice.recommendedSizeChips
    : undefined;
  const recommendedSizeBB = aggressiveAction
    ? preflopSize?.sizeBB ?? advice.recommendedSizeBB
    : undefined;
  const sizeDifference =
    amountTo !== undefined && recommendedSize !== undefined
      ? amountTo - recommendedSize
      : undefined;
  const reasons: string[] = [];
  if (actionMatch) reasons.push("实际行动与策略主推荐一致");
  else if (probability >= 15) reasons.push(`该行动属于混合策略，频率 ${probability}%`);
  else if (probability > 0) reasons.push(`该行动仅以 ${probability}% 的低频率出现`);
  else reasons.push("该行动不在当前参考策略的行动分布中");
  if (grading?.softened && !actionMatch) {
    reasons.push("参考图表将该手牌固定为单一动作，已按手牌强度与整体频率放宽评分");
  }
  if (
    sizeDifference !== undefined &&
    recommendedSize &&
    Math.abs(sizeDifference) > 0.001
  ) {
    const differencePercent = Math.abs(sizeDifference / recommendedSize) * 100;
    reasons.push(
      `实际尺寸比建议${sizeDifference > 0 ? "大" : "小"} ${Math.abs(
        sizeDifference / input.bigBlind
      ).toFixed(1)}bb（${differencePercent.toFixed(1)}%）`
    );
  }
  const sizeDifferenceBB =
    sizeDifference === undefined ? undefined : sizeDifference / input.bigBlind;
  const sizeDifferenceRatio =
    sizeDifference === undefined || !recommendedSize
      ? undefined
      : sizeDifference / recommendedSize;
  const sizeClassification = classifyAiReplaySize(amountTo, recommendedSize);
  return {
    recommendedAction: recommended,
    recommendedSizeChips: recommendedSize,
    recommendedSizeBB,
    actualActionProbability: probability,
    actionMatch,
    sizeDifferenceBB,
    sizeDifferenceRatio,
    sizeClassification,
    classification,
    softened: Boolean(grading?.softened && !actionMatch),
    reasons,
  };
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
  const grading = gradeAiReplayAction(actualAction, advice);
  if (!grading) return null;
  const actionScore = grading.actionScore;

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
