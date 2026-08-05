import React from "react";
import { Button, message } from "antd";
import { ActionType } from "../ApiType";
import { setChipsRecord } from "../features/chipsrecord/chipsRecordSlice";
import { clearCreateRoomID } from "../features/createroom/createRoomSlice";
import { addLogs } from "../features/gamehistory/gameHistorySlice";
import { clearRoomID } from "../features/home/homeSlice";
import {
  setGame,
  setHands,
  setRoom,
  setSelectSettleTimes,
  setSelf,
  setUser,
} from "../features/room/roomSlice";
import { AppDispatch, AppThunk } from "./store";

let ws: WebSocket | undefined;
let activeRoomID = "";
let activeDispatch: AppDispatch | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
let hideReconnectMessage: (() => void) | undefined;
let lifecycleListenersInstalled = false;

export function getWebSocketURL(
  location: Pick<Location, "host" | "hostname" | "port" | "protocol"> =
    window.location,
  configuredURL = process.env.REACT_APP_WS_URL
) {
  if (configuredURL) return configuredURL;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const isReactDevServer =
    process.env.NODE_ENV !== "production" && location.port !== "8086";

  return isReactDevServer
    ? `${protocol}//${location.hostname}:8086/ws`
    : `${protocol}//${location.host}/ws`;
}

function getConnectionDetails() {
  const url = getWebSocketURL();

  return { url, token: localStorage["token"] };
}

function closeReconnectMessage() {
  if (hideReconnectMessage) {
    hideReconnectMessage();
    hideReconnectMessage = undefined;
  }
}

function showReconnectMessage() {
  if (hideReconnectMessage) {
    return;
  }

  const content = React.createElement(
    "span",
    null,
    "网络连接已断开，正在自动重连。",
    React.createElement(
      Button,
      {
        type: "link",
        size: "small",
        onClick: () => window.location.reload(),
        style: { paddingRight: 0 },
      },
      "刷新"
    )
  );

  hideReconnectMessage = message.loading(content, 0);
}

function handleMessage(msg: MessageEvent) {
  if (!activeDispatch) {
    return;
  }

  try {
    const data = JSON.parse(msg.data);
    if (data.code === -1) {
      message.error(data.error);
    }
    if (data.room) {
      activeDispatch(setRoom(data.room));
    }
    if (data.game) {
      activeDispatch(setGame(data.game));
    }
    if (data.self) {
      activeDispatch(setSelf(data.self));
    }
    if (data.user) {
      activeDispatch(setUser(data.user));
    }
    if (data.hands) {
      activeDispatch(setHands(data.hands));
    }
    if (data.chips) {
      activeDispatch(setChipsRecord(data.chips));
    }
    if (data.leave) {
      activeDispatch(clearRoomID(""));
      activeDispatch(clearCreateRoomID(""));
    }
    if (data.logs) {
      activeDispatch(addLogs(data.logs));
    }
    if (data.selectSettleTimes === 1) {
      activeDispatch(setSelectSettleTimes(true));
    }
    if (data.selectSettleTimes === 0) {
      activeDispatch(setSelectSettleTimes(false));
    }

    console.log(data);
  } catch (error) {
    console.log(msg.data);
    console.error(error);
  }
}

function scheduleReconnect(immediately = false) {
  if (!activeRoomID || reconnectTimer) {
    return;
  }

  showReconnectMessage();
  const delay = immediately
    ? 0
    : Math.min(1000 * Math.pow(2, Math.min(reconnectAttempts, 4)), 15000);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    reconnectAttempts += 1;
    openConnection();
  }, delay);
}

function openConnection() {
  if (!activeRoomID) {
    return;
  }
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const { url, token } = getConnectionDetails();
  const socket = new WebSocket(url, token);
  let disconnectHandled = false;
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) {
      socket.close();
      return;
    }

    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    closeReconnectMessage();
    send2server({ action: ActionType.ENTER_GAME, roomid: activeRoomID });
  };

  socket.onmessage = (msg: MessageEvent) => {
    if (ws === socket) {
      handleMessage(msg);
    }
  };

  const handleDisconnect = () => {
    if (disconnectHandled || ws !== socket) {
      return;
    }
    disconnectHandled = true;
    ws = undefined;
    scheduleReconnect();
  };

  socket.onerror = () => {
    handleDisconnect();
    socket.close();
  };
  socket.onclose = handleDisconnect;
}

function reconnectWhenAvailable() {
  if (!activeRoomID) {
    return;
  }

  if (ws?.readyState === WebSocket.OPEN) {
    // Resync the room after the app returns from the background. If the
    // connection has actually died, sending will make the socket close and
    // enter the normal reconnect flow.
    send2server({ action: ActionType.ENTER_GAME, roomid: activeRoomID });
    return;
  }
  if (ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  scheduleReconnect(true);
}

function installLifecycleListeners() {
  if (lifecycleListenersInstalled) {
    return;
  }
  lifecycleListenersInstalled = true;

  window.addEventListener("online", reconnectWhenAvailable);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reconnectWhenAvailable();
    }
  });
}

function send2server(data: any) {
  const socket = ws;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    scheduleReconnect(true);
    return false;
  }

  try {
    socket.send(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(error);
    if (ws === socket) {
      ws = undefined;
    }
    socket.close();
    scheduleReconnect(true);
    return false;
  }
}

export const connect2server =
  (roomid: string): AppThunk =>
  (dispatch) => {
    activeRoomID = roomid;
    activeDispatch = dispatch;
    installLifecycleListeners();

    if (ws?.readyState === WebSocket.OPEN) {
      send2server({ action: ActionType.ENTER_GAME, roomid });
      return;
    }

    openConnection();
  };

export function disconnectFromServer(roomid: string) {
  if (activeRoomID !== roomid) {
    return;
  }

  activeRoomID = "";
  activeDispatch = undefined;
  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  closeReconnectMessage();

  const socket = ws;
  ws = undefined;
  if (socket) {
    socket.close();
  }
}

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

export function ws_setNextBuyIn(chips: number) {
  send2server({
    action: ActionType.SET_NEXT_BUY_IN,
    chips,
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

export function ws_runItOut() {
  send2server({
    action: ActionType.RUN_IT_OUT,
  });
}

export function ws_sendMessage(message: string) {
  send2server({
    action: ActionType.SEND_MESSAGE,
    message,
  });
}
