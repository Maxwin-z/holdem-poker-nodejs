import { fireEvent, render } from "@testing-library/react";
import { Owner } from "./Owner";
import {
  ws_overtime,
  ws_userBet,
  ws_userFold,
} from "../../app/websocket";

let mockState: any;

jest.mock("react-redux", () => ({
  shallowEqual: jest.fn(),
  useSelector: (selector: (state: any) => unknown) => selector(mockState),
}));

jest.mock("antd", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Switch: ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      switch
    </button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("../../app/websocket", () => ({
  ws_overtime: jest.fn(),
  ws_runItOut: jest.fn(),
  ws_startGame: jest.fn(),
  ws_userBet: jest.fn(),
  ws_userFold: jest.fn(),
  ws_userReady: jest.fn(),
}));

jest.mock("./Poker", () => ({ Poker: () => <div /> }));
jest.mock("./CountDown", () => ({ CountDown: () => <div /> }));
jest.mock("./Symbol", () => ({
  BigBlind: () => <div />,
  Dealer: () => <div />,
  SmallBlind: () => <div />,
}));
jest.mock("./BuyInSetting", () => ({
  BuyInSettingButton: () => <button type="button">设置带入</button>,
}));

function setActingState({
  stack = 100,
  bet = 10,
  preBet = 20,
}: {
  stack?: number;
  bet?: number;
  preBet?: number;
} = {}) {
  mockState = {
    room: {
      room: {
        roomid: "room",
        isGaming: true,
        users: [
          {
            id: "self",
            name: "SELF",
            isRoomOwner: false,
            isReady: true,
            isInCurrentGame: true,
            isSpectator: false,
            isActing: true,
            isAllIn: false,
            isFoled: false,
            isWinner: false,
            actionEndTime: Date.now() + 20_000,
            actionTimeLimit: 20,
            actionName: "",
            hands: [null, null],
            handsType: "",
            stack,
            bet,
            profits: 0,
            position: "",
          },
        ],
      },
      game: {
        boardCards: [],
        pots: 80,
        preBet,
        bb: 10,
        isSettling: false,
        raiseUser: "other",
        raiseBet: 20,
        raiseBetDiff: 10,
        userCount: 2,
      },
      self: {
        id: "self",
        hands: [],
        handsType: "",
        nextBuyIn: null,
        runItOutBoardCards: [],
      },
    },
  };
}

beforeEach(() => {
  setActingState();
  jest.clearAllMocks();
  jest
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("chip input starts empty and accepts a number without restoring zero", () => {
  const { getByLabelText } = render(<Owner />);
  const input = getByLabelText("加注金额") as HTMLInputElement;

  expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "12" } });
  expect(input.value).toBe("12");
});

test("Enter submits a valid amount from the chip input", () => {
  const { getByLabelText } = render(<Owner />);
  const input = getByLabelText("加注金额") as HTMLInputElement;

  fireEvent.change(input, { target: { value: "30" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(ws_userBet).toHaveBeenCalledTimes(1);
  expect(ws_userBet).toHaveBeenCalledWith(40);
});

test("an amount over stack asks before converting the action to all-in", () => {
  const { getByLabelText, getByText } = render(<Owner />);

  fireEvent.change(getByLabelText("加注金额"), {
    target: { value: "150" },
  });
  fireEvent.click(getByText("加注 150"));

  expect(getByText("输入金额超过当前 Stack")).toBeTruthy();
  expect(ws_userBet).not.toHaveBeenCalled();

  fireEvent.click(getByText("确认 All-in"));
  expect(ws_userBet).toHaveBeenCalledWith(110);
});

test("fold asks for confirmation when check is available", () => {
  setActingState({ bet: 20, preBet: 20 });
  const { getByRole, getByText } = render(<Owner />);

  fireEvent.click(getByText("弃牌"));
  expect(getByText("当前可以免费过牌")).toBeTruthy();
  expect(ws_userFold).not.toHaveBeenCalled();

  fireEvent.click(
    getByRole("alertdialog").querySelector("button.is-primary") as HTMLElement
  );
  expect(ws_userBet).toHaveBeenCalledWith(20);
  expect(ws_userFold).not.toHaveBeenCalled();
});

test("a digit outside editable controls focuses and seeds the chip input", () => {
  const { getByLabelText } = render(<Owner />);
  const input = getByLabelText("加注金额") as HTMLInputElement;

  fireEvent.keyDown(document, { key: "4" });

  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("4");
});

test("chat typing is isolated while R submits a valid focused chip input", () => {
  const { getByLabelText } = render(<Owner />);
  const chat = document.createElement("textarea");
  document.body.appendChild(chat);
  chat.focus();

  fireEvent.keyDown(chat, { key: "F" });
  fireEvent.keyDown(chat, { key: "7" });
  expect(ws_userFold).not.toHaveBeenCalled();
  expect((getByLabelText("加注金额") as HTMLInputElement).value).toBe("");

  const input = getByLabelText("加注金额") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "30" } });
  input.focus();
  fireEvent.keyDown(input, { key: "R" });

  expect(ws_userBet).toHaveBeenCalledWith(40);
  chat.remove();
});

test("K, C, and M shortcuts execute only their available actions", () => {
  const { unmount } = render(<Owner />);

  fireEvent.keyDown(document, { key: "C" });
  fireEvent.keyDown(document, { key: "M" });
  expect(ws_userBet).toHaveBeenCalledWith(20);
  expect(ws_overtime).toHaveBeenCalledTimes(1);

  unmount();
  jest.clearAllMocks();
  setActingState({ bet: 20, preBet: 20 });
  render(<Owner />);
  fireEvent.keyDown(document, { key: "K" });
  expect(ws_userBet).toHaveBeenCalledWith(20);
});

test("AI practice disables the paid overtime button and its M shortcut", () => {
  setActingState();
  const [hero] = mockState.room.room.users;
  mockState.room.room.users.push(
    { ...hero, id: "bot-1", isActing: false, isBot: true },
    { ...hero, id: "bot-2", isActing: false, isBot: true }
  );
  const { getByLabelText } = render(<Owner />);

  fireEvent.keyDown(document, { key: "M" });

  expect(ws_overtime).not.toHaveBeenCalled();
  expect(
    (getByLabelText("行动倒计时与加时") as HTMLButtonElement).disabled
  ).toBe(true);
});

test("I toggles the waiting check-fold preaction", () => {
  setActingState();
  mockState.room.room.users[0].isActing = false;
  const { getByText } = render(<Owner />);
  const switchButton = getByText("switch");

  expect(switchButton.getAttribute("aria-pressed")).toBe("false");
  fireEvent.keyDown(document, { key: "I" });
  expect(switchButton.getAttribute("aria-pressed")).toBe("true");
});
