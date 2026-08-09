import { assert } from "chai";
import { PlayerAnalyticsStore } from "../analytics/player-analytics";
import {
  benchmarkMarker,
  benchmarkStatus,
  PLAYER_ANALYTICS_BENCHMARKS,
} from "../../shared/playerAnalyticsBenchmarks";

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

    const report = store.getReport(token, "all");
    assert.equal(report.core.hands, 1);
    assert.equal(report.core.vpip.value, 100);
    assert.equal(report.core.pfr.value, 100);
    assert.equal(report.core.wentToShowdown.value, 100);
    assert.equal(report.core.wonAtShowdown.value, 100);
    assert.equal(report.core.gtoAlignment.value, 75);
    assert.equal(report.core.netBB, 6.5);
    assert.equal(report.positions[0].position, "BTN");
    assert.equal(report.streets[0].aggressionFrequency, 100);
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

    const report = store.getReport(token, "all");
    assert.equal(report.core.threeBet.denominator, 2);
    assert.equal(report.core.threeBet.numerator, 1);
    assert.equal(report.core.threeBet.value, 50);
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
