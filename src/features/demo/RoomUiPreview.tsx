import { useEffect } from "react";
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
      reBuyLimit: 100,
      isSettling: isSelectingRunTimes || isShowdown,
      nextGameTime: Date.now() + 10000,
      userCount: 9,
    };
    const self: SimpleSelf = {
      id: "maxwin",
      hands: [
        { num: 14, suit: "h" },
        { num: 10, suit: "c" },
      ],
      handsType: "两对 · A 和 10",
      nextBuyIn: null,
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
