import {
  createRoom,
  createUser,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userMap,
  userReady,
} from "../service";
import { hands2cards, settle } from "../utils/game-engine";

describe("", () => {
  it("settle with same", () => {
    console.log("settle with same");
    const ts = new Array(6).fill(0).map((_, i) => `token-${i}`);
    ts.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(ts[0], 1, 200);
    ts.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(ts[0]);
    const game = room.game;

    const users = game.sortedUsers.map((t) => userMap[t]);
    [198, 198, 207, 194, 208, 195].forEach((s, i) => (users[i].stack = s));
    const [sb, bb, utg, mp, co, d] = users.map((u) => u.token);
    const r = room.id;
    userBet(utg, 4);
    userBet(mp, 8);
    userBet(co, 16);
    userBet(d, 16);
    userFold(sb);
    userBet(bb, 32);
    userBet(utg, 64);
    userBet(mp, 128);
    userBet(co, 128);
    userBet(d, 128);
    userFold(bb);
    userBet(utg, 207);
    userBet(mp, 194);
    userFold(co);
    userBet(d, 195);
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

    const ps = settle([alan, bob], 1);
    console.log(
      ps.map((p) => ({
        id: p.id,
        total: p.total,
        profits: p.profits,
      }))
    );
  });
  it("还原游戏过程", () => {
    const ts = new Array(2).fill(0).map((_, i) => `token-${i}`);
    ts.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(ts[0], 1, 200);
    ts.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(ts[0]);
    const game = room.game;

    const users = game.sortedUsers.map((t) => userMap[t]);
    [198, 198, 207, 194, 208, 195].forEach((s, i) => (users[i].stack = s));
    const [sb, bb, utg, mp, co, d] = users.map((u) => u.token);
  });
});
