import {
  userMap,
  roomMap,
  createUser,
  createRoom,
  startGame,
  userEnterRoom,
  userLeaveRoom,
  userReady,
  userBet,
  userFold,
} from "../service/index";
import Room, { Game, GameRound, RoomID } from "../service/Room";
// const assert = require('assert');

import { assert, use } from "chai";
import { prettify } from "../utils/game-engine";
import { describe } from "mocha";
import { logGame } from "./utils";
const token1 = "token-1";
const token2 = "token-2";
const token3 = "token-3";
const token4 = "token-4";

const sb = 1;
const buyIn = 200;

describe("Create", () => {
  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });
  it("new user", () => {
    const user = createUser(token1, "maxwin", "/pig");
    assert.equal(user.isInRoom, false);
    assert.deepEqual(userMap[token1], user);
  });

  it("new room", () => {
    const room = new Room("123456", sb, buyIn);

    assert.equal(room.id, "123456");
    assert.equal(room.smallBlind, sb);
    assert.equal(room.buyIn, buyIn);
    assert.equal(room.isGaming, false);
    assert.equal(room.users.length, 0);
  });

  it("user create room", () => {
    const user = createUser(token1, "maxwin", "/pig");
    const room = createRoom(user.token, sb, buyIn);
    assert.equal(room.smallBlind, sb);
    assert.equal(room.buyIn, buyIn);
    assert.equal(room.isGaming, false);
    assert.equal(room.users.length, 1);

    assert.equal(user.isInRoom, true);
    assert.equal(user.isRoomOwner, true);
    assert.equal(user.isReady, true);
    assert.equal(user.roomid, room.id);
  });
});
describe("StartGame", () => {
  before(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("only one user", () => {
    const user = createUser(token1, "maxwin", "/pig");
    const room = createRoom(user.token, sb, buyIn);
    // console.log(room);
    assert.throws(
      () => startGame(user.token),
      "need more than 2 players be ready"
    );
  });

  it("not owner", () => {
    const user = createUser(token1, "maxwin", "/pig");
    const room = createRoom(user.token, sb, buyIn);
    assert.throws(() => startGame("invalid token"), "not in any room");
  });

  it("2 user but 1 ready", () => {
    const user = createUser(token1, "maxwin", "/pig");
    const user2 = createUser(token2, "alan", "/cat");
    const room = createRoom(user.token, sb, buyIn);
    userEnterRoom(user2.token, room.id);

    assert.equal(room.users.length, 2);
    assert.deepEqual(
      room.users.map((t) => userMap[t].isReady),
      [true, false]
    );
  });

  it("2 user all ready", () => {
    const user = createUser(token1, "maxwin", "/pig");
    const user2 = createUser(token2, "alan", "/cat");
    const room = createRoom(user.token, sb, buyIn);
    assert.throws(() => userReady(user2.token), "not in any room");
    userEnterRoom(user2.token, room.id);
    userReady(user2.token);
    assert.equal(startGame(user.token), true);
  });
});

describe("Game", () => {
  const token1 = "token-1";
  const token2 = "token-2";
  const token3 = "token-3";
  const token4 = "token-4";
  const token5 = "token-5";
  const token6 = "token-6";
  const sb = 1;
  const buyIn = 200;

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("user enter room", () => {
    const user1 = createUser(token1, "maxwin", "/pig");
    const user2 = createUser(token2, "alan", "/pig");
    const user3 = createUser(token3, "bob", "/pig");
    const room = createRoom(user1.token, sb, buyIn);
    assert.deepEqual(room.users, [token1]);

    userEnterRoom(user2.token, room.id);
    assert.deepEqual(room.users, [token1, token2]);

    userEnterRoom(user3.token, room.id);

    assert.deepEqual(room.users, [token1, token2, token3]);

    assert.deepEqual(
      room.users.map((t) => userMap[t].isRoomOwner),
      [true, false, false]
    );

    assert.deepEqual(
      room.users.map((t) => userMap[t].isRoomOwner),
      [true, false, false]
    );
    assert.deepEqual(
      room.users.map((t) => userMap[t].isReady),
      [true, false, false]
    );
  });

  it("user leave room", () => {
    const user1 = createUser(token1, "maxwin", "/pig");
    const user2 = createUser(token2, "alan", "/pig");
    const user3 = createUser(token3, "bob", "/pig");
    const room = createRoom(user1.token, sb, buyIn);
    userEnterRoom(user2.token, room.id);
    userEnterRoom(user3.token, room.id);

    userLeaveRoom(user3.token);
    assert.deepEqual(room.users, [token1, token2]);

    userEnterRoom(user3.token, room.id);
    userLeaveRoom(user2.token);
    assert.deepEqual(room.users, [token1, token3]);

    userEnterRoom(user2.token, room.id);
    assert.deepEqual(room.users, [token1, token3, token2]);

    userLeaveRoom(user1.token);
    assert.deepEqual(room.users, [token3, token2]);
    assert.equal(user3.isRoomOwner, true);

    userLeaveRoom(user3.token);
    assert.equal(user2.isRoomOwner, true);

    userLeaveRoom(user2.token); // all user leave delete room
    assert.equal(roomMap[room.id], undefined);
  });
});

describe("Game Loop", () => {
  const token1 = "token-1";
  const token2 = "token-2";
  const token3 = "token-3";
  const token4 = "token-4";
  const token5 = "token-5";
  const token6 = "token-6";
  const sb = 1;
  const buyIn = 200;

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("start game", () => {
    const user1 = createUser(token1, "A", "/pig");
    const user2 = createUser(token2, "B", "/pig");
    const user3 = createUser(token3, "C", "/pig");
    const user4 = createUser(token4, "D", "/pig");
    const user5 = createUser(token5, "E", "/pig");
    const user6 = createUser(token6, "F", "/pig");
    const room = createRoom(user1.token, sb, buyIn);
    userEnterRoom(user2.token, room.id);
    userEnterRoom(user3.token, room.id);
    userEnterRoom(user4.token, room.id);
    userEnterRoom(user5.token, room.id);
    userEnterRoom(user6.token, room.id);

    userReady(user2.token);
    userReady(user3.token);
    userReady(user4.token);
    userReady(user5.token);
    userReady(user6.token);

    startGame(user1.token);
    const game = room.game;
    logGame(game);

    // utg act
    assert.deepEqual(
      game.sortedUsers.map((t) => userMap[t].isActing),
      [false, false, true, false, false, false]
    );

    // bb act, error
    assert.throws(() => userBet(game.sortedUsers[1], 0), "not your action now");

    // bet large than left stack
    assert.throws(() => userBet(game.sortedUsers[2], 201), "not enough chips");
    // bet small the pre
    assert.throws(
      () => userBet(game.sortedUsers[2], 0),
      "chips should be large than the previous bet user"
    );

    // valid bet
    assert.equal(userBet(game.sortedUsers[2], 2), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[3], 10), true);
    logGame(game);

    assert.throws(
      () => userBet(game.sortedUsers[4], 12),
      "raise should 1.5 times at least"
    );

    assert.equal(userBet(game.sortedUsers[4], 15), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[5], 200), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[0], 200), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[1], 200), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[2], 200), true);
    logGame(game);

    assert.equal(userBet(game.sortedUsers[3], 200), true);
    logGame(game);

    assert.deepEqual(
      game.sortedUsers.map((t) => userMap[t].isAllIn),
      [true, true, true, true, false, true]
    );
  });
});

describe("test nextActUser", () => {
  const tokens = new Array(4).fill(0).map((_, i) => `token-${i}`);

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("1, 2, 0, 0 => 30, 20(all in), 20, 30 => 30, 20(all in), 30, 30", () => {
    // create user
    tokens.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(tokens[0], 1, 200);
    tokens.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(tokens[0]);
    const game = room.game;

    const users = game.sortedUsers.map((t) => userMap[t]);
    const [sb, bb, utg, d] = users;
    // init stack
    // bb, utg, d, sb
    [200, 20, 200, 200].forEach((stack, i) => (users[i].stack = stack));
    logGame(game);
    // check action state
    assert.deepEqual(
      users.map((u) => u.isActing),
      [false, false, true, false]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [1, 2, 0, 0]
    );

    // UTG, bet 20
    userBet(utg.token, 20);
    logGame(game);
    assert.deepEqual(
      users.map((u) => u.isActing),
      [false, false, false, true]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [1, 2, 20, 0]
    );

    // D, raise to 30
    userBet(d.token, 30);
    logGame(game);
    assert.deepEqual(
      users.map((u) => u.isActing),
      [true, false, false, false]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [1, 2, 20, 30]
    );

    // sb, call 30
    userBet(sb.token, 30);
    logGame(game);
    assert.deepEqual(
      users.map((u) => u.isActing),
      [false, true, false, false]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [30, 2, 20, 30]
    );

    // bb, All in 20.
    userBet(bb.token, 20);
    logGame(game);
    assert.deepEqual(
      users.map((u) => u.isActing),
      [false, false, true, false]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [30, 20, 20, 30]
    );
    assert.equal(
      game.sortedUsers.filter(
        (t) => !userMap[t].isAllIn && !userMap[t].isFolded
      ).length,
      3
    );

    // utg call 30, next round
    userBet(utg.token, 30);
    logGame(game);
    assert.deepEqual(
      users.map((u) => u.isActing),
      [true, false, false, false]
    );
    assert.deepEqual(
      users.map((u) => u.bets[0]),
      [30, 20, 30, 30]
    );

    // flop round
    let testCase = 2;
    if (testCase == 1) {
      // sb check
      userBet(sb.token, 0);
      logGame(game);
      assert.equal(game.round, GameRound.Flop);
      assert.deepEqual(
        users.map((u) => u.isActing),
        [false, false, true, false]
      );
      assert.deepEqual(
        users.map((u) => u.bets[1]),
        [0, 0, 0, 0]
      );

      // bb allin skip

      // utg bet 40
      console.log("utg bet 40");
      userBet(utg.token, 40);
      logGame(game);
      assert.equal(game.round, GameRound.Flop);
      assert.deepEqual(
        users.map((u) => u.isActing),
        [false, false, false, true]
      );
      assert.deepEqual(
        users.map((u) => u.bets[1]),
        [0, 0, 40, 0]
      );

      // d fold
      console.log("d fold");
      userFold(d.token);
      logGame(game);
      assert.deepEqual(
        users.map((u) => u.isActing),
        [true, false, false, false]
      );
      assert.deepEqual(
        users.map((u) => u.bets[1]),
        [0, 0, 40, 0]
      );

      console.log("sb fold, settle now");
      userFold(sb.token);
      logGame(game);
    }
    if (testCase == 2) {
      // preflop => [30, 20(allin), 30, 30]
      console.log("sb bet 40");
      userBet(sb.token, 40);
      console.log("utg, d all fold");
      userFold(utg.token);
      userFold(d.token);
      // settle
      logGame(game);
    }
    if (testCase == 3) {
      // preflop => [30, 20(allin), 30, 30]
      console.log("sb bet 40");
      userBet(sb.token, 40);
      // bb allin skip
      console.log("utg call 40");
      userBet(utg.token, 40);
      console.log("d call 40");
      userBet(d.token, 40);
      // next round
      logGame(game);

      // sb bet 70
      userBet(sb.token, 70);
      // bb allin skip
      // utg left 130 chips, raise
      userBet(utg.token, 110);
      // d call 110
      userBet(d.token, 110);
      // sb call 110
      userBet(sb.token, 110);

      logGame(game);
      // next round
      console.log("sb check");
      userBet(sb.token, 0);
      // skip bb
      console.log("utg all in 20");
      userBet(utg.token, 20);
      console.log("d call 20");
      userBet(d.token, 20);
      logGame(game);
      console.log("sb fold");
      userFold(sb.token);
      logGame(game);
      // settle
    }
  });
});

describe("Settle", () => {
  const tokens = new Array(4).fill(0).map((_, i) => `token-${i}`);

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("check to end", () => {
    // create user
    tokens.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(tokens[0], 1, 200);
    tokens.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(tokens[0]);
    const game = room.game;

    const users = game.sortedUsers.map((t) => userMap[t]);
    const [sb, bb, utg, d] = users;
    // preflop
    console.log("508 check to end");
    userBet(utg.token, 2);
    userBet(d.token, 2);
    userBet(sb.token, 2);
    userBet(bb.token, 2);

    // flop, turn, river all check
    for (let i = 0; i < 3; ++i) {
      users.forEach((u) => userBet(u.token, 10));
      logGame(game);
    }
    logGame(game);

    // [200, 20, 200, 200].forEach((stack, i) => (users[i].stack = stack));
  });

  // it("2 user, stack[200, 2] all in as bb", () => {
  //   const user1 = createUser(token1, "A", "");
  //   const user2 = createUser(token2, "B", "");
  //   const room = createRoom(token1, 1, 200);
  //   userEnterRoom(user2.token, room.id);
  //   user2.stack = 2;
  //   userReady(user2.token);
  //   startGame(token1, room.id);
  //   const game = room.game;
  //   const [sb, bb] = game.sortedUsers.map((t) => userMap[t]);
  //   logGame(game);
  //   assert.equal(sb.isActing, true);
  //   assert.equal(bb.isActing, false);

  //   userBet(sb.token, room.id, 2);
  //   logGame(game);
  // });

  // it("20, 40, 60, 200. bet 20 each turn", () => {
  //   console.log("20, 40, 60, 200. bet 20 each turn");
  //   // create user
  //   tokens.forEach((t) => {
  //     createUser(t, t.toUpperCase(), "/pig");
  //   });
  //   const room = createRoom(tokens[0], 1, 200);
  //   tokens.forEach((t, i) => {
  //     userEnterRoom(t, room.id);
  //     userMap[t].stack = 20 * (i + 1);
  //     userReady(t);
  //   });
  //   userMap[tokens[0]].stack = 200;
  //   startGame(tokens[0], room.id);
  //   const game = room.game;
  //   logGame(game);
  //   const users = game.sortedUsers.map((t) => userMap[t]);
  //   const [sb, bb, utg, d] = users;
  //   // preflop
  //   userBet(utg.token, room.id, 20);
  //   userBet(d.token, room.id, 20);
  //   userBet(sb.token, room.id, 20);
  //   userBet(bb.token, room.id, 20);
  //   logGame(game);
  //   // flop, turn, river all check
  //   for (let i = 0; i < 3; ++i) {
  //     users.forEach(
  //       (u) => game.round > 0 && !u.isAllIn && userBet(u.token, room.id, 20)
  //     );
  //     logGame(game);
  //   }
  //   console.log(583);
  //   logGame(game);

  //   // [200, 20, 200, 200].forEach((stack, i) => (users[i].stack = stack));
  // });
});

describe("AutoPlay TestCase", () => {
  const tokens = new Array(4).fill(0).map((_, i) => `token-${i}`);

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("Fold on flop", () => {
    tokens.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(tokens[0], 1, 200);
    tokens.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(tokens[0]);
    const game = room.game;

    const users = game.sortedUsers.map((t) => userMap[t]);
    const [sb, bb, utg, d] = users;
    // pre flop
    logGame(game);
    userBet(utg.token, 2);
    logGame(game);
    userBet(d.token, 2);
    logGame(game);
    userFold(sb.token);
    logGame(game);
    // flop
    userFold(bb.token);
    logGame(game);
    userFold(utg.token);
    logGame(game);
    // logGame(game);
  });
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
