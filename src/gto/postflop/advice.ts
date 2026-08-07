/**
 * Public postflop guidance API: turns a PostflopSituation into a
 * PostflopAdvice (recommended action + sizing + action mix + equity +
 * reasoning), mirroring the preflop engine's output shape.
 */

import { handGroupName, idToCard } from "./cards";
import { evaluateHand, HAND_CATEGORY } from "./hand-eval";
import { deterministicEquity } from "./features";
import {
  decidePostflop,
  HAND_CATEGORY_CN,
  isDangerousFlushBoard,
} from "./engine";
import { analyzeBoard, BOARD_TEXTURE_CN } from "./board";
import type {
  PostflopAction,
  PostflopActionDistribution,
  PostflopAdvice,
  PostflopHeroAdvice,
  PostflopSituation,
} from "./types";

const DATA_SOURCE =
  "gto-poker-overlay 蒸馏策略（≈84% 求解器一致性）+ 范围感知启发式（MIT）";

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function roundBB(x: number): number {
  return Math.round(x * 2) / 2;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function rankChar(num: number): string {
  if (num === 14) return "A";
  if (num === 13) return "K";
  if (num === 12) return "Q";
  if (num === 11) return "J";
  if (num === 10) return "T";
  return String(num);
}

function buildHeroMessage(
  action: PostflopAction,
  freq: number,
  sizeChips: number | undefined,
  toCall: number,
  eqR: number | undefined,
  pot: number
): string {
  const freqText = freq < 100 ? `（频率约 ${Math.round(freq)}%）` : "";
  switch (action) {
    case "fold":
      return `建议弃牌（对继续范围权益 ${pct(eqR ?? 0)}，低于底池赔率）`;
    case "check":
      return `建议过牌${freqText}`;
    case "call":
      return `建议跟注 ${toCall} 筹码${freqText}`;
    case "bet":
      return sizeChips !== undefined
        ? `建议下注 ${sizeChips} 筹码（约 ${Math.round(
            (sizeChips / Math.max(1, pot)) * 100
          )}% 底池）${freqText}`
        : `建议下注${freqText}`;
    case "raise":
      return `建议加注到 ${sizeChips ?? "?"} 筹码${freqText}`;
    case "allin":
      return `建议全下 ${sizeChips ?? "?"} 筹码${freqText}`;
  }
}

function buildLimitations(
  input: PostflopSituation
): string[] {
  const lim: string[] = [];
  if (input.activeVillainCount === 1) {
    lim.push("单挑策略为蒸馏神经网络近似（约 84% 求解器一致性），非精确 Nash");
  } else {
    lim.push("多人底池采用范围启发式近似，非精确多人均衡");
  }
  lim.push(
    "继续范围模型为启发式组合枚举（上限 160 组合等间隔抽样），不是完整对手范围"
  );
  if (input.effectiveStackBB < 80 || input.effectiveStackBB > 120) {
    lim.push(
      `当前有效筹码 ${round1(input.effectiveStackBB)}bb 偏离基准，尺寸/全下规则为近似`
    );
  }
  lim.push("下注/加注尺寸为纹理+街道+牌力的启发式，非求解器精确尺寸");
  return lim;
}

function buildAdjustments(
  input: PostflopSituation
): string[] {
  const adj: string[] = [];
  adj.push(
    input.heroInPosition
      ? "有位置（IP）：可略多下注施压、拿更多薄价值"
      : "无位置（OOP）：建议多过牌控池，下注范围更偏极化"
  );
  if (input.activeVillainCount > 1) {
    adj.push(
      "多人底池：价值下注门槛提高、诈唬频率降低、边缘跟注收紧"
    );
  } else {
    adj.push("单挑：可放宽 C-bet 与诈唬频率，边缘牌也能继续施压");
  }
  if (input.effectiveStackBB <= 25) {
    adj.push(
      "短码：加注更接近全下，边缘牌直接弃牌或全下，跟注需更紧"
    );
  } else if (input.effectiveStackBB < 60) {
    adj.push(
      "中短码：控制底池规模，边缘成牌避免过度投入"
    );
  } else if (input.effectiveStackBB > 120) {
    adj.push(
      "深码：听牌隐含赔率更好可多跟，但边缘成牌注意控池"
    );
  }
  if (input.street === "river") {
    adj.push("河牌：范围极化，价值/诈唬加大注，中等牌力过牌摊牌");
  }
  if (input.facedRaiseThisStreet) {
    adj.push("本街已被加注：继续范围收紧，边缘牌优先弃牌");
  }
  if (
    isDangerousFlushBoard(input.heroCards, input.board)
  ) {
    adj.push("同花面：无同花时不要价值下注，以过牌/抓诈为主");
  }
  adj.push(
    "对手偏松被动：多下注价值、少诈唬；对手偏紧：多诈唬、少薄价值；对手激进：多过牌-跟注抓诈"
  );
  return adj;
}

export function getPostflopAdvice(
  input: PostflopSituation
): PostflopAdvice {
  if (!input || !["flop", "turn", "river"].includes(input.street)) {
    throw new Error(`无效的翻后街：${input && input.street}`);
  }
  if (!input.heroCards || input.heroCards.length !== 2) {
    throw new Error("翻后建议需要提供两张手牌");
  }
  if (!input.board || input.board.length < 3) {
    throw new Error("翻后建议需要至少 3 张公共牌");
  }
  if (!Number.isFinite(input.pot) || input.pot <= 0) {
    throw new Error(`底池必须为正数（筹码），收到 ${input.pot}`);
  }
  if (!Number.isFinite(input.bigBlind) || input.bigBlind <= 0) {
    throw new Error(`大盲注必须为正数（筹码），收到 ${input.bigBlind}`);
  }

  const decision = decidePostflop(input);
  const facingBet = input.toCall > 0;
  const m = decision.mixedStrategy;
  const betProb = m.bets.reduce((s, b) => s + b.probability, 0);
  const betProbPct = round1(betProb * 100);

  const dist: PostflopActionDistribution = {
    fold: round1(m.fold * 100),
    check: round1(m.check * 100),
    call: round1(m.call * 100),
    bet: 0,
    raise: 0,
    allin: 0,
  };
  if (decision.action === "allin") {
    dist.allin = betProbPct;
  } else if (facingBet) {
    dist.raise = betProbPct;
  } else {
    dist.bet = betProbPct;
  }

  const recommended = decision.action;
  const sizeChips = decision.amount;
  const sizeBB =
    sizeChips !== undefined
      ? roundBB(sizeChips / input.bigBlind)
      : undefined;
  const freq =
    recommended === "bet" || recommended === "raise" || recommended === "allin"
      ? round1(betProb * 100)
      : round1(decision.mixedStrategy[recommended] * 100);

  const heroCat =
    input.board.length >= 3
      ? Math.floor(
          evaluateHand([input.heroCards[0], input.heroCards[1], ...input.board]) /
            1_000_000
        )
      : HAND_CATEGORY.HIGH_CARD;

  const notes: string[] = [];
  if (input.activeVillainCount === 1) {
    notes.push(
      "单挑局面：蒸馏神经网络策略（≈84% 求解器一致性）+ 范围启发式兜底"
    );
  } else {
    notes.push(
      `多人底池：范围感知启发式（对手继续范围 ${
        decision.equityRangeCombos ?? "?"
      } 个组合）`
    );
  }
  const texture = analyzeBoard(input.board).texture;
  notes.push(`牌面：${BOARD_TEXTURE_CN[texture]}`);
  notes.push(`手牌类别：${HAND_CATEGORY_CN[heroCat]}`);
  if (decision.equityVsRange !== undefined) {
    notes.push(
      `对继续范围权益 ${pct(decision.equityVsRange)}${
        decision.equityRangeCombos !== undefined
          ? `（${decision.equityRangeCombos} 组合）`
          : ""
      }`
    );
  }
  notes.push("参考范围为近似 GTO，非精确均衡；多人局为启发式修正");

  const handKey = handGroupName(input.heroCards[0], input.heroCards[1]);
  const hero: PostflopHeroAdvice = {
    hand: handKey,
    action: recommended,
    frequency: freq,
    sizeChips,
    sizeBB,
    message: buildHeroMessage(
      recommended,
      freq,
      sizeChips,
      input.toCall,
      decision.equityVsRange,
      input.pot
    ),
  };

  const boardText =
    input.boardCards && input.boardCards.length
      ? input.boardCards.map((c) => rankChar(c.num) + c.suit)
      : input.board.map((id) => {
          const c = idToCard(id);
          return rankChar(c.num) + c.suit;
        });

  return {
    kind: "postflop",
    street: input.street,
    board: boardText,
    boardTexture: texture,
    heroPosition: input.heroInPosition ? "IP" : "OOP",
    heroPositionLabel: input.heroPositionLabel || (input.heroInPosition ? "IP" : "OOP"),
    potChips: input.pot,
    potBB: round1(input.pot / input.bigBlind),
    effectiveStackBB: round1(input.effectiveStackBB),
    equityVsRandom: round1(deterministicEquity(input.heroCards, input.board)),
    equityVsRange:
      decision.equityVsRange !== undefined
        ? round1(decision.equityVsRange)
        : undefined,
    equityRangeCombos: decision.equityRangeCombos,
    heroHandKey: handKey,
    actionDistribution: dist,
    recommended,
    recommendedSizeChips: sizeChips,
    recommendedSizeBB: sizeBB,
    hero,
    notes,
    limitations: buildLimitations(input),
    adjustments: buildAdjustments(input),
    reasoning: decision.reasoning,
    dataSource: DATA_SOURCE,
  };
}
