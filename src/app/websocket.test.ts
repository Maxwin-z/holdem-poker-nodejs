import { message } from "antd";
import { ActionType } from "../ApiType";
import {
  connect2server,
  disconnectFromServer,
  ws_runItOut,
  ws_setNextBuyIn,
} from "./websocket";

jest.mock("antd", () => ({
  Button: "button",
  message: {
    error: jest.fn(),
    loading: jest.fn(() => jest.fn()),
  },
}));

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send = jest.fn();

  constructor(public url: string, public protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  disconnect() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.disconnect();
  }
}

describe("websocket reconnect", () => {
  beforeAll(() => {
    (global as any).WebSocket = MockWebSocket;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.instances = [];
    localStorage.setItem("token", "test-token");
    jest.clearAllMocks();
  });

  afterEach(() => {
    disconnectFromServer("1238");
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("binds handlers again and re-enters the room after reconnecting", () => {
    const dispatch = jest.fn();
    (connect2server("1238") as any)(dispatch);

    const firstSocket = MockWebSocket.instances[0];
    firstSocket.open();
    expect(firstSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: ActionType.ENTER_GAME, roomid: "1238" })
    );

    firstSocket.disconnect();
    expect(message.loading).toHaveBeenCalledTimes(1);
    const reconnectNotice = (message.loading as jest.Mock).mock.calls[0][0];
    const refreshButton = reconnectNotice.props.children[1];
    expect(refreshButton.props.children).toBe("刷新");
    expect(refreshButton.props.onClick).toEqual(expect.any(Function));

    jest.advanceTimersByTime(1000);
    const reconnectedSocket = MockWebSocket.instances[1];
    expect(reconnectedSocket.onopen).not.toBeNull();
    expect(reconnectedSocket.onmessage).not.toBeNull();
    expect(reconnectedSocket.onclose).not.toBeNull();

    reconnectedSocket.open();
    expect(reconnectedSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: ActionType.ENTER_GAME, roomid: "1238" })
    );
  });

  it("sends the selected next-hand buy in", () => {
    const dispatch = jest.fn();
    (connect2server("1238") as any)(dispatch);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.send.mockClear();

    ws_setNextBuyIn(320);

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: ActionType.SET_NEXT_BUY_IN, chips: 320 })
    );
  });

  it("sends a run-it-out request without any client-supplied cards", () => {
    const dispatch = jest.fn();
    (connect2server("1238") as any)(dispatch);
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.send.mockClear();

    ws_runItOut();

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: ActionType.RUN_IT_OUT })
    );
  });
});
