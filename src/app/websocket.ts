import { message } from "antd";
import { ActionType } from "../ApiType";
import { setChipsRecord } from "../features/chipsrecord/chipsRecordSlice";
import { clearCreateRoomID } from "../features/createroom/createRoomSlice";
import { addLogs } from "../features/gamehistory/gameHistorySlice";
import { roominfo } from "../features/home/homeAPI";
import { clearRoomID } from "../features/home/homeSlice";
import {
  setGame,
  setHands,
  setRoom,
  setSelectSettleTimes,
  setSelf,
  setUser,
} from "../features/room/roomSlice";
import { AppThunk } from "./store";

let ws: WebSocket;
function send2server(data: any) {
  ws.send(JSON.stringify(data));
}
export const connect2server =
  (roomid: string): AppThunk =>
  (dispatch, getState) => {
    if (!!ws) {
      send2server({ action: ActionType.ENTER_GAME, roomid });
      return;
    }

    const url =
      window.location.port == "8080"
        ? `ws://${window.location.host}`
        : `ws://${window.location.host.replace(window.location.port, "8080")}`;
    const token = localStorage["token"];

    ws = new WebSocket(url, token);

    let hideMessage: () => void = () => {};
    let connectTimer: ReturnType<typeof setTimeout>;
    let retrys = 0;

    function doConnect() {
      clearTimeout(connectTimer);
      if (++retrys < 10) {
        connectTimer = setTimeout(doConnect, 3000);
      }
      ws = new WebSocket(url, token);
    }

    ws.onopen = () => {
      console.log("36, connected");
      clearTimeout(connectTimer);
      send2server({ action: ActionType.ENTER_GAME, roomid });
      hideMessage();
    };
    ws.onmessage = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.code == -1) {
          message.error(data.error);
        }
        if (data.room) {
          dispatch(setRoom(data.room));
        }
        if (data.game) {
          dispatch(setGame(data.game));
        }
        if (data.self) {
          dispatch(setSelf(data.self));
        }
        if (data.user) {
          dispatch(setUser(data.user));
        }
        if (data.hands) {
          dispatch(setHands(data.hands));
        }
        if (data.chips) {
          dispatch(setChipsRecord(data.chips));
        }
        if (data.leave) {
          dispatch(clearRoomID(""));
          dispatch(clearCreateRoomID(""));
        }
        if (data.logs) {
          dispatch(addLogs(data.logs));
        }
        if (data.selectSettleTimes) {
          dispatch(setSelectSettleTimes(true));
        }
        console.log(data);
      } catch (e) {
        console.log(msg.data);
        console.error(e);
      }
    };
    ws.onclose = ws.onerror = () => {
      if (hideMessage) {
        hideMessage();
      }
      hideMessage = message.loading(
        "网络链接不稳定，自动重试中。或者刷新页面。",
        0
      );
      setTimeout(doConnect, 1000);
    };
  };

export function ws_startGame() {
  send2server({
    action: ActionType.START_GAME,
  });
}

export function ws_pauseGame() {
  send2server({
    action: ActionType.PAUSE_GAME,
  });
}

export function ws_userReady() {
  send2server({
    action: ActionType.READY,
  });
}

export function ws_userHangup() {
  send2server({
    action: ActionType.HANGUP,
  });
}

export function ws_userFold() {
  send2server({
    action: ActionType.FOLD,
  });
}

export function ws_userBet(chips: number) {
  send2server({
    action: ActionType.BET,
    chips,
  });
}

export function ws_userRebuy() {
  send2server({
    action: ActionType.REBUY,
  });
}

export function ws_userLeave() {
  send2server({
    action: ActionType.LEAVE,
  });
}

export function ws_overtime() {
  send2server({
    action: ActionType.OVERTIME,
  });
}

export function ws_userShowHands(index: number) {
  send2server({
    action: ActionType.SHOW_HANDS,
    index,
  });
}

export function ws_userWatch(watch: boolean) {
  send2server({
    action: ActionType.WATCH,
    watch,
  });
}

export function ws_settleTimes(times: number) {
  send2server({
    action: ActionType.SET_SETTLE_TIMES,
    times,
  });
}
