import { buildFeed, filterHands, parseLogLine } from "./feedModel";

/**
 * 下面的字符串逐字抄自 src/server/service/Room.ts / index.ts 的
 * publishLog2all 调用。服务端改了日志格式，这里应该先红。
 */
const HAND_START =
  '<div class="log-banner log-banner--start">🂠 第 127 手开始</div>';
const HAND_END =
  '<div class="log-banner log-banner--end">💰 第 127 手结束</div>';
const FLOP = '<span class="log-round-title">翻牌</span> 14s10h7d';
const RAISE =
  '<strong class="log-player">Momo</strong><span class="log-pos">BTN</span> <span class="log-act log-act--raise">加注到</span> 240';
const FOLD =
  '<strong class="log-player">Jax</strong><span class="log-pos">CO</span> <span class="log-act log-act--fold">弃牌</span>';
const CHECK =
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--check">过牌</span>';
const SETTLE_WIN =
  '<strong class="log-player">Momo</strong> 【14d14c】14s14d14c10h7d 三条 A <span class="log-profit log-profit--win">+1280</span>';
const SETTLE_LOSE =
  '<strong class="log-player">Leo</strong> <span class="log-profit log-profit--lose">-1280</span>';
const CHAT = "<strong>Leo</strong>: \n      这手&nbsp;有点意思";

describe("feedModel 日志解析", () => {
  it("识别开始/结束横幅并取到手数", () => {
    expect(parseLogLine(HAND_START)).toEqual({ kind: "handStart", hand: 127 });
    expect(parseLogLine(HAND_END)).toEqual({ kind: "handEnd", hand: 127 });
  });

  it("拆出街道名与公共牌", () => {
    expect(parseLogLine(FLOP)).toEqual({
      kind: "street",
      label: "翻牌",
      cards: [
        { num: 14, suit: "s" },
        { num: 10, suit: "h" },
        { num: 7, suit: "d" },
      ],
    });
  });

  it("拆出行动的名字、位置、动作与金额", () => {
    expect(parseLogLine(RAISE)).toEqual({
      kind: "action",
      name: "Momo",
      pos: "BTN",
      act: "raise",
      verb: "加注到",
      amount: 240,
    });
    expect(parseLogLine(FOLD)).toMatchObject({
      kind: "action",
      act: "fold",
      amount: null,
    });
    expect(parseLogLine(CHECK)).toMatchObject({
      kind: "action",
      act: "check",
      amount: null,
    });
  });

  it("拆出结算行的手牌、牌型与盈亏", () => {
    expect(parseLogLine(SETTLE_WIN)).toEqual({
      kind: "settle",
      name: "Momo",
      hole: [
        { num: 14, suit: "d" },
        { num: 14, suit: "c" },
      ],
      best: [
        { num: 14, suit: "s" },
        { num: 14, suit: "d" },
        { num: 14, suit: "c" },
        { num: 10, suit: "h" },
        { num: 7, suit: "d" },
      ],
      handsType: "三条 A",
      profit: 1280,
    });
    // 盖牌的玩家没有 【手牌】 段
    expect(parseLogLine(SETTLE_LOSE)).toEqual({
      kind: "settle",
      name: "Leo",
      hole: [],
      best: [],
      handsType: "",
      profit: -1280,
    });
  });

  it("聊天还原成纯文本，不再靠 innerHTML", () => {
    expect(parseLogLine(CHAT)).toEqual({
      kind: "chat",
      name: "Leo",
      text: "这手 有点意思",
    });
  });

  it("认不出来的行留作 note，不丢内容", () => {
    expect(parseLogLine("发2次")).toEqual({ kind: "note", html: "发2次" });
  });
});

describe("feedModel 分组", () => {
  const logs = [
    HAND_START,
    RAISE,
    FOLD,
    CHAT,
    FLOP,
    CHECK,
    SETTLE_WIN,
    SETTLE_LOSE,
    HAND_END,
  ];

  it("按手分组，横幅本身不再作为条目渲染", () => {
    const hands = buildFeed(logs);
    expect(hands).toHaveLength(1);
    expect(hands[0].hand).toBe(127);
    expect(hands[0].ended).toBe(true);
    expect(hands[0].chatCount).toBe(1);
    expect(
      hands[0].items.some(
        (item) =>
          item.type === "line" &&
          (item.line.kind === "handStart" || item.line.kind === "handEnd")
      )
    ).toBe(false);
  });

  it("连续结算行合并成一个摊牌块，并算出本手最大赢家", () => {
    const hands = buildFeed(logs);
    const showdowns = hands[0].items.filter(
      (item) => item.type === "showdown"
    );
    expect(showdowns).toHaveLength(1);
    expect(showdowns[0].type === "showdown" && showdowns[0].rows).toHaveLength(
      2
    );
    expect(hands[0].best).toEqual({ name: "Momo", profit: 1280 });
  });

  it("多手日志切成多组", () => {
    const hands = buildFeed([
      HAND_START,
      RAISE,
      HAND_END,
      '<div class="log-banner log-banner--start">🂠 第 128 手开始</div>',
      FOLD,
    ]);
    expect(hands.map((hand) => hand.hand)).toEqual([127, 128]);
    expect(hands[1].ended).toBe(false);
  });

  it("翻前补一个街道小标题，服务端只发翻后的街道行", () => {
    const streets = buildFeed(logs)[0].items.filter(
      (item) => item.type === "line" && item.line.kind === "street"
    );
    expect(
      streets.map((item) =>
        item.type === "line" && item.line.kind === "street"
          ? item.line.label
          : ""
      )
    ).toEqual(["翻前", "翻牌"]);
  });

  it("重连后从半手开始的日志也不丢，落在无编号分组里", () => {
    const hands = buildFeed([RAISE, FOLD]);
    expect(hands).toHaveLength(1);
    expect(hands[0].hand).toBe(0);
    // 不知道是哪条街，就不硬补"翻前"
    expect(hands[0].items).toHaveLength(2);
  });

  it("筛选后只留命中的条目，并丢掉空手", () => {
    const chatOnly = filterHands(buildFeed(logs), "chat");
    expect(chatOnly).toHaveLength(1);
    expect(chatOnly[0].items).toHaveLength(1);
    expect(filterHands(buildFeed([HAND_START, RAISE]), "chat")).toHaveLength(0);
  });
});
