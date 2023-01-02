require("colors");
const assert = require("assert");

import { Card } from "../../ApiType";
import { userMap } from "../service";
import {
  NUMS,
  SUITS,
  _randomPickOne,
  parse,
  randomHands,
  cards2counters,
  isFlush,
  isStraight,
  maxCards,
  isStraightFlush,
  isFour,
  isFullHouse,
  isThreeKinds,
  isTwoPair,
  isPair,
  rank,
  PokerType,
  compare,
  hands2cards,
  prettify,
  PlayerInfo,
  settle,
} from "../utils/game-engine";

describe("Game Engine", () => {
  describe("_randomPickOne()", () => {
    it("每个都有概率被选择", () => {
      const items = [1, 2, 3];
      const results = new Array(10 * items.length)
        .fill(0)
        .map((_) => _randomPickOne(items));
      for (let i in items) {
        assert(results.indexOf(items[i]) >= 0);
      }
    });
  });

  describe("parse()", () => {
    it("hand -> card", () => {
      // console.log(parse(hands2cards("2d")));
      assert.deepEqual(parse(hands2cards("2d")), [{ num: 2, suit: "d" }]);
      assert.deepEqual(parse(hands2cards("2c")), [{ num: 2, suit: "c" }]);
      assert.deepEqual(parse(hands2cards("2s")), [{ num: 2, suit: "s" }]);
      assert.deepEqual(parse(hands2cards("2h")), [{ num: 2, suit: "h" }]);
    });

    it("suit sort", () => {
      assert.deepEqual(parse(hands2cards("14d14c14h14s")), [
        { num: 14, suit: "c" },
        { num: 14, suit: "d" },
        { num: 14, suit: "h" },
        { num: 14, suit: "s" },
      ]);
    });
    it("cards -> cards", () => {
      assert.deepEqual(
        parse([
          { num: 2, suit: "d" },
          { num: 2, suit: "c" },
        ]),
        [
          { num: 2, suit: "c" },
          { num: 2, suit: "d" },
        ]
      );
    });
    it("牌顺序正确", () => {
      assert.deepEqual(parse(hands2cards("2d3d")), [
        { num: 3, suit: "d" },
        { num: 2, suit: "d" },
      ]);
      assert.deepEqual(parse(hands2cards("2d3d14d")), [
        { num: 14, suit: "d" },
        { num: 3, suit: "d" },
        { num: 2, suit: "d" },
      ]);
      assert.deepEqual(parse(hands2cards("2d3d1d")), [
        { num: 3, suit: "d" },
        { num: 2, suit: "d" },
        { num: 1, suit: "d" },
      ]);
      assert.deepEqual(parse(hands2cards("2d3c1h")), [
        { num: 3, suit: "c" },
        { num: 2, suit: "d" },
        { num: 1, suit: "h" },
      ]);
    });
  });

  describe("maxCard", () => {
    it("maxCard", () => {
      assert.deepEqual(maxCards(hands2cards("2s3s4s5d6s")), [
        { num: 6, suit: "s" },
        { num: 5, suit: "d" },
        { num: 4, suit: "s" },
        { num: 3, suit: "s" },
        { num: 2, suit: "s" },
      ]);
      assert.deepEqual(maxCards(hands2cards("12c3d8s5d6s2h")), [
        { num: 12, suit: "c" },
        { num: 8, suit: "s" },
        { num: 6, suit: "s" },
        { num: 5, suit: "d" },
        { num: 3, suit: "d" },
      ]);
      assert.deepEqual(maxCards(hands2cards("2s3s4s5d6s"), "d"), [
        { num: 5, suit: "d" },
      ]);
      assert.deepEqual(maxCards(hands2cards("13d12d2d9d10s7d9s"), "d"), [
        { num: 13, suit: "d" },
        { num: 12, suit: "d" },
        { num: 9, suit: "d" },
        { num: 7, suit: "d" },
        { num: 2, suit: "d" },
      ]);
    });
  });

  describe("cards2counters", () => {
    it("check count", () => {
      assert.equal(cards2counters([])[2], 0);
      assert.equal(cards2counters(hands2cards("2s"))[3], 0);
      assert.equal(cards2counters(hands2cards("2s2d2c3s"))[2], 3);
      assert.equal(cards2counters(hands2cards("2s2d2c3s"))[3], 1);
      assert.equal(cards2counters(hands2cards("2s2d2c3s"))[4], 0);
      assert.equal(cards2counters(hands2cards("2s2d2c3s14s"))[13], 0);
      assert.equal(cards2counters(hands2cards("2s2d2c3s14s"))[14], 1);
      assert.equal(
        cards2counters([
          { num: 2, suit: "s" },
          { num: 2, suit: "d" },
        ])[2],
        2
      );
    });
  });

  describe("randomHands", () => {
    it("长度测试", () => {
      for (let i = 0; i <= 7; ++i) {
        assert.equal(randomHands(i).length, i);
      }
    });
    // it('牌型测试', () => {
    //   const hands = randomHands(52);
    //   for (let i in hands) {
    //     assert(new RegExp(`(${NUMS.join('|')})(${SUITS.join('|')})`).test(hands[i]));
    //   }
    // });
  });

  describe("isFlush", () => {
    // it("同花测试", () => {
    //   for (let i = 0; i < 1000; ++i) {
    //     const hands = randomHands(7);
    //     const r = isFlush(hands);
    //     const msg = `${JSON.stringify(hands)}, ${JSON.stringify(r) || "x"}`;
    //     console.log(r ? msg.green : msg);
    //   }
    // });
    it("empty hands", () => {
      assert.deepEqual(isFlush([]), []);
    });
    it("two cards", () => {
      assert.deepEqual(isFlush(hands2cards("2s3s")), []);
    });
    it("five cards no flush", () => {
      assert.deepEqual(isFlush(hands2cards("2s3s4s5s6c")), []);
    });
    it("five cards has flush", () => {
      assert.deepEqual(isFlush(hands2cards("2s3s4s5s6s")), [
        { num: 6, suit: "s" },
        { num: 5, suit: "s" },
        { num: 4, suit: "s" },
        { num: 3, suit: "s" },
        { num: 2, suit: "s" },
      ]);
    });

    it("seven cards has flush", () => {
      assert.deepEqual(isFlush(hands2cards("2s3s4s5c6s8s10c")), [
        { num: 8, suit: "s" },
        { num: 6, suit: "s" },
        { num: 4, suit: "s" },
        { num: 3, suit: "s" },
        { num: 2, suit: "s" },
      ]);
    });

    it("use cards as args", () => {
      assert.deepEqual(
        isFlush([
          { num: 8, suit: "s" },
          { num: 7, suit: "c" },
          { num: 6, suit: "s" },
          { num: 5, suit: "d" },
          { num: 4, suit: "s" },
          { num: 3, suit: "s" },
          { num: 2, suit: "s" },
        ]),
        [
          { num: 8, suit: "s" },
          { num: 6, suit: "s" },
          { num: 4, suit: "s" },
          { num: 3, suit: "s" },
          { num: 2, suit: "s" },
        ]
      );
    });

    it("isFlush", () => {
      assert.deepEqual(isFlush(hands2cards("2s3s4s5s")), []);
      assert.deepEqual(isFlush(hands2cards("2c5h11h13h8h11d4h")), [
        { num: 13, suit: "h" },
        { num: 11, suit: "h" },
        { num: 8, suit: "h" },
        { num: 5, suit: "h" },
        { num: 4, suit: "h" },
      ]);
      assert.deepEqual(isFlush(hands2cards("2d7c12s3d4d7d5d")), [
        { num: 7, suit: "d" },
        { num: 5, suit: "d" },
        { num: 4, suit: "d" },
        { num: 3, suit: "d" },
        { num: 2, suit: "d" },
      ]);
      assert.deepEqual(isFlush(hands2cards("2d7c12d3d4d7d5d")), [
        { num: 12, suit: "d" },
        { num: 7, suit: "d" },
        { num: 5, suit: "d" },
        { num: 4, suit: "d" },
        { num: 3, suit: "d" },
        { num: 2, suit: "d" },
      ]);
      assert.deepEqual(isFlush(hands2cards("2c3s4c5s6s7s")), []);
    });
  });

  describe("isStraight", () => {
    it("isStraight", () => {
      assert.deepEqual(isStraight([]), []);
      assert.deepEqual(isStraight(hands2cards("2s3s")), []);
      assert.deepEqual(
        isStraight(hands2cards("2s3s4s5s6s13d")).map((c) => c.num),
        [6, 5, 4, 3, 2]
      );
      assert.deepEqual(
        isStraight(hands2cards("2s3s4s5s6s6d13d")).map((c) => c.num),
        [6, 5, 4, 3, 2]
      );
      assert.deepEqual(
        isStraight(hands2cards("13s3s7d5s6s4d")).map((c) => c.num),
        [7, 6, 5, 4, 3]
      );
      assert.deepEqual(
        isStraight(hands2cards("2h5h3s7d5s6s4d")).map((c) => c.num),
        [7, 6, 5, 4, 3, 2]
      );
      assert.deepEqual(
        isStraight(hands2cards("13s14s12d11s6s10d9s")).map((c) => c.num),
        [14, 13, 12, 11, 10, 9]
      );
      assert.deepEqual(
        isStraight(hands2cards("13s14s2d3s4s5d")).map((c) => c.num),
        [5, 4, 3, 2, 1]
      );
      assert.deepEqual(
        isStraight(hands2cards("6s14s14d2d3s4s5d")).map((c) => c.num),
        [6, 5, 4, 3, 2]
      );
      assert.deepEqual(
        isStraight(hands2cards("5s14s14d2d3s4s5d")).map((c) => c.num),
        [5, 4, 3, 2, 1]
      );
      assert.deepEqual(
        isStraight(hands2cards("4s14s14d2d3s4s5d")).map((c) => c.num),
        [5, 4, 3, 2, 1]
      );
      assert.deepEqual(isStraight(hands2cards("2s3s13d5s6s7d")), []);
    });
  });

  describe("isStraightFlush", () => {
    it("isStraightFlush", () => {
      assert.deepEqual(
        isStraightFlush(hands2cards("2s3s4s5s6s7s")).map((c) => c.num),
        [7, 6, 5, 4, 3, 2]
      );
      assert.deepEqual(
        isStraightFlush(hands2cards("2s3s4s5d6s7s")).map((c) => c.num),
        []
      );
    });
  });

  describe("isFour", () => {
    // it("log", () => {
    //   console.log(isFour(hands2cards("2s2d2c2h13c7s")));
    // });
    it("isFour", () => {
      assert.deepEqual(
        isFour(hands2cards("2s2d2c2h6s7s")).map((c) => c.num),
        [2, 2, 2, 2, 7]
      );
      assert.deepEqual(
        isFour(hands2cards("14s14d14c14h13h7s")).map((c) => c.num),
        [14, 14, 14, 14, 13]
      );
      assert.deepEqual(isFour(hands2cards("2d2c2s3h3d4d")), []);
    });
  });

  describe("isFullHouse", () => {
    it("isFullHouse", () => {
      assert.deepEqual(
        isFullHouse(hands2cards("2s2d2c3s3d3c13s")).map((c) => c.num),
        [3, 3, 3, 2, 2]
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s2d2c3s3c4s5s")).map((c) => c.num),
        [2, 2, 2, 3, 3]
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s2d2c3s3d3c5s")).map((c) => c.num),
        [3, 3, 3, 2, 2]
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s2d12c3s3d3c5s")).map((c) => c.num),
        [3, 3, 3, 2, 2]
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s12d12c3s3d3c5s")).map((c) => c.num),
        [3, 3, 3, 12, 12]
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s11d12c3s3d3c5s")).map((c) => c.num),
        []
      );

      assert.deepEqual(
        isFullHouse(hands2cards("2s2d3s3d4c4d5s")).map((c) => c.num),
        []
      );
    });
  });

  describe("isThreeKinds", () => {
    it("isThreeKinds", () => {
      assert.deepEqual(
        isThreeKinds(hands2cards("2s2d2c3c4c5c6c")).map((c) => c.num),
        [2, 2, 2, 6, 5]
      );

      assert.deepEqual(
        isThreeKinds(hands2cards("2s3d4c4s4d5c14c")).map((c) => c.num),
        [4, 4, 4, 14, 5]
      );

      assert.deepEqual(
        isThreeKinds(hands2cards("4c4s4d5c14c")).map((c) => c.num),
        [4, 4, 4, 14, 5]
      );

      assert.deepEqual(
        isThreeKinds(hands2cards("2s2d3c4c5c6c7c")).map((c) => c.num),
        []
      );

      assert.deepEqual(
        isThreeKinds(hands2cards("2s2d3s3d4c4d5s")).map((c) => c.num),
        []
      );
    });
  });

  describe("isTwoPair", () => {
    it("isTwoPair", () => {
      assert.deepEqual(
        isTwoPair(hands2cards("2s2d3s3d4c5d6s")).map((c) => c.num),
        [3, 3, 2, 2, 6]
      );

      assert.deepEqual(
        isTwoPair(hands2cards("2s2d3s3d4c4d5s")).map((c) => c.num),
        [4, 4, 3, 3, 5]
      );

      assert.deepEqual(
        isTwoPair(hands2cards("12s12d13s13d14c14d5s")).map((c) => c.num),
        [14, 14, 13, 13, 12]
      );

      assert.deepEqual(
        isTwoPair(hands2cards("12s12d13s13d14c4d5s")).map((c) => c.num),
        [13, 13, 12, 12, 14]
      );

      assert.deepEqual(
        isTwoPair(hands2cards("12s12d13s13d5s")).map((c) => c.num),
        [13, 13, 12, 12, 5]
      );

      assert.deepEqual(
        isTwoPair(hands2cards("11s12d13s10d14c4d5s")).map((c) => c.num),
        []
      );
    });
  });

  describe("isPair", () => {
    it("empty hands", () => {
      assert.deepEqual(isPair([]), []);
    });
    it("two cards no pair", () => {
      assert.deepEqual(isPair(hands2cards("2s3s")), []);
    });
    it("two cards one pair", () => {
      assert.deepEqual(isPair(hands2cards("2s2c")), [
        { num: 2, suit: "c" },
        { num: 2, suit: "s" },
      ]);
    });
    it("five cards no pair", () => {
      assert.deepEqual(isPair(hands2cards("2s3s4c5c6d")), []);
    });
    it("five cards one pair", () => {
      assert.deepEqual(
        isPair(hands2cards("2s2c4c5c6d")).map((c) => c.num),
        [2, 2, 6, 5, 4]
      );
    });

    it("six cards no pair", () => {
      assert.deepEqual(isPair(hands2cards("2s3c4c5c6d7s")), []);
    });
    it("six cards one pair", () => {
      assert.deepEqual(
        isPair(hands2cards("2s2c4c5c6d7s")).map((c) => c.num),
        [2, 2, 7, 6, 5]
      );
    });

    it("seven cards no pair", () => {
      assert.deepEqual(isPair(hands2cards("2s3c4c5c6d7s8d")), []);
    });
    it("seven cards one pair", () => {
      assert.deepEqual(
        isPair(hands2cards("2s2c4c5c6d7s8d")).map((c) => c.num),
        [2, 2, 8, 7, 6]
      );
    });
  });

  describe("Rank", () => {
    describe("StraightFlush", () => {
      it("straight flush", () => {
        const ret = rank(hands2cards("14s13s12s11s10s9s8s"));
        assert.equal(ret.type, PokerType.StraightFlush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 13, 12, 11, 10]
        );
      });

      it("straight flush break", () => {
        const ret = rank(hands2cards("14s13c12s11s10s9s8s"));
        assert.equal(ret.type, PokerType.StraightFlush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [12, 11, 10, 9, 8]
        );
      });

      it("straight flush c", () => {
        const ret = rank(hands2cards("14c13s12s11s10s9s8s"));
        assert.equal(ret.type, PokerType.StraightFlush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [13, 12, 11, 10, 9]
        );
      });

      it("straight flush 12345", () => {
        const ret = rank(hands2cards("14s13s2s3s4s5s8s"));
        assert.equal(ret.type, PokerType.StraightFlush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [5, 4, 3, 2, 1]
        );
      });
    });

    describe("FourKinds", () => {
      it("four kinds", () => {
        const ret = rank(hands2cards("2s2c2d2h14c"));
        assert.equal(ret.type, PokerType.FourKinds);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [2, 2, 2, 2, 14]
        );
      });
      it("four and three kinds", () => {
        const ret = rank(hands2cards("2s2c2d2h14c14d14h"));
        assert.equal(ret.type, PokerType.FourKinds);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [2, 2, 2, 2, 14]
        );
      });
    });

    describe("FullHouse", () => {
      it("full house with 32", () => {
        const ret = rank(hands2cards("2s12d12c3s3d3c13s"));
        assert.equal(ret.type, PokerType.FullHouse);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [3, 3, 3, 12, 12]
        );
      });

      it("full house with 33", () => {
        const ret = rank(hands2cards("2s2d2c3s3d3c13s"));
        assert.equal(ret.type, PokerType.FullHouse);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [3, 3, 3, 2, 2]
        );
      });

      it("full house with A", () => {
        const ret = rank(hands2cards("14s14d14c3s3d3c13s"));
        assert.equal(ret.type, PokerType.FullHouse);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14, 14, 3, 3]
        );
      });
    });

    describe("Flush", () => {
      it("5 cards with flush", () => {
        const ret = rank(hands2cards("2s4s6s8s10s"));
        assert.equal(ret.type, PokerType.Flush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [10, 8, 6, 4, 2]
        );
      });

      it("7 cards with flush", () => {
        const ret = rank(hands2cards("2s4s6s7d8s9c14s"));
        assert.equal(ret.type, PokerType.Flush);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 8, 6, 4, 2]
        );
      });
    });

    describe("Straight", () => {
      it("5 cards with straight", () => {
        const ret = rank(hands2cards("2c3d4c5s6h"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [6, 5, 4, 3, 2]
        );
      });
      it("7 cards with straight", () => {
        const ret = rank(hands2cards("2c3d4c5s6h7d8c"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [8, 7, 6, 5, 4]
        );
      });
      // J︎♥︎ 9︎♠︎ 8♣︎ 7︎♠︎ 6♣︎ 6♦︎ 5♣︎
      it("", () => {
        const ret = rank(hands2cards("5c6d6c7s8c9s11h"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [9, 8, 7, 6, 5]
        );
      });
      it("TJQKA straight", () => {
        const ret = rank(hands2cards("2c9d10c11s12h13d14c"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 13, 12, 11, 10]
        );
      });
      it("A2345 straight", () => {
        const ret = rank(hands2cards("2c3d4c5s12h13d14c"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [5, 4, 3, 2, 1]
        );
      });

      it("A23456 straight", () => {
        const ret = rank(hands2cards("2c3d4c5s6h13d14c"));
        assert.equal(ret.type, PokerType.Straight);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [6, 5, 4, 3, 2]
        );
      });
    });

    describe("ThreeKinds", () => {
      it("AAA302", () => {
        const ret = rank(hands2cards("14s14c14d2c3d"));
        assert.equal(ret.type, PokerType.ThreeKinds);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14, 14, 3, 2]
        );
      });

      it("6663AK", () => {
        const ret = rank(hands2cards("6s6c6d2c3d14c13d"));
        assert.equal(ret.type, PokerType.ThreeKinds);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [6, 6, 6, 14, 13]
        );
      });
    });

    describe("TwoPair", () => {
      it("3322A", () => {
        const ret = rank(hands2cards("2s2c3d3d14c13d12s"));
        assert.equal(ret.type, PokerType.TwoPair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [3, 3, 2, 2, 14]
        );
      });

      it("three pair AA30322Q", () => {
        const ret = rank(hands2cards("2s2c3d3d14c14d12s"));
        assert.equal(ret.type, PokerType.TwoPair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14, 3, 3, 12]
        );
      });

      it("three pair AAKKQQ", () => {
        const ret = rank(hands2cards("2s14c14d13s13c12d12h"));
        assert.equal(ret.type, PokerType.TwoPair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14, 13, 13, 12]
        );
      });
    });

    describe("Pair", () => {
      it("2 cards with pair", () => {
        const ret = rank(hands2cards("14c14d"));
        assert.equal(ret.type, PokerType.OnePair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14]
        );
      });

      it("5 cards with pair", () => {
        const ret = rank(hands2cards("14c14d13c12c6d"));
        assert.equal(ret.type, PokerType.OnePair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 14, 13, 12, 6]
        );
      });

      it("22 pair", () => {
        const ret = rank(hands2cards("14c13c12c2d2c5h8d"));
        assert.equal(ret.type, PokerType.OnePair);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [2, 2, 14, 13, 12]
        );
      });
    });

    describe("HighCards", () => {
      it("two cards", () => {
        const ret = rank(hands2cards("14c13c"));
        assert.equal(ret.type, PokerType.HighCards);
        assert.deepEqual(ret.cards, [
          { num: 14, suit: "c" },
          { num: 13, suit: "c" },
        ]);
      });
      it("5 cards", () => {
        const ret = rank(hands2cards("14c13c12c11c8d"));
        assert.equal(ret.type, PokerType.HighCards);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 13, 12, 11, 8]
        );
      });
      it("7 cards", () => {
        const ret = rank(hands2cards("14c13c12c11c8d7s6s"));
        assert.equal(ret.type, PokerType.HighCards);
        assert.deepEqual(
          ret.cards.map((c) => c.num),
          [14, 13, 12, 11, 8]
        );
      });
    });
  });

  describe("compare", () => {
    it("equal straight flush ", () => {
      assert.equal(
        compare(
          hands2cards("14s13s12s11s10s9s8s"),
          hands2cards("14s13s12s11s10s9s8s")
        ),
        0
      );
    });
    it("TJQKA vs 9TJQK", () => {
      assert.equal(
        compare(
          hands2cards("14s13s12s11s10s9s8s"),
          hands2cards("13s12s11s10s9s8s7s")
        ),
        1
      );
    });

    it("straight equal", () => {
      assert.equal(
        compare(
          hands2cards("14c13s12d11h10s9s8s"),
          hands2cards("14h13s12s11c10h9c8s")
        ),
        0
      );
    });

    it("One Pair vs Two Pair", () => {
      assert.equal(
        compare(
          hands2cards("14c13c9d6s4c4s2d"), // A♣︎ K♣︎ 9♦︎ 6︎♠︎ 4♣︎ 4︎♠︎ 2♦︎
          hands2cards("14c14d13c10h4c4s2d") // A♣︎ A♦︎ K♣︎ T︎♥︎ 4♣︎ 4︎♠︎ 2♦︎
        ),
        -1
      );
    });

    // it("sort cards", () => {
    //   const cardsList = new Array(10)
    //     .fill(0)
    //     .map((_) => hands2cards(randomHands(7)));
    //   cardsList.forEach((cards) => {
    //     console.log(prettify(cards));
    //   });
    //   cardsList.sort(compare).forEach((cards) => {
    //     const ret = rank(cards);
    //     console.log(ret.type, prettify(ret.cards));
    //   });
    // });
  });
});

describe("Settle", () => {
  function log(players: PlayerInfo[]) {
    players.forEach((p) => {
      console.log(
        `${p.id} ${prettify(p.cards)} Stage: ${p.stage} Max: ${prettify(
          p.maxCards!
        )}  total: ${p.total} ${p.fold ? "Fold" : ""} ${p.profits}`
      );
    });
  }

  it("test stage", () => {
    const players: PlayerInfo[] = [
      {
        id: "A",
        total: 100,
        fold: false,
        cards: hands2cards("14c14d9s8h7d"), // AA
      },
      {
        id: "B",
        total: 100,
        fold: false,
        cards: hands2cards("14c14d9s8h7d"), // AA
      },
      {
        id: "C",
        total: 100,
        fold: false,
        cards: hands2cards("13c13d9s8h7d"), // KK
      },
      {
        id: "D",
        total: 100,
        fold: false,
        cards: hands2cards("13c13d9s8h7d"), // KK
      },
      {
        id: "E",
        total: 100,
        fold: false,
        cards: hands2cards("12c12d9s8h7d"), // QQ
      },
    ];

    const ps = settle(players, 2);
    assert.deepEqual(
      ps.map((p) => p.stage),
      [0, 0, 1, 1, 2]
    );
    assert.deepEqual(
      ps.map((p) => p.isWinner),
      [true, true, false, false, false]
    );
  });
  it("only 1 alive", () => {
    const pokers = randomHands(52);
    const boardCards = pokers.splice(0, 5);
    const players: PlayerInfo[] = [
      {
        id: "A",
        total: 100,
        fold: false,
        cards: [...pokers.splice(0, 2), ...boardCards],
      },
      {
        id: "B",
        total: 100,
        fold: false,
        cards: [...pokers.splice(0, 2), ...boardCards],
      },
      {
        id: "C",
        total: 100,
        fold: false,
        cards: [...pokers.splice(0, 2), ...boardCards],
      },
      {
        id: "D",
        total: 100,
        fold: false,
        cards: [...pokers.splice(0, 2), ...boardCards],
      },
      {
        id: "E",
        total: 100,
        fold: false,
        cards: [...pokers.splice(0, 2), ...boardCards],
      },
    ];
    console.log(prettify(boardCards));
    const ps = settle(players, 2);
    log(ps);
  });

  it("final test", () => {
    const hands1 = "14s13s12s11s10s";
    const hands2 = "13s12s11s10s9s";
    const hands3 = "12s11s10s9s8s";
    const hands4 = "2s4d6c8h10s12d14h";
    const A10 = {
      id: "A10",
      total: 10,
      fold: false,
      cards: hands2cards(hands1),
    };
    const A20 = {
      id: "A20",
      total: 20,
      fold: false,
      cards: hands2cards(hands1),
    };
    const A30 = {
      id: "A30",
      total: 30,
      fold: false,
      cards: hands2cards(hands1),
    };
    const B10 = {
      id: "B10",
      total: 10,
      fold: false,
      cards: hands2cards(hands2),
    };
    const B40 = {
      id: "B40",
      total: 40,
      fold: false,
      cards: hands2cards(hands2),
    };
    const B50 = {
      id: "B50",
      total: 50,
      fold: false,
      cards: hands2cards(hands2),
    };
    const C40 = {
      id: "C40",
      total: 40,
      fold: false,
      cards: hands2cards(hands3),
    };
    const C50 = {
      id: "C50",
      total: 50,
      fold: false,
      cards: hands2cards(hands3),
    };
    const C70 = {
      id: "C70",
      total: 70,
      fold: false,
      cards: hands2cards(hands3),
    };
    const F10 = {
      id: "F10",
      total: 10,
      fold: true,
      cards: hands2cards(hands4),
    };
    const F20 = {
      id: "F20",
      total: 20,
      fold: true,
      cards: hands2cards(hands4),
    };
    const F30 = {
      id: "F30",
      total: 30,
      fold: true,
      cards: hands2cards(hands4),
    };
    const F40 = {
      id: "F40",
      total: 40,
      fold: true,
      cards: hands2cards(hands4),
    };
    const F50 = {
      id: "F50",
      total: 50,
      fold: true,
      cards: hands2cards(hands4),
    };

    // deep copy: new players
    const nps = (ps: PlayerInfo[]) =>
      ps.map((p) => JSON.parse(JSON.stringify(p)));

    let ps: PlayerInfo[] = [];

    ps = settle(nps([A10, A20]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [10, 20]
    );

    ps = settle(nps([A10, A20, B10]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [15, 25, 0]
    );

    ps = settle(nps([A10, A20, B40]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [15, 35, 20]
    );

    ps = settle(nps([A10, A20, B10, B40]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [20, 40, 0, 20]
    );

    ps = settle(nps([A10, A20, B10, B40]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [20, 40, 0, 20]
    );

    ps = settle(nps([A10, A20, B10, B40, C50]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [25, 55, 0, 40, 10]
    );

    ps = settle(nps([A10, B40, C50, F50]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [40, 90, 20, 0]
    );

    ps = settle(nps([A10, A10, B50, F50]), 1);
    assert.deepEqual(
      ps.map((p) => p.profits),
      [20, 20, 80, 0]
    );
    assert.deepEqual(
      ps.map((p) => p.isWinner),
      [true, true, true, false]
    );
  });
});

describe("Settle 1 Test", () => {
  // create player
  function cp(stage: number, total: number, fold: boolean) {
    let cards: Card[] = [];
    for (let i = 0; i < 5; ++i) {
      cards.push({
        num: 14 - stage - i,
        suit: "s",
      });
    }
    return {
      id: `${stage}_${total}_${fold}`,
      total,
      fold,
      cards,
    };
  }

  it("5, 5, 5f", () => {
    assert.deepEqual(
      settle([cp(1, 5, false), cp(1, 5, false), cp(2, 5, true)], 1).map(
        (p) => p.profits
      ),
      [7, 7, 1]
    );
  });

  it("5, 5, 5", () => {
    assert.deepEqual(
      settle([cp(1, 5, false), cp(1, 5, false), cp(2, 5, false)], 1).map(
        (p) => p.profits
      ),
      [7, 7, 1]
    );
  });

  it("2, 2, 2, 2f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 2, false), cp(1, 2, false), cp(1, 2, false), cp(2, 2, false)],
        1
      ).map((p) => p.profits),
      [2, 2, 2, 2]
    );
  });

  it("2, 2, 2f, 2f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 2, false), cp(1, 2, false), cp(2, 2, false), cp(2, 2, false)],
        1
      ).map((p) => p.profits),
      [4, 4, 0, 0]
    );
  });

  it("4, 4, 4, 4f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 4, false), cp(1, 4, false), cp(1, 4, false), cp(2, 4, true)],
        1
      ).map((p) => p.profits),
      [5, 5, 5, 1]
    );
  });

  it("4, 6, 6, 6f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 4, false), cp(1, 6, false), cp(1, 6, false), cp(2, 6, true)],
        1
      ).map((p) => p.profits),
      [5, 8, 8, 1]
    );
  });

  it("6, 8, 8, 6f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 6, false), cp(1, 8, false), cp(1, 8, false), cp(2, 6, true)],
        1
      ).map((p) => p.profits),
      [8, 10, 10, 0]
    );
  });

  it("6, 6f", () => {
    assert.deepEqual(
      settle([cp(1, 6, false), cp(2, 6, true)], 1).map((p) => p.profits),
      [12, 0]
    );
  });

  it("6, 6_2", () => {
    assert.deepEqual(
      settle([cp(1, 6, false), cp(2, 6, false)], 1).map((p) => p.profits),
      [12, 0]
    );
  });

  it("6, 6_2, 2f, 4f", () => {
    assert.deepEqual(
      settle(
        [cp(1, 6, false), cp(2, 6, false), cp(2, 2, true), cp(2, 4, true)],
        1
      ).map((p) => p.profits),
      [18, 0, 0, 0]
    );
  });
});

describe("AutoGame Test Case", () => {
  it("one", () => {
    const boardCards = hands2cards("8h6c3s8d14h"); // 8︎♥︎ 6♣︎ 3︎♠︎ 8♦︎ A︎♥︎
    const players: PlayerInfo[] = [
      {
        id: "A",
        total: 195,
        fold: false,
        cards: [...hands2cards("9s6h"), ...boardCards],
      },
      {
        id: "B",
        total: 207,
        fold: false,
        cards: [...hands2cards("10h6d"), ...boardCards],
      },
      {
        id: "C",
        total: 194,
        fold: false,
        cards: [...hands2cards("5d2d"), ...boardCards],
      },
      {
        id: "D",
        total: 128,
        fold: true,
        cards: [...hands2cards("13d9h"), ...boardCards],
      },
      {
        id: "E",
        total: 32,
        fold: true,
        cards: [...hands2cards("11c4s"), ...boardCards],
      },
      {
        id: "F",
        total: 1,
        fold: true,
        cards: [...hands2cards("8c5c"), ...boardCards],
      },
    ];
    console.log(prettify(boardCards));
    const ps = settle(players, 2);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        profits: p.profits,
      }))
    );
  });
});

/*
Alan Raise to $20
Bob Raise to $30
Alan Call $30
Flop: A♣︎7♦︎10♠︎
Alan Check
Bob Bet to $10
Alan Raise to $24
Bob Call $24
Turn: 7♥︎
Alan Check
Bob Bet to $10
Alan Raise to $40
Bob Call $40
River: 8♦︎
Alan Check
Bob Check
Alan 【A♥︎2♦︎】A♣︎A♥︎7♦︎7♥︎10♠︎ 两对 lose -4
Bob 【A♠︎3♠︎】A♣︎A♠︎7♦︎7♥︎10♠︎ 两对 lose -4
*/
describe("平分了-4块钱", () => {
  it("", () => {
    const alan = {
      id: "A10",
      total: 94,
      fold: false,
      cards: hands2cards("14h2d14c7d10s7h8d"),
    };
    const bob = {
      id: "A20",
      total: 94,
      fold: false,
      cards: hands2cards("14s3s14c7d10s7h8d"),
    };

    const ps = settle([alan, bob], 5);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        profits: p.profits,
      }))
    );
  });
  it("", () => {
    const alan = {
      id: "A10",
      total: 34,
      fold: false,
      cards: hands2cards("14h2d14c7d10s7h8d"),
    };
    const bob = {
      id: "A20",
      total: 20,
      fold: true,
      cards: hands2cards("14s3s14c7d10s7h8d"),
    };

    const ps = settle([alan, bob], 1);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        profits: p.profits,
      }))
    );
  });
});

describe("两人平分15", () => {
  it("", () => {
    const a = {
      id: "A",
      total: 5,
      fold: false,
      cards: hands2cards("1d2d3d4d5d"),
    };
    const b = {
      id: "B",
      total: 5,
      fold: false,
      cards: hands2cards("1d2d3d4d5d"),
    };

    const c = {
      id: "B",
      total: 5,
      fold: true,
      cards: hands2cards("1d2d3d4d5d"),
    };

    const ps = settle([a, b, c], 1);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        profits: p.profits,
      }))
    );
  });
});

describe("debug", () => {
  it("", () => {
    const players = [
      {
        id: "A_134",
        total: 134,
        fold: false,
        cards: hands2cards("3d3h14s12d11c"),
      },
      {
        id: "C_86",
        total: 86,
        fold: false,
        cards: hands2cards("3d3h14s12d11c"),
      },
    ];
    const ps = settle(players, 1);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        orginTotal: p.originTotal,
        profits: p.profits,
      }))
    );
  });
});
