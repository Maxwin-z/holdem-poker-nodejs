import { fireEvent, render, screen } from "@testing-library/react";
import type { SimpleRoom, SimpleUser } from "../../ApiType";
import { BotManager } from "./BotManager";
import { ws_setBotAutoReveal } from "../../app/websocket";

let mockRoom: SimpleRoom | null = null;

jest.mock("../../app/hooks", () => ({
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({ room: { room: mockRoom } }),
}));

jest.mock("antd", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    "aria-label": ariaLabel,
  }: any) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
  Modal: ({ children, visible }: any) => (visible ? <div>{children}</div> : null),
  Popconfirm: ({ children }: any) => <>{children}</>,
  Select: Object.assign(({ children }: any) => <div>{children}</div>, {
    Option: ({ children }: any) => <div>{children}</div>,
  }),
  Switch: ({ checked, disabled, onChange, "aria-label": ariaLabel }: any) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      switch
    </button>
  ),
  Tag: ({ children }: any) => <span>{children}</span>,
  Tooltip: ({ children }: any) => <>{children}</>,
}));

jest.mock("@ant-design/icons", () => ({
  DeleteOutlined: () => <i />,
  PlusOutlined: () => <i />,
  RobotOutlined: () => <i />,
}));

jest.mock("../../app/websocket", () => ({
  ws_addBot: jest.fn(),
  ws_removeBot: jest.fn(),
  ws_setBotAutoReveal: jest.fn(),
}));

function buildUser(overrides: Partial<SimpleUser>): SimpleUser {
  return {
    id: "u1",
    name: "Bot",
    avatar: "",
    hasCards: false,
    isRoomOwner: false,
    isOffline: false,
    isReady: true,
    isFoled: false,
    isAllIn: false,
    isActing: false,
    isWinner: false,
    isInCurrentGame: true,
    isSpectator: false,
    isBot: true,
    pendingBotRemoval: false,
    actionEndTime: 0,
    actionTimeLimit: 20,
    actionName: "",
    hands: [],
    handsType: "",
    maxCards: [],
    profits: 0,
    position: "",
    stack: 200,
    bet: 0,
    ...overrides,
  };
}

function buildRoom(overrides: Partial<SimpleRoom>): SimpleRoom {
  return {
    roomid: "8K21",
    isGaming: false,
    minBuyIn: 200,
    maxBuyIn: 400,
    botAutoReveal: false,
    users: [],
    ...overrides,
  };
}

function openManager() {
  render(<BotManager />);
  fireEvent.click(screen.getByLabelText("管理AI机器人"));
}

describe("BotManager AI auto show switch", () => {
  beforeEach(() => {
    (ws_setBotAutoReveal as jest.Mock).mockClear();
  });

  it("turns the switch on for a room that has bots", () => {
    mockRoom = buildRoom({ users: [buildUser({ id: "bot-1" })] });
    openManager();

    const toggle = screen.getByLabelText("AI自动秀牌");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(ws_setBotAutoReveal).toHaveBeenCalledWith(true);
  });

  it("turns the switch back off from the room state", () => {
    mockRoom = buildRoom({
      botAutoReveal: true,
      users: [buildUser({ id: "bot-1" })],
    });
    openManager();

    const toggle = screen.getByLabelText("AI自动秀牌");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(ws_setBotAutoReveal).toHaveBeenCalledWith(false);
  });

  it("disables the switch when there is nothing to reveal", () => {
    mockRoom = buildRoom({ users: [buildUser({ id: "human", isBot: false })] });
    openManager();

    expect(screen.getByLabelText("AI自动秀牌")).toBeDisabled();
  });

  it("still allows turning it off after the last bot leaves", () => {
    mockRoom = buildRoom({
      botAutoReveal: true,
      users: [buildUser({ id: "human", isBot: false })],
    });
    openManager();

    const toggle = screen.getByLabelText("AI自动秀牌");
    expect(toggle).not.toBeDisabled();

    fireEvent.click(toggle);

    expect(ws_setBotAutoReveal).toHaveBeenCalledWith(false);
  });
});
