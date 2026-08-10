import { roomMap, userEnterRoom, userLeaveRoom } from ".";
import { Card } from "../../ApiType";
import type { BotStyle, BotStyleSelection } from "../bot/types";
import { PokerWebSocket } from "../api/ws";
import Room, { RoomID } from "./Room";

export type Token = string;

class User {
  token: Token = ""; // uuid
  name: string = ""; // string
  positon: string = ""; //
  avatar: string = ""; // string, url
  roomid: RoomID = ""; // Room
  chipsRecordID: string = ""; //
  wss: PokerWebSocket[] = []; // WebSocket, communicate with web client, consider open mutiple pages
  isInRoom: boolean = false;
  isRoomOwner: boolean = false; // deprecated, Room.Owner
  isOffline: boolean = false;
  isInCurrentGame: boolean = false;
  isReady: boolean = false; // in room and ready for game. hang up or disconnection will change it to false
  isActing: boolean = false; // in game, can action now
  actionStartTime: number = new Date().getTime();
  actionEndTime: number = new Date().getTime();
  actionTimeLimit: number = 20; // seconds available for the current action
  hasUsedOfflineActionGrace: boolean = false;
  isFolded: boolean = false; // in game, already fold
  isAllIn: boolean = false;
  isWinner: boolean = false;
  isSpectator: boolean = false;
  isBot: boolean = false;
  botStyleSelection: BotStyleSelection = "standard";
  botStyle: BotStyle = "standard";
  pendingBotRemoval: boolean = false;
  needAction: boolean = false; // act each round
  actionName: string = "";
  stack: number = 0;
  nextBuyIn: number | null = null;
  bets: number[] = [0, 0, 0, 0];
  totalBets: number = 0; // sum(bets)
  hands: Card[] = [];
  maxCards: Card[] = [];
  profits: number = 0;
  handsType: string = "";
  shouldShowHand: boolean = false;
  /**
   * Set at settlement when the room has "AI auto show" on: reveals a bot's
   * hole cards only, without the showdown hand ranking.
   */
  forceRevealHands: boolean = false;
  autoLeaveTimer: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  settleTimes: number = 0;

  constructor(token: Token, name: string, avatar: string) {
    this.token = token;
    this.name = name;
    this.avatar = avatar;
  }
  leftStack(): number {
    return this.stack - this.bets.reduce((a, b) => a + b, 0);
  }
  addWebsocket(ws: PokerWebSocket) {
    const isReconnecting = this.isOffline;
    clearTimeout(this.autoLeaveTimer);
    this.isOffline = false;
    if (isReconnecting) {
      this.hasUsedOfflineActionGrace = false;
    }
    this.wss.push(ws);
    return isReconnecting;
  }
  removeWebSocket(ws: PokerWebSocket) {
    this.wss = this.wss.filter((_) => _ != ws);
    if (this.wss.length == 0 && !this.isOffline) {
      this.isOffline = true;
      this.autoLeaveTimer = setTimeout(() => {
        try {
          userLeaveRoom(this.token);
        } catch (e) {}
      }, 180000); // auto leave after 3 mins
      return true;
    }
    return false;
  }
  getWebsockets() {
    return this.wss;
  }
  clearHand() {
    this.hands = [];
    this.handsType = "";
    this.maxCards = [];
    this.shouldShowHand = false;
    this.forceRevealHands = false;
  }
  setRoom(roomid: RoomID) {
    this.roomid = roomid;
    this.stack = roomMap[roomid].buyIn;
    this.nextBuyIn = null;
    this.bets = [0, 0, 0, 0];
    this.hands = [];

    this.isInRoom = true;
    this.isReady = false;
    this.isActing = false;
    this.isAllIn = false;
    this.isFolded = false;
    this.needAction = false;
    this.shouldShowHand = false;
    this.forceRevealHands = false;
    this.isInCurrentGame = false;
    this.isWinner = false;
    this.positon = "";
    this.maxCards = [];
    this.profits = 0;
  }
  leaveRoom() {
    this.roomid = "";
    this.isInRoom = false;
    this.isFolded = true;
    this.isReady = false;
    this.isActing = false;
    this.needAction = false;
    this.shouldShowHand = false;
    this.forceRevealHands = false;
    this.isInCurrentGame = false;
    this.isWinner = false;
    this.nextBuyIn = null;
    this.maxCards = [];
  }
  setReady(ready: boolean) {
    this.isReady = ready;
  }
}

export default User;
