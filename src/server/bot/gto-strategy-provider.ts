import { buildPreflopAdvice } from "../../gto/preflop/from-game-state";
import { buildPostflopAdvice } from "../../gto/postflop/from-game-state";
import type {
  BotAction,
  BotStrategyChoice,
  BotStrategyProvider,
  BotStrategyRequest,
  BotStrategyResult,
} from "./types";

const ACTIONS: BotAction[] = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "allin",
];

function normalize(choices: BotStrategyChoice[]): BotStrategyChoice[] {
  const positive = choices.filter(
    (choice) => Number.isFinite(choice.probability) && choice.probability > 0
  );
  const total = positive.reduce((sum, choice) => sum + choice.probability, 0);
  if (total <= 0) return [];
  return positive.map((choice) => ({
    ...choice,
    probability: choice.probability / total,
  }));
}

function styleMultiplier(action: BotAction, style: BotStrategyRequest["style"]) {
  if (style === "standard") return 1;
  const aggressive = ["bet", "raise", "allin"].includes(action);
  if (style === "tight") {
    if (action === "fold") return 1.2;
    if (aggressive) return 0.85;
    return 0.95;
  }
  if (action === "fold") return 0.72;
  if (aggressive) return 1.15;
  return 1.08;
}

function exploitMultiplier(
  action: BotAction,
  request: BotStrategyRequest,
  equityVsRange?: number
) {
  const stats = request.opponentTendencies;
  if (!stats) return 1;
  const aggressive = ["bet", "raise", "allin"].includes(action);
  let multiplier = 1;

  if (request.round === 0) {
    if (aggressive && (stats.foldToRaise >= 0.55 || stats.vpip <= 0.22)) {
      multiplier *= 1.18;
    }
    if (stats.vpip >= 0.45 && action === "fold") multiplier *= 1.08;
    return multiplier;
  }

  if (aggressive && stats.postflopFold >= 0.42) multiplier *= 1.18;
  if (aggressive && stats.postflopCall >= 0.45) {
    multiplier *= (equityVsRange || 0) >= 0.55 ? 1.2 : 0.72;
  }
  if (stats.postflopAggression >= 0.35) {
    if (action === "call") multiplier *= 1.12;
    if (action === "fold") multiplier *= 0.92;
  }
  return multiplier;
}

function calibrate(
  choices: BotStrategyChoice[],
  request: BotStrategyRequest,
  equityVsRange?: number
) {
  return normalize(
    choices.map((choice) => ({
      ...choice,
      probability:
        choice.probability *
        (request.round === 0
          ? 1
          : styleMultiplier(choice.action, request.style)) *
        exploitMultiplier(choice.action, request, equityVsRange),
    }))
  );
}

export class CurrentGtoStrategyProvider implements BotStrategyProvider {
  readonly id = "current-gto-v1";

  decide(request: BotStrategyRequest): BotStrategyResult | null {
    if (request.round === 0) {
      const advice = buildPreflopAdvice({
        sortedUsers: request.sortedUsers,
        players: request.players,
        bbChips: request.bbChips,
        actingToken: request.actingToken,
        lastRaiserToken: request.lastRaiserToken,
        raiseCount: request.raiseCount,
        minimumRaiseToChips: request.minimumRaiseTo,
        looseness: request.style,
      });
      if (!advice?.hero) return null;
      const distribution = advice.hero.actionDistribution || {
        fold: advice.hero.action === "fold" ? 100 : 0,
        call: advice.hero.action === "call" ? 100 : 0,
        raise: advice.hero.action === "raise" ? 100 : 0,
        allin: advice.hero.action === "allin" ? 100 : 0,
      };
      const sizeFor = (action: BotAction) =>
        (advice.hero?.action === action ? advice.hero.sizeChips : undefined) ||
        advice.actions.find((entry) => entry.action === action)?.sizeChips;
      const choices = (["fold", "call", "raise", "allin"] as BotAction[]).map(
        (action) => ({
          action,
          probability: distribution[action as keyof typeof distribution] || 0,
          sizeChips: sizeFor(action),
        })
      );
      return {
        choices: calibrate(choices, request),
        fallbackAction: advice.hero.action,
        source: `${this.id}:preflop`,
        advice,
        diagnostics: {
          scenario: advice.scenario,
          heroPosition: advice.heroPosition,
          villainPosition: advice.villainPosition,
          stackBB: advice.stackBB,
          heroStackBB: advice.heroStackBB,
          opponentEffectiveStacksBB: advice.opponentEffectiveStacksBB,
          liveResponderEffectiveStackBB:
            advice.liveResponderEffectiveStackBB,
          amountToCallBB: advice.amountToCallBB,
          callPotOdds: advice.callPotOdds,
          potBB: advice.potBB,
          heroHandKey: advice.heroHandKey,
          recommended: advice.recommended,
          recommendedSizeBB: advice.recommendedSizeBB,
          recommendedSizeChips: advice.recommendedSizeChips,
          notes: advice.notes,
          limitations: advice.limitations,
        },
      };
    }

    const advice = buildPostflopAdvice({
      round: request.round,
      sortedUsers: request.sortedUsers,
      players: request.players,
      boardCards: request.boardCards,
      bbChips: request.bbChips,
      actingToken: request.actingToken,
      actionHistory: request.actionHistory,
      heroPositionLabel: request.heroPositionLabel,
    });
    if (!advice) return null;
    const choices = ACTIONS.map((action) => ({
      action,
      probability: advice.actionDistribution[action] || 0,
      sizeChips: ["bet", "raise", "allin"].includes(action)
        ? advice.recommendedSizeChips
        : undefined,
    }));
    return {
      choices: calibrate(choices, request, advice.equityVsRange),
      fallbackAction: advice.recommended,
      equityVsRange: advice.equityVsRange,
      source: `${this.id}:postflop`,
      advice,
      diagnostics: {
        heroPosition: request.heroPositionLabel,
        recommended: advice.recommended,
        recommendedSizeChips: advice.recommendedSizeChips,
        equityVsRange: advice.equityVsRange,
      },
    };
  }
}
