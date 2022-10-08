import { roomMap, userEnterRoom, userLeaveRoom } from ".";
import { Card } from "../../ApiType";
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
  actionEndTime: number = new Date().getTime();
  isFolded: boolean = false; // in game, already fold
  isAllIn: boolean = false;
  isWinner: boolean = false;
  isSpectator: boolean = false;
  needAction: boolean = false; // act each round
  actionName: string = "";
  stack: number = 0;
  bets: number[] = [0, 0, 0, 0];
  hands: Card[] = [];
  maxCards: Card[] = [];
  profits: number = 0;
  handsType: string = "";
  shouldShowHand: boolean = false;
  autoLeaveTimer: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);

  constructor(token: Token, name: string, avatar: string) {
    this.token = token;
    this.name = name;
    this.avatar = avatar;
  }
  leftStack(): number {
    return this.stack - this.bets.reduce((a, b) => a + b, 0);
  }
  addWebsocket(ws: PokerWebSocket) {
    clearTimeout(this.autoLeaveTimer);
    this.isOffline = false;
    this.wss.push(ws);
  }
  removeWebSocket(ws: PokerWebSocket) {
    this.wss = this.wss.filter((_) => _ != ws);
    if (this.wss.length == 0) {
      this.isOffline = true;
      this.autoLeaveTimer = setTimeout(() => {
        try {
          userLeaveRoom(this.token);
        } catch (e) {}
      }, 180000); // auto leave after 3 mins
    }
  }
  getWebsockets() {
    return this.wss;
  }
  setRoom(roomid: RoomID) {
    this.roomid = roomid;
    this.stack = roomMap[roomid].buyIn;
    this.bets = [0, 0, 0, 0];
    this.hands = [];

    this.isInRoom = true;
    this.isReady = false;
    this.isActing = false;
    this.isAllIn = false;
    this.isFolded = false;
    this.needAction = false;
    this.shouldShowHand = false;
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
  }
  setReady(ready: boolean) {
    this.isReady = ready;
  }
}

export default User;
