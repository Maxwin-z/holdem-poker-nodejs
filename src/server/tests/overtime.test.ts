import { assert } from "chai";
import { calculateOvertimeCost } from "../../shared/overtime";
import {
  createRoom,
  createUser,
  roomMap,
  userEnterRoom,
  userMap,
  userOverTime,
} from "../service";
import { Game } from "../service/Room";

function clean() {
  Object.keys(userMap).forEach((key) => delete userMap[key]);
  Object.keys(roomMap).forEach((key) => delete roomMap[key]);
}

function createOvertimeGame() {
  const tokens = new Array(4).fill(0).map((_, index) => `token-${index}`);
  tokens.forEach((token) => createUser(token, token.toUpperCase(), ""));

  const room = createRoom(tokens[0], 1, 200);
  tokens.slice(1).forEach((token) => userEnterRoom(token, room.id));

  const game = new Game(room.id, tokens[0], 1);
  room.game = game;
  game.isSettling = false;
  game.sortedUsers = [...tokens];
  tokens.forEach((token) => {
    userMap[token].isInCurrentGame = true;
    userMap[token].bets = [0, 0, 0, 0];
  });

  return { game, room, tokens };
}

describe("Overtime", () => {
  beforeEach(clean);

  it("starts each action with 20 seconds", () => {
    const { game, tokens } = createOvertimeGame();
    const startedAt = Date.now();

    game.setActingUser(tokens[0]);
    const configuredAt = Date.now();

    assert.equal(userMap[tokens[0]].actionTimeLimit, 20);
    assert.isAtLeast(userMap[tokens[0]].actionEndTime, startedAt + 20000);
    assert.isAtMost(userMap[tokens[0]].actionEndTime, configuredAt + 20000);
    clearTimeout(game.actingUserTimer);
  });

  it("rounds a fractional per-player cost up to a whole chip", () => {
    assert.equal(
      calculateOvertimeCost({
        bigBlind: 2,
        pots: 22,
        playerCount: 4,
        availableStack: 200,
      }),
      2
    );
  });

  it("caps the rounded cost to what the buyer can safely afford", () => {
    assert.equal(
      calculateOvertimeCost({
        bigBlind: 2,
        pots: 22,
        playerCount: 4,
        availableStack: 5,
      }),
      1
    );
    assert.equal(
      calculateOvertimeCost({
        bigBlind: 2,
        pots: 22,
        playerCount: 4,
        availableStack: 4,
      }),
      0
    );
  });

  it("moves only whole chips and preserves the total balance", () => {
    const { game, tokens } = createOvertimeGame();
    const buyer = userMap[tokens[0]];
    buyer.isActing = true;
    userMap[tokens[1]].bets[0] = 22;
    const totalBefore = tokens.reduce(
      (total, token) => total + userMap[token].stack,
      0
    );

    const cost = game.buyOverTimeCard(buyer.token);

    assert.equal(cost, 2);
    assert.equal(buyer.stack, 194);
    tokens.slice(1).forEach((token) => {
      assert.equal(userMap[token].stack, 202);
      assert.equal(Number.isInteger(userMap[token].stack), true);
    });
    assert.equal(
      tokens.reduce((total, token) => total + userMap[token].stack, 0),
      totalBefore
    );
  });

  it("rejects overtime from a player who is not acting", () => {
    const { tokens } = createOvertimeGame();
    let error = "";

    try {
      userOverTime(tokens[1]);
    } catch (caught) {
      error = String(caught);
    }

    assert.equal(error, "当前不是你的行动时间");
  });

  it("resets the acting timer to 30 seconds after a successful purchase", () => {
    const { game, tokens } = createOvertimeGame();
    const buyer = userMap[tokens[0]];
    buyer.isActing = true;
    userMap[tokens[1]].bets[0] = 22;
    const startedAt = Date.now();

    const cost = userOverTime(buyer.token);
    const configuredAt = Date.now();

    assert.equal(cost, 2);
    assert.equal(buyer.actionTimeLimit, 30);
    assert.isAtLeast(buyer.actionEndTime, startedAt + 30000);
    assert.isAtMost(buyer.actionEndTime, configuredAt + 30000);
    clearTimeout(game.actingUserTimer);
  });

  it("does not extend the timer when the buyer cannot afford overtime", () => {
    const { game, tokens } = createOvertimeGame();
    const buyer = userMap[tokens[0]];
    buyer.isActing = true;
    buyer.stack = 4;
    const actionEndTime = buyer.actionEndTime;
    let error = "";

    try {
      userOverTime(buyer.token);
    } catch (caught) {
      error = String(caught);
    }

    assert.equal(error, "剩余筹码不足，无法购买加时");
    assert.equal(buyer.actionEndTime, actionEndTime);
    clearTimeout(game.actingUserTimer);
  });
});
