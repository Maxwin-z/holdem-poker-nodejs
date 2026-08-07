import type { PreflopAdvice } from "./gto/preflop/types";
import type { PostflopAdvice } from "./gto/postflop/types";

export interface ApiRspSuccess {
  code: 0;
  data: any;
}
export interface ApiRspError {
  code: -1;
  error: string;
}

export type ApiRsp = ApiRspSuccess | ApiRspError;

export type RoomID = string;
export type Token = string;
export type Card = {
  num: number;
  suit: string;
};

export interface SimpleGame {
  boardCards: Card[];
  pots: number;
  acting: string; // user's uuid in room, not token
  raiseUser: string;
  raiseBet: number; //
  raiseBetDiff: number; // valid rasize count
  preBet: number;
  bb: number;
  handSeq: number;
  isSettling: boolean;
  nextGameTime: number;
  userCount: number;
}

export interface SimpleUser {
  id: string;
  name: string;
  avatar: string;
  hasCards: boolean;
  isRoomOwner: boolean;
  isOffline: boolean;
  isReady: boolean;
  isFoled: boolean;
  isAllIn: boolean;
  isActing: boolean;
  isWinner: boolean;
  isInCurrentGame: boolean;
  isSpectator: boolean;
  actionEndTime: number;
  actionTimeLimit: number;
  actionName: string;
  hands: (Card | null)[];
  handsType: string;
  maxCards: Card[];
  profits: number;
  position: string;

  stack: number;
  bet: number;
}

export interface SimpleRoom {
  roomid: RoomID;
  isGaming: boolean;
  minBuyIn: number;
  maxBuyIn: number;
  users: SimpleUser[];
}

export interface SimpleSelf {
  id: string;
  hands: Card[];
  handsType: string;
  nextBuyIn: number | null;
  runItOutBoardCards: Card[];
}

export interface SimpleUserHands extends SimpleSelf { }

export interface SimpleChipsRecord {
  id: string;
  name: string;
  chips: number;
  buyIn: number;
}

export interface SimpleRoomChipsRecords {
  roomid: string;
  chipsRecords: SimpleChipsRecord[];
}

export enum ActionType {
  ENTER_GAME = "ENTER_GAME",
  START_GAME = "START_GAME",
  PAUSE_GAME = "PAUSE_GAME",
  READY = "READY",
  HANGUP = "HANGUP",
  BET = "BET",
  FOLD = "FOLD",
  OVERTIME = "OVERTIME",
  LEAVE = "LEAVE",
  SHOW_HANDS = "SHOW_HANDS",
  WATCH = "WATCH",
  SET_NEXT_BUY_IN = "SET_NEXT_BUY_IN",
  SET_SETTLE_TIMES = "SET_SETTLE_TIMES",
  RUN_IT_OUT = "RUN_IT_OUT",
  SEND_MESSAGE = "SEND_MESSAGE",
  GTO_ADVICE = "GTO_ADVICE",
}

/** Structured GTO guidance entry displayed in the chat feed. */
export interface GtoLogEntry {
  type: "gto";
  text: string;
  data: PreflopAdvice | PostflopAdvice;
  /** The acting player's chips-record id at the time of the advice. */
  actingId: string;
  /** Hand sequence number, used to auto-collapse stale advice cards. */
  handSeq: number;
}

export type GameLogEntry = string | GtoLogEntry;
