import { fireEvent, render } from "@testing-library/react";
import { Owner } from "./Owner";
import { ws_runItOut } from "../../app/websocket";

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
  Switch: () => <button type="button">switch</button>,
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

beforeEach(() => {
  mockState = {
    room: {
      room: {
        roomid: "room",
        isGaming: false,
        users: [
          {
            id: "self",
            name: "SELF",
            isRoomOwner: false,
            isReady: true,
            isInCurrentGame: true,
            isSpectator: false,
            isActing: false,
            isAllIn: false,
            isFoled: true,
            isWinner: false,
            actionEndTime: Date.now(),
            actionTimeLimit: 20,
            actionName: "",
            hands: [null, null],
            handsType: "",
            stack: 200,
            bet: 0,
            profits: 0,
            position: "",
          },
        ],
      },
      game: {
        boardCards: [],
        pots: 0,
        preBet: 0,
        bb: 2,
        isSettling: true,
        raiseUser: "",
        raiseBet: 0,
        raiseBetDiff: 0,
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
  jest.clearAllMocks();
});

test("shows the run-it-out action to a folded hand participant during settlement", () => {
  const { getByText } = render(<Owner />);

  fireEvent.click(getByText("发发看"));

  expect(ws_runItOut).toHaveBeenCalledTimes(1);
});
