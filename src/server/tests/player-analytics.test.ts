import { assert } from "chai";
import { PlayerAnalyticsStore } from "../analytics/player-analytics";
import {
  benchmarkMarker,
  benchmarkStatus,
  combinedAnalyticsInsights,
  PLAYER_ANALYTICS_BENCHMARKS,
} from "../../shared/playerAnalyticsBenchmarks";
import type { PlayerAnalyticsCore, RateMetric } from "../../shared/playerAnalytics";

describe("player analytics SQLite store", () => {
  it("persists human hand, action, result and GTO analysis data", () => {
    const store = new PlayerAnalyticsStore(":memory:");
    const token = "analytics-user-token";
    const handId = "hand-1";

    store.beginHand({
      handId,
      roomId: "1001",
      playerCount: 2,
      hasBot: false,
      players: [{ token, name: "Alice", position: "BTN", stackBB: 100 }],
    });
    store.recordAction({
      handId,
      token,
      street: 0,
      position: "BTN",
      action: "raise",
      amountBB: 2.5,
      facingRaise: false,
      raiseLevel: 0,
      advice: {
        kind: "preflop",
        recommended: "raise",
        recommendedSizeBB: 2.5,
        actionDistribution: { fold: 20, call: 0, raise: 80, allin: 0 },
      } as any,
    });
    store.markSawFlop(handId, [token]);
    store.recordAction({
      handId,
      token,
      street: 1,
      position: "BTN",
      action: "bet",
      amountBB: 4,
      facingRaise: false,
      raiseLevel: 0,
      advice: {
        kind: "postflop",
        recommended: "bet",
        recommendedSizeBB: 4,
        actionDistribution: {
          fold: 0, check: 30, call: 0, bet: 70, raise: 0, allin: 0,
        },
      } as any,
    });
    store.recordSettlement({
      handId,
      token,
      profitBB: 6.5,
      won: true,
      showdown: true,
      final: true,
    });

    const report = store.getReport(token, 5000);
    assert.equal(report.core.hands, 1);
    assert.equal(report.core.vpip.value, 100);
    assert.equal(report.core.pfr.value, 100);
    assert.equal(report.core.wentToShowdown.value, 100);
    assert.equal(report.core.wonAtShowdown.value, 100);
    assert.equal(report.core.gtoAlignment.value, 75);
    assert.equal(report.core.netBB, 6.5);
    assert.equal(report.positions[0].position, "BTN");
    assert.equal(report.streets[0].aggressionFrequency, 100);
    // Both actions matched the recommendation: graded, zero EV loss.
    assert.equal(report.core.evLoss.scoredActions, 2);
    assert.equal(report.core.evLoss.totalBB, 0);
    assert.equal(report.core.evLoss.per100Hands, 0);
  });

  it("aggregates EV loss for negative-price calls into the report", () => {
    const store = new PlayerAnalyticsStore(":memory:");
    const token = "ev-loss-user";
    const handId = "hand-ev";
    store.beginHand({
      handId,
      roomId: "1003",
      playerCount: 2,
      hasBot: false,
      players: [{ token, name: "Cara", position: "BB", stackBB: 100 }],
    });
    // EV(call) = 0.2 × (10 + 5) − 5 = −2bb: calling burns 2bb.
    store.recordAction({
      handId,
      token,
      street: 2,
      position: "BB",
      action: "call",
      amountBB: 5,
      facingRaise: true,
      raiseLevel: 1,
      advice: {
        kind: "postflop",
        recommended: "fold",
        potBB: 10,
        toCallBB: 5,
        equityVsRange: 0.2,
        actionDistribution: {
          fold: 100, check: 0, call: 0, bet: 0, raise: 0, allin: 0,
        },
      } as any,
    });
    store.recordSettlement({
      handId, token, profitBB: -5, won: false, showdown: true, final: true,
    });

    const report = store.getReport(token, 5000);
    assert.equal(report.core.evLoss.scoredActions, 1);
    assert.closeTo(report.core.evLoss.totalBB, 2, 0.001);
    assert.closeTo(report.core.evLoss.per100Hands!, 200, 0.1);
    assert.closeTo(report.streets[1].evLossBB!, 2, 0.001);
  });

  it("counts a 3-bet only when raising over an opening raise", () => {
    const store = new PlayerAnalyticsStore(":memory:");
    const token = "three-bet-user";

    ["raise", "call"].forEach((action, index) => {
      const handId = `hand-${index}`;
      store.beginHand({
        handId,
        roomId: "1002",
        playerCount: 6,
        hasBot: index === 0,
        players: [{ token, name: "Bob", position: "BB", stackBB: 100 }],
      });
      store.recordAction({
        handId,
        token,
        street: 0,
        position: "BB",
        action,
        amountBB: action === "raise" ? 9 : 2.5,
        facingRaise: true,
        raiseLevel: 1,
      });
      store.recordSettlement({
        handId,
        token,
        profitBB: 0,
        won: false,
        showdown: false,
        final: true,
      });
    });

    const report = store.getReport(token, 5000);
    assert.equal(report.core.threeBet.denominator, 2);
    assert.equal(report.core.threeBet.numerator, 1);
    assert.equal(report.core.threeBet.value, 50);
  });

  it("loads 100 hands without exceeding Durable Object binding limits", () => {
    const store = new PlayerAnalyticsStore(":memory:");
    const database = (store as any).db;
    (store as any).db = {
      exec: (sql: string) => database.exec(sql),
      prepare: (sql: string) => {
        const statement = database.prepare(sql);
        const guard = (method: "run" | "get" | "all") => (...params: any[]) => {
          assert.isAtMost(params.length, 100, "Cloudflare permits at most 100 bindings");
          return statement[method](...params);
        };
        return {
          run: guard("run"),
          get: guard("get"),
          all: guard("all"),
        };
      },
    };

    const token = "frequent-player";
    for (let index = 0; index < 100; index += 1) {
      const handId = `frequent-hand-${index}`;
      store.beginHand({
        handId,
        roomId: "1003",
        playerCount: 6,
        hasBot: false,
        players: [{ token, name: "Mainland", position: "BTN", stackBB: 100 }],
      });
      store.recordAction({
        handId,
        token,
        street: 0,
        position: "BTN",
        action: "call",
        amountBB: 2,
        facingRaise: true,
        raiseLevel: 1,
      });
      store.recordSettlement({
        handId,
        token,
        profitBB: 0,
        won: false,
        showdown: false,
        final: true,
      });
    }

    const report = store.getReport(token, 100);
    assert.equal(report.core.hands, 100);
    assert.equal(report.core.vpip.value, 100);
    assert.equal(report.core.threeBet.denominator, 100);
  });

  it("uses the standard AFq denominator and excludes checks", () => {
    const store = new PlayerAnalyticsStore(":memory:");
    const token = "afq-player";
    const handId = "afq-hand";
    store.beginHand({
      handId,
      roomId: "1004",
      playerCount: 2,
      hasBot: false,
      players: [{ token, name: "AFQ", position: "BTN", stackBB: 100 }],
    });
    ["check", "bet", "call", "fold"].forEach((action) => {
      store.recordAction({
        handId,
        token,
        street: 1,
        position: "BTN",
        action,
        facingRaise: false,
        raiseLevel: 0,
      });
    });
    store.recordSettlement({
      handId,
      token,
      profitBB: 0,
      won: false,
      showdown: false,
      final: true,
    });

    const report = store.getReport(token, 5000);
    assert.equal(report.core.aggressionFrequency.numerator, 1);
    assert.equal(report.core.aggressionFrequency.denominator, 3);
    assert.equal(report.core.aggressionFrequency.value, 33.3);
    assert.equal(report.streets[0].aggressionFrequency, 33.3);
  });
});

describe("player analytics reference systems", () => {
  it("uses tighter VPIP and PFR ranges for 9-max", () => {
    const six = PLAYER_ANALYTICS_BENCHMARKS["6max"].metrics;
    const nine = PLAYER_ANALYTICS_BENCHMARKS["9max"].metrics;
    assert.deepEqual([six.vpip.low, six.vpip.high], [21, 26]);
    assert.deepEqual([six.pfr.low, six.pfr.high], [18, 22]);
    assert.deepEqual([nine.vpip.low, nine.vpip.high], [14, 16]);
    assert.deepEqual([nine.pfr.low, nine.pfr.high], [11, 14]);
  });

  it("classifies values and clamps the visual marker", () => {
    const range = PLAYER_ANALYTICS_BENCHMARKS["6max"].metrics.vpip;
    assert.equal(benchmarkStatus(18, range), "low");
    assert.equal(benchmarkStatus(24, range), "standard");
    assert.equal(benchmarkStatus(35, range), "high");
    assert.equal(benchmarkMarker(100, range), 100);
  });
});

const metric = (value: number | null, denominator = 500): RateMetric => ({
  value,
  numerator: value === null ? 0 : Math.round((value / 100) * denominator),
  denominator,
});

function analyticsCore(overrides: Partial<PlayerAnalyticsCore>): PlayerAnalyticsCore {
  return {
    hands: 500,
    vpip: metric(24),
    pfr: metric(20),
    threeBet: metric(8, 100),
    aggressionFrequency: metric(48, 300),
    aggressionFactor: 3,
    wentToShowdown: metric(29, 200),
    wonAtShowdown: metric(51, 60),
    gtoAlignment: metric(null, 0),
    evLoss: { totalBB: 0, per100Hands: null, scoredActions: 0 },
    netBB: 0,
    bbPer100: 0,
    ...overrides,
  };
}

describe("player analytics combined diagnoses", () => {
  it("recognizes a loose-passive calling-station pattern", () => {
    const insights = combinedAnalyticsInsights(analyticsCore({
      vpip: metric(35),
      pfr: metric(22),
      wentToShowdown: metric(38, 200),
      wonAtShowdown: metric(43, 76),
    }), "6max");

    assert.include(insights.map((insight) => insight.title), "松弱跟注站倾向");
  });

  it("recognizes a loose-aggressive high-pressure pattern", () => {
    const insights = combinedAnalyticsInsights(analyticsCore({
      vpip: metric(32),
      pfr: metric(28),
      threeBet: metric(13, 120),
      aggressionFrequency: metric(61, 320),
      aggressionFactor: 4.8,
    }), "6max");

    assert.include(insights.map((insight) => insight.title), "松凶高压型倾向");
  });

  it("recognizes fit-or-fold from aggression and showdown together", () => {
    const insights = combinedAnalyticsInsights(analyticsCore({
      vpip: metric(18),
      pfr: metric(15),
      aggressionFrequency: metric(35, 240),
      aggressionFactor: 4.5,
      wentToShowdown: metric(23, 180),
      wonAtShowdown: metric(58, 42),
    }), "6max");

    assert.include(insights.map((insight) => insight.title), "Fit-or-Fold 倾向");
  });
});
