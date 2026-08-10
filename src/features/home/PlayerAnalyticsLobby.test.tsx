import { render, screen } from "@testing-library/react";
import type { PlayerAnalyticsReport } from "../../shared/playerAnalytics";
import { PlayerAnalytics } from "../room/PlayerAnalytics";

const report: PlayerAnalyticsReport = {
  window: 100,
  generatedAt: "2026-08-10T00:00:00.000Z",
  style: {
    code: "tag",
    label: "紧凶型 TAG",
    summary: "入池选择与主动性较均衡。",
  },
  core: {
    hands: 100,
    vpip: { value: 24, numerator: 24, denominator: 100 },
    pfr: { value: 20, numerator: 20, denominator: 100 },
    threeBet: { value: 8, numerator: 4, denominator: 50 },
    aggressionFrequency: { value: 48, numerator: 48, denominator: 100 },
    aggressionFactor: 3,
    wentToShowdown: { value: 29, numerator: 12, denominator: 41 },
    wonAtShowdown: { value: 51, numerator: 6, denominator: 12 },
    gtoAlignment: { value: 62, numerator: 62, denominator: 100 },
    netBB: 18.6,
    bbPer100: 18.6,
  },
  positions: [
    { position: "BTN", hands: 22, vpip: 32, pfr: 27, netBB: 12.4 },
  ],
  streets: [
    { street: "flop", actions: 40, fold: 9, call: 12, aggressive: 19, aggressionFrequency: 48, gtoAlignment: 64 },
  ],
  insights: [],
};

test("renders the full in-game analytics card in the lobby", () => {
  const { container } = render(
    <PlayerAnalytics variant="lobby" previewReport={report} />
  );

  expect(container.querySelector(".player-analytics.is-lobby")).toBeInTheDocument();
  expect(screen.getByText("我的牌局分析")).toBeInTheDocument();
  expect(screen.getByText("紧凶型 TAG")).toBeInTheDocument();
  expect(screen.getAllByText("VPIP").length).toBeGreaterThan(0);
  expect(screen.getAllByText("PFR").length).toBeGreaterThan(0);
  expect(screen.getByText("3-Bet")).toBeInTheDocument();
  expect(screen.getAllByText("Agg%").length).toBeGreaterThan(0);
  expect(screen.getByText("WTSD")).toBeInTheDocument();
  expect(screen.getByText("W$SD")).toBeInTheDocument();
  expect(screen.getAllByText("GTO Match").length).toBeGreaterThan(0);
  expect(screen.getByText("AF")).toBeInTheDocument();
  expect(screen.getByText("数据解读")).toBeInTheDocument();
  expect(screen.getByText("位置表现")).toBeInTheDocument();
  expect(screen.getByText("各街行动")).toBeInTheDocument();
  expect(screen.queryByLabelText("AI 牌局复盘（新窗口打开）")).not.toBeInTheDocument();
});

test("opens the room analytics replay entry in a new window", () => {
  render(<PlayerAnalytics previewReport={report} />);

  const entry = screen.getByLabelText("AI 牌局复盘（新窗口打开）");
  expect(entry).toHaveAttribute("href", "/replays");
  expect(entry).toHaveAttribute("target", "_blank");
  expect(entry).toHaveAttribute("rel", "noopener noreferrer");
});
