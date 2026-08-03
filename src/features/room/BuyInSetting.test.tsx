import { fireEvent, render } from "@testing-library/react";
import { ws_setNextBuyIn } from "../../app/websocket";
import { BuyInSettingButton } from "./BuyInSetting";

let mockState: any;

jest.mock("../../app/hooks", () => ({
  useAppSelector: (selector: (state: any) => unknown) => selector(mockState),
}));

jest.mock("../../app/websocket", () => ({
  ws_setNextBuyIn: jest.fn(),
}));

function makeState(nextBuyIn: number | null = null) {
  const user = {
    id: "self-id",
    name: "RESTING",
    avatar: "",
    hasCards: false,
    isRoomOwner: false,
    isOffline: false,
    isReady: false,
    isFoled: false,
    isAllIn: false,
    isActing: false,
    isWinner: false,
    isInCurrentGame: false,
    isSpectator: false,
    actionEndTime: 0,
    actionTimeLimit: 20,
    actionName: "",
    hands: [null, null],
    handsType: "",
    maxCards: [],
    profits: 0,
    position: "",
    stack: 120,
    bet: 0,
  };
  return {
    room: {
      room: {
        roomid: "1238",
        isGaming: true,
        minBuyIn: 200,
        maxBuyIn: 500,
        users: [user],
      },
      self: {
        id: user.id,
        hands: [],
        handsType: "",
        nextBuyIn,
      },
    },
  };
}

describe("BuyInSettingButton", () => {
  beforeEach(() => {
    mockState = makeState();
    jest.clearAllMocks();
  });

  it("shows the server-provided range and submits the selected integer", () => {
    const { getAllByText, getByLabelText, getByText } = render(
      <BuyInSettingButton />
    );

    fireEvent.click(getByLabelText("设置下一手带入码量"));
    expect(getByText("最小买入")).toBeInTheDocument();
    expect(getByText("CHIP LEADER")).toBeInTheDocument();
    expect(getAllByText("200").length).toBeGreaterThan(0);
    expect(getAllByText("500").length).toBeGreaterThan(0);

    fireEvent.change(getByLabelText("下一手带入筹码"), {
      target: { value: "350" },
    });
    fireEvent.click(getByText("保存设置"));

    expect(ws_setNextBuyIn).toHaveBeenCalledWith(350);
  });

  it("shows a previously saved target on the button", () => {
    mockState = makeState(320);
    const { getByText } = render(<BuyInSettingButton />);
    expect(getByText("带入 320")).toBeInTheDocument();
  });
});
