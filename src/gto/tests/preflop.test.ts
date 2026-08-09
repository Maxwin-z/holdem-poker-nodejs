import * as assert from "assert";
import {
  applyCalibration,
  applyMultiwayTightening,
  chartPositionByActionOrder,
  chartCombos,
  comboCount,
  distanceFromButton,
  getPreflopAdvice,
  handStrength,
  normalizeHandKey,
  normalizePlayerCount,
  positionForDistance,
  positionsForGame,
  resolveChart,
} from "../preflop";
import type { PreflopSituation } from "../preflop";

const base = (over: Partial<PreflopSituation>): PreflopSituation => ({
  playerCount: 6,
  heroPosition: "BTN",
  effectiveStackBB: 100,
  scenario: "unopened",
  ...over,
});

describe("preflop GTO engine", () => {
  it("normalizes player count (10 -> 9, rejects out of range)", () => {
    assert.strictEqual(normalizePlayerCount(10), 9);
    assert.strictEqual(normalizePlayerCount(6), 6);
    assert.throws(() => normalizePlayerCount(1));
    assert.throws(() => normalizePlayerCount(11));
    assert.throws(() => normalizePlayerCount(NaN));
  });

  it("maps seats for 2-9 handed games", () => {
    assert.strictEqual(positionForDistance(9, 0).label, "BTN");
    assert.strictEqual(positionForDistance(9, 1).label, "SB");
    assert.strictEqual(positionForDistance(9, 2).label, "BB");
    assert.strictEqual(positionForDistance(9, 3).label, "CO");
    assert.strictEqual(positionForDistance(9, 4).label, "HJ");
    assert.strictEqual(positionForDistance(9, 5).label, "LJ");
    assert.strictEqual(positionForDistance(9, 6).label, "MP");
    assert.strictEqual(positionForDistance(9, 7).label, "UTG+1");
    assert.strictEqual(positionForDistance(9, 8).label, "UTG");

    assert.strictEqual(positionForDistance(9, 8).chart, "UTG");
    assert.strictEqual(positionForDistance(9, 7).chart, "UTG");
    assert.strictEqual(positionForDistance(9, 5).chart, "MP");
    assert.strictEqual(positionForDistance(9, 4).chart, "MP");

    // Heads-up: button posts the small blind.
    const hu = positionForDistance(2, 0);
    assert.strictEqual(hu.chart, "SB");
    assert.strictEqual(hu.headsUpButton, true);

    assert.strictEqual(positionForDistance(6, 5).label, "UTG");
    assert.strictEqual(positionForDistance(5, 3).label, "CO");
    assert.strictEqual(positionForDistance(5, 4).label, "UTG");
    assert.strictEqual(positionsForGame(4).map((p) => p.label).join(","), "BTN,SB,BB,CO");
  });

  it("maps 2-10 handed games onto 6-max chart keys by action order", () => {
    const expected: Record<number, string[]> = {
      2: ["SB", "BB"],
      3: ["BTN", "SB", "BB"],
      4: ["CO", "BTN", "SB", "BB"],
      5: ["UTG", "CO", "BTN", "SB", "BB"],
      6: ["UTG", "MP", "CO", "BTN", "SB", "BB"],
      7: ["UTG", "MP", "MP", "CO", "BTN", "SB", "BB"],
      8: ["UTG", "MP", "MP", "MP", "CO", "BTN", "SB", "BB"],
      9: ["UTG", "UTG", "MP", "MP", "MP", "CO", "BTN", "SB", "BB"],
      10: ["UTG", "UTG", "UTG", "MP", "MP", "MP", "CO", "BTN", "SB", "BB"],
    };
    for (const [nStr, keys] of Object.entries(expected)) {
      const n = Number(nStr);
      const actual = Array.from({ length: n }, (_, i) =>
        chartPositionByActionOrder(n, i)
      );
      assert.deepStrictEqual(actual, keys, `${n}-handed action order`);
    }
  });

  it("resolveChart falls back instead of throwing for uncovered position pairs", () => {
    const coVsUtg = resolveChart("vs-open", "CO", "UTG");
    assert.ok(coVsUtg.chart);
    assert.strictEqual(coVsUtg.source, "generic fallback");
    assert.ok(coVsUtg.fallbackNote?.includes("通用"));

    const mpVsCo = resolveChart("vs-open", "MP", "CO");
    assert.ok(mpVsCo.chart);
    assert.strictEqual(mpVsCo.source, "generic fallback");

    const utgVsCo = resolveChart("vs-open", "UTG", "CO");
    assert.ok(utgVsCo.chart);
    assert.strictEqual(utgVsCo.source, "generic fallback");

    const btnVsMp3bet = resolveChart("vs-3bet", "BTN", "MP");
    assert.ok(btnVsMp3bet.chart);
    assert.strictEqual(btnVsMp3bet.source, "generic fallback");
  });

  it("computes distance from the button", () => {
    assert.strictEqual(distanceFromButton(4, 1, 6), 3);
    assert.strictEqual(distanceFromButton(1, 5, 6), 2);
    assert.strictEqual(distanceFromButton(0, 0, 3), 0);
    assert.throws(() => distanceFromButton(9, 0, 6));
  });

  it("parses hand keys and combo counts", () => {
    assert.strictEqual(normalizeHandKey("AhKh"), "AKs");
    assert.strictEqual(normalizeHandKey("ah kh"), "AKs");
    assert.strictEqual(normalizeHandKey("T9s"), "T9s");
    assert.strictEqual(normalizeHandKey("AA"), "AA");
    assert.strictEqual(normalizeHandKey("AKo"), "AKo");
    // Pocket pairs dealt as concrete cards must not get an "o" suffix,
    // otherwise the chart lookup (keys like "KK"/"AA") misses and folds.
    assert.strictEqual(normalizeHandKey("KsKd"), "KK");
    assert.strictEqual(normalizeHandKey("AhAd"), "AA");
    assert.strictEqual(normalizeHandKey("7c7h"), "77");
    assert.strictEqual(normalizeHandKey("KKo"), "KK");
    assert.strictEqual(comboCount("AA"), 6);
    assert.strictEqual(comboCount("AKs"), 4);
    assert.strictEqual(comboCount("AKo"), 12);
  });

  it("classifies hand strength tiers", () => {
    assert.strictEqual(handStrength("AA"), "strong");
    assert.strictEqual(handStrength("99"), "strong");
    assert.strictEqual(handStrength("AKo"), "strong");
    assert.strictEqual(handStrength("JTs"), "strong");
    assert.strictEqual(handStrength("88"), "medium");
    assert.strictEqual(handStrength("22"), "medium");
    assert.strictEqual(handStrength("A5s"), "medium");
    assert.strictEqual(handStrength("AJo"), "medium");
    assert.strictEqual(handStrength("KQo"), "medium");
    assert.strictEqual(handStrength("KTo"), "medium");
    assert.strictEqual(handStrength("QJo"), "medium");
    assert.strictEqual(handStrength("A9o"), "medium");
    assert.strictEqual(handStrength("T9s"), "medium");
    assert.strictEqual(handStrength("A2o"), "weak");
    assert.strictEqual(handStrength("K8o"), "weak");
    assert.strictEqual(handStrength("K2o"), "weak");
    assert.strictEqual(handStrength("Q8o"), "weak");
    assert.strictEqual(handStrength("K9o"), "weak");
    assert.strictEqual(handStrength("J9o"), "weak");
    assert.strictEqual(handStrength("72o"), "weak");
    assert.strictEqual(handStrength("32s"), "weak");
    assert.strictEqual(handStrength("98o"), "weak");
  });

  it("RFI ranges widen toward the button", () => {
    const combos = (pos: "UTG" | "MP" | "CO" | "BTN" | "SB") =>
      chartCombos(resolveChart("unopened", pos).chart!);
    assert.ok(combos("BTN") >= combos("CO"));
    assert.ok(combos("CO") >= combos("MP"));
    assert.ok(combos("MP") >= combos("UTG"));
  });

  it("BB with an unopened pot recommends check", () => {
    const a = getPreflopAdvice(
      base({ heroPosition: "BB", scenario: "unopened" })
    );
    assert.strictEqual(a.recommended, "call");
    assert.ok(a.notes.some((n) => n.includes("过牌")));
  });

  it("RFI sizing: UTG 3bb, BTN 2.5bb", () => {
    const utg = getPreflopAdvice(
      base({ heroPosition: "UTG", scenario: "unopened" })
    );
    assert.strictEqual(utg.recommended, "raise");
    assert.strictEqual(utg.recommendedSizeBB, 3);
    const btn = getPreflopAdvice(base({ scenario: "unopened" }));
    assert.strictEqual(btn.recommended, "raise");
    assert.strictEqual(btn.recommendedSizeBB, 2.5);
  });

  it("BB vs BTN open: AA raises to 10bb, 72o folds, call costs 1.5bb", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
        heroHand: "AA",
      })
    );
    assert.strictEqual(a.hero!.action, "raise");
    assert.strictEqual(a.hero!.sizeBB, 10);
    assert.ok(a.hero!.message.includes("10bb"));
    const weak = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
        heroHand: "72o",
      })
    );
    assert.strictEqual(weak.hero!.action, "fold");
    const agg = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
      })
    );
    const callAction = agg.actions.find((x) => x.action === "call")!;
    const raiseAction = agg.actions.find((x) => x.action === "raise")!;
    assert.ok(callAction);
    assert.strictEqual(callAction.sizeBB, undefined);
    assert.ok(raiseAction);
    assert.strictEqual(raiseAction.sizeBB, 10);
  });

  it("BTN vs UTG open: 3bet size is 3.5x", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "BTN",
        scenario: "vs-open",
        villainPosition: "UTG",
        openSizeBB: 3,
        heroHand: "AA",
      })
    );
    assert.strictEqual(a.hero!.sizeBB, 10.5);
  });

  it("authored fallback: MP vs UTG open and CO vs MP open", () => {
    const mp = getPreflopAdvice(
      base({
        heroPosition: "MP",
        scenario: "vs-open",
        villainPosition: "UTG",
        openSizeBB: 3,
        heroHand: "AA",
      })
    );
    assert.strictEqual(mp.hero!.action, "raise");
    assert.ok(mp.notes.some((n) => n.includes("本地标准近似表")));

    const co = getPreflopAdvice(
      base({
        heroPosition: "CO",
        scenario: "vs-open",
        villainPosition: "MP",
        openSizeBB: 2.5,
        heroHand: "A5s",
      })
    );
    assert.strictEqual(co.hero!.action, "raise");
  });

  it("vs 3bet: UTG vs BB 3bet -> AA jams, 99 calls, 72o folds", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "UTG",
        scenario: "vs-3bet",
        villainPosition: "BB",
        openSizeBB: 3,
        threeBetSizeBB: 12,
        heroHand: "AA",
      })
    );
    assert.strictEqual(a.hero!.action, "allin");
    assert.strictEqual(a.hero!.sizeBB, 100);

    const call = getPreflopAdvice(
      base({
        heroPosition: "UTG",
        scenario: "vs-3bet",
        villainPosition: "BB",
        openSizeBB: 3,
        threeBetSizeBB: 12,
        heroHand: "99",
      })
    );
    assert.strictEqual(call.hero!.action, "call");

    const weak = getPreflopAdvice(
      base({
        heroPosition: "UTG",
        scenario: "vs-3bet",
        villainPosition: "BB",
        openSizeBB: 3,
        threeBetSizeBB: 12,
        heroHand: "72o",
      })
    );
    assert.strictEqual(weak.hero!.action, "fold");
  });

  it("vs 4bet from the blinds uses the blind-defense charts", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-4bet",
        villainPosition: "UTG",
        openSizeBB: 3,
        threeBetSizeBB: 12,
        heroHand: "AA",
      })
    );
    assert.strictEqual(a.hero!.action, "allin");
  });

  it("vs 4bet in position: rule-based jam/fold", () => {
    const jam = getPreflopAdvice(
      base({
        heroPosition: "BTN",
        scenario: "vs-4bet",
        villainPosition: "UTG",
        openSizeBB: 3,
        threeBetSizeBB: 24,
        heroHand: "AA",
      })
    );
    assert.strictEqual(jam.hero!.action, "allin");
    const fold = getPreflopAdvice(
      base({
        heroPosition: "BTN",
        scenario: "vs-4bet",
        villainPosition: "UTG",
        openSizeBB: 3,
        threeBetSizeBB: 24,
        heroHand: "99",
      })
    );
    assert.strictEqual(fold.hero!.action, "fold");
  });

  it("ISO over limpers: CO with 2 limpers raises to 6bb", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "CO",
        scenario: "iso",
        limpers: 2,
        heroHand: "A5s",
      })
    );
    assert.strictEqual(a.hero!.action, "raise");
    assert.strictEqual(a.hero!.sizeBB, 6);
  });

  it("short stack: SB 10bb push/fold", () => {
    const shove = getPreflopAdvice(
      base({
        heroPosition: "SB",
        effectiveStackBB: 10,
        scenario: "unopened",
        heroHand: "A5s",
      })
    );
    assert.strictEqual(shove.hero!.action, "allin");
    const fold = getPreflopAdvice(
      base({
        heroPosition: "SB",
        effectiveStackBB: 10,
        scenario: "unopened",
        heroHand: "72o",
      })
    );
    assert.strictEqual(fold.hero!.action, "fold");
  });

  it("short stack: BB vs SB 15bb shove", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "BB",
        effectiveStackBB: 15,
        scenario: "vs-open",
        villainPosition: "SB",
        openSizeBB: 15,
        heroHand: "A8o",
      })
    );
    assert.strictEqual(a.hero!.action, "allin");
    const fold = getPreflopAdvice(
      base({
        heroPosition: "BB",
        effectiveStackBB: 15,
        scenario: "vs-open",
        villainPosition: "SB",
        openSizeBB: 15,
        heroHand: "K7o",
      })
    );
    assert.strictEqual(fold.hero!.action, "fold");
  });

  it("multiway tightening reduces marginal hands", () => {
    const chart = resolveChart("vs-open", "BB", "BTN").chart!;
    const before = chartCombos(chart);
    const after = chartCombos(applyMultiwayTightening(chart, 2));
    assert.ok(after < before);
    const a = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
        callers: 2,
      })
    );
    assert.ok(a.notes.some((n) => n.includes("多人底池")));
  });

  it("calibration: loose widens, tight narrows", () => {
    const chart = resolveChart("unopened", "BTN").chart!;
    assert.ok(
      chartCombos(applyCalibration(chart, "loose", "unopened")) >
        chartCombos(chart)
    );
    assert.ok(
      chartCombos(applyCalibration(chart, "tight", "unopened")) <
        chartCombos(chart)
    );
  });

  it("converts sizes to chips", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "UTG",
        scenario: "unopened",
        heroHand: "AA",
        bigBlindChips: 2,
      })
    );
    assert.strictEqual(a.recommendedSizeChips, 6);
    assert.strictEqual(a.hero!.sizeChips, 6);
  });

  it("preserves the exact hand's mixed strategy for bot sampling", () => {
    const advice = getPreflopAdvice(
      base({
        heroPosition: "BTN",
        scenario: "unopened",
        heroHand: "K8o",
      })
    );
    assert.deepStrictEqual(advice.hero!.actionDistribution, {
      fold: 50,
      call: 0,
      raise: 50,
      allin: 0,
    });
  });

  it("provides range grids and the hero hand marker", () => {
    const a = getPreflopAdvice(
      base({
        heroPosition: "UTG",
        scenario: "unopened",
        heroHand: "AhKh",
      })
    );
    assert.strictEqual(a.rangeGrid.rows.length, 13);
    assert.strictEqual(a.rangeGrid.cols.length, 13);
    assert.strictEqual(a.rangeGrid.cells.length, 13);
    for (const row of a.rangeGrid.cells) {
      assert.strictEqual(row.length, 13);
    }
    assert.strictEqual(a.heroHandKey, "AKs");
    // AKs on the UTG RFI grid: row A (0), col K (1) -> raise (code 2).
    assert.strictEqual(a.rangeGrid.cells[0][1], 2);

    assert.ok(a.rfiGrids.UTG);
    assert.ok(a.rfiGrids.MP);
    assert.ok(a.rfiGrids.CO);
    assert.ok(a.rfiGrids.BTN);
    assert.ok(a.rfiGrids.SB);
    assert.strictEqual(a.rfiGrids.BB, undefined);

    const b = getPreflopAdvice(
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
        heroHand: "AA",
      })
    );
    // AA on the BB-vs-BTN grid: (0,0) -> raise (code 2).
    assert.strictEqual(b.rangeGrid.cells[0][0], 2);
  });

  it("treats 10 players as 9", () => {
    const a = getPreflopAdvice(base({ playerCount: 10 }));
    assert.strictEqual(a.playerCount, 9);
    assert.ok(a.notes.some((n) => n.includes("10 人局按 9 人局")));
  });

  it("action distribution sums to ~100 for every scenario", () => {
    const cases: PreflopSituation[] = [
      base({}),
      base({ heroPosition: "UTG" }),
      base({
        heroPosition: "BB",
        scenario: "vs-open",
        villainPosition: "BTN",
        openSizeBB: 2.5,
      }),
      base({
        heroPosition: "UTG",
        scenario: "vs-3bet",
        villainPosition: "BB",
        openSizeBB: 3,
        threeBetSizeBB: 12,
      }),
      base({ heroPosition: "CO", scenario: "iso", limpers: 1 }),
      base({ heroPosition: "SB", effectiveStackBB: 10 }),
    ];
    for (const c of cases) {
      const d = getPreflopAdvice(c).actionDistribution;
      const sum = d.fold + d.call + d.raise + d.allin;
      assert.ok(
        Math.abs(sum - 100) < 1.5,
        `distribution ${JSON.stringify(d)} does not sum to 100 (${sum})`
      );
    }
  });

  it("surfaces approximations and practical offsets on the advice", () => {
    const advice = getPreflopAdvice(
      base({
        heroHand: "AKs",
        scenario: "vs-open",
        villainPosition: "UTG",
        effectiveStackBB: 100,
      })
    );
    assert.ok(advice.limitations.length >= 1);
    assert.ok(
      advice.limitations.some((l) => l.includes("100bb")),
      "should note the 100bb baseline approximation"
    );
    assert.ok(advice.adjustments.length >= 2);
    assert.ok(
      advice.adjustments.some((a) => a.includes("对手")),
      "should include opponent-based offsets"
    );
  });
});
