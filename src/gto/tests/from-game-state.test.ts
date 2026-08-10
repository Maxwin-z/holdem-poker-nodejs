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
  stacks?: Record<string, number>;
  folded?: string[];
  allIn?: string[];
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
      stack: (opts.stacks && opts.stacks[seat]) ?? stack,
      isFolded: Boolean(opts.folded?.includes(seat)),
      isAllIn: Boolean(opts.allIn?.includes(seat)),
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

  it("6-max: 第 1 行动者显示为 UTG 并按 UTG 图表处理（3bb RFI）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        acting: "CO",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "UTG");
    assert.strictEqual(advice!.heroPositionLabel, "UTG");
    assert.strictEqual(advice!.scenario, "unopened");
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 3);
  });

  it("6-max: 游戏 CO 开池 -> MP 面对（映射为 MP vs UTG，不再抛异常）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, CO: 6 },
        acting: "MP",
        lastRaiser: "CO",
        heroCards: [TD, TS],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "MP");
    assert.strictEqual(advice!.villainPosition, "UTG");
    assert.strictEqual(advice!.scenario, "vs-open");
  });

  it("多人局：英雄深码而他人短码时，按英雄自身筹码正常开池（不改为全下）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        stacks: { SB: 215, BB: 3, CO: 215, MP: 215, UTG: 215, BTN: 215 },
        acting: "CO",
        heroCards: [
          { num: 8, suit: "c" },
          { num: 8, suit: "h" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.stackBB, 107.5);
    assert.strictEqual(advice!.recommended, "raise");
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 3);
    assert.ok(!advice!.notes.some((n) => n.includes("短码")));
  });

  it("多人局：英雄自己是最短筹码时，仍按自身筹码全下", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        stacks: { SB: 215, BB: 215, CO: 3, MP: 215, UTG: 215, BTN: 215 },
        acting: "CO",
        heroCards: [
          { num: 8, suit: "c" },
          { num: 8, suit: "h" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.stackBB, 1.5);
    assert.strictEqual(advice!.hero!.action, "allin");
    assert.strictEqual(advice!.hero!.sizeBB, 1.5);
  });

  it("单挑：深码英雄面对短码对手时按有效筹码加注，不把自己全部筹码推出", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["BTN", "BB"],
        bets: { BTN: 1, BB: 2 },
        stacks: { BTN: 215, BB: 3 },
        acting: "BTN",
        heroCards: [
          { num: 8, suit: "c" },
          { num: 8, suit: "h" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.stackBB, 1.5);
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 2);
  });

  it("三人桌：100 筹码 BB 不会把 Dealer 对 1000 筹码 SB 的尺度限制到 100", () => {
    const unopened = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 10, BB: 20 },
        stacks: { SB: 1000, BB: 100, BTN: 2000 },
        acting: "BTN",
        heroCards: [AH, { num: 14, suit: "d" }],
        bb: 20,
      })
    );
    assert.ok(unopened);
    assert.strictEqual(unopened!.stackBB, 50);
    assert.deepStrictEqual(unopened!.opponentEffectiveStacksBB, [50, 5]);
    assert.strictEqual(unopened!.hero!.action, "raise");
    assert.strictEqual(unopened!.hero!.sizeChips, 50);

    const facingShortJam = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 10, BB: 100 },
        stacks: { SB: 1000, BB: 100, BTN: 2000 },
        allIn: ["BB"],
        acting: "BTN",
        lastRaiser: "BB",
        raiseCount: 1,
        heroCards: [AH, { num: 14, suit: "d" }],
        bb: 20,
      })
    );
    assert.ok(facingShortJam);
    assert.strictEqual(facingShortJam!.liveResponderEffectiveStackBB, 50);
    assert.strictEqual(facingShortJam!.hero!.action, "raise");
    assert.strictEqual(facingShortJam!.hero!.sizeChips, 350);
  });

  it("投入 900/1000 后只需补 100 时按真实底池赔率取消弃牌", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1000, BB: 20, BTN: 900 },
        stacks: { SB: 3000, BB: 3000, BTN: 1000 },
        acting: "BTN",
        lastRaiser: "SB",
        raiseCount: 3,
        heroCards: [
          { num: 7, suit: "h" },
          { num: 6, suit: "h" },
        ],
        bb: 20,
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.amountToCallBB, 5);
    assert.ok(advice!.callPotOdds! < 0.06);
    assert.strictEqual(advice!.hero!.action, "call");
    assert.deepStrictEqual(advice!.hero!.actionDistribution, {
      fold: 0,
      call: 100,
      raise: 0,
      allin: 0,
    });
  });

  it("常规 3bet 加到 900/1000 会按套池阈值改为直接全下", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 10, BB: 20, BTN: 225 },
        stacks: { SB: 3000, BB: 1000, BTN: 3000 },
        acting: "BB",
        lastRaiser: "BTN",
        raiseCount: 1,
        heroCards: [AH, { num: 14, suit: "d" }],
        bb: 20,
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.hero!.action, "allin");
    assert.strictEqual(advice!.hero!.sizeChips, 1000);
    assert.ok(advice!.notes.some((note) => note.includes("套池阈值")));
  });

  it("深码英雄面对唯一短码全下者时只跟到有效筹码，不超额全下", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "BTN"],
        bets: { SB: 1000, BB: 20, BTN: 900 },
        stacks: { SB: 1000, BB: 3000, BTN: 3000 },
        folded: ["BB"],
        allIn: ["SB"],
        acting: "BTN",
        lastRaiser: "SB",
        raiseCount: 3,
        heroCards: [AH, { num: 14, suit: "d" }],
        bb: 20,
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.stackBB, 50);
    assert.strictEqual(advice!.hero!.action, "call");
    assert.strictEqual(advice!.hero!.sizeChips, undefined);
  });

  it("6-max: 游戏 CO 开池 -> 游戏 UTG 面对（映射为 CO vs UTG，走通用兜底）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, CO: 6 },
        acting: "UTG",
        lastRaiser: "CO",
        heroCards: SEVEN_TWO,
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "CO");
    assert.strictEqual(advice!.villainPosition, "UTG");
    assert.strictEqual(advice!.scenario, "vs-open");
    assert.strictEqual(advice!.hero!.action, "fold");
    assert.ok(
      advice!.notes.some((n) => n.includes("通用"))
    );
  });

  it("6-max: 第 3 行动者显示为 CO 并按 CO 图表开池（2.5bb RFI）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2 },
        acting: "UTG",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "CO");
    assert.strictEqual(advice!.heroPositionLabel, "CO");
    assert.strictEqual(advice!.scenario, "unopened");
    assert.strictEqual(advice!.hero!.sizeBB, 2.5);
  });

  it("iso: 游戏 CO 平跟后，游戏 MP 隔离加注（MP 图表）", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["SB", "BB", "CO", "MP", "UTG", "BTN"],
        bets: { SB: 1, BB: 2, CO: 2 },
        acting: "MP",
        heroCards: [AH, KH],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.heroPosition, "MP");
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
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 16);
  });

  it("第 8 手回归：深码 QQ 面对 13bb 3bet 只加注到 30bb", () => {
    const advice = buildPreflopAdvice(
      makeInput({
        seats: ["C", "Henry", "William", "Emma", "Chloe", "Grace", "Lily", "Mia"],
        bets: { C: 60, Henry: 260, Chloe: 60 },
        stacks: {
          C: 2070,
          Henry: 1760,
          William: 2290,
          Emma: 1940,
          Chloe: 2070,
          Grace: 1870,
          Lily: 2070,
          Mia: 1930,
        },
        folded: ["William", "Emma", "Grace", "Lily", "Mia"],
        acting: "Chloe",
        lastRaiser: "Henry",
        raiseCount: 2,
        bb: 20,
        heroCards: [
          { num: 12, suit: "s" },
          { num: 12, suit: "d" },
        ],
      })
    );
    assert.ok(advice);
    assert.strictEqual(advice!.scenario, "vs-3bet");
    assert.strictEqual(advice!.heroPosition, "MP");
    assert.strictEqual(advice!.heroPositionLabel, "LJ");
    assert.strictEqual(advice!.recommended, "raise");
    assert.strictEqual(advice!.recommendedSizeBB, 30);
    assert.strictEqual(advice!.recommendedSizeChips, 600);
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
    assert.strictEqual(advice!.hero!.action, "raise");
    assert.strictEqual(advice!.hero!.sizeBB, 32);
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
