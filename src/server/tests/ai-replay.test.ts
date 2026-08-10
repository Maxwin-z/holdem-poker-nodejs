import { assert } from "chai";
import * as jwt from "jsonwebtoken";
import { cardToId } from "../../gto/postflop/cards";
import { equityVsRange } from "../../gto/postflop/equity";
import {
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
