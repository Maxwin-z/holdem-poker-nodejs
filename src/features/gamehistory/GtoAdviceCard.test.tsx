import { fireEvent, render, screen } from "@testing-library/react";
import type { GtoLogEntry } from "../../ApiType";
import { getPostflopAdvice } from "../../gto/postflop/advice";
import { getPreflopAdvice } from "../../gto/preflop/advice";
import { cardToId } from "../../gto/postflop/cards";
import type { PostflopSituation } from "../../gto/postflop/types";
import GtoAdviceCard from "./GtoAdviceCard";
import GameHistory from "./GameHistory";

let mockState: any;

jest.mock("../../app/hooks", () => ({
  useAppSelector: (selector: (state: any) => unknown) => selector(mockState),
}));

jest.mock("../../app/websocket", () => ({
  ws_sendMessage: jest.fn(),
}));

const c = (num: number, suit: string) => cardToId({ num, suit });

function postflopSituation(
  over: Partial<PostflopSituation> = {}
): PostflopSituation {
  return {
    street: "flop",
    heroCards: [c(14, "h"), c(13, "h")],
    board: [c(9, "d"), c(7, "h"), c(2, "c")],
    pot: 120,
    currentBet: 0,
    heroBet: 0,
    toCall: 0,
    heroRemaining: 980,
    bigBlind: 2,
    effectiveStackBB: 100,
    activeVillainCount: 1,
    heroInPosition: true,
    isPreflopAggressor: true,
    preflopHasRaise: true,
    threeBetPot: false,
    streetBetCount: 0,
    facedRaiseThisStreet: false,
    ...over,
  };
}

const ACTION_COLORS: Record<string, string> = {
  fold: "#8a8f98",
  check: "#64748b",
  call: "#3b82f6",
  bet: "#22c55e",
  raise: "#f59e0b",
  allin: "#a855f7",
};

function postflopEntry(
  over: Partial<PostflopSituation> = {}
): GtoLogEntry {
  return {
    type: "gto",
    text: "GTO 翻牌建议",
    data: getPostflopAdvice(postflopSituation(over)),
    actingId: "p1",
    handSeq: 1,
  };
}

function preflopEntry(): GtoLogEntry {
  return {
    type: "gto",
    text: "GTO 翻前建议",
    data: getPreflopAdvice({
      playerCount: 6,
      heroPosition: "BTN",
      effectiveStackBB: 100,
      scenario: "unopened",
      heroHand: "AhKh",
    }),
    actingId: "p1",
    handSeq: 1,
  };
}

describe("GtoAdviceCard 全局折叠", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("默认折叠时只显示 GTO + 行动轮次，不显示建议", () => {
    render(<GtoAdviceCard entry={postflopEntry()} globalCollapsed />);
    expect(screen.getByText("GTO")).toBeInTheDocument();
    expect(screen.getByText("翻牌")).toBeInTheDocument();
    expect(screen.queryByText("翻牌建议")).not.toBeInTheDocument();
    expect(screen.queryByText(/建议/)).not.toBeInTheDocument();
  });

  it("翻前折叠条显示“翻前”", () => {
    render(<GtoAdviceCard entry={preflopEntry()} globalCollapsed />);
    expect(screen.getByText("翻前")).toBeInTheDocument();
  });

  it("展开态边框颜色与推荐行动字体颜色一致", () => {
    const entry = postflopEntry();
    const { container } = render(
      <GtoAdviceCard entry={entry} globalCollapsed={false} />
    );
    const card = container.querySelector(
      ".gto-advice-card"
    ) as HTMLElement;
    expect(card.style.borderColor).toBe(
      ACTION_COLORS[entry.data.kind === "postflop" ? entry.data.recommended : ""]
    );
  });

  it("展开态显示每手相关信息，通用说明默认折叠可展开", () => {
    const entry = postflopEntry();
    render(<GtoAdviceCard entry={entry} globalCollapsed={false} />);

    // 每手相关的信息直接可见
    expect(screen.getByText(/牌面：/)).toBeInTheDocument();
    expect(screen.getByText(/手牌类别：/)).toBeInTheDocument();
    expect(screen.getByText(/对继续范围权益/)).toBeInTheDocument();
    expect(screen.getByText("实际情况偏移建议")).toBeInTheDocument();

    // 通用说明（频率条解释 + 名词解释 + 近似说明）默认折叠
    expect(screen.getByText("通用说明")).toBeInTheDocument();
    expect(screen.queryByText(/频率条/)).not.toBeInTheDocument();
    expect(screen.queryByText("名词解释")).not.toBeInTheDocument();
    expect(screen.queryByText(/蒸馏神经网络近似/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("通用说明"));
    expect(screen.getByText(/频率条/)).toBeInTheDocument();
    expect(screen.getByText("名词解释")).toBeInTheDocument();
    expect(screen.getByText("有效筹码")).toBeInTheDocument();
    expect(screen.getByText(/蒸馏神经网络近似/)).toBeInTheDocument();
  });

  it("继续范围明细以二维表展示，可折叠", () => {
    const entry = postflopEntry();
    render(<GtoAdviceCard entry={entry} globalCollapsed={false} />);

    // 继续范围明细默认展开（类似翻前牌力表），展示表格与图例
    expect(screen.getByText(/继续范围明细/)).toBeInTheDocument();
    expect(
      screen.getByText("继续范围（颜色越深组合越多）")
    ).toBeInTheDocument();
    expect(screen.getByText("不在范围")).toBeInTheDocument();

    // 折叠后表格隐藏
    fireEvent.click(screen.getByText(/继续范围明细/));
    expect(screen.queryByText("不在范围")).not.toBeInTheDocument();
  });

  it("眼睛图标控制全局展开/折叠并持久化到 localStorage", () => {
    const entry = postflopEntry();
    mockState = {
      gamehistory: { logs: [entry] },
      room: { game: { handSeq: 1, acting: "p1" } },
    };
    render(<GameHistory />);

    // 默认折叠
    expect(screen.getByText("翻牌")).toBeInTheDocument();
    expect(screen.queryByText("翻牌建议")).not.toBeInTheDocument();

    // 点击眼睛展开，写入本地
    fireEvent.click(screen.getByRole("button", { name: "展开 GTO 建议" }));
    expect(screen.getByText("翻牌建议")).toBeInTheDocument();
    expect(localStorage.getItem("gtoAdviceCollapsed")).toBe("0");

    // 再次点击折叠
    fireEvent.click(screen.getByRole("button", { name: "折叠 GTO 建议" }));
    expect(screen.queryByText("翻牌建议")).not.toBeInTheDocument();
    expect(localStorage.getItem("gtoAdviceCollapsed")).toBe("1");
  });

  it("本地已保存展开状态时，新卡片默认展开", () => {
    localStorage.setItem("gtoAdviceCollapsed", "0");
    mockState = {
      gamehistory: { logs: [postflopEntry()] },
      room: { game: { handSeq: 1, acting: "p1" } },
    };
    render(<GameHistory />);
    expect(screen.getByText("翻牌建议")).toBeInTheDocument();
  });
});
