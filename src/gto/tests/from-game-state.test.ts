import * as assert from "assert";
import { buildPreflopAdvice } from "../preflop/from-game-state";
import type {
  GamePlayerState,
  PreflopGameStateInput,
} from "../preflop/from-game-state";

type Seat = string;
type CardInput = { num: number; suit: string };

function makeInput(opts: {
  seats: Seat[];
  bets: Record<string, number>;
  stack?: number;
  acting: string;
  heroCards?: CardInput[];
  lastRaiser?: string;
  raiseCount?: number;
  bb?: number;
}): PreflopGameStateInput {
  const stack = opts.stack ?? 200;
  const bb = opts.bb ?? 2;
  const players: Record<string, GamePlayerState> = {};
  for (const seat of opts.seats) {
    players[seat] = {
      bet: opts.bets[seat] || 0,
      stack,
      isFolded: false,
      hands:
        seat === opts.acting && opts.heroCards
          ? opts.heroCards
          : [],
    };
  }
  return {
    sortedUsers: opts.seats,
    players,
    bbChips: bb,
    actingToken: opts.acting,
    lastRaiserToken: opts.lastRaiser,
    raiseCount: opts.raiseCount,
  };
}

const AH = { num: 14, suit: "h" };
const KH = { num: 13, suit: "h" };
const TD = { num: 10, suit: "d" };
const TS = { num: 10, suit: "s" };
const SEVEN_TWO = [
  { num: 7, suit: "c" },
  { num: 2, suit: "s" },
];

describe("preflop advice from game state", () => {
  it("BTN unopened 6-max: raise 2.5bb", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        acting: "BTN",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "BTN");
    assert.strictEqual(advice!.scenario, "unopened");
    assert.strictEqual(advice!.recommended, "raise");
    assert.strictEqual(advice!.recommendedSizeBB, 2.5);
    assert.strictEqual(advice!.hero!.hand, "AKs");
  });

  it("BB unopened: check", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        acting: "BB",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "unopened");
    assert.strictEqual(advice!.recommended, "call");
  });

  it("BB vs BTN open 2.5bb: AA 3bets to 10bb", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, BTN: 5 },
        acting: "BB",
        lastRaiser: "BTN",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-open");
    assert.strictEqual(advice!.villainPosition, "BTN");
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 10);
  });

  it("CO with a limper: isolation raise 5bb", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, UTG: 2 },
        acting: "CO",
        heroCards: [
          { num: 14, suit: "s" },
          { num: 5, suit: "s" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "iso");
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 5);
  });

  it("BTN facing a BB 3bet: vs-3bet", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1, BB: 14, BTN: 5 },
        acting: "BTN",
        lastRaiser: "BB",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-3bet");
    assert.strictEqual(advice!.villainPosition, "BB");
    assert.strictEqual(advice!.hero!.action, "allin");
  });

  it("CO 4bet facing a BB 5bet: vs-4bet", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "BTN"],
        bets: { SB: 1, BB: 100, CO: 48, BTN: 20 },
        acting: "CO",
        lastRaiser: "BB",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-4bet");
    assert.strictEqual(advice!.villainPosition, "BB");
    assert.strictEqual(advice!.hero!.action, "allin");
  });

  it("heads-up BB 3bet faces an all-in 4bet jam: vs-4bet", () => {
    // Real hand: BTN/SB opens 3bb, BB 3bets to 14bb, BTN/SB jams 100bb.
    // The jam overwrites the open, so the bet levels are [2, 28, 200] and
    // the raise counter (3) is what keeps the spot classified correctly.
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["BTN", "BB"],
        bets: { BTN: 200, BB: 28 },
        acting: "BB",
        lastRaiser: "BTN",
        raiseCount: 3,
        heroCards: [
          { num: 13, suit: "s" },
          { num: 10, suit: "s" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-4bet");
    assert.strictEqual(advice!.villainPosition, "SB");
    assert.strictEqual(advice!.hero!.hand, "KTs");
    assert.strictEqual(advice!.hero!.action, "fold");
  });

  it("heads-up SB open faces a BB 3bet: vs-3bet", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["BTN", "BB"],
        bets: { BTN: 6, BB: 28 },
        acting: "BTN",
        lastRaiser: "BB",
        raiseCount: 2,
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-3bet");
    assert.strictEqual(advice!.villainPosition, "BB");
    assert.strictEqual(advice!.hero!.action, "allin");
  });

  it("BB with only a blind in facing a cold 4bet: vs-4bet", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1, BB: 2, BTN: 100 },
        acting: "BB",
        lastRaiser: "BTN",
        raiseCount: 3,
        heroCards: [TD, TS],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-4bet");
    assert.strictEqual(advice!.villainPosition, "BTN");
  });

  it("folds weak hand: 72o folds to an open", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, BTN: 5 },
        acting: "BB",
        lastRaiser: "BTN",
        heroCards: SEVEN_TWO,
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.hero!.action, "fold");
  });

  it("returns null without hero hole cards or with an actor as last raiser", () => {
    const noCards = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1, BB: 2 },
        acting: "BTN",
      })
    );
    assert.strictEqual(noCards, null);

    const lastRaiserActing = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1, BB: 2, BTN: 6 },
        acting: "BTN",
        lastRaiser: "BTN",
        heroCards: [TD, TS],
      })
    );
    assert.strictEqual(lastRaiserActing, null);
  });

  it("heads-up: button seat maps to SB chart", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["BTN", "BB"],
        bets: { BTN: 1, BB: 2 },
        acting: "BTN",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "SB");
    assert.strictEqual(advice!.scenario, "unopened");
  });
});
