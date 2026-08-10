/**
 * Preflop guidance engine.
 *
 * Strategy comes from precomputed GreenCharts2024 charts (6-max, 100bb
 * baseline), mapped onto 2-9 handed games, with authored fallbacks,
 * multiway tightening, short-stack push/fold handling and sizing.
 */

import { nearestTable } from "./data/pushfold";
import {
  BB_CALL_VS_BTN_SHOVE_NASH as BB_CALL_VS_BTN_SHOVE,
  BB_CALL_VS_SB_SHOVE_NASH as BB_CALL_VS_SB_SHOVE,
  BTN_SHOVE_NASH as BTN_SHOVE,
  PUSHFOLD_NASH_TRUST as PUSHFOLD_TRUST,
  SB_SHOVE_NASH as SB_SHOVE,
} from "./data/pushfold-nash";
import type { AdviceTrust } from "../trust";
import {
  HAND_ORDER,
  RANKS,
  comboCount,
  expandRange,
  handStrength,
  normalizeHandKey,
} from "./hand";
import {
  applyCalibration,
  applyDepthAdjustment,
  applyFullRingTightening,
  applyMultiwayTightening,
  normalizeCell,
  resolveChart,
} from "./lookup";
import type { DepthBucket } from "./lookup";
import { GRID_ACTION } from "./types";
import { normalizePlayerCount } from "./positions";
import {
  fourBetSizeBB,
  investedBB,
  isoSizeBB,
  rfiSizeBB,
  roundBB,
  threeBetSizeBB,
  toChips,
} from "./sizing";
import type {
  ActionDistribution,
  AdviceAction,
  Chart,
  ChartPosition,
  HeroAdvice,
  Looseness,
  PreflopAction,
  PreflopAdvice,
  PreflopGrid,
  PreflopSituation,
  PreflopScenario,
} from "./types";

const ACTIONS: PreflopAction[] = ["fold", "call", "raise", "allin"];
const CHART_POSITIONS: ChartPosition[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const SCENARIOS: PreflopScenario[] = ["unopened", "iso", "vs-open", "vs-3bet", "vs-4bet"];
const JAM_HANDS = new Set(["AA", "KK", "QQ", "AKs", "AKo", "JJ"]);
const DATA_SOURCE =
  "GreenCharts2024 (Greenline Poker) 预计算图表 + 本地近似调整";
const JAM_REMAINING_STACK_RATIO = 0.12;
const JAM_REMAINING_STACK_BB = 2;
const AUTO_CALL_MAX_STACK_RATIO = 0.08;
const DEEP_STACK_NO_AUTO_JAM_BB = 120;

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function normalizedDistribution(
  distribution: ActionDistribution
): ActionDistribution {
  const total = ACTIONS.reduce(
    (sum, action) => sum + Math.max(0, distribution[action]),
    0
  );
  if (total <= 0) return { fold: 100, call: 0, raise: 0, allin: 0 };
  return {
    fold: round1((Math.max(0, distribution.fold) / total) * 100),
    call: round1((Math.max(0, distribution.call) / total) * 100),
    raise: round1((Math.max(0, distribution.raise) / total) * 100),
    allin: round1((Math.max(0, distribution.allin) / total) * 100),
  };
}

function dominantAction(distribution: ActionDistribution): PreflopAction {
  let best: PreflopAction = "fold";
  for (const action of ACTIONS) {
    if (distribution[action] > distribution[best]) best = action;
  }
  return best;
}

function toHandSet(hands: string[]): Set<string> {
  const set = new Set<string>();
  for (const h of hands) {
    for (const key of expandRange(h)) set.add(key);
  }
  return set;
}

function buildGrid(
  actionOf: (handKey: string) => { action: PreflopAction; freq: number }
): PreflopGrid {
  const cells: number[][] = [];
  for (let i = 0; i < RANKS.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < RANKS.length; j++) {
      const r1 = RANKS[i];
      const r2 = RANKS[j];
      const key = i === j ? r1 + r2 : i < j ? r1 + r2 + "s" : r2 + r1 + "o";
      row.push(GRID_ACTION[actionOf(key).action]);
    }
    cells.push(row);
  }
  return { rows: [...RANKS], cols: [...RANKS], cells };
}

function resolvePushFold(
  scenario: PreflopScenario,
  hero: ChartPosition,
  playerCount: number,
  stackBB: number,
  input: PreflopSituation
): Set<string> | null {
  if (stackBB > 20) return null;
  if (scenario === "unopened") {
    if (hero === "SB") return toHandSet(nearestTable(SB_SHOVE, stackBB).hands);
    if (hero === "BTN" && playerCount >= 3) {
      return toHandSet(nearestTable(BTN_SHOVE, stackBB).hands);
    }
    return null;
  }
  if (
    scenario === "vs-open" &&
    hero === "BB" &&
    input.villainPosition &&
    (input.openSizeBB ?? stackBB) >= stackBB - 0.5
  ) {
    const tables =
      input.villainPosition === "SB"
        ? BB_CALL_VS_SB_SHOVE
        : BB_CALL_VS_BTN_SHOVE;
    return toHandSet(nearestTable(tables, stackBB).hands);
  }
  return null;
}

function ruleBasedVs4Bet(
  hero: ChartPosition,
  villain: ChartPosition,
  handKey: string
): { action: PreflopAction; freq: number } {
  // The hero's prior 3bet was made against the villain's open raise, so the
  // hands that reach the 4bet spot come from the vs-open raise subset.
  let vsOpenChart: Chart | null = null;
  let supported = true;
  try {
    vsOpenChart = resolveChart("vs-open", hero, villain).chart;
  } catch {
    // Impossible (hero, villain) pair for a vs-open spot (e.g. CO vs BB):
    // the 4-bettor isn't the original opener. Fall back to a generic rule.
    supported = false;
  }
  if (supported && vsOpenChart) {
    const cell = normalizeCell(vsOpenChart[handKey]);
    const raiseFreq = cell.actions.raise || 0;
    if (raiseFreq <= 0) return { action: "fold", freq: 100 };
    if (JAM_HANDS.has(handKey)) return { action: "allin", freq: raiseFreq };
    return { action: "fold", freq: 100 };
  }
  // Generic fallback: jam the premium core, fold everything else.
  if (JAM_HANDS.has(handKey)) return { action: "allin", freq: 100 };
  return { action: "fold", freq: 100 };
}

function potBBFor(scenario: PreflopScenario, input: PreflopSituation): number {
  const open = input.openSizeBB || 2.5;
  const threeBet = input.threeBetSizeBB || 10;
  const callers = input.callers || 0;
  switch (scenario) {
    case "unopened":
      return 1.5;
    case "iso":
      return 1.5 + (input.limpers || 0);
    case "vs-open":
      return 1.5 + open * (1 + callers);
    case "vs-3bet":
      return 1.5 + open + threeBet + callers * open;
    case "vs-4bet":
      return 1.5 + open + threeBet + threeBet * 2;
  }
}

export function getPreflopAdvice(input: PreflopSituation): PreflopAdvice {
  const playerCount = normalizePlayerCount(input.playerCount);
  const hero = input.heroPosition;
  const scenario = input.scenario;
  if (!CHART_POSITIONS.includes(hero)) {
    throw new Error(`无效的玩家位置：${hero}`);
  }
  if (!SCENARIOS.includes(scenario)) {
    throw new Error(`无效的场景：${scenario}`);
  }
  const stackBB = input.effectiveStackBB;
  if (!Number.isFinite(stackBB) || stackBB <= 0) {
    throw new Error(`有效筹码深度必须为正数（bb），收到 ${stackBB}`);
  }
  if (
    (scenario === "vs-open" || scenario === "vs-3bet" || scenario === "vs-4bet") &&
    !input.villainPosition
  ) {
    throw new Error(`${scenario} 场景需要提供 villainPosition`);
  }

  const heroStackBB = input.heroStackBB ?? stackBB;
  const amountToCallBB = Math.max(0, input.amountToCallBB ?? 0);
  const contestablePotBB = Math.max(
    0,
    input.contestablePotBB ?? potBBFor(scenario, input)
  );
  const callPotOdds =
    amountToCallBB > 0
      ? amountToCallBB / (contestablePotBB + amountToCallBB)
      : 0;

  const looseness = input.looseness || "standard";
  const notes: string[] = [];
  if (input.playerCount >= 10) notes.push("10 人局按 9 人局处理");
  if (playerCount === 2 && hero === "SB") notes.push("单挑时按钮位即小盲");

  const resolved = resolveChart(scenario, hero, input.villainPosition);
  if (resolved.fallbackNote) notes.push(resolved.fallbackNote);
  if (!resolved.chart && scenario === "unopened" && hero === "BB") {
    notes.push("大盲无人加注：可过牌");
  }

  let chart = resolved.chart;
  const extraPlayers = Math.max(
    0,
    (input.callers || 0) + (input.limpers || 0)
  );
  const heroLabel = input.heroPositionLabel || hero;
  let fullRingRemoved = 0;
  let depthBucket: DepthBucket = null;
  if (chart) {
    // Order matters: correct the 6-max baseline for full-ring seats first,
    // then apply the subjective looseness calibration on top.
    const fullRing = applyFullRingTightening(
      chart,
      scenario,
      playerCount,
      heroLabel
    );
    chart = fullRing.chart;
    fullRingRemoved = fullRing.removedFraction;
    if (fullRingRemoved > 0) {
      notes.push(
        `${playerCount} 人桌前位（${heroLabel}）：较 6-max 基准收紧约 ${Math.round(
          fullRingRemoved * 100
        )}% 最弱开池手牌`
      );
    }
    const depth = applyDepthAdjustment(chart, scenario, stackBB);
    chart = depth.chart;
    depthBucket = depth.bucket;
    if (depthBucket) {
      notes.push(
        `有效筹码约 ${depthBucket}bb：隐含赔率下降，投机跟注已按深度收紧`
      );
    }
    chart = applyCalibration(chart, looseness, scenario);
    if (extraPlayers > 0) {
      chart = applyMultiwayTightening(chart, extraPlayers);
      notes.push(`多人底池（额外 ${extraPlayers} 名玩家），边缘手牌已收紧`);
    }
  }

  const pushFold = resolvePushFold(
    scenario,
    hero,
    playerCount,
    stackBB,
    input
  );
  if (pushFold) {
    notes.push(`短码 ${stackBB}bb：按全下/弃牌 Nash 均衡给出参考（本地求解）`);
  }
  if (resolved.ruleBased) {
    notes.push("面对 4bet：基于 5bet 全下/弃牌的简化规则，非精确 GTO");
  }
  if (looseness === "loose") notes.push("已按“偏松”档位加宽约 5% 边缘手牌");
  if (looseness === "tight") notes.push("已按“偏紧”档位剔除约 10% 边缘手牌");

  const shortStack = stackBB <= 20 && !pushFold;
  if (shortStack) notes.push(`短码 ${stackBB}bb：加注建议改为全下`);

  // In the source vs-3bet charts, `allin` labels the premium hands that
  // 4bet and then continue against a 5bet shove. It is not an instruction to
  // open-jam the full stack over the 3bet. Translate that chart semantics into
  // the action for the current decision; the stack-commitment logic below can
  // still turn the normal 4bet into a shove when the raise would leave too
  // little behind.
  const chartActionForCurrentDecision = (
    action: PreflopAction
  ): PreflopAction => {
    const translated =
      scenario === "vs-3bet" && action === "allin" ? "raise" : action;
    return shortStack && translated === "raise" ? "allin" : translated;
  };

  const actionFor = (
    handKey: string
  ): { action: PreflopAction; freq: number } => {
    if (pushFold) {
      return pushFold.has(handKey)
        ? { action: "allin", freq: 100 }
        : { action: "fold", freq: 100 };
    }
    if (resolved.ruleBased && input.villainPosition) {
      return ruleBasedVs4Bet(hero, input.villainPosition, handKey);
    }
    if (!chart) {
      // BB with an unopened pot: check.
      return { action: "call", freq: 100 };
    }
    const w = normalizeCell(chart[handKey]);
    let best: PreflopAction = "fold";
    let bestFreq = w.actions.fold || 0;
    for (const a of ACTIONS) {
      const f = w.actions[a] || 0;
      if (f > bestFreq) {
        bestFreq = f;
        best = a;
      }
    }
    return {
      action: chartActionForCurrentDecision(best),
      freq: bestFreq,
    };
  };

  const distributionFor = (handKey: string): ActionDistribution => {
    const distribution: ActionDistribution = {
      fold: 0,
      call: 0,
      raise: 0,
      allin: 0,
    };
    if (pushFold || resolved.ruleBased || !chart) {
      const { action, freq } = actionFor(handKey);
      distribution[action] = freq;
      if (action !== "fold") distribution.fold = Math.max(0, 100 - freq);
    } else {
      const cell = normalizeCell(chart[handKey]);
      const weight = Math.max(0, Math.min(100, cell.weight));
      distribution.fold = 100 - weight;
      for (const action of ACTIONS) {
        distribution[action] +=
          (weight * Math.max(0, cell.actions[action] || 0)) / 100;
      }
    }

    if (scenario === "vs-3bet" && distribution.allin > 0) {
      distribution.raise += distribution.allin;
      distribution.allin = 0;
    }
    if (shortStack && distribution.raise > 0) {
      distribution.allin += distribution.raise;
      distribution.raise = 0;
    }
    return normalizedDistribution(distribution);
  };

  const rangeGrid = buildGrid(actionFor);

  // Standard RFI grids per position, for browsing (looseness-calibrated).
  const rfiGrids: Partial<Record<ChartPosition, PreflopGrid>> = {};
  const RFI_POSITIONS: ChartPosition[] = ["UTG", "MP", "CO", "BTN", "SB"];
  for (const pos of RFI_POSITIONS) {
    const rfiChart = applyCalibration(
      resolveChart("unopened", pos).chart || {},
      looseness,
      "unopened"
    );
    rfiGrids[pos] = buildGrid((handKey) => {
      const w = normalizeCell(rfiChart[handKey]);
      let best: PreflopAction = "fold";
      let bestFreq = w.actions.fold || 0;
      for (const a of ACTIONS) {
        const f = w.actions[a] || 0;
        if (f > bestFreq) {
          bestFreq = f;
          best = a;
        }
      }
      return { action: best, freq: bestFreq };
    });
  }

  // Combo-weighted action distribution over all 169 hand classes.
  const dist: ActionDistribution = { fold: 0, call: 0, raise: 0, allin: 0 };
  let totalCombos = 0;
  for (const hand of HAND_ORDER) {
    const combos = comboCount(hand);
    const { action, freq } = actionFor(hand);
    dist[action] += (combos * freq) / 100;
    totalCombos += combos;
  }
  const actionDistribution: ActionDistribution = {
    fold: round1((dist.fold / totalCombos) * 100),
    call: round1((dist.call / totalCombos) * 100),
    raise: round1((dist.raise / totalCombos) * 100),
    allin: round1((dist.allin / totalCombos) * 100),
  };

  // Sizes.
  const openSize = input.openSizeBB || rfiSizeBB(hero);
  const threeBetSize = input.threeBetSizeBB || openSize * 4;
  const callers = input.callers || 0;
  const callSizeBB =
    input.amountToCallBB !== undefined
      ? round1(amountToCallBB)
      : Math.max(
          0,
          round1(
            scenario === "vs-open"
              ? openSize - investedBB(hero)
              : scenario === "vs-3bet"
              ? threeBetSize - openSize
              : scenario === "iso"
              ? 1
              : 0
          )
        );
  const rawRaiseSizeBB =
    scenario === "unopened"
      ? rfiSizeBB(hero)
      : scenario === "iso"
      ? isoSizeBB(hero, input.limpers || 0)
      : scenario === "vs-open"
      ? threeBetSizeBB(openSize, callers, hero)
      : scenario === "vs-3bet"
      ? fourBetSizeBB(threeBetSize)
      : roundBB(threeBetSize * 2.1);

  const defaultCurrentBetBB =
    scenario === "vs-open"
      ? openSize
      : scenario === "vs-3bet" || scenario === "vs-4bet"
      ? threeBetSize
      : 1;
  const currentBetBB = input.currentBetBB ?? defaultCurrentBetBB;
  const minimumRaiseToBB =
    input.minimumRaiseToBB ?? Math.max(2, currentBetBB * 2);
  const liveResponderEffectiveStackBB = Math.min(
    heroStackBB,
    input.liveResponderEffectiveStackBB ?? stackBB
  );
  const canRaise =
    liveResponderEffectiveStackBB > currentBetBB + 0.01;
  const raiseCapBB = canRaise
    ? liveResponderEffectiveStackBB
    : Math.min(heroStackBB, stackBB);
  const raiseSizeBB = Math.min(
    heroStackBB,
    Math.max(minimumRaiseToBB, Math.min(raiseCapBB, rawRaiseSizeBB))
  );
  const remainingAfterRaiseBB = Math.max(0, heroStackBB - raiseSizeBB);
  const jamThresholdBB = Math.max(
    JAM_REMAINING_STACK_BB,
    heroStackBB * JAM_REMAINING_STACK_RATIO
  );
  const opponentsCanCoverHero = stackBB >= heroStackBB - 0.01;
  const raiseCommitsHero =
    canRaise &&
    opponentsCanCoverHero &&
    remainingAfterRaiseBB <= jamThresholdBB;

  const effectiveAllInAction: PreflopAction =
    stackBB >= heroStackBB - 0.01
      ? "allin"
      : canRaise
      ? "raise"
      : "call";

  const adjustHeroDistribution = (
    original: ActionDistribution,
    handKey: string
  ): {
    distribution: ActionDistribution;
    priceProtected: boolean;
    deepStackJamReduced: boolean;
  } => {
    const distribution = { ...original };

    if (distribution.allin > 0 && effectiveAllInAction !== "allin") {
      distribution[effectiveAllInAction] += distribution.allin;
      distribution.allin = 0;
    }
    const deepStackJamReduced =
      scenario === "vs-4bet" &&
      heroStackBB > DEEP_STACK_NO_AUTO_JAM_BB &&
      canRaise &&
      distribution.allin > 0;
    if (deepStackJamReduced) {
      distribution.raise += distribution.allin;
      distribution.allin = 0;
    }
    if (distribution.raise > 0) {
      if (!canRaise) {
        distribution.call += distribution.raise;
        distribution.raise = 0;
      } else if (raiseCommitsHero) {
        distribution.allin += distribution.raise;
        distribution.raise = 0;
      }
    }

    const strength = handStrength(handKey);
    const opponents = Math.max(
      1,
      input.activeOpponentCount ?? playerCount - 1
    );
    const maxPotOdds =
      strength === "strong"
        ? opponents > 1
          ? 0.12
          : 0.16
        : strength === "medium"
        ? opponents > 1
          ? 0.08
          : 0.1
        : opponents > 1
        ? 0.03
        : 0.055;
    const callStackRatio =
      heroStackBB > 0 ? amountToCallBB / heroStackBB : 1;
    const priceProtected =
      amountToCallBB > 0 &&
      distribution.fold > 0 &&
      (callPotOdds <= maxPotOdds ||
        (strength !== "weak" &&
          callStackRatio <= AUTO_CALL_MAX_STACK_RATIO &&
          callPotOdds <= 0.12));
    if (priceProtected) {
      distribution.call += distribution.fold;
      distribution.fold = 0;
    }
    return {
      distribution: normalizedDistribution(distribution),
      priceProtected,
      deepStackJamReduced,
    };
  };

  const sizeForAction = (action: PreflopAction): number | undefined => {
    if (action === "raise") return raiseSizeBB;
    if (action === "allin") return heroStackBB;
    return undefined;
  };

  // Reference ranges by primary action.
  const ranges: Partial<Record<PreflopAction, string[]>> = {};
  for (const hand of HAND_ORDER) {
    const { action, freq } = actionFor(hand);
    if (freq <= 0) continue;
    const list = ranges[action] || (ranges[action] = []);
    list.push(hand);
  }

  // Hero-specific advice.
  let heroAdvice: HeroAdvice | undefined;
  if (input.heroHand) {
    const handKey = normalizeHandKey(input.heroHand);
    const baseDistribution = distributionFor(handKey);
    const adjusted = adjustHeroDistribution(baseDistribution, handKey);
    const finalAction = dominantAction(adjusted.distribution);
    let sizeBB = sizeForAction(finalAction);
    const finalFreq = adjusted.distribution[finalAction];
    if (finalAction === "raise") sizeBB = raiseSizeBB;
    else if (finalAction === "allin") sizeBB = heroStackBB;
    else sizeBB = undefined;
    if (adjusted.priceProtected) {
      notes.push(
        `补注 ${round1(amountToCallBB)}bb，底池赔率约 ${Math.round(
          callPotOdds * 100
        )}%：已移除不合理弃牌分支`
      );
    }
    if (raiseCommitsHero && finalAction === "allin") {
      notes.push(
        `常规加注后仅剩 ${round1(
          remainingAfterRaiseBB
        )}bb：按套池阈值改为直接全下`
      );
    }
    if (adjusted.deepStackJamReduced) {
      notes.push("超过 120bb 的深码 4bet 底池：自动全下改为小尺度 5bet");
    }
    const sourceCell = chart ? normalizeCell(chart[handKey]) : undefined;
    if (
      scenario === "vs-3bet" &&
      finalAction === "raise" &&
      (sourceCell?.actions.allin || 0) > 0
    ) {
      notes.push("牌表强牌档位表示 4bet 后跟进 5bet；当前先采用常规 4bet 尺度");
    }
    if (
      effectiveAllInAction === "raise" &&
      baseDistribution.allin > 0 &&
      finalAction === "raise"
    ) {
      notes.push("短码对手不能覆盖英雄全部筹码：全下语义改为有效筹码加注");
    }
    const message = buildHeroMessage(
      finalAction,
      finalFreq,
      sizeBB,
      callSizeBB,
      heroStackBB,
      scenario,
      hero
    );
    heroAdvice = {
      hand: handKey,
      action: finalAction,
      frequency: finalFreq,
      sizeBB,
      sizeChips: sizeBB !== undefined ? toChips(sizeBB, input.bigBlindChips) : undefined,
      actionDistribution: adjusted.distribution,
      message,
    };
  }

  // Recommended action + size.
  let recommended: PreflopAction;
  if (heroAdvice) {
    recommended = heroAdvice.action;
  } else {
    // Without a hero hand, recommend the most frequent *non-fold* action
    // (i.e. what the range does when it plays). Falls back to fold.
    let bestAction: PreflopAction = "fold";
    let bestFreq = -1;
    for (const a of ACTIONS) {
      if (a === "fold") continue;
      if (actionDistribution[a] > 0 && actionDistribution[a] > bestFreq) {
        bestFreq = actionDistribution[a];
        bestAction = a;
      }
    }
    recommended = bestAction;
  }
  const recommendedSizeBB = heroAdvice?.sizeBB ?? sizeForAction(recommended);

  const actions: AdviceAction[] = ACTIONS.filter(
    (a) => actionDistribution[a] > 0
  )
    .map((a) => ({
      action: a,
      frequency: actionDistribution[a],
      sizeBB: a === "raise" || a === "allin" ? sizeForAction(a) : undefined,
      sizeChips:
        a === "raise" || a === "allin"
          ? toChips(sizeForAction(a) || 0, input.bigBlindChips)
          : undefined,
    }))
    .sort((a, b) => b.frequency - a.frequency);

  const potBB = round1(contestablePotBB);

  // Trust level: how the recommendation was produced for this exact spot.
  let trust: AdviceTrust;
  if (pushFold) {
    trust = PUSHFOLD_TRUST;
  } else if (resolved.ruleBased) {
    trust = "rule";
  } else if (!chart) {
    // BB with an unopened pot: trivially correct check rule.
    trust = "rule";
  } else if (resolved.fallbackNote) {
    trust = "chart-fallback";
  } else {
    trust = "chart";
  }

  return {
    kind: "preflop",
    playerCount,
    heroPosition: hero,
    heroPositionLabel: input.heroPositionLabel || hero,
    stackBB,
    heroStackBB,
    opponentEffectiveStacksBB: input.opponentEffectiveStacksBB,
    liveResponderEffectiveStackBB,
    amountToCallBB,
    callPotOdds,
    scenario,
    villainPosition: input.villainPosition,
    potBB,
    potChips: toChips(potBB, input.bigBlindChips),
    actionDistribution,
    recommended,
    recommendedSizeBB,
    recommendedSizeChips:
      recommendedSizeBB !== undefined
        ? toChips(recommendedSizeBB, input.bigBlindChips)
        : undefined,
    actions,
    ranges,
    rangeGrid,
    rfiGrids,
    heroHandKey: input.heroHand ? normalizeHandKey(input.heroHand) : undefined,
    hero: heroAdvice,
    notes,
    limitations: buildLimitations(
      scenario,
      stackBB,
      playerCount,
      hero,
      extraPlayers,
      looseness,
      fullRingRemoved,
      depthBucket
    ),
    adjustments: buildAdjustments(scenario, stackBB, hero, extraPlayers),
    dataSource: DATA_SOURCE,
    trust,
  };
}

function buildHeroMessage(
  action: PreflopAction,
  freq: number,
  sizeBB: number | undefined,
  callSizeBB: number,
  stackBB: number,
  scenario: PreflopScenario,
  hero: ChartPosition
): string {
  const freqText = freq < 100 ? `（频率约 ${Math.round(freq)}%）` : "";
  switch (action) {
    case "fold":
      return `建议弃牌${freqText}`;
    case "call":
      if (scenario === "unopened" && hero === "BB") {
        return "无人加注：建议过牌";
      }
      if (callSizeBB > 0) {
        return `建议跟注 ${callSizeBB}bb${freqText}`;
      }
      return `建议跟注${freqText}`;
    case "raise":
      return `建议加注到 ${sizeBB}bb${freqText}`;
    case "allin":
      return `建议全下 ${stackBB}bb${freqText}`;
  }
}

function buildLimitations(
  scenario: PreflopScenario,
  stackBB: number,
  playerCount: number,
  hero: ChartPosition,
  extraPlayers: number,
  looseness: Looseness,
  fullRingRemoved = 0,
  depthBucket: DepthBucket = null
): string[] {
  const lim: string[] = [];
  lim.push("图表为 100bb 深码 6-max 基准，其他筹码深度通过尺寸/全下规则近似");
  if (fullRingRemoved > 0) {
    lim.push("满员桌前位范围为 6-max 图表按比例收紧的近似，非独立求解的全环范围");
  }
  if (depthBucket) {
    lim.push(
      `${depthBucket}bb 档位为 100bb 图表的投机跟注收紧近似，非该深度的独立求解`
    );
  }
  if (stackBB <= 20) {
    lim.push(
      "短码 push/fold 表为本地求解的 Nash 近似（蒙特卡洛权益 ±0.6%，牌类粒度去牌权重；仅覆盖全下/弃牌决策树）"
    );
  }
  if (playerCount >= 10) {
    lim.push("10 人局按 9 人局处理");
  }
  if (extraPlayers > 0) {
    lim.push("多人局为单挑图表的收紧修正，非精确多人均衡");
  }
  if (scenario === "vs-4bet" && hero !== "SB" && hero !== "BB") {
    lim.push("非盲注位面对 4bet：采用 5bet 全下/弃牌简化规则");
  }
  if (looseness !== "standard") {
    lim.push(
      looseness === "loose"
        ? "已按“偏松”档位加宽约 5% 边缘手牌（主观校准）"
        : "已按“偏紧”档位剔除约 10% 边缘手牌（主观校准）"
    );
  }
  return lim;
}

function buildAdjustments(
  scenario: PreflopScenario,
  stackBB: number,
  hero: ChartPosition,
  extraPlayers: number
): string[] {
  const adj: string[] = [];
  const early = hero === "UTG" || hero === "MP";
  adj.push(
    early
      ? "前位：紧守图表范围，边缘手牌直接弃牌"
      : "后位/盲注位：可略放宽开池与防守范围"
  );
  if (stackBB <= 20) {
    adj.push("短码：按全下/弃牌模型执行，面对加注的边缘牌直接弃牌");
  } else if (stackBB > 120) {
    adj.push("深码：3bet/4bet 尺度可加大，翻后隐含赔率更好");
  }
  if (extraPlayers > 0) {
    adj.push("多人池：边缘手牌收紧，加注尺度每多一人约 +1bb");
  }
  if (scenario === "vs-open" || scenario === "vs-3bet") {
    adj.push("对手偏松：3bet 范围可更宽；对手偏紧：3bet 用更极化的范围");
  } else {
    adj.push("对手偏松被动：偷盲/开池可更宽；对手激进：收紧边缘防守");
  }
  return adj;
}
