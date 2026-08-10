import { assert } from "chai";
import type { SimpleRoom, SimpleUser } from "../../ApiType";
import {
  addBot,
  createRoom,
  createUser,
  removeBot,
  roomMap,
  setBotAutoReveal,
  startGame,
  userEnterRoom,
  userMap,
  userReady,
} from "../service";
import { publish2all, PokerWebSocket } from "../api/ws";
import { OpponentModel } from "../bot/opponent-model";
import { CurrentGtoStrategyProvider } from "../bot/gto-strategy-provider";
import {
  getBotStrategyProvider,
  setBotStrategyProvider,
} from "../bot/strategy-registry";
import type { BotStrategyProvider } from "../bot/types";

function clean() {
  Object.keys(userMap).forEach((key) => delete userMap[key]);
  Object.keys(roomMap).forEach((key) => delete roomMap[key]);
}

describe("AI bots", () => {
  beforeEach(clean);

  it("adds a ready bot with a resolved style and enforces ten seats", () => {
    const owner = createUser("owner", "Owner", "");
    const room = createRoom(owner.token, 1, 200);
    const first = addBot(owner.token, "random");

    assert.isTrue(first.isBot);
    assert.isTrue(first.isReady);
    assert.equal(first.botStyleSelection, "random");
    assert.include(["standard", "tight", "loose"], first.botStyle);
    assert.include(room.users, first.token);

    for (let index = 0; index < 8; index += 1) {
      addBot(owner.token, "standard");
    }
    assert.lengthOf(room.users, 10);
    assert.throws(() => addBot(owner.token, "loose"), /最多容纳10名玩家/);
  });

  it("keeps a removed bot through the current hand and removes it before the next", () => {
    const owner = createUser("owner", "Owner", "");
    const room = createRoom(owner.token, 1, 200);
    const bot = addBot(owner.token, "tight");
    startGame(owner.token);
    clearTimeout(room.game.actingUserTimer);
    clearTimeout(room.game.botActionTimer);

    removeBot(owner.token, bot.chipsRecordID);

    assert.isTrue(bot.pendingBotRemoval);
    assert.include(room.users, bot.token);
    assert.include(room.game.sortedUsers, bot.token);

    room.game.isSettling = true;
    room.prepareBotsForNextHand();
    assert.notInclude(room.users, bot.token);
    assert.notInclude(room.game.sortedUsers, bot.token);
  });

  it("automatically rebuys a bot to 100BB below 5BB only", () => {
    const owner = createUser("owner", "Owner", "");
    const human = createUser("human", "Human", "");
    const room = createRoom(owner.token, 2, 250);
    userEnterRoom(human.token, room.id);
    const shortBot = addBot(owner.token, "standard");
    const boundaryBot = addBot(owner.token, "tight");
    const shortBotRecord = room.chipsRecords.find(
      (record) => record.id === shortBot.chipsRecordID
    )!;

    // BB is 4 chips: below 5BB means below 20, and 100BB is 400.
    shortBot.stack = 19;
    shortBotRecord.chips = 19;
    shortBot.isReady = false;
    boundaryBot.stack = 20;
    human.stack = 19;

    room.prepareBotsForNextHand();

    assert.equal(shortBot.nextBuyIn, 400);
    assert.isTrue(shortBot.isReady);
    assert.equal(boundaryBot.nextBuyIn, null);
    assert.equal(human.nextBuyIn, null);

    const profitBefore = shortBotRecord.chips - shortBotRecord.buyIn;
    room.applyReadyNextBuyIns();
    assert.equal(shortBot.stack, 400);
    assert.equal(shortBot.nextBuyIn, null);
    assert.equal(shortBotRecord.chips, 400);
    assert.equal(shortBotRecord.chips - shortBotRecord.buyIn, profitBefore);
  });

  it("uses the replaceable strategy provider to perform an action", async () => {
    const previous = getBotStrategyProvider();
    const allInProvider: BotStrategyProvider = {
      id: "test-allin",
      decide: () => ({
        choices: [{ action: "allin", probability: 1 }],
        fallbackAction: "allin",
        source: "test",
      }),
    };
    setBotStrategyProvider(allInProvider);
    try {
      const owner = createUser("owner", "Owner", "");
      const human = createUser("human", "Human", "");
      const room = createRoom(owner.token, 1, 200);
      userEnterRoom(human.token, room.id);
      userReady(human.token);
      const bot = addBot(owner.token, "standard");
      startGame(owner.token);
      clearTimeout(room.game.actingUserTimer);
      clearTimeout(room.game.botActionTimer);
      room.game.sortedUsers.forEach((token) => {
        userMap[token].isActing = false;
        userMap[token].needAction = true;
      });
      bot.isActing = true;

      await room.game.performBotAction(bot.token);

      assert.isTrue(bot.isAllIn);
      clearTimeout(room.game.actingUserTimer);
      clearTimeout(room.game.botActionTimer);
    } finally {
      setBotStrategyProvider(previous);
    }
  });
});

describe("AI auto show", () => {
  beforeEach(clean);

  function withoutTimers<T>(fn: () => T): T {
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (() => 0) as unknown as typeof setTimeout;
    try {
      return fn();
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  }

  /** Owner plus two bots, dealt in, with the acting timers disarmed. */
  function seatOwnerWithBots() {
    const owner = createUser("owner", "Owner", "");
    const room = createRoom(owner.token, 1, 200);
    userReady(owner.token);
    const folder = addBot(owner.token, "standard");
    const shower = addBot(owner.token, "tight");
    startGame(owner.token);
    clearTimeout(room.game.actingUserTimer);
    clearTimeout(room.game.botActionTimer);

    const inbox: any[] = [];
    const socket: PokerWebSocket = {
      send(data: string) {
        inbox.push(JSON.parse(data));
      },
      close() {},
    };
    userMap[owner.token].addWebsocket(socket);

    /** What the owner's client sees for a seat, straight off the wire. */
    const seatSeenByOwner = (chipsRecordID: string): SimpleUser => {
      inbox.length = 0;
      publish2all(room.id);
      const simpleRoom: SimpleRoom = inbox[inbox.length - 1].room;
      return simpleRoom.users.find((user) => user.id === chipsRecordID)!;
    };

    return { owner, room, folder, shower, seatSeenByOwner };
  }

  it("hides mucked bot hands while the switch is off", () => {
    const { room, folder, shower, seatSeenByOwner } = seatOwnerWithBots();

    folder.isFolded = true;
    withoutTimers(() => room.game.settle());

    assert.isFalse(room.botAutoReveal);
    assert.deepEqual(seatSeenByOwner(folder.chipsRecordID).hands, [null, null]);
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, [null, null]);
  });

  it("reveals every bot's hole cards at settlement while the switch is on", () => {
    const { owner, room, folder, shower, seatSeenByOwner } =
      seatOwnerWithBots();
    setBotAutoReveal(owner.token, true);

    // Turning it on mid-hand must not leak live hole cards.
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, [null, null]);

    folder.isFolded = true;
    withoutTimers(() => room.game.settle());

    // Folded bots reveal too, and the hand ended before the river, so this is
    // the auto-show path rather than a real showdown.
    assert.isFalse(folder.shouldShowHand);
    assert.deepEqual(seatSeenByOwner(folder.chipsRecordID).hands, folder.hands);
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, shower.hands);
    // Hole cards only: no hand ranking is invented for an unfinished board.
    assert.equal(seatSeenByOwner(shower.chipsRecordID).handsType, "");
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).maxCards, []);
    // The human's own cards stay private to everyone else.
    assert.deepEqual(seatSeenByOwner(userMap[owner.token].chipsRecordID).hands, [
      null,
      null,
    ]);
  });

  it("hides the bots again once the next hand is dealt", () => {
    const { owner, room, folder, shower, seatSeenByOwner } =
      seatOwnerWithBots();
    setBotAutoReveal(owner.token, true);

    folder.isFolded = true;
    withoutTimers(() => room.game.settle());
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, shower.hands);

    withoutTimers(() => room.game.nextGame());
    clearTimeout(room.game.actingUserTimer);
    clearTimeout(room.game.botActionTimer);

    assert.isTrue(room.botAutoReveal);
    assert.lengthOf(shower.hands, 2);
    assert.deepEqual(seatSeenByOwner(folder.chipsRecordID).hands, [null, null]);
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, [null, null]);
  });

  it("hides the bots again as soon as the switch goes off", () => {
    const { owner, room, folder, shower, seatSeenByOwner } =
      seatOwnerWithBots();
    setBotAutoReveal(owner.token, true);

    folder.isFolded = true;
    withoutTimers(() => room.game.settle());
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, shower.hands);

    setBotAutoReveal(owner.token, false);

    assert.isFalse(room.botAutoReveal);
    assert.deepEqual(seatSeenByOwner(folder.chipsRecordID).hands, [null, null]);
    assert.deepEqual(seatSeenByOwner(shower.chipsRecordID).hands, [null, null]);
  });

  it("only lets the room owner flip the switch", () => {
    const { owner, room } = seatOwnerWithBots();
    const guest = createUser("guest", "Guest", "");
    userEnterRoom(guest.token, room.id);

    assert.throws(() => setBotAutoReveal(guest.token, true), /只有房主/);
    assert.isFalse(room.botAutoReveal);

    setBotAutoReveal(owner.token, true);
    assert.isTrue(room.botAutoReveal);
  });
});

describe("bot opponent model", () => {
  it("builds human tendencies after enough observed hands", () => {
    const model = new OpponentModel();
    for (let hand = 0; hand < 8; hand += 1) {
      model.beginHand(["human"]);
      model.observe({
        token: "human",
        round: 0,
        action: hand < 4 ? "raise" : "fold",
        facingRaise: hand >= 4,
      });
      model.observe({
        token: "human",
        round: 1,
        action: hand < 4 ? "bet" : "fold",
        facingRaise: false,
      });
    }
    const stats = model.summarize(["human"]);
    assert.exists(stats);
    assert.equal(stats!.vpip, 0.5);
    assert.equal(stats!.pfr, 0.5);
    assert.equal(stats!.foldToRaise, 1);
    assert.equal(stats!.postflopAggression, 0.5);
  });
});

describe("current bot strategy adapter", () => {
  it("uses the exact preflop hand mix instead of the whole-range distribution", () => {
    const seats = ["sb", "bb", "utg", "mp", "co", "btn"];
    const players: any = {};
    seats.forEach((token, index) => {
      players[token] = {
        bet: index === 0 ? 1 : index === 1 ? 2 : 0,
        totalBets: index === 0 ? 1 : index === 1 ? 2 : 0,
        stack: 200,
        isFolded: false,
        isAllIn: false,
        hands:
          token === "btn"
            ? [{ num: 13, suit: "h" }, { num: 8, suit: "d" }]
            : [],
      };
    });
    const result = new CurrentGtoStrategyProvider().decide({
      round: 0,
      sortedUsers: seats,
      players,
      boardCards: [],
      bbChips: 2,
      actingToken: "btn",
      raiseCount: 0,
      minimumRaiseTo: 4,
      actionHistory: [],
      heroPositionLabel: "BTN",
      style: "standard",
    });
    assert.exists(result);
    const probabilities: Record<string, number> = {};
    result!.choices.forEach((choice) => {
      probabilities[choice.action] = choice.probability;
    });
    assert.approximately(probabilities.fold, 0.5, 0.001);
    assert.approximately(probabilities.raise, 0.5, 0.001);
  });

  it("passes the hand-8 QQ decision through as a 600-chip 4bet", () => {
    const seats = ["c", "henry", "william", "emma", "chloe", "grace", "lily", "mia"];
    const stacks: Record<string, number> = {
      c: 2070,
      henry: 1760,
      william: 2290,
      emma: 1940,
      chloe: 2070,
      grace: 1870,
      lily: 2070,
      mia: 1930,
    };
    const bets: Record<string, number> = { c: 60, henry: 260, chloe: 60 };
    const folded = new Set(["william", "emma", "grace", "lily", "mia"]);
    const players: any = {};
    seats.forEach((token) => {
      players[token] = {
        bet: bets[token] || 0,
        totalBets: bets[token] || 0,
        stack: stacks[token],
        isFolded: folded.has(token),
        isAllIn: false,
        hands:
          token === "chloe"
            ? [{ num: 12, suit: "s" }, { num: 12, suit: "d" }]
            : [],
      };
    });
    const result = new CurrentGtoStrategyProvider().decide({
      round: 0,
      sortedUsers: seats,
      players,
      boardCards: [],
      bbChips: 20,
      actingToken: "chloe",
      lastRaiserToken: "henry",
      raiseCount: 2,
      minimumRaiseTo: 460,
      actionHistory: [],
      heroPositionLabel: "LJ",
      style: "tight",
    });
    assert.exists(result);
    const raise = result!.choices.find((choice) => choice.action === "raise");
    const allin = result!.choices.find((choice) => choice.action === "allin");
    assert.equal(raise?.probability, 1);
    assert.equal(raise?.sizeChips, 600);
    assert.notExists(allin);
    assert.equal(result!.fallbackAction, "raise");
  });
});
