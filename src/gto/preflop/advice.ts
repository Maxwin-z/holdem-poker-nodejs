/**
 * Preflop guidance engine.
 *
 * Strategy comes from precomputed GreenCharts2024 charts (6-max, 100bb
 * baseline), mapped onto 2-9 handed games, with authored fallbacks,
 * multiway tightening, short-stack push/fold handling and sizing.
 */

import {
  BB_CALL_VS_BTN_SHOVE,
  BB_CALL_VS_SB_SHOVE,
  BTN_SHOVE,
  SB_SHOVE,
  nearestTable,
} from "./data/pushfold";
import { HAND_ORDER, RANKS, comboCount, expandRange, normalizeHandKey } from "./hand";
import {
  applyCalibration,
  applyMultiwayTightening,
  normalizeCell,
  resolveChart,
} from "./lookup";
import { GRID_ACTION } from "./types";
import { normalizePlayerCount } from "./positions";
import {
  fourBetSizeBB,
  investedBB,
  isoSizeBB,
  rfiSizeBB,
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

function round1(x: number): number {
  return Math.round(x * 10) / 10;
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
  if (chart) {
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
    notes.push(`短码 ${stackBB}bb：按全下/弃牌模型给出参考（近似 Nash）`);
  }
  if (resolved.ruleBased) {
    notes.push("面对 4bet：基于 5bet 全下/弃牌的简化规则，非精确 GTO");
  }
  if (looseness === "loose") notes.push("已按“偏松”档位加宽约 5% 边缘手牌");
  if (looseness === "tight") notes.push("已按“偏紧”档位剔除约 10% 边缘手牌");

  const shortStack = stackBB <= 20 && !pushFold;
  if (shortStack) notes.push(`短码 ${stackBB}bb：加注建议改为全下`);

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
    return { action: best, freq: bestFreq };
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
  const callSizeBB = Math.max(
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
  const raiseSizeBB =
    scenario === "unopened"
      ? rfiSizeBB(hero)
      : scenario === "iso"
      ? isoSizeBB(hero, input.limpers || 0)
      : scenario === "vs-open"
      ? threeBetSizeBB(openSize, callers, hero)
      : scenario === "vs-3bet"
      ? fourBetSizeBB(threeBetSize)
      : stackBB;

  const sizeForAction = (action: PreflopAction): number | undefined => {
    if (action === "raise") return shortStack ? stackBB : raiseSizeBB;
    if (action === "allin") return stackBB;
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
    const { action, freq } = actionFor(handKey);
    let finalAction = action;
    let sizeBB = sizeForAction(action);
    let finalFreq = freq;
    if (action === "raise" && shortStack) {
      finalAction = "allin";
      sizeBB = stackBB;
    }
    const message = buildHeroMessage(
      finalAction,
      finalFreq,
      sizeBB,
      callSizeBB,
      stackBB,
      scenario,
      hero
    );
    heroAdvice = {
      hand: handKey,
      action: finalAction,
      frequency: finalFreq,
      sizeBB,
      sizeChips: sizeBB !== undefined ? toChips(sizeBB, input.bigBlindChips) : undefined,
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
  const recommendedSizeBB = sizeForAction(recommended);

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

  const potBB = round1(potBBFor(scenario, input));

  return {
    kind: "preflop",
    playerCount,
    heroPosition: hero,
    heroPositionLabel: input.heroPositionLabel || hero,
    stackBB,
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
      looseness
    ),
    adjustments: buildAdjustments(scenario, stackBB, hero, extraPlayers),
    dataSource: DATA_SOURCE,
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
  looseness: Looseness
): string[] {
  const lim: string[] = [];
  lim.push("图表为 100bb 深码 6-max 基准，其他筹码深度通过尺寸/全下规则近似");
  if (stackBB <= 20) {
    lim.push("短码 push/fold 表为近似 Nash（非精确解）");
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
