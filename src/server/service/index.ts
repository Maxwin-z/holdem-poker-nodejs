import User, { Token } from "./User";
import Room, { RoomID } from "./Room";
import { v4 as uuidv4 } from "uuid";
import { OVERTIME_ACTION_TIME_SECONDS } from "../../shared/actionTimer";
import {
  PokerWebSocket,
  publish2all,
  publishLog2all,
  send2all,
  send2user,
} from "../api/ws";
import { BOT_NAMES } from "../bot/names";
import type { BotStyle, BotStyleSelection } from "../bot/types";

type UserMap = {
  [token: string]: User;
};
type RoomMap = {
  [roomid: string]: Room;
};

export const userMap: UserMap = {};

export const roomMap: RoomMap = {};

const BOT_STYLES: BotStyle[] = ["standard", "tight", "loose"];

function ownerRoom(token: Token): Room {
  const user = userMap[token];
  const room = user?.roomid ? roomMap[user.roomid] : undefined;
  if (!room || !user.isRoomOwner) throw "只有房主可以管理AI机器人";
  return room;
}

function resolveBotStyle(selection: BotStyleSelection): BotStyle {
  if (selection === "random") {
    return BOT_STYLES[Math.floor(Math.random() * BOT_STYLES.length)];
  }
  if (!BOT_STYLES.includes(selection)) throw "无效的AI机器人风格";
  return selection;
}

function rand4str(): string {
  let id = `${Math.floor(Math.random() * 10000)}`;
  while (id.length < 4) {
    id = `0${id}`;
  }
  id = id.replace(/4/g, "8");
  return id;
}

function genRoomID(): string {
  let id = rand4str();
  while (roomMap[id]) {
    id = rand4str();
  }
  return id;
}

export function createUser(token: Token, name: string, avatar: string): User {
  if (!token || !name) {
    throw "should have token & name";
  }
  const user = new User(token, name, avatar);
  userMap[token] = user;
  return user;
}

export function createRoom(
  token: Token,
  sb: number,
  buyIn: number
): Room {
  const user = userMap[token];
  const room = new Room(genRoomID(), sb, buyIn);
  roomMap[room.id] = room;
  userEnterRoom(token, room.id);
  user.isRoomOwner = true;
  user.isReady = true;
  // console.log(31, userMap);
  return room;
}

export function userEnterRoom(token: Token, roomid: RoomID) {
  const room = roomMap[roomid];
  if (!room) {
    throw `房间${roomid}不存在`;
  }
  const user = userMap[token];
  if (!user) {
    throw "invalid user";
  }
  if (user.roomid == roomid) {
    return;
  }
  if (user.roomid) {
    const previousRoom = roomMap[user.roomid];
    if (
      previousRoom &&
      previousRoom.isGaming &&
      !user.isFolded &&
      user.isInCurrentGame &&
      !previousRoom.game.isSettling
    ) {
      throw `请结束本局后再离开`;
    }
    if (previousRoom) {
      const previousRoomID = previousRoom.id;
      previousRoom.removeUser(token);
      if (roomMap[previousRoomID]) {
        publish2all(previousRoomID);
      }
    } else {
      user.leaveRoom();
    }
  }
  if (room.addUser(token)) {
    user.setRoom(roomid);
  }
}

export function userLeaveRoom(token: Token) {
  const roomid = userMap[token].roomid;
  const room = roomMap[roomid];
  if (
    room.isGaming &&
    !userMap[token].isFolded &&
    userMap[token].isInCurrentGame &&
    !room.game.isSettling
  ) {
    throw `请结束本局后再离开`;
  }
  room.removeUser(token);
  send2user(token, {
    leave: true,
  });
}

export function startGame(token: Token) {
  const user = userMap[token];
  if (!user || !user.roomid) {
    throw "not in any room";
  }
  const roomid = userMap[token].roomid;
  return roomMap[roomid].startGame(token);
}

export function pauseGame(token: Token) {
  const roomid = userMap[token].roomid;
  return roomMap[roomid].pauseGame(token);
}

export function userReady(token: Token) {
  const user = userMap[token];
  if (!user.roomid) {
    throw "not in any room";
  }
  if (user.isSpectator) {
    throw "观战玩家不能准备";
  }
  const room = roomMap[user.roomid];
  if (!user.isReady && user.nextBuyIn === null && user.stack === 0) {
    user.nextBuyIn = room.buyIn;
  }
  if (
    user.nextBuyIn !== null &&
    (!user.isInCurrentGame || room.game.isSettling)
  ) {
    room.applyNextBuyIn(token);
  }
  user.setReady(true);
}

export function userSetNextBuyIn(token: Token, chips: number) {
  const user = userMap[token];
  if (!user || !user.roomid || !isInRoom(token, user.roomid)) {
    throw "invalid room";
  }
  roomMap[user.roomid].setNextBuyIn(token, chips);
}

function isInRoom(token: Token, roomid: RoomID): boolean {
  const user = userMap[token];
  const room = roomMap[roomid];
  return user && room && user.roomid == room.id;
}

// game round action
export function userBet(token: Token, chips: number) {
  const roomid = userMap[token].roomid;

  if (!isInRoom(token, roomid)) {
    throw "invalid room";
  }
  return roomMap[roomid].game.bet(token, chips);
}

export function userFold(token: Token) {
  const roomid = userMap[token].roomid;

  if (!isInRoom(token, roomid)) {
    throw "invalid room";
  }
  return roomMap[roomid].game.fold(token);
}

export function userHangup(token: Token) {
  const user = userMap[token];
  user.isReady = false;
  const room = roomMap[user.roomid];
  if (!user.isInCurrentGame || room?.game.isSettling) {
    user.clearHand();
  }
}

export function userOverTime(token: Token) {
  const user = userMap[token];
  if (!user || !user.roomid || !isInRoom(token, user.roomid)) {
    throw "invalid room";
  }
  const roomid = user.roomid;
  const game = roomMap[roomid].game;
  const cost = game.buyOverTimeCard(token);
  game.setActingUser(token, OVERTIME_ACTION_TIME_SECONDS * 1000);
  return cost;
}

export function userWatch(token: Token, watch: boolean) {
  if (!watch) {
    const room = roomMap[userMap[token].roomid];
    if (userMap[token].isSpectator && room.seatedCount() >= 10) {
      throw "牌桌最多容纳10名玩家";
    }
    userMap[token].isSpectator = false;
  } else {
    const roomid = userMap[token].roomid;

    if (!isInRoom(token, roomid)) {
      throw "invalid room";
    }
    const room = roomMap[roomid];
    if (
      room.isGaming &&
      !userMap[token].isFolded &&
      userMap[token].isInCurrentGame &&
      !room.game.isSettling
    ) {
      throw `请结束本局后再观战`;
    }
    userMap[token].isSpectator = true;
  }
}

export function userShowHands(token: Token, index: number) {
  const user = userMap[token];
  const roomid = user.roomid;
  const game = roomMap[roomid].game;

  if (!isInRoom(token, roomid)) {
    throw "invalid room";
  }

  if (!game.isSettling) {
    return;
  }

  if (index == 0 || index == 1) {
    const hands: any[] = [null, null];
    let card = "";
    if (index == 0) {
      hands[0] = user.hands[0];
      card = `${hands[0].num}${hands[0].suit}`;
    }
    if (index == 1) {
      hands[1] = user.hands[1];
      card = `${hands[1].num}${hands[1].suit}`;
    }
    send2all(roomid, {
      hands: {
        id: user.chipsRecordID,
        hands,
      },
    });
    publishLog2all(roomid, [`${user.name}亮牌${card}`]);
  }
}

export function userSetSettleTimes(token: Token, times: number) {
  const user = userMap[token];
  const roomid = user.roomid;
  const game = roomMap[roomid].game;
  if (!isInRoom(token, roomid)) {
    throw "invalid room";
  }
  game.userSetSettleTimes(token, times);
}

export function userRunItOut(token: Token) {
  const user = userMap[token];
  if (!user || !user.roomid || !isInRoom(token, user.roomid)) {
    throw "invalid room";
  }

  const game = roomMap[user.roomid].game;
  const boardCardCount = game.boardCards.length;
  const result = game.runItOut(token);
  let cardIndex = 0;
  const streets: string[] = [];
  if (boardCardCount === 0) {
    streets.push(
      `Flop: ${result.remainingCards
        .slice(cardIndex, cardIndex + 3)
        .map((card) => `${card.num}${card.suit}`)
        .join("")}`
    );
    cardIndex += 3;
  }
  if (boardCardCount <= 3) {
    const card = result.remainingCards[cardIndex++];
    streets.push(`Turn: ${card.num}${card.suit}`);
  }
  if (boardCardCount <= 4) {
    const card = result.remainingCards[cardIndex];
    streets.push(`River: ${card.num}${card.suit}`);
  }

  send2user(token, {
    logs: [
      `你支付了${result.paid ? result.recipientCount : 0}BB，查看了公共牌`,
      streets.join("，"),
    ],
  });
  result.recipientTokens.forEach((recipientToken) => {
    send2user(recipientToken, {
      logs: [
        result.paid
          ? `${user.name}玩家查看了公共牌，支付了你1BB`
          : `${user.name}玩家查看了公共牌，但是他很穷，未支付你任何筹码`,
      ],
    });
  });
  return result;
}

export function userSendMessage(token: Token, message: string) {
  const roomid = userMap[token].roomid;
  publishLog2all(roomid, [`<strong>${userMap[token].name}</strong>: 
      ${message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/ /g, "&nbsp;")
    }`]);
}

export function userRequestGtoAdvice(token: Token) {
  const user = userMap[token];
  const room = roomMap[user.roomid];
  if (!room) throw "不在房间中";
  const game = room.game;
  if (!game) throw "游戏未开始";
  const sent = game.publishGtoAdvice(token);
  if (!sent) {
    send2user(token, {
      logs: ["现在不是行动轮次，暂时无法给出 GTO 建议"],
    });
  }
}

export function addBot(token: Token, selection: BotStyleSelection = "standard") {
  const room = ownerRoom(token);
  const usedNames = new Set(room.users.map((userToken) => userMap[userToken].name));
  const availableNames = BOT_NAMES.filter((name) => !usedNames.has(name));
  const baseName = availableNames.length > 0
    ? availableNames[Math.floor(Math.random() * availableNames.length)]
    : `Player ${room.users.length + 1}`;
  const botToken = `bot:${uuidv4()}`;
  const bot = new User(botToken, baseName, "");
  bot.isBot = true;
  bot.botStyleSelection = selection;
  bot.botStyle = resolveBotStyle(selection);
  bot.isOffline = false;
  userMap[botToken] = bot;
  try {
    room.addUser(botToken);
    bot.setRoom(room.id);
    bot.isReady = true;
  } catch (error) {
    delete userMap[botToken];
    throw error;
  }
  return bot;
}

export function removeBot(token: Token, botId: string) {
  const room = ownerRoom(token);
  const botToken = room.users.find(
    (userToken) =>
      userMap[userToken].isBot && userMap[userToken].chipsRecordID === botId
  );
  if (!botToken) throw "AI机器人不存在";
  const bot = userMap[botToken];
  if (room.isGaming && !room.game.isSettling && bot.isInCurrentGame) {
    bot.pendingBotRemoval = true;
  } else {
    room.removeUser(botToken);
  }
}
