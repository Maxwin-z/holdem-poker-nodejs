import { v4 as uuidv4 } from "uuid";
import "colors";
import * as fs from "fs";
import * as path from "path";
import { Token } from "./User";

import { roomMap, userMap } from ".";
import {
  parse,
  PlayerInfo,
  pokerTypeName,
  prettify,
  randomHands,
  rank,
  settle,
} from "../utils/game-engine";
import { logGame } from "../tests/utils";
import { publish2all, publishLog2all, send2user } from "../api/ws";
import { Card } from "../../ApiType";
import { buildPreflopAdvice } from "../../gto/preflop/from-game-state";
import { positionForDistance } from "../../gto/preflop/positions";
import { buildPostflopAdvice } from "../../gto/postflop/from-game-state";
import type { GamePlayerState } from "../../gto/preflop/from-game-state";
import type { PreflopAdvice } from "../../gto/preflop/types";
import type {
  PostflopActionRecord,
  PostflopGamePlayerState,
} from "../../gto/postflop/from-game-state";
import type { PostflopAdvice } from "../../gto/postflop/types";
import { calculateOvertimeCost } from "../../shared/overtime";
import {
  DISCONNECTED_ACTION_GRACE_SECONDS,
  INITIAL_ACTION_TIME_SECONDS,
} from "../../shared/actionTimer";
import { OpponentModel } from "../bot/opponent-model";
import { getBotStrategyProvider } from "../bot/strategy-registry";
import type {
  BotAction,
  BotStrategyChoice,
  BotStrategyRequest,
} from "../bot/types";
import { getPlayerAnalyticsStore } from "../analytics/player-analytics";

export type RoomID = string;
export enum GameRound {
  PreFlop = 0,
  Flop = 1,
  Turn = 2,
  River = 3,
}

const BOT_AUTO_REBUY_THRESHOLD_BB = 5;
const BOT_AUTO_REBUY_TARGET_BB = 100;

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

type FnType = () => void;

function delayTry(fn: FnType, delay: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.log("delay try error", fn.toString());
    }
  }, delay);
}

export class Game {
  roomid: RoomID = "";
  smallBlind: number = 0;
  bigBlindUser: Token = "";
  cards: Card[] = [];
  boardCards: Card[] = [];
  cardIndex: number = 0;
  round: GameRound = GameRound.PreFlop;
  sortedUsers: Token[] = [];
  actingUserTimer = setTimeout(() => { }, 0);
  botActionTimer = setTimeout(() => { }, 0);
  isSettling: boolean = true;
  nextGameTime: number = 0;
  roundLeader: Token = ""; // the max bet
  raiseUser: string = "";
  raiseBet: number = 0; // bet of the raise
  raiseBetDiff: number = 0; //  valid rasize count
  raiseCount: number = 0; // raises this round (preflop scenario classification)
  /** Per-street action log (fold/check/call/bet/raise/allin), used by the
   *  postflop GTO engine to reconstruct betting context. */
  actionHistory: PostflopActionRecord[] = [];

  multiSettleStart: boolean = false;
  multiSettleRound: GameRound = GameRound.PreFlop;
  multiSettleConfirm: boolean = false;
  multiSettleTimes: number = 1; // settle times
  multiSettleIndex: number = 0;
  multiSettleUsers: Token[] = [];
  multiSettleTimer = setTimeout(() => { }, 0);
  handSeq: number = 0;
  analyticsHandId: string = "";
  latestAdviceByToken: Record<Token, PreflopAdvice | PostflopAdvice> = {};

  runItOutBoardCardsByUser: { [token: string]: Card[] } = {};

  constructor(
    roomid: RoomID,
    token: Token,
    smallBlind: number
  ) {
    this.roomid = roomid;
    this.bigBlindUser = token;
    this.smallBlind = smallBlind;
  }

  start() {
    roomMap[this.roomid].prepareBotsForNextHand();
    roomMap[this.roomid].applyReadyNextBuyIns();
    if (!this.initUsers()) return;
    this.cards = randomHands(52);
    this.cardIndex = 0;
    this.boardCards = [];
    this.isSettling = false;
    this.round = GameRound.PreFlop;
    this.roundLeader = "";
    this.raiseUser = "";
    this.raiseCount = 0;
    this.actionHistory = [];
    this.latestAdviceByToken = {};

    this.multiSettleStart = false;
    this.multiSettleRound = GameRound.PreFlop;
    this.multiSettleConfirm = false;
    this.multiSettleTimes = 1;
    this.multiSettleIndex = 0;
    this.multiSettleUsers = [];
    clearTimeout(this.multiSettleTimer);
    this.runItOutBoardCardsByUser = {};

    this.sortedUsers = this.sortUsersBySmallBlind();
    if (this.sortedUsers.length < 2) {
      console.log("not enough users");
      return;
    }
    roomMap[this.roomid].opponentModel.beginHand(
      this.sortedUsers.filter((token) => !userMap[token].isBot)
    );
    console.log(new Array(10).fill("==").join(""));
    console.log("START:", this.sortedUsers);
    console.log(prettify(this.cards));
    this.handSeq += 1;
    this.analyticsHandId = uuidv4();
    publishLog2all(this.roomid, [
      `<div class="log-banner log-banner--start">🂠 第 ${this.handSeq} 手开始</div>`,
    ]);

    this.dealCards2User();
    this.doPreBet();
    publish2all(this.roomid);
    logGame(this);
  }
  nextGame() {
    if (!roomMap[this.roomid].isGaming) return;
    roomMap[this.roomid].prepareBotsForNextHand();
    const tokens = roomMap[this.roomid].users;
    const currentBBIndex = tokens.findIndex((t) => t == this.bigBlindUser);
    for (let i = 0; i < tokens.length - 1; ++i) {
      const bbToken = tokens[(currentBBIndex + i + 1) % tokens.length];
      const user = userMap[bbToken];
      const nextStack = user.nextBuyIn ?? user.stack;
      if (user.isReady && nextStack >= this.smallBlind * 2) {
        this.bigBlindUser = bbToken;
        this.start();
        return;
      }
    }
    // not enough users, pause game
    this.initUsers();
    console.log("cannot find big blind");
    this.isSettling = true;
    roomMap[this.roomid].pauseGameInteral();
  }
  initUsers() {
    roomMap[this.roomid].users.forEach((t) => {
      const user = userMap[t];
      user.isActing = false;
      user.isAllIn = false;
      user.isFolded = false;
      user.needAction = false;
      user.isInCurrentGame = false;
      user.isWinner = false;
      user.positon = "";
      user.clearHand();
      user.actionName = "";
      user.bets = [0, 0, 0, 0];
      user.totalBets = 0;
      user.profits = 0;
      user.settleTimes = 0;
    });
    let balance = 0;
    roomMap[this.roomid].chipsRecords.forEach(cr => {
      balance += cr.buyIn - cr.chips;
    });
    console.log(`balance: ${balance}`);
    if (balance !== 0) {
      publishLog2all(this.roomid, [`<strong style="color: red;">⚠️注意，帐不平，差异${balance}。游戏无法继续，请核算，并将日志保留。</strong>`]);
      return false;
    }
    return true;
  }
  sortUsersBySmallBlind(): Token[] {
    let tokens = roomMap[this.roomid].users.filter(
      (t) =>
        !userMap[t].isOffline &&
        userMap[t].isReady &&
        userMap[t].stack >= this.smallBlind * 2
    );
    if (tokens.length < 2) {
      console.log(`only ${tokens} user left, pause game`);
      this.isSettling = true;
      roomMap[this.roomid].pauseGameInteral();
      return [];
    }
    const smallBlindIndex =
      (tokens.findIndex((t) => t === this.bigBlindUser) + (tokens.length - 1)) %
      tokens.length;
    return [
      ...tokens.slice(smallBlindIndex),
      ...tokens.slice(0, smallBlindIndex),
    ];
  }
  removeUser(token: Token) {
    this.sortedUsers = this.sortedUsers.filter((t) => t !== token);
  }
  doPreBet() {
    const sb = userMap[this.sortedUsers[0]];
    const bb = userMap[this.sortedUsers[1]];
    sb.bets[0] = sb.totalBets = roomMap[this.roomid].smallBlind;
    bb.bets[0] = bb.totalBets = roomMap[this.roomid].smallBlind * 2;
    if (bb.stack == bb.bets[0]) {
      bb.isAllIn = true;
    }
    sb.positon = "SB";
    bb.positon = "BB";
    this.raiseBet = bb.bets[0];
    this.raiseBetDiff = bb.bets[0]; // 1,2 -> 4. bet diff should >= bb.
    if (this.sortedUsers.length > 2) {
      userMap[this.sortedUsers[this.sortedUsers.length - 1]].positon = "D";
    }
    this.sortedUsers.forEach((t) => {
      userMap[t].needAction = true;
      userMap[t].isInCurrentGame = true;
    });
    this.beginAnalyticsHand();
    this.nextActUser(bb.token);
  }
  maxPreBet() {
    return Math.max(
      ...this.sortedUsers.map((t) => userMap[t].bets[this.round])
    );
  }
  bet(token: Token, chips: number) {
    const user = userMap[token];
    if (!user.isActing) {
      console.error("BET: not action", user.name);
      throw "not your action now";
    }
    const preRoundBets = sum([...user.bets].slice(0, this.round));
    const availableStack = user.stack - preRoundBets;
    // console.log(`round ${this.round}:`, user.token, user.stack, availableStack);
    if (chips > availableStack) {
      console.error("BET:", user.name, chips, "not enough", userMap[token]);
      throw "not enough chips";
    }
    const preBets = this.maxPreBet();
    const raiseLevel = this.raiseCount;
    const facingRaise =
      this.round === GameRound.PreFlop
        ? this.raiseCount > 0
        : preBets > user.bets[this.round];
    if (chips < preBets && chips < availableStack) {
      throw "chips should be large than the previous bet user";
    }
    // raise
    if (chips > preBets) {
      // all in
      if (chips < this.raiseBet + this.raiseBetDiff) {
        if (chips < availableStack) {
          throw "raise should greater than " + this.raiseBetDiff;
        }
      } else {
        // valid raise
        this.raiseUser = user.chipsRecordID;
        this.raiseBetDiff = chips - this.raiseBet;
        this.raiseBet = chips;
      }
      // Count accepted bets above the current max (valid raises and short
      // all-ins) as a raise for preflop scenario classification.
      this.raiseCount += 1;
      // user raise, other users need react
      this.sortedUsers
        .filter((t) => !userMap[t].isAllIn && !userMap[t].isFolded)
        .forEach((t) => t != token && (userMap[t].needAction = true));
      this.roundLeader = token;
    }
    // bet
    console.log(
      `USER ${chips == availableStack ? "AllIn" : chips == preBets ? "Call" : "NBet"
        }:`.green,
      user.name,
      prettify(user.hands),
      chips
    );

    const pos = this.positionLabelOf(token);
    let log = `<strong class="log-player">${user.name}</strong><span class="log-pos">${pos}</span> `;
    const delta = chips - user.bets[this.round];
    const actionType =
      chips === availableStack && chips > preBets
        ? "allin"
        : delta === 0
        ? "check"
        : chips > preBets
        ? preBets === 0
          ? "bet"
          : "raise"
        : "call";
    this.actionHistory.push({
      round: this.round,
      type: actionType,
      token,
      amount: chips,
    });
    if (!user.isBot) {
      this.recordHumanAction(
        token,
        actionType,
        chips / (this.smallBlind * 2),
        facingRaise,
        raiseLevel
      );
      roomMap[this.roomid].opponentModel.observe({
        token,
        round: this.round,
        action: actionType,
        facingRaise,
      });
    }
    if (chips == availableStack) {
      log += `<span class="log-act log-act--allin">全下</span> ${chips}`;
      user.actionName = "AllIn";
    } else {
      if (delta == 0) {
        log += `<span class="log-act log-act--check">过牌</span>`;
        user.actionName = "Check";
      } else {
        if (chips > preBets) {
          if (preBets == 0) {
            log += `<span class="log-act log-act--bet">下注</span> ${chips}`;
            user.actionName = "Bet";
          } else {
            log += `<span class="log-act log-act--raise">加注到</span> ${chips}`;
            user.actionName = "Raise";
          }
        } else {
          log += `<span class="log-act log-act--call">跟注</span> ${chips}`;
          user.actionName = "Call";
        }
      }
    }
    publishLog2all(this.roomid, [log]);

    user.bets[this.round] = chips;
    user.totalBets = sum(user.bets);
    this.setActed(token);

    if (chips == availableStack) {
      user.isAllIn = true;
    }
    this.nextActUser(token);
    return true;
  }
  fold(token: Token) {
    const user = userMap[token];
    if (!user.isActing) {
      console.error("FOLD: not action", user.name);
      throw "not your action now";
    }
    console.log(`USER Fold: ${user.name}`.green, prettify(user.hands));
    const pos = this.positionLabelOf(token);
    publishLog2all(this.roomid, [
      `<strong class="log-player">${user.name}</strong><span class="log-pos">${pos}</span> <span class="log-act log-act--fold">弃牌</span>`,
    ]);
    user.isFolded = true;
    user.actionName = "Fold";
    this.actionHistory.push({ round: this.round, type: "fold", token });
    if (!user.isBot) {
      const facingRaise =
        this.round === GameRound.PreFlop
          ? this.raiseCount > 0
          : this.maxPreBet() > user.bets[this.round];
      this.recordHumanAction(
        token,
        "fold",
        undefined,
        facingRaise,
        this.raiseCount
      );
      roomMap[this.roomid].opponentModel.observe({
        token,
        round: this.round,
        action: "fold",
        facingRaise,
      });
    }
    this.setActed(token);
    if (!this.decreaseActiveUserToSettle()) {
      this.nextActUser(token);
    }
  }
  decreaseActiveUserToSettle(): boolean {
    const tokens = this.sortedUsers.filter((t) => !userMap[t].isFolded);
    // only 1 user not fold
    if (tokens.length == 1) {
      delayTry(() => {
        this.settle();
      }, 2000);
      return true;
    }
    return false;
  }
  settle() {
    console.log("SETTLE NOW");
    logGame(this);

    const subTotal = (total: number) => {
      const chips = Math.floor(total / this.multiSettleTimes);
      if (this.multiSettleIndex < this.multiSettleTimes - 1) {
        return chips;
      } else {
        return total - (this.multiSettleTimes - 1) * chips;
      }
    };

    const availableUsers = this.sortedUsers
      .filter((t) => !userMap[t].isFolded)
      .map((t) => userMap[t]);

    const players: PlayerInfo[] = this.sortedUsers.map((t) => {
      const user = userMap[t];
      return {
        id: user.token,
        total: subTotal(user.totalBets),
        profits: 0,
        fold: user.isFolded,
        cards: [...user.hands, ...this.boardCards],
      };
    });

    // console.log(JSON.stringify(players, null, 2));
    const ps = settle(players, 1);

    // just log
    ps.forEach((p) => {
      const user = userMap[p.id];
      const total = subTotal(user.totalBets);
      console.log(
        `${user.name} ${prettify(user.hands)} Stage: ${p.stage} Max: ${prettify(
          p.maxCards!
        )}  total: ${total} ${p.fold ? "Fold" : "Alive"} Profits: ${p.profits
        } Stack:${user.stack} => ${user.stack + p.profits! - total}`
      );
    });
    // end log

    const crs = roomMap[this.roomid].chipsRecords;
    const logs: string[] = [];

    const leaderIndex = this.sortedUsers.findIndex(
      (t) => t === this.roundLeader
    );
    const actionOrder = [
      ...this.sortedUsers.slice(leaderIndex),
      ...this.sortedUsers.slice(0, leaderIndex),
    ];
    const winnerMap: { [x: string]: boolean } = {};
    ps.forEach((p) => {
      if (p.isWinner) {
        winnerMap[p.id] = true;
      }
    });
    let lastWinnerIndex = 0;
    actionOrder.forEach((t, i) => {
      if (winnerMap[t]) {
        lastWinnerIndex = i;
      }
    });

    ps.forEach((p) => {
      const user = userMap[p.id];
      const profits = p.profits! - subTotal(user.totalBets);
      user.bets = [0, 0, 0, 0];
      user.stack += profits;
      user.profits = profits;
      user.isWinner = p.isWinner || false;
      user.maxCards = p.maxCards || [];
      user.actionName = "";
      const index = actionOrder.findIndex((t) => t === p.id);
      user.shouldShowHand =
        this.round === GameRound.River &&
        availableUsers.length > 1 &&
        (user.isAllIn || (!user.isFolded && index <= lastWinnerIndex));

      logs.push(
        `<strong class="log-player">${user.name}</strong> ${user.shouldShowHand
          ? `【${user.hands
            .map((c) => `${c.num}${c.suit}`)
            .join("")}】${p.maxCards
              ?.map((c) => `${c.num}${c.suit}`)
              .join("")} ${user.handsType} `
          : ""
        }<span class="log-profit log-profit--${
          profits >= 0 ? "win" : "lose"
        }">${profits >= 0 ? "+" : ""}${profits}</span>`
      );
      if (user.stack < this.smallBlind * 2 && user.nextBuyIn === null) {
        user.isReady = false;
      }
      crs.find((cr) => cr.id === user.chipsRecordID)!.chips = user.stack;
      if (!user.isBot) {
        this.recordAnalyticsSettlement(
          p.id,
          profits / (this.smallBlind * 2),
          Boolean(p.isWinner),
          availableUsers.length > 1,
          this.multiSettleIndex >= this.multiSettleTimes - 1
        );
      }
    });

    publishLog2all(this.roomid, logs);

    // just log
    this.sortedUsers.forEach((t) => {
      const user = userMap[t];
      console.log(`${user.token}, Stack: ${user.stack}`);
    });
    // end log

    if (++this.multiSettleIndex < this.multiSettleTimes) {
      publishLog2all(this.roomid, [`第${this.multiSettleIndex + 1}轮`]);
      // new one
      this.round = this.multiSettleRound;
      switch (this.round) {
        case GameRound.PreFlop:
          this.boardCards = [];
          break;
        case GameRound.Flop:
          this.boardCards = this.boardCards.slice(0, 3);
          break;
        case GameRound.Turn:
          this.boardCards = this.boardCards.slice(0, 4);
          break;
      }

      publish2all(this.roomid);
      delayTry(() => {
        this.nextRound();
      }, 3000);
      return;
    }

    publishLog2all(this.roomid, [
      `<div class="log-banner log-banner--end">💰 第 ${this.handSeq} 手结束</div>`,
    ]);

    // next game
    roomMap[this.roomid].users.forEach((t) => {
      const user = userMap[t];
      if (!user.isReady) {
        user.clearHand();
      }
    });
    this.isSettling = true;
    const delay = 6000; // after 6s, start next game
    this.nextGameTime = Date.now() + delay;
    publish2all(this.roomid);
    delayTry(() => {
      this.nextGame();
    }, delay);
  }
  dealCards2User() {
    // deal cards to ready user
    this.sortedUsers.forEach((t) => {
      const user = userMap[t];
      if (user.isReady) {
        user.hands = parse(
          [this.cards[this.cardIndex], this.cards[this.cardIndex + 1]],
          false
        );
        this.cardIndex += 2;
        user.isFolded = false;
      }
    });
    this.calcUserRank();
  }
  nextActUser(current: Token): void {
    const currentIndex = this.sortedUsers.findIndex((t) => t == current);
    for (let i = 0; i < this.sortedUsers.length - 1; ++i) {
      let t =
        this.sortedUsers[(currentIndex + 1 + i) % this.sortedUsers.length];
      const user = userMap[t];
      if (!user.isFolded && !user.isAllIn && user.needAction) {
        this.setActingUser(t);
        return;
      }
    }
    delayTry(() => {
      this.nextRound();
    }, 1000);
  }
  nextRound(): void {
    if (this.round === GameRound.River) {
      console.log("already river turn, goto settle");
      this.settle();
      return;
    }

    const activeUsers = this.sortedUsers.filter(
      (t) => !userMap[t].isFolded && !userMap[t].isAllIn
    );

    console.log("nextRound", activeUsers);

    // only one or zero user need act
    if (activeUsers.length <= 1) {
      // avaiable user show all show hand
      this.sortedUsers.forEach((t) => {
        const user = userMap[t];
        if (user.isInCurrentGame && !user.isFolded) {
          user.shouldShowHand = true;
        }
      });

      const settleUsers = this.multiSettleStart
        ? this.multiSettleUsers
        : this.sortedUsers.filter((t) => {
            const user = userMap[t];
            return (
              !user.isFolded &&
              user.isInCurrentGame &&
              user.totalBets > 0
            );
          });

      console.log("multi settle users:", settleUsers);

      // decide
      if (!this.multiSettleStart) {
        this.multiSettleStart = true;
        this.multiSettleRound = this.round;
        this.multiSettleIndex = 0;
        this.multiSettleUsers = settleUsers;

        // A runout decision needs at least two players who can still win a pot.
        // Never enter a waiting state when there is nobody to answer it.
        if (settleUsers.length < 2) {
          this.multiSettleTimes = 1;
          this.multiSettleConfirm = true;
        } else {
          // multiple settle users
          publish2all(this.roomid);

          settleUsers.forEach((t) => {
            send2user(t, {
              selectSettleTimes: 1,
            });
            if (userMap[t].isBot) {
              delayTry(() => this.userSetSettleTimes(t, 1), 650);
            }
          });

          this.multiSettleTimer = delayTry(() => {
            this.multiSettleUsers.forEach((t) => {
              this.userSetSettleTimes(t, 4);
              send2user(t, {
                selectSettleTimes: 0,
              });
            });
          }, 30000);

          const log =
            "玩家" +
            settleUsers.map((t) => userMap[t].name).join(", ") +
            "决定发牌次数";
          publishLog2all(this.roomid, [log]);

          return;
        }
      } else if (!this.multiSettleConfirm) {
        // check all settle users selected
        const settleTimes = Math.min(
          ...this.multiSettleUsers.map((t) => userMap[t].settleTimes)
        );
        console.log("times", settleTimes);
        if (!Number.isFinite(settleTimes)) {
          this.multiSettleTimes = 1;
          this.multiSettleConfirm = true;
        } else if (settleTimes === 0) {
          // wait for other user
          return;
        } else {
          this.multiSettleTimes = settleTimes;
          this.multiSettleConfirm = true;
          publishLog2all(this.roomid, [`发${settleTimes}次`]);
        }
      }
    }

    this.round += 1;
    if (this.round === GameRound.Flop) {
      try {
        getPlayerAnalyticsStore().markSawFlop(
          this.analyticsHandId,
          this.sortedUsers.filter(
            (token) => !userMap[token].isBot && !userMap[token].isFolded
          )
        );
      } catch (error) {
        console.warn("player analytics mark flop failed", error);
      }
    }
    this.roundLeader = "";
    this.sortedUsers.forEach((t) => (userMap[t].actionName = ""));
    this.raiseUser = "";
    this.raiseBet = 0;
    this.raiseBetDiff = this.smallBlind * 2;
    this.raiseCount = 0;
    const r = this.round;
    const roundName =
      r === GameRound.PreFlop
        ? "PreFlop"
        : r === GameRound.Flop
          ? "Flop"
          : r === GameRound.Turn
            ? "Turn"
            : r === GameRound.River
              ? "River"
              : "Invalid";

    const roundLabel =
      r === GameRound.PreFlop
        ? "翻前"
        : r === GameRound.Flop
          ? "翻牌"
          : r === GameRound.Turn
            ? "转牌"
            : r === GameRound.River
              ? "河牌"
              : roundName;
    let log = `<span class="log-round-title">${roundLabel}</span> `;
    // deal cards
    this.cardIndex += 1; // skip one
    if (this.round === GameRound.Flop) {
      for (let i = 0; i < 3; ++i) {
        const card = this.cards[this.cardIndex];
        this.boardCards.push(card);
        console.log("deal card", prettify([card]));
        log += `${card.num}${card.suit}`;
        this.cardIndex += 1;
      }
    } else {
      const card = this.cards[this.cardIndex];
      this.boardCards.push(card);
      console.log("deal card", prettify([card]));
      this.cardIndex += 1;
      log += `${card.num}${card.suit}`;
    }

    this.calcUserRank();

    publishLog2all(this.roomid, [log]);

    if (activeUsers.length <= 1) {
      delayTry(() => {
        this.nextRound();
      }, 1000);
    } else {
      activeUsers.forEach((t) => (userMap[t].needAction = true));
      const token = activeUsers[0];
      this.roundLeader = token;
      this.setActingUser(token);
    }
    publish2all(this.roomid);
  }
  setActingUser(token: Token, requestedDelay?: number) {
    const user = userMap[token];
    let delay = requestedDelay ?? INITIAL_ACTION_TIME_SECONDS * 1000;
    if (
      requestedDelay === undefined &&
      user.isOffline &&
      !user.hasUsedOfflineActionGrace
    ) {
      delay =
        (INITIAL_ACTION_TIME_SECONDS + DISCONNECTED_ACTION_GRACE_SECONDS) *
        1000;
      user.hasUsedOfflineActionGrace = true;
    }

    user.actionStartTime = Date.now();
    user.isActing = true;
    user.actionEndTime = user.actionStartTime + delay;
    user.actionTimeLimit = Math.ceil(delay / 1000);
    console.log("setActingUser", user.name);
    this.scheduleActionTimeout(token, delay);
    if (user.isBot) {
      this.scheduleBotAction(token);
    } else {
      this.publishGtoAdvice(token);
    }
  }

  private buildBotStrategyRequest(token: Token): BotStrategyRequest {
    const players: BotStrategyRequest["players"] = {};
    this.sortedUsers.forEach((playerToken) => {
      const player = userMap[playerToken];
      players[playerToken] = {
        bet: player.bets[this.round],
        totalBets: player.totalBets,
        stack: player.stack,
        isFolded: player.isFolded,
        isAllIn: player.isAllIn,
        hands: player.hands,
      };
    });
    const lastRaiserToken = this.raiseUser
      ? this.sortedUsers.find(
          (playerToken) =>
            userMap[playerToken].chipsRecordID === this.raiseUser
        )
      : undefined;
    const humanOpponents = this.sortedUsers.filter(
      (playerToken) =>
        playerToken !== token &&
        !userMap[playerToken].isBot &&
        !userMap[playerToken].isFolded
    );
    return {
      round: this.round,
      sortedUsers: this.sortedUsers,
      players,
      boardCards: this.boardCards,
      bbChips: this.smallBlind * 2,
      actingToken: token,
      lastRaiserToken,
      raiseCount: this.raiseCount,
      actionHistory: this.actionHistory,
      heroPositionLabel: this.positionLabelOf(token),
      style: userMap[token].botStyle,
      opponentTendencies:
        roomMap[this.roomid].opponentModel.summarize(humanOpponents),
    };
  }

  private scheduleBotAction(token: Token) {
    clearTimeout(this.botActionTimer);
    const thinkingTime = 650 + Math.floor(Math.random() * 700);
    this.botActionTimer = delayTry(() => {
      this.performBotAction(token).catch((error) => {
        console.warn("bot action failed", error);
        this.performSafeBotFallback(token);
      });
    }, thinkingTime);
  }

  async performBotAction(token: Token) {
    const user = userMap[token];
    if (!user?.isBot || !user.isActing || this.isSettling) return;
    const result = await getBotStrategyProvider().decide(
      this.buildBotStrategyRequest(token)
    );
    if (!user.isActing || this.isSettling) return;
    if (!result) {
      this.performSafeBotFallback(token);
      return;
    }
    const choices = this.canonicalBotChoices(
      token,
      result.choices.length > 0
        ? result.choices
        : [{ action: result.fallbackAction, probability: 1 }]
    );
    const total = choices.reduce((sum, choice) => sum + choice.probability, 0);
    let roll = Math.random() * total;
    let selected = choices[choices.length - 1];
    for (const choice of choices) {
      roll -= choice.probability;
      if (roll <= 0) {
        selected = choice;
        break;
      }
    }
    console.log(
      "[BOT]",
      user.name,
      result.source,
      "=>",
      selected.action,
      selected.sizeChips ?? "-"
    );
    this.executeBotChoice(token, selected);
    publish2all(this.roomid);
  }

  private canonicalBotChoices(
    token: Token,
    choices: BotStrategyChoice[]
  ): BotStrategyChoice[] {
    const user = userMap[token];
    const currentBet = this.maxPreBet();
    const facingBet = currentBet > user.bets[this.round];
    const byAction: Partial<Record<BotAction, BotStrategyChoice>> = {};
    choices.forEach((choice) => {
      let action = choice.action;
      if (!facingBet && (action === "fold" || action === "call")) action = "check";
      if (facingBet && action === "check") action = "fold";
      if (facingBet && action === "bet") action = "raise";
      if (!facingBet && action === "raise") action = "bet";
      const existing = byAction[action];
      if (existing) {
        existing.probability += choice.probability;
      } else if (choice.probability > 0) {
        byAction[action] = { ...choice, action };
      }
    });
    const normalized = Object.keys(byAction).map(
      (action) => byAction[action as BotAction]!
    );
    return normalized.length > 0
      ? normalized
      : [{ action: facingBet ? "fold" : "check", probability: 1 }];
  }

  private executeBotChoice(token: Token, choice: BotStrategyChoice) {
    const user = userMap[token];
    const previousStreetBets = sum(user.bets.slice(0, this.round));
    const maxTo = user.stack - previousStreetBets;
    const currentBet = this.maxPreBet();
    if (choice.action === "fold") {
      this.fold(token);
      return;
    }
    if (choice.action === "check" || choice.action === "call") {
      this.bet(token, Math.min(currentBet, maxTo));
      return;
    }
    if (choice.action === "allin") {
      this.bet(token, maxTo);
      return;
    }
    if (maxTo <= currentBet) {
      this.bet(token, maxTo);
      return;
    }
    const minimumRaiseTo = this.raiseBet + this.raiseBetDiff;
    const suggested = choice.sizeChips === Infinity
      ? maxTo
      : Number.isFinite(choice.sizeChips)
      ? Math.round(choice.sizeChips!)
      : minimumRaiseTo;
    this.bet(token, Math.min(maxTo, Math.max(minimumRaiseTo, suggested)));
  }

  private performSafeBotFallback(token: Token) {
    const user = userMap[token];
    if (!user?.isActing) return;
    const currentBet = this.maxPreBet();
    if (currentBet > user.bets[this.round]) this.fold(token);
    else this.bet(token, user.bets[this.round]);
    publish2all(this.roomid);
  }

  /**
   * Compute GTO guidance for the acting player (preflop charts or the
   * postflop engine) and push it only to that player's chat feed (hole cards
   * must stay private). Returns whether advice was sent.
   */
  publishGtoAdvice(token: Token): boolean {
    if (this.isSettling) return false;
    try {
      const players: Record<
        string,
        GamePlayerState & PostflopGamePlayerState
      > = {};
      for (const t of this.sortedUsers) {
        const u = userMap[t];
        players[t] = {
          bet: u.bets[this.round],
          totalBets: u.totalBets,
          stack: u.stack,
          isFolded: u.isFolded,
          isAllIn: u.isAllIn,
          hands: u.hands,
        };
      }
      let advice: PreflopAdvice | PostflopAdvice | null = null;
      if (this.round === GameRound.PreFlop) {
        const lastRaiserToken = this.raiseUser
          ? this.sortedUsers.find(
              (t) => userMap[t].chipsRecordID === this.raiseUser
            )
          : undefined;
        advice = buildPreflopAdvice({
          sortedUsers: this.sortedUsers,
          players,
          bbChips: this.smallBlind * 2,
          actingToken: token,
          lastRaiserToken,
          raiseCount: this.raiseCount,
        });
      } else {
        advice = buildPostflopAdvice({
          round: this.round,
          sortedUsers: this.sortedUsers,
          players,
          boardCards: this.boardCards,
          bbChips: this.smallBlind * 2,
          actingToken: token,
          actionHistory: this.actionHistory,
          heroPositionLabel: this.positionLabelOf(token),
        });
      }
      if (!advice) return false;
      this.latestAdviceByToken[token] = advice;
      send2user(token, {
        logs: [
          {
            type: "gto",
            text: advice.hero?.message || "GTO 建议",
            data: advice,
            actingId: userMap[token].chipsRecordID,
            handSeq: this.handSeq,
          },
        ],
      });
      console.log(
        "[GTO]",
        userMap[token].name,
        advice.heroHandKey || "-",
        advice.kind === "preflop" ? advice.scenario : advice.street,
        advice.heroPositionLabel,
        "=>",
        advice.recommended,
        advice.recommendedSizeBB ?? advice.recommendedSizeChips ?? "-"
      );
      this.writeGtoLog(advice, token);
      return true;
    } catch (e) {
      console.warn("publishGtoAdvice failed:", e);
      return false;
    }
  }

  /**
   * Persist every GTO suggestion to logs/gto-advice.jsonl for offline
   * analysis. Compact record: no range grids, only decision-relevant fields.
   */
  private writeGtoLog(advice: PreflopAdvice | PostflopAdvice, token: Token) {
    try {
      const dir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const user = userMap[token];
      const common = {
        ts: new Date().toISOString(),
        roomid: this.roomid,
        player: user.name,
        hand: advice.heroHandKey,
        position: advice.heroPositionLabel,
        recommended: advice.recommended,
        sizeBB: advice.recommendedSizeBB,
        sizeChips: advice.recommendedSizeChips,
        distribution: advice.actionDistribution,
        notes: advice.notes,
      };
      const record = {
        ...common,
        ...(advice.kind === "preflop"
          ? {
              stage: "preflop",
              stackBB: advice.stackBB,
              potBB: advice.potBB,
              scenario: advice.scenario,
              villainPosition: advice.villainPosition,
            }
          : {
              stage: advice.street,
              board: advice.board.join(" "),
              stackBB: advice.effectiveStackBB,
              potBB: advice.potBB,
              equityVsRandom: advice.equityVsRandom,
              equityVsRange: advice.equityVsRange,
              equityRangeCombos: advice.equityRangeCombos,
            }),
      };
      fs.appendFileSync(
        path.join(dir, "gto-advice.jsonl"),
        JSON.stringify(record) + "\n"
      );
    } catch (e) {
      console.warn("writeGtoLog failed:", e);
    }
  }

  private beginAnalyticsHand() {
    try {
      const bigBlind = this.smallBlind * 2;
      getPlayerAnalyticsStore().beginHand({
        handId: this.analyticsHandId,
        roomId: this.roomid,
        playerCount: this.sortedUsers.length,
        hasBot: this.sortedUsers.some((token) => userMap[token].isBot),
        players: this.sortedUsers
          .filter((token) => !userMap[token].isBot)
          .map((token) => ({
            token,
            name: userMap[token].name,
            position: this.positionLabelOf(token),
            stackBB: userMap[token].stack / bigBlind,
          })),
      });
    } catch (error) {
      console.warn("player analytics hand start failed", error);
    }
  }

  private recordHumanAction(
    token: Token,
    action: string,
    amountBB: number | undefined,
    facingRaise: boolean,
    raiseLevel: number
  ) {
    try {
      getPlayerAnalyticsStore().recordAction({
        handId: this.analyticsHandId,
        token,
        street: this.round,
        position: this.positionLabelOf(token),
        action,
        amountBB,
        facingRaise,
        raiseLevel,
        advice: this.latestAdviceByToken[token],
      });
      delete this.latestAdviceByToken[token];
    } catch (error) {
      console.warn("player analytics action failed", error);
    }
  }

  private recordAnalyticsSettlement(
    token: Token,
    profitBB: number,
    won: boolean,
    showdown: boolean,
    final: boolean
  ) {
    try {
      getPlayerAnalyticsStore().recordSettlement({
        handId: this.analyticsHandId,
        token,
        profitBB,
        won,
        showdown,
        final,
      });
    } catch (error) {
      console.warn("player analytics settlement failed", error);
    }
  }

  /** Real seat label for a player in this hand (SB/BB/CO/BTN/...). */
  private positionLabelOf(token: Token): string {
    const n = this.sortedUsers.length;
    if (n < 2) return "";
    const idx = this.sortedUsers.indexOf(token);
    if (idx < 0) return "";
    const count = Math.min(Math.max(n, 2), 9);
    const buttonIndex = n > 2 ? n - 1 : 0;
    const dist = Math.min((idx - buttonIndex + n) % n, count - 1);
    return positionForDistance(count, dist).label;
  }
  handleUserDisconnected(token: Token) {
    const user = userMap[token];
    if (!user?.isActing || user.hasUsedOfflineActionGrace) {
      return;
    }

    user.hasUsedOfflineActionGrace = true;
    const actionTimeLimit =
      INITIAL_ACTION_TIME_SECONDS + DISCONNECTED_ACTION_GRACE_SECONDS;
    const extendedEndTime = user.actionStartTime + actionTimeLimit * 1000;
    if (extendedEndTime <= user.actionEndTime) {
      return;
    }

    user.actionEndTime = extendedEndTime;
    user.actionTimeLimit = actionTimeLimit;
    this.scheduleActionTimeout(token, Math.max(0, extendedEndTime - Date.now()));
  }
  private scheduleActionTimeout(token: Token, delay: number) {
    clearTimeout(this.actingUserTimer);
    this.actingUserTimer = delayTry(() => {
      this.fold(token); // auto fold
      publish2all(this.roomid);
    }, delay);
  }
  userSetSettleTimes(token: Token, times: number) {
    if (
      !this.multiSettleStart ||
      !this.multiSettleUsers.includes(token) ||
      userMap[token].settleTimes > 0 ||
      !Number.isInteger(times) ||
      times < 1 ||
      times > 4
    ) {
      return;
    }
    userMap[token].settleTimes = times;
    this.nextRound();
  }
  buyOverTimeCard(token: Token): number {
    const user = userMap[token];
    if (
      !user ||
      !user.isActing ||
      !this.sortedUsers.includes(token) ||
      this.isSettling
    ) {
      throw "当前不是你的行动时间";
    }

    const pots = sum(this.sortedUsers.map((t) => sum(userMap[t].bets)));
    const cost = calculateOvertimeCost({
      bigBlind: this.smallBlind * 2,
      pots,
      playerCount: this.sortedUsers.length,
      availableStack: user.leftStack(),
    });
    if (cost <= 0) {
      throw "剩余筹码不足，无法购买加时";
    }

    const recipients = this.sortedUsers.filter((t) => t !== token);
    recipients.forEach((t) => (userMap[t].stack += cost));
    user.stack -= recipients.length * cost;
    publish2all(this.roomid);
    return cost;
  }
  getRunItOutBoardCards(token: Token): Card[] {
    return this.runItOutBoardCardsByUser[token] || [];
  }
  runItOut(token: Token): {
    boardCards: Card[];
    remainingCards: Card[];
    paid: boolean;
    recipientCount: number;
    recipientTokens: Token[];
  } {
    const user = userMap[token];
    if (
      !user ||
      !this.isSettling ||
      !user.isInCurrentGame ||
      user.isSpectator ||
      !this.sortedUsers.includes(token)
    ) {
      throw "当前不能发发看";
    }
    if (this.boardCards.length >= 5) {
      throw "公共牌已经发完";
    }
    if (this.runItOutBoardCardsByUser[token]) {
      throw "本手已经发发看过了";
    }
    if (![0, 3, 4].includes(this.boardCards.length)) {
      throw "公共牌状态异常";
    }

    const remainingCards: Card[] = [];
    let nextCardIndex = this.cardIndex;
    let boardCardCount = this.boardCards.length;
    if (boardCardCount === 0) {
      nextCardIndex += 1; // burn before the flop
      remainingCards.push(...this.cards.slice(nextCardIndex, nextCardIndex + 3));
      nextCardIndex += 3;
      boardCardCount = 3;
    }
    while (boardCardCount < 5) {
      nextCardIndex += 1; // burn before the turn and river
      remainingCards.push(this.cards[nextCardIndex]);
      nextCardIndex += 1;
      boardCardCount += 1;
    }
    if (
      remainingCards.length !== 5 - this.boardCards.length ||
      remainingCards.some((card) => !card)
    ) {
      throw "牌堆剩余牌不足";
    }

    const boardCards = [...this.boardCards, ...remainingCards];
    const recipients = this.sortedUsers.filter((t) => t !== token && userMap[t]);
    const costPerRecipient = this.smallBlind * 2; // one big blind
    const totalCost = recipients.length * costPerRecipient;
    const paid = user.stack >= totalCost;

    if (paid && totalCost > 0) {
      const touchedTokens = [token, ...recipients];
      const chipsRecords = touchedTokens.map((t) => {
        const touchedUser = userMap[t];
        const chipsRecord = roomMap[this.roomid].chipsRecords.find(
          (record) => record.id === touchedUser.chipsRecordID
        );
        if (!chipsRecord) {
          throw "chips record not found";
        }
        return chipsRecord;
      });

      user.stack -= totalCost;
      recipients.forEach((recipientToken) => {
        userMap[recipientToken].stack += costPerRecipient;
      });
      touchedTokens.forEach((t, index) => {
        chipsRecords[index].chips = userMap[t].stack;
      });
    }

    this.runItOutBoardCardsByUser[token] = boardCards;
    return {
      boardCards,
      remainingCards,
      paid,
      recipientCount: recipients.length,
      recipientTokens: recipients,
    };
  }
  setActed(token: Token) {
    userMap[token].isActing = false;
    userMap[token].needAction = false;
    clearTimeout(this.actingUserTimer);
    clearTimeout(this.botActionTimer);
  }
  calcUserRank() {
    this.sortedUsers.forEach((t) => {
      const user = userMap[t];
      const cards = [...user.hands, ...this.boardCards];
      const cardsRank = rank(cards);
      user.handsType = pokerTypeName(cardsRank.type);
    });
  }
}

type ChipsRecord = {
  id: string; // random and unique
  // token: Token; // user
  name: string;
  chips: number; // total chips
  buyIn: number; // total buy in
};

class Room {
  id: RoomID = ""; // string
  users: Token[] = [];
  isGaming: boolean = false;
  smallBlind: number = 0;
  buyIn: number = 0;
  game: Game = new Game("", "", 0);
  chipsRecords: ChipsRecord[] = [];
  opponentModel = new OpponentModel();

  constructor(id: string, sb: number, buyIn: number) {
    if (sb === 0 || buyIn === 0) {
      throw `small blind(${sb}) and buy in(${buyIn})] should not be 0`;
    }
    // new room
    this.id = id;
    this.smallBlind = sb;
    this.buyIn = buyIn;
    this.isGaming = false;
  }

  startGame(token: Token) {
    const isOwner = this.users.some(
      (t) => userMap[t].isRoomOwner && t == token
    );
    if (!isOwner) {
      throw "not room owner";
    }
    const readyUsers = this.users.filter((t) => userMap[t].isReady);
    if (readyUsers.length < 2) {
      throw "至少需要两名玩家准备";
    }
    this.isGaming = true;

    // already in game
    if (this.game && !this.game.isSettling) {
      return true;
    }

    this.game = new Game(
      this.id,
      readyUsers.sort((_) => Math.random() - 0.5)[0],
      this.smallBlind
    );
    this.game.start();
    return true;
  }

  pauseGame(token: Token) {
    const isOwner = this.users.some(
      (t) => userMap[t].isRoomOwner && t == token
    );
    if (!isOwner) {
      throw "not room owner";
    }
    console.log("owner pause game");
    this.pauseGameInteral();
  }

  pauseGameInteral() {
    this.isGaming = false;
    console.log("GAME PAUSE");
    publish2all(this.id);
  }

  getBuyInBounds(): { min: number; max: number } {
    const maxStack = this.users.reduce(
      (max, token) => Math.max(max, userMap[token].leftStack()),
      this.buyIn
    );
    return { min: this.buyIn, max: maxStack };
  }

  setNextBuyIn(token: Token, chips: number) {
    const user = userMap[token];
    if (!user || user.roomid !== this.id) {
      throw "invalid room";
    }
    if (user.isReady || user.isSpectator) {
      throw "只有休息中的玩家可以设置下一手带入";
    }
    if (!Number.isFinite(chips) || !Number.isInteger(chips)) {
      throw "带入筹码必须是整数";
    }

    const { min, max } = this.getBuyInBounds();
    if (chips < min || chips > max) {
      throw `带入筹码必须在${min}到${max}之间`;
    }
    user.nextBuyIn = chips;
  }

  applyNextBuyIn(token: Token) {
    const user = userMap[token];
    const target = user.nextBuyIn;
    if (target === null) return;

    const chipsRecord = this.chipsRecords.find(
      (record) => record.id === user.chipsRecordID
    );
    if (!chipsRecord) {
      throw "chips record not found";
    }

    chipsRecord.buyIn += target - chipsRecord.chips;
    chipsRecord.chips = target;
    user.stack = target;
    user.nextBuyIn = null;
  }

  applyReadyNextBuyIns() {
    this.users.forEach((token) => {
      if (userMap[token].isReady && userMap[token].nextBuyIn !== null) {
        this.applyNextBuyIn(token);
      }
    });
  }

  seatedCount(): number {
    return this.users.filter((token) => !userMap[token].isSpectator).length;
  }

  prepareBotsForNextHand() {
    const pending = this.users.filter(
      (token) => userMap[token].isBot && userMap[token].pendingBotRemoval
    );
    pending.forEach((token) => this.removeUser(token));
    const bigBlind = this.smallBlind * 2;
    this.users.forEach((token) => {
      const user = userMap[token];
      if (
        user.isBot &&
        user.stack < BOT_AUTO_REBUY_THRESHOLD_BB * bigBlind &&
        user.nextBuyIn === null
      ) {
        user.nextBuyIn = BOT_AUTO_REBUY_TARGET_BB * bigBlind;
        // A busted player is marked not-ready during settlement. Bots should
        // remain seated and take part again after their automatic rebuy.
        user.isReady = true;
      }
    });
  }

  addUser(token: Token): boolean {
    if (this.users.findIndex((t) => t == token) == -1) {
      if (this.seatedCount() >= 10) {
        throw "牌桌最多容纳10名玩家";
      }
      this.users.push(token);

      const id = uuidv4();

      userMap[token].chipsRecordID = id;
      userMap[token].stack = this.buyIn;

      const chipsRecord = {
        id,
        token,
        name: userMap[token].name,
        chips: this.buyIn,
        buyIn: this.buyIn,
      };
      this.chipsRecords.push(chipsRecord);
      return true;
    }
    return false;
  }

  removeUser(token: Token) {
    this.users = this.users.filter((t) => t != token);
    if (userMap[token].isRoomOwner) {
      // trans owner to next user, user should be ready
      userMap[token].isRoomOwner = false;
      const index = this.users.findIndex((t) => userMap[t].isInRoom);
      if (index == -1) {
        // none user inRoom, remove game
        delete roomMap[this.id];
        this.users.forEach((t) => userMap[t].leaveRoom());
        this.users = [];
      } else {
        userMap[this.users[index]].isRoomOwner = true;
      }
    }
    this.game.removeUser(token);
    userMap[token].leaveRoom();
  }
}

export default Room;
