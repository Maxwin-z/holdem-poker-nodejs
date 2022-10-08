import { Card } from "../../ApiType";

const colors = require("colors");
export const NUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const SUITS = ["c", "d", "h", "s"]; // club ♣︎, diamond ♦︎, heart ♥︎, spade ♠︎

export function _randomPickOne(items: any) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomHands(len = 7): Card[] {
  return new Array(NUMS.length * SUITS.length)
    .fill(0)
    .map(
      (_, i) =>
        <Card>{
          num: NUMS[i % NUMS.length],
          suit: SUITS[Math.floor(i / NUMS.length) % SUITS.length],
        }
    )
    .sort(() => Math.random() - 0.5)
    .splice(0, len);
}
export function hands2cards(hands: string | Card[]): Card[] {
  return typeof hands == "string"
    ? parse(hands.match(/(\d+\w)/g))
    : parse(hands);
}
export function prettify(cards: Card[]) {
  return cards
    .map((c) => {
      const num =
        c.num == 14
          ? "A"
          : c.num == 13
          ? "K"
          : c.num == 12
          ? "Q"
          : c.num == 11
          ? "J"
          : c.num == 10
          ? "T"
          : c.num == 1
          ? "A"
          : c.num;
      return c.suit == "c"
        ? colors.green(`${num}♣︎`)
        : c.suit == "d"
        ? colors.magenta(`${num}♦︎`)
        : c.suit == "h"
        ? colors.red(`${num}︎♥︎`)
        : colors.white(`${num}︎♠︎`);
    })
    .join(" ");
}
export function parse(hands: any): Card[] {
  const suitSortOpts: { [x: string]: number } = {
    c: 4,
    d: 3,
    h: 2,
    s: 1,
  };
  return (
    typeof hands[0] == "object"
      ? hands
      : hands.map(
          (hand: string) =>
            <Card>{
              num: parseInt(hand.substr(0, hand.length - 1), 10),
              suit: hand.substr(-1),
            }
        )
  ).sort(
    (
      a: { num: number; suit: string | number },
      b: { num: number; suit: string | number }
    ) =>
      b.num - a.num != 0
        ? b.num - a.num
        : suitSortOpts[b.suit] - suitSortOpts[a.suit]
  );
}

// function maxCard(hands, suit = null) {
//   return parse(hands).reduce(
//     (a, b) => (b[0] > a[0] && ((!!suit && suit == b[1]) || !suit) ? b : a),
//     [0, ""]
//   );
// }

export function maxCards(cards: Card[], suit: string = "", len = 5) {
  return cards
    .filter((c) => (!!suit && c.suit == suit) || !suit)
    .splice(0, len);
}

export function cards2counters(cards: Card[]) {
  const counters = new Array(15).fill(0);
  cards.forEach((card) => (counters[card.num] += 1));
  return counters;
}

export function isFlush(cards: Card[]) {
  const matches = cards
    .map((c) => c.suit)
    .sort()
    .join("")
    .match(/(d{5}|s{5}|c{5}|h{5})/);
  return !!matches ? maxCards(cards, matches[0][0], 7) : [];
}

export function isStraight(cards: Card[]): Card[] {
  // console.log(cards);
  const nums = cards
    .map((c) => c.num)
    .filter((n, i, a) => i == 0 || n != a[i - 1]);
  if (nums.length < 5) return [];
  let high = 0;
  if (
    [...nums]
      .splice(0, nums.length - 4)
      .some((n, i, a) => nums[i + 4] == n - 4 && (high = n))
  ) {
    const result: Card[] = [];
    cards.forEach((c) => {
      if (c.num == high) {
        result.push(c);
        high -= 1;
      }
    });
    return result;
  }
  return nums[0] == 14
    ? isStraight(
        cards
          .map((c) => (c.num == 14 ? { num: 1, suit: c.suit } : c))
          .sort((a, b) => b.num - a.num)
      )
    : [];
}

// const r = isStraight(["14s", "2s", "3c", "4s", "5s"]);
// console.log(r);

// Rank 1: 同花顺
export function isStraightFlush(cards: Card[]) {
  return isStraight(isFlush(cards));
}

// Rank 2: 四条
export function isFour(cards: Card[]) {
  const fourCard = cards2counters(cards).findIndex((num) => num == 4);
  return fourCard > 0
    ? [
        ...SUITS.map((suit) => ({
          num: fourCard,
          suit,
        })),
        cards.filter((c) => c.num != fourCard)[0],
      ]
    : [];
}

// Rank 3: 葫芦
export function isFullHouse(cards: Card[]) {
  const counters = cards2counters(cards);
  let threeCard = 0;
  let twoCard = 0;
  for (let cardIndex = counters.length - 1; cardIndex > 1; --cardIndex) {
    const num = counters[cardIndex];
    if (num == 3) {
      if (threeCard == 0) threeCard = cardIndex;
      else twoCard = cardIndex;
    }
    if (num == 2 && twoCard == 0) {
      twoCard = cardIndex;
    }
  }
  // console.log("fh", threeCard, twoCard);
  if (threeCard > 0 && twoCard > 0) {
    return [
      ...cards.filter((c) => c.num == threeCard),
      ...cards.filter((c) => c.num == twoCard).splice(0, 2),
    ];
  }
  return [];
}

// Rank 4: Flush
// Rank 5: Straight
// Rank 6: Three kinds
export function isThreeKinds(cards: Card[]) {
  const threeCard = cards2counters(cards).findIndex((num) => num == 3);
  return threeCard > 0
    ? [
        ...cards.filter((c) => c.num == threeCard),
        ...cards.filter((c) => c.num != threeCard).splice(0, 2),
      ]
    : [];
}

// Rank 7: Two pair
export function isTwoPair(cards: Card[]) {
  const counters = cards2counters(cards);
  const head = cards.filter((c) => counters[c.num] == 2).splice(0, 4);
  return head.length == 4
    ? [
        ...head,
        ...cards
          .filter((c) => c.num != head[0].num && c.num != head[2].num)
          .splice(0, 1),
      ]
    : [];
}

// Rank 8: Pair
export function isPair(cards: Card[]) {
  const twoCard = cards2counters(cards).findIndex((num) => num == 2);
  return twoCard > 0
    ? [
        ...cards.filter((c) => c.num == twoCard),
        ...cards.filter((c) => c.num != twoCard).splice(0, 3),
      ]
    : [];
}

// Rank 9: High cards

//###//

export enum PokerType {
  StraightFlush = 1, // 同花顺
  FourKinds = 2, // 四条
  FullHouse = 3, // 葫芦
  Flush = 4, // 同花
  Straight = 5, // 顺子
  ThreeKinds = 6, // 三条
  TwoPair = 7, // 两对
  OnePair = 8, // 对子
  HighCards = 9, // 高牌
}

export function pokerTypeName(type: PokerType) {
  switch (type) {
    case PokerType.StraightFlush:
      return "同花顺";
    case PokerType.FourKinds:
      return "四条";
    case PokerType.FullHouse:
      return "葫芦";
    case PokerType.Flush:
      return "同花";
    case PokerType.Straight:
      return "顺子";
    case PokerType.ThreeKinds:
      return "三条";
    case PokerType.TwoPair:
      return "两对";
    case PokerType.OnePair:
      return "一对";
    case PokerType.HighCards:
      return "高牌";
  }
}

/**
 *
 * @param {*} hands
 * @returns {type: PokerType, cards: []}
 */
export interface PokerRank {
  type: PokerType;
  cards: Card[];
}
export function rank(hands: any): PokerRank {
  const cards = parse(hands);
  let maxCards: Card[] = [];
  if ((maxCards = isStraightFlush(hands)).length > 0) {
    return {
      type: PokerType.StraightFlush,
      cards: maxCards.splice(0, 5),
    };
  }
  if ((maxCards = isFour(hands)).length > 0) {
    return {
      type: PokerType.FourKinds,
      cards: maxCards,
    };
  }
  if ((maxCards = isFullHouse(hands)).length > 0) {
    return {
      type: PokerType.FullHouse,
      cards: maxCards,
    };
  }
  if ((maxCards = isFlush(hands)).length > 0) {
    return {
      type: PokerType.Flush,
      cards: maxCards.splice(0, 5),
    };
  }
  if ((maxCards = isStraight(hands)).length > 0) {
    return {
      type: PokerType.Straight,
      cards: maxCards.splice(0, 5),
    };
  }
  if ((maxCards = isThreeKinds(hands)).length > 0) {
    return {
      type: PokerType.ThreeKinds,
      cards: maxCards,
    };
  }
  if ((maxCards = isTwoPair(hands)).length > 0) {
    return {
      type: PokerType.TwoPair,
      cards: maxCards,
    };
  }
  if ((maxCards = isPair(hands)).length > 0) {
    return {
      type: PokerType.OnePair,
      cards: maxCards,
    };
  }
  return {
    type: PokerType.HighCards,
    cards: [...cards].splice(0, 5),
  };
}

// const ret = rank(["2s", "2d", "2c", "3s", "3d", "3c", "13s"]);
// console.log(ret);

export function compare(cardsA: any, cardsB: Card[]) {
  const a = rank(cardsA);
  const b = rank(cardsB);
  // console.log(a, b);
  if (a.type != b.type) {
    return b.type - a.type;
  }
  for (let i = 0; i != a.cards.length; ++i) {
    if (a.cards[i].num != b.cards[i].num) {
      return a.cards[i].num - b.cards[i].num;
    }
  }
  return 0;
}

// const a = hands2cards("14h13c9d8c8h8s6c");
// const b = hands2cards("13h12c8s7s6h5c2c");
// const ret = compare(a, b);
// console.log(ret, a, b);
// const ret = rank(b);
// console.log(ret);

export type PlayerInfo = {
  id: string;
  bets?: number[];
  total: number;
  originTotal?: number;
  profits?: number;
  fold: boolean;
  cards: Card[];
  maxCards?: Card[];
  stage?: number;
  isWinner?: boolean;
};
export function settle(players: PlayerInfo[], sb: number): PlayerInfo[] {
  players.forEach((p) => {
    p.maxCards = rank(p.cards).cards;
    p.profits = 0;
    p.originTotal = p.total;
    p.isWinner = false;
  });

  let aliveUsers = players
    .filter((p) => !p.fold)
    .sort((p1, p2) => compare(p2.cards, p1.cards));
  const foldUsers = players
    .filter((p) => p.fold)
    .sort((p1, p2) => p2.total - p1.total);

  // aliveUsers to rank stage
  const stages: [[PlayerInfo]] = [[aliveUsers[0]]];
  aliveUsers[0].stage = 0;
  let stage = 0;
  for (let i = 1; i < aliveUsers.length; ++i) {
    // equal to the previous one
    if (compare(aliveUsers[i].cards, stages[stage][0].cards) == 0) {
      stages[stage].push(aliveUsers[i]);
    } else {
      stages[++stage] = [aliveUsers[i]];
    }
    aliveUsers[i].stage = stage;
  }

  aliveUsers = aliveUsers.sort((p1, p2) => {
    if (p1.stage != p2.stage) {
      return (p1.stage || 0) - (p2.stage || 0);
    } else {
      return p1.total - p2.total;
    }
  });

  const allUseres = [...aliveUsers, ...foldUsers];

  // share profits
  let userTail = 0;
  let stageTail = 0;
  let nextStageHead = 0;
  let stageIndex = 0;
  for (let i = 0; i < aliveUsers.length; ++i) {
    let subTotal = stageTail + allUseres[i].total;
    stageTail = 0;
    for (let j = i + 1; j < allUseres.length; ++j) {
      const subProfit = Math.min(aliveUsers[i].total, allUseres[j].total);
      // console.log(i, j, subProfit);
      allUseres[j].total -= subProfit;
      subTotal += subProfit;
    }
    const currentStage = aliveUsers[i].stage || 0;
    const stageLeftCount = stages[currentStage].length - stageIndex;
    userTail = subTotal % (sb * stageLeftCount);
    subTotal -= userTail;
    // console.log(
    //   `i: ${i}, stage: ${currentStage} si: ${stageIndex} subTotal: ${subTotal}`
    // );
    for (let j = stageIndex; j < stages[currentStage].length; ++j) {
      stages[currentStage][j].profits! += subTotal / stageLeftCount;
    }
    stageIndex += 1;
    nextStageHead += userTail;
    // current stage done, next one
    if (stageIndex > stages[currentStage].length - 1) {
      stageIndex = 0;
      stageTail = nextStageHead;
      nextStageHead = 0;
    }
  }

  if (stageTail > 0 && foldUsers.length > 0) {
    foldUsers[0].profits = stageTail;
  }

  stages[0].forEach((p) => (p.isWinner = true));
  let maxWin = Math.max(...stages[0].map((p) => p.originTotal || 0));
  for (let i = 1; i < stages.length; ++i) {
    for (let j = 0; j < stages[i].length; ++j) {
      const p = stages[i][j];
      if (p.originTotal! > maxWin) {
        maxWin = p.originTotal!;
        p.isWinner = true;
      }
    }
  }

  return allUseres;
}

// const a = {
//   id: "A",
//   total: 5,
//   fold: false,
//   cards: hands2cards("1d2d3d4d5d"),
// };
// const b = {
//   id: "B",
//   total: 5,
//   fold: false,
//   cards: hands2cards("1d2d3d4d5d"),
// };

// const c = {
//   id: "B",
//   total: 5,
//   fold: true,
//   cards: hands2cards("1d2d3d4d5d"),
// };

// const ps = settle([a, b, c], 1);
// console.log(
//   ps.map((p) => ({
//     id: p.id,
//     total: p.total,
//     profits: p.profits,
//   }))
// );
