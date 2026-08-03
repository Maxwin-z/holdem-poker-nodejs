import { render } from "@testing-library/react";
import { playCountdownAudio } from "./countdownAudio";
import { User } from "./User";

let mockState: any;

jest.mock("react-redux", () => ({
  shallowEqual: jest.fn(),
  useSelector: (selector: (state: any) => unknown) => selector(mockState),
}));

jest.mock("antd", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Progress: () => <div />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("./countdownAudio", () => ({
  playCountdownAudio: jest.fn(),
  stopCountdownAudio: jest.fn(),
}));

test("keeps an opponent's action countdown silent", () => {
  mockState = {
    room: {
      room: {
        users: [
          {
            id: "opponent-id",
            name: "OPPONENT",
            stack: 1000,
            bet: 0,
            isReady: true,
            isFoled: false,
            isAllIn: false,
            isActing: true,
            isWinner: false,
            isInCurrentGame: true,
            isOffline: false,
            actionEndTime: Date.now() + 9000,
            actionTimeLimit: 20,
            actionName: "",
            hands: [null, null],
            hasCards: false,
            profits: 0,
            position: "",
          },
        ],
      },
    },
  };

  const { getByLabelText } = render(
    <User id="opponent-id" seat="top-left" />
  );

  expect(getByLabelText(/剩余 \d+ 秒/)).toBeInTheDocument();
  expect(playCountdownAudio).not.toHaveBeenCalled();
});
