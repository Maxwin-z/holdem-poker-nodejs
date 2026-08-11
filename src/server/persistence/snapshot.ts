import Room, { Game } from "../service/Room";
import User from "../service/User";
import { OpponentModel } from "../bot/opponent-model";

/**
 * Explicit field whitelists. Never stringify the live objects: `User.wss`
 * holds sockets and the classes carry `Timeout` handles, both of which are
 * circular and meaningless after a restart.
 */
const GAME_FIELDS = [
  "roomid",
  "smallBlind",
  "bigBlindUser",
  "cards",
  "boardCards",
  "cardIndex",
  "round",
  "sortedUsers",
  "isSettling",
  "nextGameTime",
  "roundLeader",
  "raiseUser",
  "raiseBet",
  "raiseBetDiff",
  "raiseCount",
  "actionHistory",
  "multiSettleStart",
  "multiSettleRound",
  "multiSettleConfirm",
  "multiSettleTimes",
  "multiSettleIndex",
  "multiSettleUsers",
  "handSeq",
  "analyticsHandId",
  "latestAdviceByToken",
  "replayPublicId",
  "replayHumanToken",
  "replayParticipantIds",
  "replayStartingStacks",
  "replayDecisionSequence",
  "replayRunouts",
  "replayHeroProfitChips",
  "pendingReplayBotStrategy",
  "pendingReplayBotAdvice",
  "runItOutBoardCardsByUser",
  "pendingWait",
] as const;

const USER_FIELDS = [
  "token",
  "name",
  "positon",
  "avatar",
  "roomid",
  "chipsRecordID",
  "isInRoom",
  "isRoomOwner",
  "isInCurrentGame",
  "isReady",
  "isActing",
  "actionStartTime",
  "actionEndTime",
  "actionTimeLimit",
  "hasUsedOfflineActionGrace",
  "isFolded",
  "isAllIn",
  "isWinner",
  "isSpectator",
  "isBot",
  "botStyleSelection",
  "botStyle",
  "pendingBotRemoval",
  "needAction",
  "actionName",
  "stack",
  "nextBuyIn",
  "bets",
  "totalBets",
  "hands",
  "maxCards",
  "profits",
  "handsType",
  "shouldShowHand",
  "forceRevealHands",
  "settleTimes",
] as const;

const ROOM_FIELDS = [
  "id",
  "users",
  "isGaming",
  "smallBlind",
  "buyIn",
  "chipsRecords",
  "botAutoReveal",
] as const;

function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  keys.forEach((key) => {
    out[key] = source[key];
  });
  return out;
}

function apply<T extends object, K extends keyof T>(
  target: T,
  data: Record<string, any>,
  keys: readonly K[]
) {
  keys.forEach((key) => {
    const value = data[key as string];
    if (value !== undefined) target[key] = value as T[K];
  });
}

export type RoomSnapshot = Record<string, any>;

export function snapshotRoom(room: Room, users: Record<string, User>): RoomSnapshot {
  return {
    ...pick(room, ROOM_FIELDS),
    opponentModel: room.opponentModel.snapshot(),
    game: pick(room.game, GAME_FIELDS),
    // Seated players only: lobby users are re-created lazily on next request.
    players: room.users
      .filter((token) => users[token])
      .map((token) => pick(users[token], USER_FIELDS)),
  };
}

export type RestoredRoom = {
  room: Room;
  users: User[];
};

/**
 * Rebuilds the live objects from a snapshot. Timers are deliberately left
 * unarmed here; the caller decides when to resume them.
 */
export function restoreRoom(data: RoomSnapshot): RestoredRoom {
  const id = String(data.id || "");
  const smallBlind = Number(data.smallBlind || 0);
  const buyIn = Number(data.buyIn || 0);
  if (!id || !smallBlind || !buyIn) throw "invalid room snapshot";

  const room = new Room(id, smallBlind, buyIn);
  apply(room, data, ROOM_FIELDS);
  room.opponentModel = OpponentModel.fromSnapshot(data.opponentModel);

  const game = new Game(id, "", smallBlind);
  apply(game, data.game || {}, GAME_FIELDS);
  room.game = game;

  const players: User[] = (data.players || []).map((entry: Record<string, any>) => {
    const user = new User(
      String(entry.token || ""),
      String(entry.name || ""),
      String(entry.avatar || "")
    );
    apply(user, entry, USER_FIELDS);
    // Sockets never survive a restart; humans are offline until they return.
    // Bots have no socket at all and must not be filtered out of the seating.
    user.wss = [];
    user.isOffline = !user.isBot;
    return user;
  });

  const known = new Set(players.map((user) => user.token));
  room.users = room.users.filter((token) => known.has(token));
  room.game.sortedUsers = room.game.sortedUsers.filter((token) => known.has(token));
  room.game.multiSettleUsers = room.game.multiSettleUsers.filter((token) =>
    known.has(token)
  );

  return { room, users: players };
}
