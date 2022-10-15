import { Context } from 'koa';
import * as ws from 'ws';
import * as jwt from 'jsonwebtoken';
import { secret } from '../config';
import {
  pauseGame,
  roomMap,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userHangup,
  userLeaveRoom,
  userMap,
  userOverTime,
  userReady,
  userReBuy,
  userWatch
} from '../service';
import { Token } from '../service/User';
import Room, { Game, RoomID } from '../service/Room';
import {
  ActionType,
  SimpleChipsRecord,
  SimpleGame,
  SimpleRoom,
  SimpleRoomChipsRecords,
  SimpleSelf,
  SimpleUser
} from '../../ApiType';

export interface PokerWebSocket extends ws {
  name?: string;
  token?: string;
}

export interface ActionBase {
  action: ActionType;
  [x: string]: any;
}

function send2client(ws: PokerWebSocket, data: any) {
  ws.send(JSON.stringify(data));
}

function sendError(ws: PokerWebSocket, error: string) {
  send2client(ws, {
    code: -1,
    error
  });
}

export function send2user(token: Token, data: any) {
  const self = getSimpleSelf(token);
  data = Object.assign({}, data, { self });
  userMap[token].wss.forEach((ws) => {
    send2client(ws, data);
  });
}

function send2all(roomid: RoomID, data: any) {
  roomMap[roomid].users.forEach((t) => send2user(t, data));
}

export default async (ctx: Context) => {
  const token = ctx.request.header['sec-websocket-protocol']?.toString() || '';
  let websocket: PokerWebSocket | null = null;
  try {
    const user = jwt.verify(token.toString(), secret).toString().split('@')[0];
    websocket = ctx.websocket;
    websocket.name = user;
    websocket.token = token;
    userMap[token].addWebsocket(websocket);
    console.log('client connect', token, user);
  } catch (e) {
    ctx.websocket.send('invalid token');
    ctx.websocket.close();
  }

  if (!websocket) {
    return;
  }

  websocket.on('message', (msg: string) => {
    try {
      let data: ActionBase | null = null;
      try {
        data = JSON.parse(msg);
      } catch (e) {
        send2client(websocket!, {
          code: -1,
          error: e
        });
      }
      if (!data) {
        return;
      }
      handle(websocket!, data);
    } catch (e) {
      console.log('server catch error', e);
      sendError(websocket!, `${e}`);
    }
  });
  ctx.websocket.on('close', () => {
    console.log('client closed');
    const user = userMap[token];
    if (user) {
      user.removeWebSocket(websocket!);
      if (user.roomid) {
        publish2all(user.roomid);
      }
    }

    websocket = null;
  });
};

function handle(ws: PokerWebSocket, data: ActionBase) {
  const token = ws.token!;
  console.log('handle', token, data);
  switch (data.action) {
    case ActionType.ENTER_GAME:
      userEnterRoom(token, data.roomid);
      break;
    case ActionType.START_GAME:
      startGame(token);
      break;
    case ActionType.PAUSE_GAME:
      pauseGame(token);
      break;
    case ActionType.BET:
      userBet(token, data.chips);
      break;
    case ActionType.FOLD:
      userFold(token);
      break;
    case ActionType.HANGUP:
      userHangup(token);
      break;
    case ActionType.LEAVE:
      userLeaveRoom(token);
      break;
    case ActionType.READY:
      userReady(token);
      break;
    case ActionType.REBUY:
      userReBuy(token);
      break;
    case ActionType.OVERTIME:
      userOverTime(token);
      break;
    case ActionType.WATCH:
      userWatch(token, data.watch);
      break;
  }
  if (data.action != ActionType.LEAVE) {
    publish(token, data, ws);
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function getSimpleRoom(room: Room): SimpleRoom {
  return {
    roomid: room.id,
    isGaming: room.isGaming,
    users: room.users.map((t) => getSimpleUser(t))
  };
}

function getSimpleChipsRecords(room: Room): SimpleRoomChipsRecords {
  return {
    roomid: room.id,
    chipsRecords: room.chipsRecords.map((cr) => ({
      id: cr.id,
      name: cr.name,
      chips: cr.chips,
      buyIn: cr.buyIn
    }))
  };
}

function getSimpleGame(game: Game): SimpleGame {
  if (!game) {
    return {
      boardCards: [],
      pots: 0,
      acting: '',
      preBet: 0,
      bb: 0,
      isSettling: false,
      nextGameTime: 0
    };
  }
  const actingUser =
    game.sortedUsers.filter((t) => userMap[t].isActing)[0] || null;
  const preBet = Math.max(
    ...game.sortedUsers.map((t) => userMap[t].bets[game.round])
  );
  return {
    boardCards: game.boardCards,
    pots: sum(game.sortedUsers.map((t) => sum(userMap[t].bets))),
    acting: actingUser ? userMap[actingUser].chipsRecordID : '',
    preBet,
    bb: game.smallBlind * 2,
    isSettling: game.isSettling,
    nextGameTime: game.nextGameTime
  };
}

function getSimpleUser(token: Token): SimpleUser {
  const user = userMap[token];
  const room = roomMap[user.roomid];
  return {
    id: user.chipsRecordID,
    name: user.name,
    avatar: user.avatar,
    hasCards: user.hands.length > 0,
    isRoomOwner: user.isRoomOwner,
    isOffline: user.isOffline,
    isReady: user.isReady,
    isFoled: user.isFolded,
    isAllIn: user.isAllIn,
    isActing: user.isActing,
    isWinner: user.isWinner,
    isInCurrentGame: user.isInCurrentGame,
    isSpectator: user.isSpectator,
    actionEndTime: user.actionEndTime,
    actionName: user.actionName,
    hands: user.shouldShowHand ? user.hands : [null, null],
    maxCards: user.shouldShowHand ? user.maxCards : [],
    profits: user.profits,
    position: user.positon,
    handsType: user.shouldShowHand ? user.handsType : '',

    stack: user.stack - sum(user.bets),
    bet: room.game ? user.bets[room.game.round] : 0
  };
}

function getSimpleSelf(token: Token): SimpleSelf {
  const user = userMap[token];
  return {
    id: user.chipsRecordID,
    hands: user.hands,
    handsType: user.handsType
  };
}

export function publish(token: Token, data: ActionBase, ws: PokerWebSocket) {
  const user = userMap[token];
  const action = data.action;
  if (!user) {
    return sendError(ws, 'user not exists');
  }
  const room = roomMap[user.roomid];
  if (!room) {
    return sendError(ws, 'not in room');
  }

  const simpleGame = getSimpleGame(room.game);
  const simpleRoom = getSimpleRoom(room);
  const simpleUser = getSimpleUser(token);

  switch (action) {
    case ActionType.ENTER_GAME:
    case ActionType.START_GAME:
    case ActionType.BET:
    case ActionType.FOLD:
    case ActionType.OVERTIME:
    case ActionType.REBUY:
    case ActionType.WATCH:
      send2all(room.id, {
        game: simpleGame,
        room: simpleRoom
      });
      break;
    case ActionType.READY:
    case ActionType.HANGUP:
      send2all(room.id, {
        user: simpleUser
      });
      break;
    case ActionType.LEAVE:
      send2all(room.id, {
        game: simpleGame
      });
      break;
    case ActionType.PAUSE_GAME:
      send2all(room.id, {
        room: simpleRoom
      });
      break;
    case ActionType.SHOW_HANDS:
      const index = data.index;
      if (index == 0 || index == 1) {
        const hands: any[] = [null, null];
        if (index == 0) hands[0] = user.hands[0];
        if (index == 1) hands[1] = user.hands[1];
        send2all(room.id, {
          hands: {
            id: user.chipsRecordID,
            hands
          }
        });
      }
      break;
  }
}

export function publish2all(roomid: RoomID) {
  const room = roomMap[roomid];
  const simpleGame = getSimpleGame(room.game);
  const simpleRoom = getSimpleRoom(room);
  send2all(room.id, {
    game: simpleGame,
    room: simpleRoom,
    chips: getSimpleChipsRecords(room)
  });
}

export function publishLog2all(roomid: RoomID, logs: string[]) {
  send2all(roomid, {
    logs
  });
}
