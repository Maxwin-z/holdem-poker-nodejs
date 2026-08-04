import { assert } from "chai";
import {
  ActionType,
  Card,
} from "../../ApiType";
import {
  createRoom,
  createUser,
  roomMap,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userHangup,
  userMap,
  userReady,
  userRunItOut,
  userSetNextBuyIn,
} from "../service";
import { handlePokerWebSocketMessage } from "../api/ws";
import Room, { Game, GameRound } from "../service/Room";
import User, { Token } from "../service/User";

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
  userBet(sb, 4);
  settleAndAdvance(game, () => userFold(bb));
  return [room, game, users];
}

function testCase_sb199_bb200_sbFold(): [Room, Game, User[]] {
  const [room, game, users] = createGameWithUsers(2);
  const [sb, bb] = users.map((u) => u.token);
  userBet(sb, 199);
  userBet(bb, 200);
  settleAndAdvance(game, () => userFold(sb));
  return [room, game, users];
}

function settleAndAdvance(game: Game, finalAction: () => void) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (() => 0) as unknown as typeof setTimeout;
  try {
    finalAction();
    game.settle();
    game.nextGame();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

describe("Game Test", () => {
  describe("starting a new hand", () => {
    beforeEach(clean);

    it("clears the previous hand for a resting user", () => {
      const [, game, users] = createGameWithUsers(3);
      const restingUser = users[0];

      assert.lengthOf(restingUser.hands, 2);
      restingUser.handsType = "上一手牌型";
      restingUser.actionName = "上一手行动";
      userHangup(restingUser.token);

      clearTimeout(game.actingUserTimer);
      game.start();

      assert.deepEqual(restingUser.hands, []);
      assert.equal(restingUser.handsType, "");
      assert.equal(restingUser.actionName, "");
      clearTimeout(game.actingUserTimer);
    });

    it("clears a resting user's hand as soon as the current hand settles", () => {
      const [room, game, users] = createGameWithUsers(3);
      const restingUser = users[0];
      const originalSetTimeout = global.setTimeout;

      userHangup(restingUser.token);
      assert.lengthOf(restingUser.hands, 2);
      users.slice(1).forEach((user) => (user.isFolded = true));
      room.isGaming = false;
      clearTimeout(game.actingUserTimer);

      global.setTimeout = (() => 0) as unknown as typeof setTimeout;
      try {
        game.settle();
      } finally {
        global.setTimeout = originalSetTimeout;
      }

      assert.deepEqual(restingUser.hands, []);
    });
  });

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
});

describe("all-in runout selection edge case", () => {
  function createFlopAfterShortStackAllIn() {
    const p0 = createUser("runout-0", "P0", "/pig");
    const p1 = createUser("runout-1", "P1", "/pig");
    const p2 = createUser("runout-2", "P2", "/pig");
    const room = createRoom(p0.token, 1, 3);
    userEnterRoom(p1.token, room.id);
    userEnterRoom(p2.token, room.id);
    userReady(p1.token);
    userReady(p2.token);

    startGame(p0.token);
    const game = room.game;
    clearTimeout(game.actingUserTimer);
    const [b, c, a] = game.sortedUsers.map((token) => userMap[token]);
    a.name = "A";
    b.name = "B";
    c.name = "C";

    [b, c].forEach((user) => {
      user.stack = 200;
      const record = getChipsRecoud(room, user.token);
      record.chips = 200;
      record.buyIn = 200;
    });

    const messages: Record<string, any[]> = { A: [], B: [], C: [] };
    [a, b, c].forEach((user) => {
      user.wss = [
        {
          send(data: string) {
            messages[user.name].push(JSON.parse(data));
          },
          close() {},
        },
      ];
    });
    assert.deepEqual(
      game.sortedUsers.map((token) => userMap[token].name),
      ["B", "C", "A"]
    );

    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (() => 0) as unknown as typeof setTimeout;

    userBet(a.token, 3);
    userBet(b.token, 3);
    userBet(c.token, 3);
    game.nextRound();

    assert.equal(game.round, GameRound.Flop);
    assert.lengthOf(game.boardCards, 3);
    assert.isTrue(a.isAllIn);
    assert.isTrue(b.isActing);

    return {
      room,
      game,
      a,
      b,
      c,
      messages,
      restoreTimers() {
        global.setTimeout = originalSetTimeout;
        clearTimeout(game.actingUserTimer);
        clearTimeout(game.multiSettleTimer);
      },
    };
  }

  function runoutPrompts(messages: Record<string, any[]>, name: string) {
    return messages[name].filter(
      (message) => message.selectSettleTimes === 1
    );
  }

  beforeEach(clean);

  it("asks both eligible players when the flop checks through before the other caller folds", () => {
    const { game, a, b, c, messages, restoreTimers } =
      createFlopAfterShortStackAllIn();

    try {
      userBet(b.token, 0);
      userFold(c.token);
      game.nextRound();

      assert.equal(game.round, GameRound.Flop);
      assert.isTrue(game.multiSettleStart);
      assert.isFalse(game.multiSettleConfirm);
      assert.isFalse(game.isSettling);
      assert.deepEqual(
        game.multiSettleUsers.map((token) => userMap[token].name),
        ["B", "A"]
      );
      assert.isFalse(a.isActing);
      assert.isFalse(b.isActing);
      assert.isFalse(c.isActing);
      assert.lengthOf(runoutPrompts(messages, "A"), 1);
      assert.lengthOf(runoutPrompts(messages, "B"), 1);
      assert.lengthOf(runoutPrompts(messages, "C"), 0);

      game.userSetSettleTimes(c.token, 1);
      assert.equal(c.settleTimes, 0);
      assert.equal(game.round, GameRound.Flop);

      game.userSetSettleTimes(a.token, 2);
      assert.equal(game.round, GameRound.Flop);
      assert.isFalse(game.multiSettleConfirm);

      game.userSetSettleTimes(b.token, 1);
      assert.equal(game.round, GameRound.Turn);
      assert.isTrue(game.multiSettleConfirm);
      assert.equal(game.multiSettleTimes, 1);

      game.nextRound();
      assert.equal(game.round, GameRound.River);
      game.nextRound();

      assert.isTrue(game.isSettling);
      assert.lengthOf(game.boardCards, 5);
    } finally {
      restoreTimers();
    }
  });

  it("continues normally when the remaining caller bets the flop before the other caller folds", () => {
    const { game, a, b, c, messages, restoreTimers } =
      createFlopAfterShortStackAllIn();

    try {
      userBet(b.token, 10);
      userFold(c.token);
      game.nextRound();

      assert.equal(game.round, GameRound.Flop);
      assert.lengthOf(runoutPrompts(messages, "A"), 1);
      assert.lengthOf(runoutPrompts(messages, "B"), 1);
      assert.lengthOf(runoutPrompts(messages, "C"), 0);

      game.userSetSettleTimes(a.token, 2);
      game.userSetSettleTimes(b.token, 1);
      assert.equal(game.round, GameRound.Turn);
      assert.isTrue(game.multiSettleConfirm);

      game.nextRound();
      assert.equal(game.round, GameRound.River);
      game.nextRound();

      assert.isTrue(game.isSettling);
      assert.lengthOf(game.boardCards, 5);
      assert.equal(b.settleTimes, 1);
    } finally {
      restoreTimers();
    }
  });
});

describe("settled hand run it out", () => {
  function createSettledGame(boardCardCount: 0 | 3 | 4 = 0) {
    const [room, game, users] = createGameWithUsers(3);
    clearTimeout(game.actingUserTimer);
    game.isSettling = true;
    users.forEach((user) => {
      user.bets = [0, 0, 0, 0];
      user.totalBets = 0;
      user.isActing = false;
      user.isInCurrentGame = true;
      user.isSpectator = false;
    });

    const fixedCards: { [index: number]: Card } = {
      6: { num: 14, suit: "s" }, // burn before flop
      7: { num: 2, suit: "c" },
      8: { num: 3, suit: "d" },
      9: { num: 4, suit: "h" },
      10: { num: 13, suit: "s" }, // burn before turn
      11: { num: 5, suit: "s" },
      12: { num: 12, suit: "s" }, // burn before river
      13: { num: 6, suit: "c" },
    };
    Object.entries(fixedCards).forEach(([index, card]) => {
      game.cards[Number(index)] = card;
    });

    if (boardCardCount === 0) {
      game.boardCards = [];
      game.cardIndex = 6;
    } else if (boardCardCount === 3) {
      game.boardCards = [fixedCards[7], fixedCards[8], fixedCards[9]];
      game.cardIndex = 10;
    } else {
      game.boardCards = [
        fixedCards[7],
        fixedCards[8],
        fixedCards[9],
        fixedCards[11],
      ];
      game.cardIndex = 12;
    }

    const messages: Record<string, any[]> = {};
    users.forEach((user) => {
      messages[user.token] = [];
      user.wss = [
        {
          token: user.token,
          name: user.name,
          send(data: string) {
            messages[user.token].push(JSON.parse(data));
          },
          close() {},
        },
      ];
    });
    return { room, game, users, messages };
  }

  beforeEach(clean);

  it("peeks the original flop, turn, and river while respecting every burn card", () => {
    const { game, users } = createSettledGame(0);
    const originalCardIndex = game.cardIndex;

    const result = userRunItOut(users[0].token);

    assert.deepEqual(result.remainingCards, [
      { num: 2, suit: "c" },
      { num: 3, suit: "d" },
      { num: 4, suit: "h" },
      { num: 5, suit: "s" },
      { num: 6, suit: "c" },
    ]);
    assert.deepEqual(game.boardCards, []);
    assert.equal(game.cardIndex, originalCardIndex);
  });

  it("only peeks the turn and river after the flop", () => {
    const { game, users } = createSettledGame(3);

    const result = userRunItOut(users[0].token);

    assert.deepEqual(result.remainingCards, [
      { num: 5, suit: "s" },
      { num: 6, suit: "c" },
    ]);
    assert.lengthOf(result.boardCards, 5);
    assert.lengthOf(game.boardCards, 3);
  });

  it("only peeks the river after the turn", () => {
    const { game, users } = createSettledGame(4);

    const result = userRunItOut(users[0].token);

    assert.deepEqual(result.remainingCards, [{ num: 6, suit: "c" }]);
    assert.lengthOf(result.boardCards, 5);
    assert.lengthOf(game.boardCards, 4);
  });

  it("pays one big blind to every other hand participant and keeps the ledger balanced", () => {
    const { room, users, messages } = createSettledGame(0);
    const [buyer, foldedRecipient, recipient] = users;
    foldedRecipient.isFolded = true;
    const totalBefore = room.chipsRecords.reduce(
      (total, record) => total + record.chips,
      0
    );

    const result = userRunItOut(buyer.token);

    assert.isTrue(result.paid);
    assert.equal(buyer.stack, 196);
    assert.equal(foldedRecipient.stack, 202);
    assert.equal(recipient.stack, 202);
    assert.deepEqual(messages[buyer.token][0].logs, [
      "你支付了2BB，查看了公共牌",
      "Flop: 2c3d4h，Turn: 5s，River: 6c",
    ]);
    [foldedRecipient, recipient].forEach((user) => {
      assert.equal(
        messages[user.token][0].logs[0],
        `${buyer.name}玩家查看了公共牌，支付了你1BB`
      );
    });
    users.forEach((user) => {
      assert.equal(getChipsRecoud(room, user.token).chips, user.stack);
    });
    assert.equal(
      room.chipsRecords.reduce((total, record) => total + record.chips, 0),
      totalBefore
    );
  });

  it("is completely free when the buyer cannot pay every recipient", () => {
    const { room, users, messages } = createSettledGame(0);
    const buyer = users[0];
    buyer.stack = 3;
    getChipsRecoud(room, buyer.token).chips = 3;
    const stacksBefore = users.map((user) => user.stack);

    const result = userRunItOut(buyer.token);

    assert.isFalse(result.paid);
    assert.deepEqual(
      users.map((user) => user.stack),
      stacksBefore
    );
    assert.deepEqual(messages[buyer.token][0].logs, [
      "你支付了0BB，查看了公共牌",
      "Flop: 2c3d4h，Turn: 5s，River: 6c",
    ]);
    users.slice(1).forEach((user) => {
      assert.equal(
        messages[user.token][0].logs[0],
        `${buyer.name}玩家查看了公共牌，但是他很穷，未支付你任何筹码`
      );
    });
    assert.lengthOf(result.boardCards, 5);
  });

  it("sends cards and the log only to the buyer", () => {
    const { game, users, messages } = createSettledGame(0);
    const buyer = users[0];
    const buyerSocket = buyer.wss[0];

    handlePokerWebSocketMessage(
      buyerSocket,
      JSON.stringify({ action: ActionType.RUN_IT_OUT })
    );

    assert.isTrue(
      messages[buyer.token].some(
        (message) =>
          message.logs?.length === 2 &&
          message.self.runItOutBoardCards.length === 5
      )
    );
    users.slice(1).forEach((user) => {
      const recipientLogs = messages[user.token].reduce(
        (logs: string[], message: any) => [
          ...logs,
          ...(message.logs || []),
        ],
        [] as string[]
      );
      assert.deepEqual(recipientLogs, [
        `${buyer.name}玩家查看了公共牌，支付了你1BB`,
      ]);
      assert.isFalse(
        recipientLogs.some((log: string) =>
          /(Flop|Turn|River|\d+(c|d|h|s))/.test(log)
        )
      );
      assert.isTrue(
        messages[user.token].every(
          (message) => message.self.runItOutBoardCards.length === 0
        )
      );
      assert.isTrue(
        messages[user.token].every(
          (message) => !message.game || message.game.boardCards.length === 0
        )
      );
    });
    assert.deepEqual(game.boardCards, []);
  });

  it("rejects repeat requests, active hands, completed boards, and spectators", () => {
    const { game, users } = createSettledGame(0);
    const buyer = users[0];
    userRunItOut(buyer.token);
    assert.throws(() => userRunItOut(buyer.token), "本手已经发发看过了");

    const active = createSettledGame(0);
    active.game.isSettling = false;
    assert.throws(
      () => userRunItOut(active.users[0].token),
      "当前不能发发看"
    );

    const completed = createSettledGame(4);
    completed.game.boardCards.push({ num: 6, suit: "c" });
    assert.throws(
      () => userRunItOut(completed.users[0].token),
      "公共牌已经发完"
    );

    const spectator = createSettledGame(0);
    spectator.users[0].isSpectator = true;
    assert.throws(
      () => userRunItOut(spectator.users[0].token),
      "当前不能发发看"
    );
  });

  it("clears every private preview when the next hand starts", () => {
    const { game, users } = createSettledGame(0);
    const buyer = users[0];
    userRunItOut(buyer.token);
    assert.lengthOf(game.getRunItOutBoardCards(buyer.token), 5);

    game.start();

    assert.deepEqual(game.getRunItOutBoardCards(buyer.token), []);
    clearTimeout(game.actingUserTimer);
  });
});

describe("next hand buy in", () => {
  const ownerToken = "buy-in-owner";
  const restingToken = "buy-in-resting";
  const leaderToken = "buy-in-leader";

  function createBuyInRoom() {
    const owner = createUser(ownerToken, "OWNER", "/pig");
    const resting = createUser(restingToken, "RESTING", "/pig");
    const leader = createUser(leaderToken, "LEADER", "/pig");
    const room = createRoom(owner.token, 1, 200);
    userEnterRoom(resting.token, room.id);
    userEnterRoom(leader.token, room.id);
    return { room, owner, resting, leader };
  }

  function setLedgerStack(room: Room, user: User, chips: number) {
    user.stack = chips;
    const record = getChipsRecoud(room, user.token);
    record.chips = chips;
  }

  beforeEach(clean);

  it("uses the room buy in as the minimum and the visible chip leader stack as the maximum", () => {
    const { room, owner, resting, leader } = createBuyInRoom();
    setLedgerStack(room, owner, 500);
    owner.bets[0] = 100;
    setLedgerStack(room, resting, 250);
    setLedgerStack(room, leader, 450);

    assert.deepEqual(room.getBuyInBounds(), { min: 200, max: 450 });
  });

  it("accepts both boundaries and any integer between them", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 450);

    userSetNextBuyIn(resting.token, 200);
    assert.equal(resting.nextBuyIn, 200);
    userSetNextBuyIn(resting.token, 317);
    assert.equal(resting.nextBuyIn, 317);
    userSetNextBuyIn(resting.token, 450);
    assert.equal(resting.nextBuyIn, 450);
  });

  it("rejects out-of-range, fractional, ready, and spectator requests", () => {
    const { room, owner, resting, leader } = createBuyInRoom();
    setLedgerStack(room, owner, 450);

    assert.throws(
      () => userSetNextBuyIn(resting.token, 199),
      "带入筹码必须在200到450之间"
    );
    assert.throws(
      () => userSetNextBuyIn(resting.token, 451),
      "带入筹码必须在200到450之间"
    );
    assert.throws(
      () => userSetNextBuyIn(resting.token, 200.5),
      "带入筹码必须是整数"
    );
    assert.throws(
      () => userSetNextBuyIn(owner.token, 300),
      "只有休息中的玩家可以设置下一手带入"
    );
    leader.isSpectator = true;
    assert.throws(
      () => userSetNextBuyIn(leader.token, 300),
      "只有休息中的玩家可以设置下一手带入"
    );
  });

  it("does not change the stack or ledger until the player becomes ready", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 350);
    setLedgerStack(room, resting, 50);
    const record = getChipsRecoud(room, resting.token);

    userSetNextBuyIn(resting.token, 300);

    assert.equal(resting.stack, 50);
    assert.equal(record.chips, 50);
    assert.equal(record.buyIn, 200);
    assert.equal(resting.nextBuyIn, 300);
  });

  it("applies the target stack on ready and updates actual buy in by the same delta", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 350);
    setLedgerStack(room, resting, 50);
    const record = getChipsRecoud(room, resting.token);
    const profitBefore = record.chips - record.buyIn;

    userSetNextBuyIn(resting.token, 300);
    userReady(resting.token);

    assert.equal(resting.isReady, true);
    assert.equal(resting.stack, 300);
    assert.equal(resting.nextBuyIn, null);
    assert.equal(record.chips, 300);
    assert.equal(record.buyIn, 450);
    assert.equal(record.chips - record.buyIn, profitBefore);
    assert.equal(
      room.chipsRecords.reduce((total, item) => total + item.buyIn - item.chips, 0),
      0
    );

    startGame(owner.token);
    assert.equal(resting.isInCurrentGame, true);
    assert.lengthOf(resting.hands, 2);
    assert.equal(resting.stack, 300);
    clearTimeout(room.game.actingUserTimer);
  });

  it("uses the minimum buy in when a busted player readies without choosing a target", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 400);
    setLedgerStack(room, resting, 0);
    const record = getChipsRecoud(room, resting.token);

    userReady(resting.token);

    assert.equal(resting.isReady, true);
    assert.equal(resting.stack, room.buyIn);
    assert.equal(resting.nextBuyIn, null);
    assert.equal(record.chips, room.buyIn);
    assert.equal(record.buyIn, 400);

    startGame(owner.token);
    assert.include(room.game.sortedUsers, resting.token);
    clearTimeout(room.game.actingUserTimer);
  });

  it("keeps a non-zero short stack when readying without choosing a target", () => {
    const { room, resting } = createBuyInRoom();
    setLedgerStack(room, resting, 50);
    const record = getChipsRecoud(room, resting.token);

    userReady(resting.token);

    assert.equal(resting.stack, 50);
    assert.equal(resting.nextBuyIn, null);
    assert.equal(record.chips, 50);
    assert.equal(record.buyIn, 200);
  });

  it("supports lowering the next-hand stack while keeping ledger profit unchanged", () => {
    const { room, owner, resting, leader } = createBuyInRoom();
    setLedgerStack(room, owner, 100);
    setLedgerStack(room, resting, 300);
    setLedgerStack(room, leader, 200);
    const record = getChipsRecoud(room, resting.token);
    const profitBefore = record.chips - record.buyIn;

    userSetNextBuyIn(resting.token, 225);
    userReady(resting.token);

    assert.equal(resting.stack, 225);
    assert.equal(record.chips, 225);
    assert.equal(record.buyIn, 125);
    assert.equal(record.chips - record.buyIn, profitBefore);
    assert.equal(
      room.chipsRecords.reduce(
        (total, item) => total + item.buyIn - item.chips,
        0
      ),
      0
    );
  });

  it("defers applying a new stack when a resting player is still in the current hand", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 400);
    resting.isInCurrentGame = true;
    resting.isReady = false;
    room.game.isSettling = false;

    userSetNextBuyIn(resting.token, 300);
    userReady(resting.token);

    assert.equal(resting.stack, 200);
    assert.equal(resting.nextBuyIn, 300);

    room.applyReadyNextBuyIns();
    assert.equal(resting.stack, 300);
    assert.equal(resting.nextBuyIn, null);
  });

  it("uses a deferred target to qualify a short-stacked player for the next hand", () => {
    const { room, owner, resting } = createBuyInRoom();
    setLedgerStack(room, owner, 399);
    setLedgerStack(room, resting, 1);
    room.isGaming = true;
    room.game = new Game(room.id, owner.token, room.smallBlind);
    room.game.isSettling = false;
    resting.isInCurrentGame = true;

    userSetNextBuyIn(resting.token, 300);
    userReady(resting.token);
    assert.equal(resting.stack, 1);
    assert.equal(resting.nextBuyIn, 300);

    room.game.nextGame();

    assert.equal(room.isGaming, true);
    assert.equal(resting.stack, 300);
    assert.equal(resting.nextBuyIn, null);
    assert.include(room.game.sortedUsers, resting.token);
    clearTimeout(room.game.actingUserTimer);
  });
});
