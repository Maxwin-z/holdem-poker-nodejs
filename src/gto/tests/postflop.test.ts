import * as assert from "assert";
import { buildPostflopAdvice } from "../postflop/from-game-state";
import { getPostflopAdvice } from "../postflop/advice";
import { cardToId } from "../postflop/cards";
import { deterministicEquity } from "../postflop/features";
import { analyzeBoard } from "../postflop/board";
import { equityVsRange } from "../postflop/equity";
import { evaluateHand, HAND_CATEGORY } from "../postflop/hand-eval";
import { villainContinuingRange } from "../postflop/range";
import {
  preflopClassRange,
  trackedVillainRange,
} from "../postflop/range-tracker";
import type { PostflopSituation } from "../postflop/types";

const c = (num: number, suit: string) => cardToId({ num, suit });

function sit(over: Partial<PostflopSituation>): PostflopSituation {
  return {
    street: "flop",
    heroCards: [c(14, "h"), c(13, "h")],
    board: [c(9, "d"), c(7, "h"), c(2, "c")],
    pot: 120,
    currentBet: 0,
    heroBet: 0,
    toCall: 0,
    heroRemaining: 980,
    bigBlind: 2,
    effectiveStackBB: 100,
    activeVillainCount: 1,
    heroInPosition: true,
    isPreflopAggressor: true,
    preflopHasRaise: true,
    threeBetPot: false,
    streetBetCount: 0,
    facedRaiseThisStreet: false,
    ...over,
  };
}

describe("postflop hand evaluator", () => {
  it("returns the correct category for known hands", () => {
    const cat = (cards: number[]) =>
      Math.floor(evaluateHand(cards) / 1_000_000);
    assert.strictEqual(
      cat([c(14, "h"), c(14, "s"), c(14, "d"), c(14, "c"), c(2, "h")]),
      HAND_CATEGORY.FOUR_OF_A_KIND
    );
    assert.strictEqual(
      cat([c(9, "h"), c(9, "s"), c(9, "d"), c(7, "h"), c(7, "c")]),
      HAND_CATEGORY.FULL_HOUSE
    );
    assert.strictEqual(
      cat([c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(10, "h")]),
      HAND_CATEGORY.STRAIGHT_FLUSH
    );
    assert.strictEqual(
      cat([c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(2, "h")]),
      HAND_CATEGORY.FLUSH
    );
    assert.strictEqual(
      cat([c(14, "s"), c(13, "d"), c(12, "h"), c(11, "c"), c(10, "s")]),
      HAND_CATEGORY.STRAIGHT
    );
    assert.strictEqual(
      cat([c(9, "h"), c(9, "s"), c(9, "d"), c(7, "h"), c(2, "c")]),
      HAND_CATEGORY.THREE_OF_A_KIND
    );
    assert.strictEqual(
      cat([c(14, "s"), c(13, "d"), c(9, "h"), c(9, "s"), c(2, "c")]),
      HAND_CATEGORY.PAIR
    );
    assert.strictEqual(
      cat([c(14, "s"), c(13, "d"), c(9, "h"), c(2, "s"), c(7, "c")]),
      HAND_CATEGORY.HIGH_CARD
    );
  });

  it("enumerates all 2,598,960 five-card hands with the textbook category counts", () => {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const counts = new Array(9).fill(0);
    for (let a = 0; a < 48; a++) {
      for (let b = a + 1; b < 49; b++) {
        for (let cc = b + 1; cc < 50; cc++) {
          for (let d = cc + 1; d < 51; d++) {
            for (let e = d + 1; e < 52; e++) {
              const v = evaluateHand([
                deck[a], deck[b], deck[cc], deck[d], deck[e],
              ]);
              counts[Math.floor(v / 1_000_000)]++;
            }
          }
        }
      }
    }
    assert.deepStrictEqual(counts, [
      1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40,
    ]);
  });
});

describe("postflop equity", () => {
  it("deterministicEquity is a pure function of the spot", () => {
    const board = [c(9, "d"), c(7, "h"), c(2, "c")];
    const hero: [number, number] = [c(14, "h"), c(13, "h")];
    const a = deterministicEquity(hero, board);
    const b = deterministicEquity(hero, board);
    assert.ok(a > 0.4 && a < 0.7, `AKs on 972 flop should be middling, got ${a}`);
    assert.strictEqual(a, b);
  });

  it("multiway tightens the villain continuing range", () => {
    const board = [c(13, "d"), c(9, "h"), c(4, "c")];
    const hero: [number, number] = [c(14, "h"), c(13, "h")];
    for (const aggression of [false, true]) {
      const headsUp = villainContinuingRange(hero, board, {
        aggression,
        multiway: false,
      });
      const multiway = villainContinuingRange(hero, board, {
        aggression,
        multiway: true,
      });
      assert.ok(
        multiway.length < headsUp.length,
        `multiway (${multiway.length}) should be tighter than HU (${headsUp.length}) with aggression=${aggression}`
      );
      const headsUpKeys = new Set(headsUp.map(([a, b]) => `${a},${b}`));
      multiway.forEach(([a, b]) => {
        assert.ok(
          headsUpKeys.has(`${a},${b}`),
          "multiway range must be a subset of the heads-up range"
        );
      });
    }
  });

  it("equityVsRange is exact on the river", () => {
    const board = [c(9, "d"), c(7, "h"), c(2, "c"), c(5, "s"), c(3, "d")];
    const hero: [number, number] = [c(9, "h"), c(9, "s")]; // trips nines
    const range = villainContinuingRange(hero, board, {
      aggression: false,
      multiway: false,
    });
    const res = equityVsRange(hero, board, range, 100);
    assert.ok(res.equity > 0.9, `trips should crush the range, got ${res.equity}`);
    assert.ok(res.combos > 0);
  });
});

describe("villain range tracker", () => {
  const hero: [number, number] = [c(14, "h"), c(13, "h")];

  it("builds the preflop base range from the villain's chart role", () => {
    const open = preflopClassRange("UTG", { kind: "open" })!;
    assert.ok(open.has("AKs") && open.has("QQ"), "UTG opens premiums");
    assert.ok(!open.has("72o") && !open.has("Q5s"), "UTG folds junk");
    const bbCheck = preflopClassRange("BB", { kind: "bb-check" })!;
    assert.ok(bbCheck.has("72o"), "a checked BB option keeps junk");
    assert.ok(open.size < bbCheck.size);
  });

  it("filters street by street using the board as it stood (slicing)", () => {
    // Villain opened BTN preflop, c-bet the Ks 9h 4c flop; the turn 2d
    // gives 22 a set — but 22 could not continue the flop bet, so it must
    // be absent from the tracked turn range while top pair stays.
    const board = [c(13, "s"), c(9, "h"), c(4, "c"), c(2, "d")];
    const range = trackedVillainRange(hero, board, {
      chartPosition: "BTN",
      preflop: { kind: "open" },
      streetActions: [{ round: 1, action: "bet" }],
    })!;
    assert.ok(range.length >= 20, "tracked range should survive");
    const keys = new Set(range.map(([a, b]) => `${a},${b}`));
    const combo = (x: { num: number; suit: string }, y: { num: number; suit: string }) => {
      const i = cardToId(x);
      const j = cardToId(y);
      return `${Math.min(i, j)},${Math.max(i, j)}`;
    };
    assert.ok(
      !keys.has(combo({ num: 2, suit: "s" }, { num: 2, suit: "h" })),
      "22 (turned set) cannot have c-bet the flop"
    );
    assert.ok(
      keys.has(combo({ num: 13, suit: "d" }, { num: 12, suit: "s" })),
      "KQ (top pair) continues the c-bet line"
    );
  });

  it("tightens across streets and returns null when the range collapses", () => {
    const board5 = [c(13, "s"), c(9, "h"), c(4, "c"), c(2, "d"), c(3, "s")];
    const oneBarrel = trackedVillainRange(hero, board5, {
      chartPosition: "BTN",
      preflop: { kind: "open" },
      streetActions: [{ round: 1, action: "bet" }],
    })!;
    const threeBarrels = trackedVillainRange(hero, board5, {
      chartPosition: "BTN",
      preflop: { kind: "open" },
      streetActions: [
        { round: 1, action: "bet" },
        { round: 2, action: "bet" },
        { round: 3, action: "bet" },
      ],
    });
    if (threeBarrels) {
      assert.ok(threeBarrels.length <= oneBarrel.length);
    }
    // A 3bet range barreling a board it entirely missed collapses to the
    // fallback rather than producing a handful of overfit combos.
    const collapsed = trackedVillainRange(hero, board5, {
      chartPosition: "SB",
      preflop: { kind: "3bet", openerPosition: "BTN" },
      streetActions: [
        { round: 1, action: "bet" },
        { round: 2, action: "bet" },
        { round: 3, action: "bet" },
      ],
    });
    assert.ok(
      collapsed === null || collapsed.length >= 20,
      "collapsing ranges must return null, never a tiny overfit set"
    );
  });

  it("unknown roles yield no tracked range", () => {
    const board = [c(13, "s"), c(9, "h"), c(4, "c")];
    assert.strictEqual(
      trackedVillainRange(hero, board, {
        chartPosition: "BTN",
        preflop: { kind: "unknown" },
        streetActions: [],
      }),
      null
    );
  });
});

describe("board texture", () => {
  it("classifies monotone / paired / dry boards", () => {
    assert.strictEqual(
      analyzeBoard([c(9, "s"), c(7, "s"), c(2, "s")]).texture,
      "monotone"
    );
    assert.strictEqual(
      analyzeBoard([c(9, "s"), c(9, "d"), c(2, "h")]).texture,
      "paired_dry"
    );
    assert.strictEqual(
      analyzeBoard([c(14, "s"), c(13, "d"), c(2, "h")]).texture,
      "dry"
    );
  });
});

describe("postflop advice", () => {
  it("never value-bets a non-flush made hand on a monotone board", () => {
    const advice = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(14, "h"), c(13, "d")],
        board: [c(9, "s"), c(7, "s"), c(2, "s"), c(5, "s"), c(3, "d")],
        pot: 500,
        currentBet: 0,
        heroRemaining: 500,
        activeVillainCount: 2,
        isPreflopAggressor: true,
      })
    );
    assert.strictEqual(advice.recommended, "check");
    assert.strictEqual(advice.actionDistribution.check, 100);
  });

  it("bets a river full house for value", () => {
    const advice = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(9, "h"), c(9, "d")],
        board: [c(9, "s"), c(7, "s"), c(2, "c"), c(7, "h"), c(3, "d")],
        pot: 500,
        heroRemaining: 500,
      })
    );
    assert.strictEqual(advice.recommended, "bet");
    assert.ok((advice.recommendedSizeChips || 0) > 0);
    assert.strictEqual(advice.actionDistribution.bet, 90);
  });

  it("exposes the bet size when a 50/50 check-bet mix recommends check", () => {
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(11, "c"), c(9, "d")],
        board: [c(8, "d"), c(10, "s"), c(2, "s")],
        pot: 14,
        heroRemaining: 133,
        effectiveStackBB: 69.5,
        heroInPosition: false,
        isPreflopAggressor: true,
      })
    );
    assert.strictEqual(advice.recommended, "check");
    assert.strictEqual(advice.actionDistribution.check, 50);
    assert.strictEqual(advice.actionDistribution.bet, 50);
    assert.strictEqual(advice.recommendedSizeChips, 11);
    assert.strictEqual(advice.recommendedSizeBB, 5.5);
  });

  it("keeps the bet-branch size when a check-first mix still bets sometimes", () => {
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(7, "c"), c(2, "d")],
        board: [c(14, "s"), c(8, "h"), c(3, "d")],
        pot: 14,
        heroRemaining: 133,
        effectiveStackBB: 69.5,
        heroInPosition: false,
        isPreflopAggressor: true,
      })
    );
    assert.strictEqual(advice.recommended, "check");
    assert.ok(
      advice.actionDistribution.bet > 0,
      `expected a bet branch, got ${JSON.stringify(advice.actionDistribution)}`
    );
    assert.ok(
      advice.recommendedSizeChips !== undefined &&
        advice.recommendedSizeChips > 0,
      "bet-branch size should be exposed for display"
    );
  });

  it("folds junk facing a big multiway bet with bad equity", () => {
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(7, "h"), c(2, "d")],
        board: [c(14, "s"), c(13, "d"), c(12, "h")],
        pot: 100,
        currentBet: 80,
        heroBet: 0,
        toCall: 80,
        heroRemaining: 420,
        activeVillainCount: 2,
        isPreflopAggressor: false,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(advice.recommended, "fold");
  });

  it("calls with a strong draw when the price is right (heads-up)", () => {
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(14, "h"), c(13, "h")],
        board: [c(9, "h"), c(7, "h"), c(2, "c")],
        pot: 300,
        currentBet: 100,
        heroBet: 0,
        toCall: 100,
        heroRemaining: 900,
        isPreflopAggressor: false,
        streetBetCount: 1,
      })
    );
    assert.ok(
      advice.recommended === "call" || advice.recommended === "raise",
      `flush draw should continue, got ${advice.recommended}`
    );
  });

  it("caps bet/raise sizes to the hero's remaining stack (all-in)", () => {
    const advice = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(9, "h"), c(9, "d")],
        board: [c(9, "s"), c(7, "s"), c(2, "c"), c(7, "h"), c(3, "d")],
        pot: 500,
        heroRemaining: 100,
      })
    );
    // River full house wants ~0.9 pot = 450, but only 100 is left -> all-in.
    assert.ok(
      advice.recommended === "allin" ||
        (advice.recommendedSizeChips || 0) <= 100,
      `got ${advice.recommended} ${advice.recommendedSizeChips}`
    );
  });

  it("surfaces approximations and practical offsets on the advice", () => {
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(7, "h"), c(2, "d")],
        board: [c(14, "s"), c(13, "d"), c(12, "h")],
        pot: 100,
        currentBet: 80,
        heroBet: 0,
        toCall: 80,
        heroRemaining: 420,
        activeVillainCount: 2,
        isPreflopAggressor: false,
        streetBetCount: 1,
      })
    );
    assert.ok(advice.limitations.length >= 2, "should list approximations");
    assert.ok(
      advice.limitations.some((l) => l.includes("多人")),
      "multiway approximation should be listed"
    );
    assert.ok(advice.adjustments.length >= 3, "should list practical offsets");
    assert.ok(
      advice.adjustments.some((a) => a.includes("多人")),
      "multiway offset should be present"
    );
    assert.ok(
      advice.adjustments.some((a) => a.includes("对手")),
      "opponent-based offset should be present"
    );
  });
});

describe("postflop trust labels", () => {
  // `trust` must name the mechanism that PICKED the action, so an advice
  // card never presents a hand-written rule as a distilled-model output.

  it("labels heads-up first-to-act spots as rule, not model", () => {
    // Not facing a bet => leadBetProbability decides alone; the net's
    // bet/check head is measurably inverted here (see lead.ts).
    const advice = getPostflopAdvice(sit({ activeVillainCount: 1 }));
    assert.strictEqual(advice.trust, "rule");
  });

  it("labels a heads-up net decision facing a bet as model", () => {
    const advice = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(9, "h"), c(9, "s")],
        board: [c(9, "d"), c(9, "c"), c(2, "c"), c(5, "h"), c(3, "d")],
        pot: 400,
        currentBet: 120,
        heroBet: 0,
        toCall: 120,
        heroRemaining: 900,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(advice.trust, "model");
  });

  it("labels the multiway path as heuristic", () => {
    const advice = getPostflopAdvice(sit({ activeVillainCount: 2 }));
    assert.strictEqual(advice.trust, "heuristic");
  });

  it("labels an anti-punt override as heuristic, not model", () => {
    // QT on a double-paired 8877 turn: 2% equity against the continuing
    // range, so the pot-odds floor vetoes the net's own choice. The floor is
    // a range-equity calculation, so the label must follow it.
    const advice = getPostflopAdvice(
      sit({
        street: "turn",
        heroCards: [c(10, "d"), c(12, "c")],
        board: [c(8, "h"), c(7, "s"), c(8, "s"), c(7, "c")],
        pot: 100,
        currentBet: 60,
        heroBet: 0,
        toCall: 60,
        heroRemaining: 900,
        activeVillainCount: 1,
        isPreflopAggressor: false,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(advice.recommended, "fold");
    assert.ok(
      /anti-punt/.test(advice.reasoning || ""),
      `expected the anti-punt floor to fire, got: ${advice.reasoning}`
    );
    assert.strictEqual(advice.trust, "heuristic");
  });

  it("never claims a neural net produced a rule-labelled recommendation", () => {
    // The limitations block is rendered on the same card as the badge, so
    // it must not say "蒸馏神经网络" while the badge says 简化规则.
    const lead = getPostflopAdvice(sit({ activeVillainCount: 1 }));
    assert.strictEqual(lead.trust, "rule");
    assert.ok(
      !lead.limitations.some((l) => l.includes("神经网络")),
      `rule-labelled advice must not cite the net: ${JSON.stringify(lead.limitations)}`
    );
    assert.ok(lead.limitations.some((l) => l.includes("规则策略")));

    const net = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(9, "h"), c(9, "s")],
        board: [c(9, "d"), c(9, "c"), c(2, "c"), c(5, "h"), c(3, "d")],
        pot: 400,
        currentBet: 120,
        heroBet: 0,
        toCall: 120,
        heroRemaining: 900,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(net.trust, "model");
    assert.ok(net.limitations.some((l) => l.includes("神经网络")));
  });

  it("keeps the model label when the net folds on its own", () => {
    // Same shape, but here the net itself wants to fold — no guard fires, so
    // the label must NOT be downgraded.
    const advice = getPostflopAdvice(
      sit({
        heroCards: [c(7, "h"), c(2, "d")],
        board: [c(14, "s"), c(13, "d"), c(12, "h")],
        pot: 100,
        currentBet: 80,
        heroBet: 0,
        toCall: 80,
        heroRemaining: 420,
        activeVillainCount: 1,
        isPreflopAggressor: false,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(advice.recommended, "fold");
    assert.strictEqual(advice.trust, "model");
  });
});

describe("postflop raise sizing", () => {
  it("sizes net-driven raises from the model's size head", () => {
    const advice = getPostflopAdvice(
      sit({
        street: "river",
        heroCards: [c(9, "h"), c(9, "s")],
        board: [c(9, "d"), c(9, "c"), c(2, "c"), c(5, "h"), c(3, "d")],
        pot: 400,
        currentBet: 120,
        heroBet: 0,
        toCall: 120,
        heroRemaining: 900,
        streetBetCount: 1,
      })
    );
    assert.strictEqual(advice.recommended, "raise");
    // currentBet + fraction * pot, where fraction is one of the model's
    // pot-fraction buckets — never the old flat 2.5x-the-bet formula.
    const buckets = [0.4, 0.66, 0.85, 1.25, 2.0];
    const size = advice.recommendedSizeChips!;
    assert.ok(
      buckets.some((f) => Math.abs(size - (120 + f * 400)) <= 2),
      `raise size ${size} should match a model size bucket off 120 + f*400`
    );
  });
});

describe("postflop advice from game state", () => {
  function makeState(over: {
    seats: string[];
    acting: string;
    round: number;
    board: { num: number; suit: string }[];
    heroCards: { num: number; suit: string }[];
    bets: Record<string, number>;
    totalBets?: Record<string, number>;
    actionHistory?: {
      round: number;
      type: string;
      token: string;
      amount?: number;
    }[];
    positionLabel?: string;
  }) {
    const totalBets = over.totalBets || {};
    const players: Record<string, any> = {};
    for (const seat of over.seats) {
      players[seat] = {
        bet: over.bets[seat] || 0,
        totalBets: totalBets[seat] ?? over.bets[seat] ?? 0,
        stack: 200,
        isFolded: false,
        isAllIn: false,
        hands: seat === over.acting ? over.heroCards : [],
      };
    }
    return {
      round: over.round,
      sortedUsers: over.seats,
      players,
      boardCards: over.board,
      bbChips: 2,
      actingToken: over.acting,
      actionHistory: over.actionHistory || [],
      heroPositionLabel: over.positionLabel,
    };
  }

  it("builds flop advice for the heads-up big blind (in position)", () => {
    const advice = buildPostflopAdvice(
      makeState({
        seats: ["SB", "BB"],
        acting: "BB",
        round: 1,
        board: [
          { num: 9, suit: "d" },
          { num: 7, suit: "h" },
          { num: 2, suit: "c" },
        ],
        heroCards: [
          { num: 9, suit: "h" },
          { num: 9, suit: "s" },
        ],
        bets: { SB: 60, BB: 60 },
        totalBets: { SB: 122, BB: 122 },
        actionHistory: [
          { round: 0, type: "raise", token: "BB" },
          { round: 0, type: "call", token: "SB" },
          { round: 1, type: "bet", token: "SB", amount: 60 },
          { round: 1, type: "call", token: "BB", amount: 60 },
        ],
        positionLabel: "BB",
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.street, "flop");
    assert.strictEqual(advice!.heroPosition, "IP");
    assert.strictEqual(advice!.heroPositionLabel, "BB");
    assert.strictEqual(advice!.heroHandKey, "99");
  });

  it("returns null on the preflop round", () => {
    const advice = buildPostflopAdvice(
      makeState({
        seats: ["SB", "BB"],
        acting: "BB",
        round: 0,
        board: [
          { num: 9, suit: "d" },
          { num: 7, suit: "h" },
          { num: 2, suit: "c" },
        ],
        heroCards: [
          { num: 9, suit: "h" },
          { num: 9, suit: "s" },
        ],
        bets: { SB: 1, BB: 2 },
      })
    );
    assert.strictEqual(advice, null);
  });
});
