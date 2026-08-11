import { useEffect } from "react";
import {
  Card,
  GameLogEntry,
  SimpleChipsRecord,
  SimpleGame,
  SimpleRoom,
  SimpleSelf,
  SimpleUser,
} from "../../ApiType";
import { useAppDispatch } from "../../app/hooks";
import { getPostflopAdvice } from "../../gto/postflop/advice";
import { cardToId } from "../../gto/postflop/cards";
import { getPreflopAdvice } from "../../gto/preflop/advice";
import { Room } from "../room/Room";
import {
  setGame,
  setRoom,
  setSelectSettleTimes,
  setSelf,
} from "../room/roomSlice";

const boardCards: Card[] = [
  { num: 14, suit: "s" },
  { num: 10, suit: "h" },
  { num: 7, suit: "d" },
  { num: 2, suit: "c" },
  { num: 13, suit: "s" },
];

const previewCard = (num: number, suit: string) => cardToId({ num, suit });

// GTO 建议是结构化条目（不是日志字符串），预览页也要带上，
// 否则改版后的折叠条 / 展开卡没法在浏览器里核对。
const preflopAdvice: GameLogEntry = {
  type: "gto",
  text: "GTO 翻前建议",
  data: getPreflopAdvice({
    playerCount: 6,
    heroPosition: "BTN",
    effectiveStackBB: 100,
    scenario: "unopened",
    heroHand: "AdAc",
  }),
  actingId: "momo",
  handSeq: 127,
};

const postflopAdvice: GameLogEntry = {
  type: "gto",
  text: "GTO 转牌建议",
  data: getPostflopAdvice({
    street: "turn",
    heroCards: [previewCard(14, "d"), previewCard(14, "c")],
    board: [
      previewCard(14, "s"),
      previewCard(10, "h"),
      previewCard(7, "d"),
      previewCard(2, "c"),
    ],
    pot: 1240,
    currentBet: 0,
    heroBet: 0,
    toCall: 0,
    heroRemaining: 8700,
    bigBlind: 40,
    effectiveStackBB: 87,
    activeVillainCount: 1,
    heroInPosition: true,
    isPreflopAggressor: true,
    preflopHasRaise: true,
    threeBetPot: false,
    streetBetCount: 0,
    facedRaiseThisStreet: false,
  }),
  actingId: "momo",
  handSeq: 127,
};

// 与服务端 publishLog2all 的输出格式保持一致，预览页才能真实反映排版。
const previewLogs: GameLogEntry[] = [
  '<div class="log-banner log-banner--start">🂠 第 126 手开始</div>',
  '<strong class="log-player">Ivy</strong><span class="log-pos">SB</span> <span class="log-act log-act--fold">弃牌</span>',
  '<strong class="log-player">Sora</strong><span class="log-pos">BTN</span> <span class="log-act log-act--raise">加注到</span> 120',
  '<strong class="log-player">Sora</strong> <span class="log-profit log-profit--win">+640</span>',
  '<strong class="log-player">Ivy</strong> <span class="log-profit log-profit--lose">-640</span>',
  '<div class="log-banner log-banner--end">💰 第 126 手结束</div>',
  '<div class="log-banner log-banner--start">🂠 第 127 手开始</div>',
  '<strong class="log-player">Momo</strong><span class="log-pos">BTN</span> <span class="log-act log-act--raise">加注到</span> 240',
  preflopAdvice,
  '<strong class="log-player">Jax</strong><span class="log-pos">CO</span> <span class="log-act log-act--fold">弃牌</span>',
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--call">跟注</span> 240',
  "<strong>Leo</strong>: \n      这手有点意思",
  '<span class="log-round-title">翻牌</span> 14s10h7d',
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--check">过牌</span>',
  '<strong class="log-player">Momo</strong><span class="log-pos">BTN</span> <span class="log-act log-act--bet">下注</span> 320',
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--call">跟注</span> 320',
  '<span class="log-round-title">转牌</span> 2c',
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--check">过牌</span>',
  postflopAdvice,
  '<strong class="log-player">Momo</strong><span class="log-pos">BTN</span> <span class="log-act log-act--bet">下注</span> 680',
  '<strong class="log-player">Leo</strong><span class="log-pos">BB</span> <span class="log-act log-act--allin">全下</span> 2140',
  '<span class="log-round-title">河牌</span> 13s',
  '<strong class="log-player">Momo</strong> 【14d14c】14s14d14c10h7d 三条 A <span class="log-profit log-profit--win">+1280</span>',
  '<strong class="log-player">Leo</strong> 【13h12h】13s13h12h10h7d 一对 K <span class="log-profit log-profit--lose">-1280</span>',
  "<strong>Maxwin</strong>: \n      nice&nbsp;hand",
];

const previewChipsRecords: SimpleChipsRecord[] = [
  { id: "sora", name: "Sora", chips: 186400, buyIn: 120000 },
  { id: "maxwin", name: "Maxwin", chips: 124860, buyIn: 100000 },
  { id: "momo", name: "Momo", chips: 128450, buyIn: 140000 },
  { id: "jax", name: "Jax", chips: 36780, buyIn: 40000 },
  { id: "nana", name: "Nana", chips: 72210, buyIn: 80000 },
  { id: "owen", name: "Owen", chips: 50820, buyIn: 60000 },
  { id: "ivy", name: "Ivy", chips: 9340, buyIn: 10000 },
];

function makeUser(
  id: string,
  name: string,
  stack: number,
  overrides: Partial<SimpleUser> = {}
): SimpleUser {
  return {
    id,
    name,
    avatar: "",
    hasCards: true,
    isRoomOwner: false,
    isOffline: false,
    isReady: true,
    isFoled: false,
    isAllIn: false,
    isActing: false,
    isWinner: false,
    isInCurrentGame: true,
    isSpectator: false,
    actionEndTime: Date.now() + 18000,
    actionTimeLimit: 20,
    actionName: "",
    hands: [null, null],
    handsType: "",
    maxCards: [],
    profits: 0,
    position: "",
    stack,
    bet: 0,
    ...overrides,
    isBot: overrides.isBot ?? false,
    pendingBotRemoval: overrides.pendingBotRemoval ?? false,
  };
}

export function RoomUiPreview() {
  const dispatch = useAppDispatch();
  const previewState =
    new URLSearchParams(window.location.search).get("state") || "acting";
  const isOwnerActing = previewState === "acting";
  const isSelectingRunTimes = previewState === "settling";
  const isShowdown = previewState === "showdown";
  const isOwnerWaiting = previewState === "owner-waiting";
  const isNewUser = previewState === "new-user";
  const showAllDealerPositions = previewState === "dealer-positions";

  useEffect(() => {
    const users: SimpleUser[] = [
      makeUser("momo", "Momo", 128450, {
        isRoomOwner: isNewUser,
        position: "D",
        actionName: "已跟注",
        bet: 80,
        isWinner: isShowdown,
        hands: isShowdown
          ? [
              { num: 14, suit: "d" },
              { num: 14, suit: "c" },
            ]
          : [null, null],
        handsType: isShowdown ? "三条 A" : "",
        maxCards: isShowdown
          ? [
              { num: 14, suit: "s" },
              { num: 14, suit: "d" },
              { num: 14, suit: "c" },
              { num: 10, suit: "h" },
              { num: 7, suit: "d" },
            ]
          : [],
        profits: isShowdown ? 1280 : 0,
      }),
      makeUser("jax", "Jax", 36780, {
        actionName: "等待",
      }),
      makeUser("leo", "Leo", 1940, {
        position: "SB",
        isActing: !isOwnerActing && !isShowdown,
        actionName: isShowdown
          ? "已加注"
          : !isOwnerActing
          ? "思考中"
          : "等待",
        bet: 160,
        hands: isShowdown
          ? [
              { num: 10, suit: "s" },
              { num: 10, suit: "d" },
            ]
          : [null, null],
        handsType: isShowdown ? "三条 10" : "",
      }),
      makeUser("river", "River", 3120, {
        position: "BB",
        isFoled: true,
        actionName: "已弃牌",
      }),
      makeUser("kai", "Kai", 840, {
        isAllIn: true,
        actionName: "All-in",
        bet: 840,
      }),
      makeUser("nana", "Nana", 72210, {
        actionName: "等待",
      }),
      makeUser("owen", "Owen", 50820, {
        actionName: "已跟注",
        bet: 80,
      }),
      makeUser("sora", "Sora", 186400, {
        actionName: "等待",
      }),
      makeUser("ivy", "Ivy", 9340, {
        isFoled: true,
        actionName: "已弃牌",
      }),
      makeUser("maxwin", "Maxwin", 124860, {
        isRoomOwner: !isNewUser,
        isReady: !isNewUser,
        isInCurrentGame: !isOwnerWaiting && !isNewUser,
        isActing: isOwnerActing,
        actionName: isOwnerActing ? "行动中" : "已投入",
        bet: 80,
        handsType: "两对 · A 和 10",
        hands: isShowdown
          ? [
              { num: 14, suit: "h" },
              { num: 10, suit: "c" },
            ]
          : [null, null],
      }),
    ];
    if (showAllDealerPositions) {
      users.forEach((user) => {
        user.position = "D";
      });
    }
    const room: SimpleRoom = {
      roomid: "8K21",
      isGaming: !isOwnerWaiting,
      minBuyIn: 4000,
      maxBuyIn: 186400,
      botAutoReveal: false,
      users,
    };
    const game: SimpleGame = {
      boardCards,
      pots: 960,
      acting: isShowdown ? "" : isOwnerActing ? "maxwin" : "leo",
      raiseUser: "leo",
      raiseBet: 240,
      raiseBetDiff: 160,
      preBet: 240,
      bb: 40,
      handSeq: 0,
      isSettling: isSelectingRunTimes || isShowdown,
      nextGameTime: Date.now() + 10000,
      userCount: 10,
    };
    const self: SimpleSelf = {
      id: "maxwin",
      hands: [
        { num: 14, suit: "h" },
        { num: 10, suit: "c" },
      ],
      handsType: "两对 · A 和 10",
      nextBuyIn: null,
      runItOutBoardCards: [],
    };

    dispatch(setRoom(room));
    dispatch(setGame(game));
    dispatch(setSelf(self));
    dispatch(setSelectSettleTimes(isSelectingRunTimes));
  }, [
    dispatch,
    isNewUser,
    isOwnerActing,
    isOwnerWaiting,
    isSelectingRunTimes,
    isShowdown,
    showAllDealerPositions,
  ]);

  return (
    <Room
      previewDetails={{
        logs: previewLogs,
        chipsRecords: previewChipsRecords,
      }}
    />
  );
}
