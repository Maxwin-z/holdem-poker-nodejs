import { useEffect, useState } from "react";
import {
  Card,
  SimpleChipsRecord,
  SimpleGame,
  SimpleRoom,
  SimpleSelf,
  SimpleUser,
} from "../../ApiType";
import { useAppDispatch } from "../../app/hooks";
import { Room } from "../room/Room";
import {
  setGame,
  setRoom,
  setSelectSettleTimes,
  setSelf,
} from "../room/roomSlice";
import "./ResponsiveTableDemo.css";

const boardCards: Card[] = [
  { num: 14, suit: "s" },
  { num: 10, suit: "h" },
  { num: 7, suit: "d" },
  { num: 2, suit: "c" },
  { num: 13, suit: "s" },
];

const previewLogs = [
  "=== 新的一手 #128 ===",
  "Momo 在按钮位下注 80",
  "Flop 14s 10h 7d",
  "<strong>Leo</strong>: 这手有点意思",
  "Owen 跟注 80",
  "Turn 2c",
  "<strong>Maxwin</strong>: 河牌见",
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

type DemoState = "acting" | "waiting" | "showdown" | "settling" | "dealer";

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

function buildPreview(demoState: DemoState) {
  const isShowdown = demoState === "showdown" || demoState === "settling";
  const users: SimpleUser[] = [
    makeUser("momo", "Momo", 128450, {
      position: "D",
      actionName: "已跟注",
      bet: 80,
      isWinner: demoState === "showdown",
      hands:
        demoState === "showdown"
          ? [
              { num: 14, suit: "d" },
              { num: 14, suit: "c" },
            ]
          : [null, null],
      handsType: demoState === "showdown" ? "三条 A" : "",
      maxCards:
        demoState === "showdown"
          ? [
              { num: 14, suit: "s" },
              { num: 14, suit: "d" },
              { num: 14, suit: "c" },
              { num: 10, suit: "h" },
              { num: 7, suit: "d" },
            ]
          : [],
      profits: demoState === "showdown" ? 1280 : 0,
    }),
    makeUser("jax", "Jax", 36780, {
      actionName: "等待",
      hands: isShowdown
        ? [
            { num: 3, suit: "s" },
            { num: 7, suit: "h" },
          ]
        : [null, null],
      handsType: isShowdown ? "高牌 K" : "",
    }),
    makeUser("leo", "Leo", 1940, {
      position: "SB",
      isActing: demoState === "waiting",
      actionName:
        demoState === "showdown"
          ? "已加注"
          : demoState === "waiting"
          ? "思考中"
          : "等待",
      bet: 160,
      hands:
        demoState === "showdown"
          ? [
              { num: 10, suit: "s" },
              { num: 10, suit: "d" },
            ]
          : [null, null],
      handsType: demoState === "showdown" ? "三条 10" : "",
    }),
    makeUser("river", "River", 3120, {
      position: "BB",
      isFoled: true,
      actionName: "已弃牌",
      hands: isShowdown
        ? [
            { num: 13, suit: "c" },
            { num: 3, suit: "h" },
          ]
        : [null, null],
    }),
    makeUser("kai", "Kai", 840, {
      isAllIn: true,
      actionName: "All-in",
      bet: 840,
      hands: isShowdown
        ? [
            { num: 6, suit: "s" },
            { num: 7, suit: "c" },
          ]
        : [null, null],
      handsType: isShowdown ? "一对 7" : "",
    }),
    makeUser("nana", "Nana", 72210, {
      actionName: "等待",
      hands: isShowdown
        ? [
            { num: 11, suit: "h" },
            { num: 8, suit: "d" },
          ]
        : [null, null],
      handsType: isShowdown ? "高牌 A" : "",
    }),
    makeUser("owen", "Owen", 50820, {
      actionName: "已跟注",
      bet: 80,
      hands: isShowdown
        ? [
            { num: 9, suit: "s" },
            { num: 6, suit: "d" },
          ]
        : [null, null],
      handsType: isShowdown ? "高牌 A" : "",
    }),
    makeUser("sora", "Sora", 186400, {
      actionName: "等待",
      hands: isShowdown
        ? [
            { num: 4, suit: "h" },
            { num: 11, suit: "c" },
          ]
        : [null, null],
      handsType: isShowdown ? "一对 10" : "",
    }),
    makeUser("ivy", "Ivy", 9340, {
      isFoled: true,
      actionName: "已弃牌",
      hands: isShowdown
        ? [
            { num: 12, suit: "d" },
            { num: 5, suit: "s" },
          ]
        : [null, null],
    }),
    makeUser("maxwin", "Maxwin", 124860, {
      isRoomOwner: true,
      isReady: true,
      isInCurrentGame: true,
      isActing: demoState === "acting",
      actionName:
        demoState === "acting"
          ? "行动中"
          : isShowdown
          ? "已投入"
          : "等待",
      bet: 80,
      hands:
        demoState === "showdown"
          ? [
              { num: 14, suit: "h" },
              { num: 10, suit: "c" },
            ]
          : [null, null],
      handsType: isShowdown ? "两对 · A 和 10" : "",
    }),
  ];

  if (demoState === "dealer") {
    users.forEach((user) => {
      user.position = "D";
    });
  }

  const room: SimpleRoom = {
    roomid: "8K21",
    isGaming: true,
    minBuyIn: 4000,
    maxBuyIn: 186400,
    botAutoReveal: false,
    users,
  };
  const game: SimpleGame = {
    boardCards: isShowdown ? boardCards : boardCards.slice(0, 4),
    pots: 960,
    acting: isShowdown
      ? ""
      : demoState === "waiting"
      ? "leo"
      : "maxwin",
    raiseUser: "leo",
    raiseBet: 240,
    raiseBetDiff: 160,
    preBet: 240,
    bb: 40,
    handSeq: 0,
    isSettling: isShowdown,
    nextGameTime: Date.now() + 10000,
    userCount: 10,
  };
  const self: SimpleSelf = {
    id: "maxwin",
    hands: [
      { num: 14, suit: "h" },
      { num: 10, suit: "c" },
    ],
    handsType: isShowdown ? "两对 · A 和 10" : "",
    nextBuyIn: null,
    runItOutBoardCards: [],
  };

  return {
    room,
    game,
    self,
    selectSettleTimes: demoState === "settling",
  };
}

const demoStates: { id: DemoState; label: string; hint: string }[] = [
  { id: "acting", label: "操作态", hint: "轮到你行动，显示加注面板" },
  { id: "waiting", label: "等待态", hint: "等待对手，显示提前选择" },
  { id: "showdown", label: "摊牌", hint: "亮牌与赢家提示" },
  { id: "settling", label: "结算选择", hint: "All-in 发牌次数选择" },
  { id: "dealer", label: "全员徽章", hint: "检查 D / SB / BB 位置" },
];

export function ResponsiveTableDemo() {
  const dispatch = useAppDispatch();
  const [demoState, setDemoState] = useState<DemoState>("acting");
  const [controlsOpen, setControlsOpen] = useState(
    () => window.innerWidth > 760
  );

  useEffect(() => {
    const { room, game, self, selectSettleTimes } = buildPreview(demoState);
    dispatch(setRoom(room));
    dispatch(setGame(game));
    dispatch(setSelf(self));
    dispatch(setSelectSettleTimes(selectSettleTimes));
  }, [dispatch, demoState]);

  return (
    <>
      <Room
        previewDetails={{
          logs: previewLogs,
          chipsRecords: previewChipsRecords,
        }}
      />
      <aside className="demo-controls" aria-label="Demo 状态切换">
        <button
          type="button"
          className="demo-controls__toggle"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen((open) => !open)}
        >
          <span>Demo 控制</span>
          <small>{controlsOpen ? "收起" : "展开"}</small>
        </button>
        {controlsOpen ? (
          <div className="demo-controls__panel">
            <p>以下按钮只切换预览状态，不会提交真实操作。</p>
            <div className="demo-controls__grid">
              {demoStates.map((state) => (
                <button
                  type="button"
                  key={state.id}
                  className={demoState === state.id ? "is-active" : ""}
                  onClick={() => setDemoState(state.id)}
                >
                  <span>{state.label}</span>
                  <small>{state.hint}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
