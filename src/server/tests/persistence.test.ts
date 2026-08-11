import { assert } from "chai";
import { describe } from "mocha";

import {
  addBot,
  createRoom,
  createUser,
  roomMap,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userMap,
  userReady,
} from "../service";
import {
  GameStateStore,
  flushGameStateNow,
  restoreGameState,
  setGameStateStore,
} from "../persistence";

const sb = 1;
const buyIn = 200;

/**
 * Drops the in-memory world exactly the way a process exit would, without
 * leaving armed timers behind to fire into the next test.
 */
function killProcessState() {
  Object.keys(roomMap).forEach((roomid) => {
    const game = roomMap[roomid].game;
    clearTimeout(game.actingUserTimer);
    clearTimeout(game.botActionTimer);
    clearTimeout(game.multiSettleTimer);
    delete roomMap[roomid];
  });
  Object.keys(userMap).forEach((token) => {
    clearTimeout(userMap[token].autoLeaveTimer);
    delete userMap[token];
  });
}

function seatThree() {
  const owner = createUser("token-1", "maxwin", "/pig");
  const alan = createUser("token-2", "alan", "/cat");
  const bob = createUser("token-3", "bob", "/dog");
  const room = createRoom(owner.token, sb, buyIn);
  userEnterRoom(alan.token, room.id);
  userReady(alan.token);
  userEnterRoom(bob.token, room.id);
  userReady(bob.token);
  return room;
}

describe("Game state persistence", () => {
  let store: GameStateStore;

  beforeEach(() => {
    killProcessState();
    store = new GameStateStore(":memory:");
    setGameStateStore(store);
  });

  afterEach(() => {
    killProcessState();
    setGameStateStore(null);
  });

  it("restores a hand in progress after the process dies", () => {
    const room = seatThree();
    startGame("token-1");

    const roomid = room.id;
    const before = {
      cards: JSON.stringify(room.game.cards),
      cardIndex: room.game.cardIndex,
      handSeq: room.game.handSeq,
      sortedUsers: [...room.game.sortedUsers],
      chipsRecords: JSON.stringify(room.chipsRecords),
      hands: room.users.map((t) => JSON.stringify(userMap[t].hands)),
      bets: room.users.map((t) => [...userMap[t].bets]),
      acting: room.game.sortedUsers.find((t) => userMap[t].isActing),
    };
    assert.isOk(before.acting, "somebody should be acting");
    assert.equal(room.game.pendingWait?.kind, "acting");

    flushGameStateNow();
    killProcessState();
    assert.isUndefined(roomMap[roomid]);

    assert.equal(restoreGameState(), 1);

    const restored = roomMap[roomid];
    assert.isOk(restored, "room should come back");
    assert.equal(restored.smallBlind, sb);
    assert.equal(restored.buyIn, buyIn);
    assert.equal(restored.isGaming, true);
    assert.deepEqual(restored.users, ["token-1", "token-2", "token-3"]);
    assert.equal(JSON.stringify(restored.chipsRecords), before.chipsRecords);

    const game = restored.game;
    assert.equal(JSON.stringify(game.cards), before.cards);
    assert.equal(game.cardIndex, before.cardIndex);
    assert.equal(game.handSeq, before.handSeq);
    assert.deepEqual(game.sortedUsers, before.sortedUsers);
    assert.equal(game.isSettling, false);

    restored.users.forEach((token, index) => {
      const user = userMap[token];
      assert.isOk(user, `${token} should come back`);
      assert.equal(user.roomid, roomid);
      assert.equal(JSON.stringify(user.hands), before.hands[index]);
      assert.deepEqual(user.bets, before.bets[index]);
      assert.equal(user.stack, buyIn);
      // Sockets never survive: everyone is disconnected until they return.
      assert.deepEqual(user.wss, []);
      assert.equal(user.isOffline, true);
    });

    // The same player is still on the clock, with a fresh window rather than
    // whatever was left when the process went down.
    assert.equal(
      game.sortedUsers.find((t) => userMap[t].isActing),
      before.acting
    );
    assert.equal(game.pendingWait?.kind, "acting");
    assert.equal(game.pendingWait?.token, before.acting);
    assert.isAbove(game.pendingWait!.dueAt, Date.now());
  });

  it("keeps the owner, blinds and pot accounting through a restart", () => {
    const room = seatThree();
    startGame("token-1");
    const roomid = room.id;

    const actor = room.game.sortedUsers.find((t) => userMap[t].isActing)!;
    userBet(actor, 2); // call the big blind
    const pot = room.users.reduce(
      (total, t) => total + userMap[t].bets.reduce((a, b) => a + b, 0),
      0
    );

    flushGameStateNow();
    killProcessState();
    restoreGameState();

    const restored = roomMap[roomid];
    const restoredPot = restored.users.reduce(
      (total, t) => total + userMap[t].bets.reduce((a, b) => a + b, 0),
      0
    );
    assert.equal(restoredPot, pot);
    assert.equal(userMap["token-1"].isRoomOwner, true);
    assert.equal(userMap[actor].bets[0], 2);
    assert.equal(userMap[actor].totalBets, 2);
  });

  it("brings bots back as seated, online players", () => {
    const owner = createUser("token-1", "maxwin", "/pig");
    const room = createRoom(owner.token, sb, buyIn);
    const bot = addBot(owner.token, "tight");
    const roomid = room.id;
    const botToken = bot.token;

    flushGameStateNow();
    killProcessState();
    restoreGameState();

    const restoredBot = userMap[botToken];
    assert.isOk(restoredBot, "bot should come back");
    assert.equal(restoredBot.isBot, true);
    assert.equal(restoredBot.botStyle, "tight");
    assert.equal(restoredBot.botStyleSelection, "tight");
    // A bot has no socket to reconnect, so it must not read as offline or
    // the next hand would exclude it from the seating order.
    assert.equal(restoredBot.isOffline, false);
    assert.equal(userMap["token-1"].isOffline, true);
    assert.deepEqual(roomMap[roomid].users, ["token-1", botToken]);
  });

  it("finishes a pending settlement that the crash interrupted", async function () {
    this.timeout(10000);
    const room = seatThree();
    startGame("token-1");
    const roomid = room.id;

    // Fold down to one player: settlement is now on a bare setTimeout that a
    // restart would otherwise lose, freezing the table forever.
    userFold(room.game.sortedUsers.find((t) => userMap[t].isActing)!);
    userFold(room.game.sortedUsers.find((t) => userMap[t].isActing)!);
    const winner = room.game.sortedUsers.find((t) => !userMap[t].isFolded)!;
    assert.equal(room.game.pendingWait?.kind, "settle");
    assert.equal(room.game.isSettling, false);

    flushGameStateNow();
    killProcessState();
    restoreGameState();

    const restored = roomMap[roomid];
    assert.equal(restored.game.pendingWait?.kind, "settle");
    assert.equal(restored.game.isSettling, false);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    assert.equal(restored.game.isSettling, true, "settlement should have run");
    assert.isAbove(userMap[winner].stack, buyIn, "winner should collect the pot");
    // Settling immediately queues the next deal, which must also be durable.
    assert.equal(restored.game.pendingWait?.kind, "nextGame");
  });

  it("forgets rooms that no longer exist", () => {
    const room = seatThree();
    const roomid = room.id;
    flushGameStateNow();
    assert.equal(store.loadAll().length, 1);

    delete roomMap[roomid];
    flushGameStateNow();

    assert.equal(store.loadAll().length, 0);
    killProcessState();
    assert.equal(restoreGameState(), 0);
  });

  it("drops snapshots it cannot use instead of failing to start", () => {
    const room = seatThree();
    flushGameStateNow();
    killProcessState();

    // Simulate a row written by an older, incompatible build.
    const corrupted = new GameStateStore(":memory:");
    setGameStateStore(corrupted);
    corrupted.saveAll([
      { roomId: "9999", updatedAt: Date.now(), data: { id: "9999" } },
      {
        roomId: "8888",
        updatedAt: Date.now() - 48 * 60 * 60 * 1000,
        data: { id: "8888", smallBlind: 1, buyIn: 200 },
      },
    ]);

    assert.equal(restoreGameState(), 0);
    assert.isUndefined(roomMap["9999"]);
    assert.isUndefined(roomMap["8888"]);
    // The unusable rows are cleared out rather than retried every boot.
    assert.equal(corrupted.loadAll().length, 1);
    assert.equal(Object.keys(roomMap).length, 0);
    assert.isOk(room);
  });
});
