import { assert } from "chai";
import * as jwt from "jsonwebtoken";
import { cardToId } from "../../gto/postflop/cards";
import { equityVsRange } from "../../gto/postflop/equity";
import {
  buildAiReplayComparison,
  calculateAiReplayActionDeviation,
  calculateAiReplayDecisionDeviation,
  calculateAiReplayHandDeviation,
  calculateAiReplaySizeDeviation,
  classifyAiReplaySize,
} from "../../shared/aiReplay";
import type { AiReplayParticipant } from "../../shared/aiReplay";
import { AiReplayStore, replayOwnerKey } from "../replay/ai-replay-store";

const heroCards = [{ num: 14, suit: "h" }, { num: 13, suit: "h" }];
const botCards = [{ num: 12, suit: "s" }, { num: 12, suit: "d" }];

function participants(): AiReplayParticipant[] {
  return [
    {
      id: "hero", name: "Hero", type: "human", position: "BTN",
      cards: heroCards, startingStack: 200, endingStack: 220,
    },
    {
      id: "bot-1", name: "Ada", type: "bot", position: "BB",
      cards: botCards, startingStack: 200, endingStack: 180, botStyle: "standard",
    },
  ];
}

function token(jti: string) {
  return jwt.sign({ name: "Hero", credential: "stable-credential", jti }, "test");
}

function replayAdvice() {
  const actionDistribution = { fold: 10, call: 30, raise: 60, allin: 0 };
  return {
    kind: "preflop",
    recommended: "raise",
    recommendedSizeChips: 5,
    actionDistribution,
    actions: [{ action: "raise", frequency: 60, sizeChips: 5 }],
    hero: { actionDistribution },
  } as any;
}

/** Advice from a binary chart that pins the hand to a single action. */
function deterministicAdvice(hand: string, chartAction: "raise" | "fold" = "raise") {
  const rangeDistribution = { fold: 35.3, call: 26.2, raise: 38.5, allin: 0 };
  const heroDistribution = chartAction === "raise"
    ? { fold: 0, call: 0, raise: 100, allin: 0 }
    : { fold: 100, call: 0, raise: 0, allin: 0 };
  return {
    kind: "preflop",
    recommended: chartAction,
    recommendedSizeChips: chartAction === "raise" ? 240 : undefined,
    recommendedSizeBB: chartAction === "raise" ? 12 : undefined,
    actionDistribution: rangeDistribution,
    actions: [{ action: "raise", frequency: 38.5, sizeBB: 12, sizeChips: 240 }],
    hero: {
      hand,
      action: chartAction,
      frequency: 100,
      actionDistribution: heroDistribution,
    },
  } as any;
}

describe("AI replay store", () => {
  it("uses the stable credential rather than the issued JWT", () => {
    assert.equal(replayOwnerKey(token("one")), replayOwnerKey(token("two")));
  });

  it("stores decisions and exposes a completed hand through its public id", () => {
    const store = new AiReplayStore(":memory:");
    const ownerToken = token("first");
    const publicId = "0123456789abcdef0123456789abcdef";
    store.beginHand({
      publicId, ownerToken, roomId: "1001", handSeq: 7,
      startedAt: 1000, smallBlind: 1, bigBlind: 2,
      heroId: "hero", participants: participants(),
    });
    store.recordDecision(publicId, {
      sequence: 1, street: "preflop", actorId: "hero", actorType: "human",
      actorName: "Hero", position: "BTN",
      actual: { action: "raise", amountTo: 5, delta: 5, origin: "human" },
      context: {
        board: [], potBefore: 3, amountToCall: 2, minimumRaiseTo: 4,
        currentBet: 2, raiseCount: 0, players: [],
      },
      comparison: {
        recommendedAction: "raise", actualActionProbability: 85,
        actionMatch: true, classification: "recommended", reasons: ["一致"],
      },
      advice: replayAdvice(),
      createdAt: 1100,
    });
    store.completeHand({
      publicId, ownerToken: token("second"), completedAt: 2000,
      board: [{ num: 2, suit: "c" }], participants: participants(),
      runouts: [], heroProfitChips: 20,
    });

    const list = store.listForToken(token("third"));
    assert.equal(list.total, 1);
    assert.equal(list.items[0].heroProfitBB, 10);
    assert.equal(list.items[0].deviationScore, 0);
    assert.equal(list.items[0].deviationLevel, "close");
    assert.equal(list.items[0].scoredDecisionCount, 1);
    const replay = store.getPublic(publicId)!;
    assert.equal(replay.decisions.length, 1);
    assert.equal(replay.decisions[0].actual.action, "raise");
    assert.equal(replay.participants[1].cards[0].suit, "s");
  });

  it("retains only the latest 100 completed hands per owner", () => {
    const store = new AiReplayStore(":memory:");
    const ownerToken = token("retention");
    for (let index = 0; index < 101; index += 1) {
      const publicId = index.toString(16).padStart(32, "0");
      store.beginHand({
        publicId, ownerToken, roomId: "1001", handSeq: index,
        startedAt: index, smallBlind: 1, bigBlind: 2,
        heroId: "hero", participants: participants(),
      });
      store.completeHand({
        publicId, ownerToken, completedAt: index + 1,
        board: [], participants: participants(), runouts: [], heroProfitChips: index,
      });
    }
    assert.equal(store.listForToken(ownerToken).total, 100);
    assert.isNull(store.getPublic("00000000000000000000000000000000"));
    assert.isNotNull(store.getPublic("00000000000000000000000000000064"));
  });
});

describe("AI replay raise-size grading", () => {
  it("grades sizing by proportional difference", () => {
    assert.equal(classifyAiReplaySize(109, 100), "matched");
    assert.equal(classifyAiReplaySize(110, 100), "matched");
    assert.equal(classifyAiReplaySize(125, 100), "minor");
    assert.equal(classifyAiReplaySize(150, 100), "minor");
    assert.equal(classifyAiReplaySize(151, 100), "major");
  });

  it("does not grade sizing without a valid GTO reference", () => {
    assert.isUndefined(classifyAiReplaySize(100, undefined));
    assert.isUndefined(classifyAiReplaySize(100, 0));
  });
});

describe("AI replay deviation scoring", () => {
  it("scores action distance relative to the highest-frequency action", () => {
    assert.equal(calculateAiReplayActionDeviation(60, 60), 0);
    assert.equal(calculateAiReplayActionDeviation(30, 60), 50);
    assert.equal(calculateAiReplayActionDeviation(10, 60), 83.3);
    assert.equal(calculateAiReplayActionDeviation(0, 60), 100);
  });

  it("uses a ten-percent sizing tolerance and reaches 100 at fifty percent", () => {
    assert.equal(calculateAiReplaySizeDeviation(110, 100), 0);
    assert.equal(calculateAiReplaySizeDeviation(130, 100), 50);
    assert.equal(calculateAiReplaySizeDeviation(150, 100), 100);
    assert.isUndefined(calculateAiReplaySizeDeviation(100, undefined));
  });

  it("combines action and sizing without reducing a severe action deviation", () => {
    const sized = calculateAiReplayDecisionDeviation({
      actual: { action: "raise", amountTo: 6.5, origin: "human" },
      advice: replayAdvice(),
      comparison: {
        recommendedAction: "raise", recommendedSizeChips: 5,
        actionMatch: true, classification: "recommended", reasons: [],
      },
    });
    assert.equal(sized?.actionScore, 0);
    assert.equal(sized?.sizeScore, 50);
    assert.equal(sized?.score, 17.5);

    const absentAction = calculateAiReplayDecisionDeviation({
      actual: { action: "allin", origin: "human" },
      advice: replayAdvice(),
      comparison: {
        recommendedAction: "raise", actionMatch: false,
        classification: "deviation", reasons: [],
      },
    });
    assert.equal(absentAction?.score, 100);
  });

  it("softens deterministic-chart mismatches by hand strength and direction", () => {
    // A binary chart pins every hand to one action; grading a fold of a
    // marginal hand as a 100-point deviation overstates the error.
    const foldT3s = buildAiReplayComparison({
      action: "fold",
      advice: deterministicAdvice("T3s"),
      bigBlind: 20,
    });
    // Weak hand, passive direction: widened toward the range frequencies.
    assert.equal(foldT3s.classification, "low-frequency");
    assert.equal(foldT3s.actualActionProbability, 12.4);
    const foldT3sDeviation = calculateAiReplayDecisionDeviation({
      actual: { action: "fold", origin: "human" },
      advice: deterministicAdvice("T3s"),
      comparison: foldT3s,
    });
    assert.equal(foldT3sDeviation?.actionScore, 30);
    assert.equal(foldT3sDeviation?.score, 30);
    const hand = calculateAiReplayHandDeviation([
      {
        actorType: "human",
        actual: { action: "fold", origin: "human" },
        advice: deterministicAdvice("T3s"),
        comparison: foldT3s,
      },
    ]);
    assert.equal(hand.deviationScore, 30);
    assert.equal(hand.deviationLevel, "minor");
    assert.equal(hand.severeDecisionCount, 0);

    // Medium hand: partial softening.
    const foldK9s = buildAiReplayComparison({
      action: "fold",
      advice: deterministicAdvice("K9s"),
      bigBlind: 20,
    });
    assert.equal(foldK9s.classification, "low-frequency");
    assert.equal(foldK9s.actualActionProbability, 7.1);
    const foldK9sDeviation = calculateAiReplayDecisionDeviation({
      actual: { action: "fold", origin: "human" },
      advice: deterministicAdvice("K9s"),
      comparison: foldK9s,
    });
    assert.equal(foldK9sDeviation?.actionScore, 60);

    // Premium hand: no softening, folding stays a full deviation.
    const foldAA = buildAiReplayComparison({
      action: "fold",
      advice: deterministicAdvice("AA"),
      bigBlind: 20,
    });
    assert.equal(foldAA.classification, "deviation");
    assert.equal(foldAA.actualActionProbability, 0);
    const foldAADeviation = calculateAiReplayDecisionDeviation({
      actual: { action: "fold", origin: "human" },
      advice: deterministicAdvice("AA"),
      comparison: foldAA,
    });
    assert.equal(foldAADeviation?.actionScore, 100);

    // Over-aggression with junk the chart folds stays a full deviation.
    const raiseJunk = buildAiReplayComparison({
      action: "raise",
      advice: deterministicAdvice("72o", "fold"),
      bigBlind: 20,
    });
    assert.equal(raiseJunk.classification, "deviation");
    const raiseJunkDeviation = calculateAiReplayDecisionDeviation({
      actual: { action: "raise", origin: "human" },
      advice: deterministicAdvice("72o", "fold"),
      comparison: raiseJunk,
    });
    assert.equal(raiseJunkDeviation?.actionScore, 100);

    // Matching the pinned action is still a clean recommendation.
    const raiseT3s = buildAiReplayComparison({
      action: "raise",
      amountTo: 240,
      advice: deterministicAdvice("T3s"),
      bigBlind: 20,
    });
    assert.equal(raiseT3s.classification, "recommended");
    assert.equal(raiseT3s.actualActionProbability, 100);
  });

  it("uses RMS across scored human decisions and excludes bots or unscored actions", () => {
    const result = calculateAiReplayHandDeviation([
      {
        actorType: "human",
        actual: { action: "raise", amountTo: 5, origin: "human" },
        advice: replayAdvice(),
        comparison: { actionMatch: true, classification: "recommended", reasons: [] },
      },
      {
        actorType: "human",
        actual: { action: "allin", origin: "human" },
        advice: replayAdvice(),
        comparison: { actionMatch: false, classification: "deviation", reasons: [] },
      },
      {
        actorType: "bot",
        actual: { action: "allin", origin: "bot" },
        advice: replayAdvice(),
        comparison: { actionMatch: false, classification: "deviation", reasons: [] },
      },
      {
        actorType: "human",
        actual: { action: "fold", origin: "human" },
        comparison: { actionMatch: false, classification: "unscored", reasons: [] },
      },
    ]);

    assert.equal(result.deviationScore, 70.7);
    assert.equal(result.deviationLevel, "severe");
    assert.equal(result.scoredDecisionCount, 2);
    assert.equal(result.severeDecisionCount, 1);
    assert.equal(result.maxDecisionDeviation, 100);
  });
});

describe("EV-loss grading", () => {
  /** Postflop advice facing a bet, with a measured equity vs range. */
  function postflopAdvice(overrides: Record<string, unknown> = {}) {
    return {
      kind: "postflop",
      recommended: "fold",
      potBB: 10,
      potChips: 200,
      toCallBB: 5,
      toCallChips: 100,
      equityVsRange: 0.2,
      actionDistribution: { fold: 100, check: 0, call: 0, bet: 0, raise: 0, allin: 0 },
      ...overrides,
    } as any;
  }

  it("gives full credit to actions inside a mixed reference", () => {
    // call runs at 30% in the mix: indifferent, zero action score & EV loss.
    const comparison = buildAiReplayComparison({
      action: "call",
      advice: replayAdvice(),
      bigBlind: 2,
    });
    assert.equal(comparison.classification, "mixed-acceptable");
    assert.equal(comparison.evLossBB, 0);
    assert.equal(comparison.evBasis, "indifference");
    const deviation = calculateAiReplayDecisionDeviation({
      actual: { action: "call", origin: "human" },
      advice: replayAdvice(),
      comparison,
    });
    assert.equal(deviation?.actionScore, 0);
    assert.equal(deviation?.score, 0);
  });

  it("prices calling with insufficient equity by pot odds", () => {
    // EV(call) = 0.2 × (10 + 5) − 5 = −2bb.
    const comparison = buildAiReplayComparison({
      action: "call",
      advice: postflopAdvice(),
      bigBlind: 20,
    });
    assert.equal(comparison.evBasis, "pot-odds");
    assert.closeTo(comparison.evLossBB!, 2, 0.001);
  });

  it("prices folding away a profitable call by pot odds", () => {
    // EV(call) = 0.5 × (10 + 5) − 5 = +2.5bb forfeited by folding.
    const comparison = buildAiReplayComparison({
      action: "fold",
      advice: postflopAdvice({
        recommended: "call",
        equityVsRange: 0.5,
        actionDistribution: { fold: 0, check: 0, call: 100, bet: 0, raise: 0, allin: 0 },
      }),
      bigBlind: 20,
    });
    assert.equal(comparison.evBasis, "pot-odds");
    assert.closeTo(comparison.evLossBB!, 2.5, 0.001);
  });

  it("falls back to a pot-scaled frequency proxy without equity data", () => {
    // Missed value bet: no equity pricing for bet-vs-check, proxy applies.
    const comparison = buildAiReplayComparison({
      action: "check",
      advice: postflopAdvice({
        recommended: "bet",
        toCallBB: 0,
        toCallChips: 0,
        actionDistribution: { fold: 0, check: 5, call: 0, bet: 95, raise: 0, allin: 0 },
      }),
      bigBlind: 20,
    });
    assert.equal(comparison.evBasis, "frequency");
    assert.isAbove(comparison.evLossBB!, 0);
  });

  it("totals EV loss across scored human decisions", () => {
    const callAdvice = postflopAdvice();
    const comparison = buildAiReplayComparison({
      action: "call",
      advice: callAdvice,
      bigBlind: 20,
    });
    const hand = calculateAiReplayHandDeviation([
      {
        actorType: "human",
        actual: { action: "call", origin: "human" },
        advice: callAdvice,
        comparison,
      },
      {
        actorType: "human",
        actual: { action: "fold", origin: "human" },
        advice: postflopAdvice(),
        comparison: buildAiReplayComparison({
          action: "fold",
          advice: postflopAdvice(),
          bigBlind: 20,
        }),
      },
    ]);
    // First decision burns 2bb; the second matches the recommendation.
    assert.closeTo(hand.totalEvLossBB!, 2, 0.001);
  });
});

describe("suit-aware continuing range equity", () => {
  it("returns an independent equity result for every concrete combo", () => {
    const hero: [number, number] = [
      cardToId({ num: 14, suit: "h" }),
      cardToId({ num: 13, suit: "h" }),
    ];
    const board = [
      cardToId({ num: 12, suit: "h" }),
      cardToId({ num: 11, suit: "h" }),
      cardToId({ num: 2, suit: "c" }),
      cardToId({ num: 3, suit: "d" }),
      cardToId({ num: 4, suit: "s" }),
    ];
    const combos: [number, number][] = [
      [cardToId({ num: 12, suit: "s" }), cardToId({ num: 12, suit: "d" })],
      [cardToId({ num: 10, suit: "h" }), cardToId({ num: 9, suit: "h" })],
    ];
    const result = equityVsRange(hero, board, combos);
    assert.equal(result.details.length, 2);
    assert.deepEqual(result.details.map((detail) => detail.cards), combos);
    result.details.forEach((detail) => {
      assert.closeTo(detail.win + detail.tie + detail.lose, 1, 0.00001);
      assert.equal(detail.samples, 1);
    });
  });
});
