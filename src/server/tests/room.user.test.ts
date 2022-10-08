import { assert } from "chai";
import {
  createRoom,
  createUser,
  roomMap,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userMap,
  userReady,
  userReBuy,
} from "../service";
import Room, { Game, GameRound } from "../service/Room";
import User, { Token } from "../service/User";
import { logGame } from "./utils";

function clean() {
  Object.keys(userMap).forEach((k) => delete userMap[k]);
  Object.keys(roomMap).forEach((k) => delete roomMap[k]);
}
function createGameWithUsers(n: number): [Room, Game, User[]] {
  const ts = new Array(n).fill(0).map((_, i) => `token-${i}`);
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
  return [room, game, users];
}

function getChipsRecoud(room: Room, token: Token) {
  return room.chipsRecords[
    room.chipsRecords.findIndex((cr) => cr.id == userMap[token].chipsRecordID)
  ];
}

function testCase_bbFold(): [Room, Game, User[]] {
  const [room, game, users] = createGameWithUsers(2);
  const [sb, bb] = users.map((u) => u.token);
  const rid = room.id;
  userBet(sb, 4);
  userFold(bb);
  return [room, game, users];
}

function testCase_sb199_bb200_sbFold(): [Room, Game, User[]] {
  const [room, game, users] = createGameWithUsers(2);
  const [sb, bb] = users.map((u) => u.token);
  const rid = room.id;
  userBet(sb, 199);
  userBet(bb, 200);
  userFold(sb);
  return [room, game, users];
}

describe("Game Test", () => {
  describe("sb raise 4, bb fold.", () => {
    beforeEach(clean);

    it("sb 200 -> 202", () => {
      const [room, game, users] = testCase_bbFold();
      const [sb, bb] = users.map((u) => u.token);
      const sbCr = getChipsRecoud(room, sb);
      assert.equal(sbCr.buyIn, 200);
      assert.equal(sbCr.chips, 202);
    });
    it("bb 200 -> 198", () => {
      const [room, game, users] = testCase_bbFold();
      const [sb, bb] = users.map((u) => u.token);
      const bbCr = getChipsRecoud(room, bb);
      assert.equal(bbCr.buyIn, 200);
      assert.equal(bbCr.chips, 198);
    });
    it("game should be new, in round preflop", () => {
      const [room, game, users] = testCase_bbFold();
      assert.equal(game.round, GameRound.PreFlop);
    });
  });
  describe("sb 199, bb 200, sb fold. ", () => {
    beforeEach(clean);

    it("sb chips should be 1", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users.map((u) => u.token);
      const sbCr = getChipsRecoud(room, sb);
      assert.equal(sbCr.chips, 1);
      assert.equal(sbCr.buyIn, 200);
    });
    it("sb stack should be 1", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users.map((u) => u.token);
      assert.equal(userMap[sb].stack, 1);
    });
    it("bb chips should be 399", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users.map((u) => u.token);
      const bbCr = getChipsRecoud(room, bb);
      assert.equal(bbCr.chips, 399);
      assert.equal(bbCr.buyIn, 200);
    });
    it("bb stack should be 399", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users.map((u) => u.token);
      assert.equal(userMap[bb].stack, 399);
    });
    it("it should be game pause", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      assert.equal(room.isGaming, false);
    });
  });

  describe("re buy in", () => {
    beforeEach(clean);
    it("can rebuy", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users.map((u) => u.token);
      userReBuy(sb);
      assert.equal(userMap[sb].stack, 201);
      const sbCr = getChipsRecoud(room, sb);
      assert.equal(sbCr.chips, 201);
      assert.equal(sbCr.buyIn, 400);
    });

    it("cannot rebuy", () => {
      const [room, game, users] = testCase_bbFold();
      const [sb, bb] = users.map((u) => u.token);
      assert.throws(() => userReBuy(sb), "cannot rebuy now");
    });

    it("re buy and continue game", () => {
      const [room, game, users] = testCase_sb199_bb200_sbFold();
      const [sb, bb] = users;
      userReBuy(sb.token);
      startGame(sb.isRoomOwner ? sb.token : bb.token);
      assert.equal(room.isGaming, true);
      logGame(game);
    });
  });
});
