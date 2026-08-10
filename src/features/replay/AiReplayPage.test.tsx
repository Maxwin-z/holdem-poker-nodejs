import { render, screen } from "@testing-library/react";
// RTL v9 exports `wait` at runtime but the bundled @types predate it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wait } = require("@testing-library/react") as {
  wait: (callback: () => void) => Promise<void>;
};
import type { AiReplaySummary } from "../../shared/aiReplay";
import { AiReplayPage } from "./AiReplayPage";

const OWNED_ID = "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6";
const SHARED_ID = "ffffffffffffffffffffffffffffffff";

function summary(publicId: string): AiReplaySummary {
  return {
    publicId,
    completedAt: 1754800000000,
    handSeq: 3,
    heroName: "C",
    heroPosition: "BTN",
    heroCards: [{ num: 14, suit: "s" }, { num: 13, suit: "s" }],
    board: [],
    botCount: 5,
    bigBlind: 20,
    heroProfitChips: 40,
    heroProfitBB: 2,
    result: "win",
    decisionCount: 2,
    deviationScore: 12,
    deviationLevel: "minor",
    scoredDecisionCount: 2,
    severeDecisionCount: 0,
    maxDecisionDeviation: 18,
    totalEvLossBB: null,
  };
}

function mockApi(listItems: AiReplaySummary[]) {
  return jest.fn((url: RequestInfo | URL) => {
    if (String(url) === "/api/me/ai-replays") {
      return Promise.resolve({
        json: () => Promise.resolve({ code: 0, data: { items: listItems, total: listItems.length } }),
      } as Response);
    }
    // Keep the detail request pending: sidebar visibility must not depend on it.
    return new Promise<Response>(() => {});
  });
}

afterEach(() => {
  localStorage.removeItem("token");
  window.history.pushState({}, "", "/replays");
});

test("owner viewing an owned replay keeps the private list sidebar", async () => {
  localStorage.setItem("token", "owner-token");
  window.history.pushState({}, "", `/replays/${OWNED_ID}`);
  global.fetch = mockApi([summary(OWNED_ID)]);

  render(<AiReplayPage />);

  expect(await screen.findByText("最近对局")).toBeInTheDocument();
});

test("logged-in visitor opening a shared replay sees no list sidebar", async () => {
  localStorage.setItem("token", "visitor-token");
  window.history.pushState({}, "", `/replays/${SHARED_ID}`);
  const fetchMock = mockApi([summary(OWNED_ID)]);
  global.fetch = fetchMock;

  render(<AiReplayPage />);

  await wait(() => expect(fetchMock).toHaveBeenCalledWith("/api/me/ai-replays", expect.anything()));
  expect(screen.queryByText("最近对局")).not.toBeInTheDocument();
});

test("logged-out visitor opening a shared replay sees no list sidebar and no list request", async () => {
  window.history.pushState({}, "", `/replays/${SHARED_ID}`);
  const fetchMock = mockApi([]);
  global.fetch = fetchMock;

  render(<AiReplayPage />);

  await wait(() => expect(fetchMock).toHaveBeenCalledWith(`/api/ai-replays/${SHARED_ID}`, expect.anything()));
  expect(fetchMock).not.toHaveBeenCalledWith("/api/me/ai-replays", expect.anything());
  expect(screen.queryByText("最近对局")).not.toBeInTheDocument();
});

test("logged-out /replays entry keeps the sidebar with its login prompt", async () => {
  window.history.pushState({}, "", "/replays");
  global.fetch = mockApi([]);

  render(<AiReplayPage />);

  expect(await screen.findByText("最近对局")).toBeInTheDocument();
  expect(screen.getByText("登录后查看你的复盘列表")).toBeInTheDocument();
});
