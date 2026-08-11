import { Button, message, Popconfirm, Tooltip } from "antd";
import {
  Card as PokerCard,
  GameLogEntry,
  SimpleChipsRecord,
} from "../../ApiType";
import {
  LoginOutlined,
  CopyOutlined,
  CoffeeOutlined,
  CaretRightOutlined,
  CheckOutlined,
  PauseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CloseOutlined,
  MenuOutlined,
  MessageOutlined,
  TrophyOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { User } from "./User";
import { Owner } from "./Owner";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  selectSelf,
  selectRoomID,
  selectUsers,
  selectGame,
  selectRoom,
  getSelectSettleStatus,
  setSelectSettleTimes,
} from "./roomSlice";
import {
  ws_pauseGame,
  ws_settleTimes,
  ws_startGame,
  ws_userHangup,
  ws_userLeave,
  ws_userReady,
  ws_userWatch,
} from "../../app/websocket";
import { Poker } from "./Poker";
import { CountDown } from "./CountDown";
import { ChipsRecord } from "../chipsrecord/ChipsRecord";
import GameHistory from "../gamehistory/GameHistory";
import { Spectators } from "./Spectators";
import "./RoomResponsive.css";
import { createRoomInviteText } from "./roomInvite";
import { BuyInSettingButton } from "./BuyInSetting";
import { getVisibleBoardCards } from "./runItOut";
import { BotManager } from "./BotManager";
import { PlayerAnalytics } from "./PlayerAnalytics";
import { useTableLayout } from "./tableLayout";

const seatNames = [
  // Keep the rotated player list moving continuously around the table.
  "lower-left",
  "middle-left",
  "upper-left",
  "top-left",
  "top-center",
  "top-right",
  "upper-right",
  "middle-right",
  "lower-right",
];

type RoomPreviewDetails = {
  logs?: GameLogEntry[];
  chipsRecords?: SimpleChipsRecord[];
};

type ChipFlight = {
  key: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
};

const FLIGHT_CHIPS_PER_WINNER = 5;
const FLIGHT_TOTAL_MS = 1400;

function isStandaloneOrFullscreen() {
  const iosNavigator = window.navigator as Navigator & {
    standalone?: boolean;
  };
  const displayModeMatches =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches);

  return Boolean(
    iosNavigator.standalone || document.fullscreenElement || displayModeMatches
  );
}

export function Room({
  previewDetails,
}: {
  previewDetails?: RoomPreviewDetails;
} = {}) {
  const dispatch = useAppDispatch();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"chat" | "chips" | "stats">("chat");
  const [hasBottomSafeGap, setHasBottomSafeGap] = useState(
    isStandaloneOrFullscreen
  );
  const roomid = useAppSelector(selectRoomID);
  const users = useAppSelector(selectUsers) || [];
  const { ref: stageRef, layout } = useTableLayout<HTMLDivElement>();
  const [chipFlights, setChipFlights] = useState<ChipFlight[]>([]);
  const prevWinnerIds = useRef<Set<string>>(new Set());
  const flightTimer = useRef<number>();
  const room = useAppSelector(selectRoom);
  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const selectSettleStatus = useAppSelector(getSelectSettleStatus);
  const cards: PokerCard[] = [
    ...getVisibleBoardCards(
      game?.boardCards || [],
      self?.runItOutBoardCards || []
    ),
  ];
  const boardCards = [...cards, null, null, null, null, null].splice(0, 5);
  const onlineCount =
    room?.users.filter((user) => !user.isBot && !user.isOffline).length || 0;
  const botCount = room?.users.filter((user) => user.isBot).length || 0;

  useEffect(() => {
    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const fullscreenQuery = window.matchMedia?.("(display-mode: fullscreen)");
    const queries = [standaloneQuery, fullscreenQuery].filter(
      Boolean
    ) as MediaQueryList[];
    const update = () => setHasBottomSafeGap(isStandaloneOrFullscreen());

    document.addEventListener("fullscreenchange", update);
    queries.forEach((query) => query.addEventListener?.("change", update));

    return () => {
      document.removeEventListener("fullscreenchange", update);
      queries.forEach((query) => query.removeEventListener?.("change", update));
    };
  }, []);

  useEffect(() => () => window.clearTimeout(flightTimer.current), []);

  // 结算时让筹码从底池飞向新出现的赢家座位
  useEffect(() => {
    const winners = new Set(
      (room?.users || [])
        .filter((user) => user.isWinner && user.profits >= 0)
        .map((user) => user.id)
    );
    const appeared = [...winners].filter(
      (id) => !prevWinnerIds.current.has(id)
    );
    prevWinnerIds.current = winners;
    if (!appeared.length || !layout) return;

    const seatIds = users.slice(0, 9).map((id) => `${id}`);
    const from = {
      x: layout.board.x + layout.board.w / 2,
      y: layout.board.y + 24,
    };
    const flights: ChipFlight[] = [];
    appeared.forEach((id, winnerIndex) => {
      const seatIndex = seatIds.indexOf(id);
      const seat = seatIndex >= 0 ? layout.seats[seatIndex] : null;
      // 自己不在 9 个座位里,朝舞台底部中央(自家区方向)飞
      const to = seat
        ? { x: seat.x + seat.w / 2, y: seat.y + seat.h / 2 }
        : {
            x: layout.felt.x + layout.felt.w / 2,
            y: layout.felt.y + layout.felt.h,
          };
      for (let i = 0; i < FLIGHT_CHIPS_PER_WINNER; i++) {
        flights.push({
          key: `${id}-${winnerIndex}-${i}`,
          fromX: from.x + (i - 2) * 5,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          delay: winnerIndex * 120 + i * 70,
        });
      }
    });

    window.clearTimeout(flightTimer.current);
    setChipFlights(flights);
    flightTimer.current = window.setTimeout(
      () => setChipFlights([]),
      FLIGHT_TOTAL_MS
    );
  }, [room?.users, users, layout]);

  function setSettleTimes(times: number) {
    ws_settleTimes(times);
    dispatch(setSelectSettleTimes(false));
  }

  async function copyRoomInvite() {
    if (!roomid) {
      message.error("无法获取房间号");
      return;
    }

    try {
      await navigator.clipboard.writeText(createRoomInviteText(roomid));
      message.success("复制成功");
    } catch (error) {
      message.error("无法获取剪切板权限，请手动复制");
    }
  }

  return (
    <div
      className={`live-room-shell ${
        hasBottomSafeGap ? "has-bottom-safe-gap" : ""
      }`}
    >
      <header className="live-room-topbar">
        <div className="live-room-brand">
          <span className="live-room-brand__mark">♠</span>
          <Button
            className={`live-room-icon-button live-mobile-menu-toggle ${
              showMobileMenu ? "is-open" : ""
            }`}
            icon={showMobileMenu ? <CloseOutlined /> : <MenuOutlined />}
            aria-label={showMobileMenu ? "收起牌桌菜单" : "展开牌桌菜单"}
            aria-controls="live-mobile-room-menu"
            aria-expanded={showMobileMenu}
            onClick={() => setShowMobileMenu((visible) => !visible)}
          />
          <div>
            <strong>River Club</strong>
            <span>十人桌 · 房间 {roomid || "—"}</span>
          </div>
        </div>

        <div className="live-room-meta" aria-label="牌局信息">
          <span>
            <small>房间</small>
            <strong>{roomid || "—"}</strong>
          </span>
          <span>
            <small>盲注</small>
            <strong>{game?.bb ? `${game.bb / 2} / ${game.bb}` : "—"}</strong>
          </span>
          <span>
            <small>底池</small>
            <strong>{(game?.pots || 0).toLocaleString("en-US")}</strong>
          </span>
        </div>

        {showMobileMenu ? (
          <button
            type="button"
            className="live-mobile-menu-backdrop"
            aria-label="收起牌桌菜单"
            onClick={() => setShowMobileMenu(false)}
          />
        ) : null}

        <div className="live-room-controls">
          <div
            id="live-mobile-room-menu"
            className={`live-room-menu-actions ${
              showMobileMenu ? "is-open" : ""
            }`}
          >
            <span className="live-room-online">
              <i />
              {onlineCount} 人在线{botCount > 0 ? ` · ${botCount} AI` : ""}
            </span>
            <div className="live-mobile-menu-item">
              <Spectators />
              <span>观战者</span>
            </div>
            <div className="live-mobile-menu-item">
              <Tooltip title="复制房间邀请">
                <Button
                  className="live-room-icon-button"
                  icon={<CopyOutlined />}
                  aria-label="复制房间邀请"
                  onClick={() => {
                    setShowMobileMenu(false);
                    copyRoomInvite();
                  }}
                />
              </Tooltip>
              <span>复制邀请</span>
            </div>
            {self?.isRoomOwner ? (
              room?.isGaming ? (
                <div className="live-mobile-menu-item">
                  <Tooltip title="下一场暂停游戏">
                    <Button
                      className="live-room-icon-button"
                      icon={<PauseOutlined />}
                      onClick={() => {
                        setShowMobileMenu(false);
                        ws_pauseGame();
                      }}
                    />
                  </Tooltip>
                  <span>暂停游戏</span>
                </div>
              ) : (
                <div className="live-mobile-menu-item">
                  <Tooltip title="开始游戏">
                    <Button
                      className="live-room-icon-button is-primary"
                      icon={<CaretRightOutlined />}
                      onClick={() => {
                        setShowMobileMenu(false);
                        ws_startGame();
                      }}
                    />
                  </Tooltip>
                  <span>开始游戏</span>
                </div>
              )
            ) : null}
            {self?.isRoomOwner ? (
              <div className="live-mobile-menu-item">
                <BotManager />
                <span>AI机器人</span>
              </div>
            ) : null}
            {!self?.isSpectator ? (
              self?.isReady ? (
                <div className="live-mobile-menu-item">
                  <Tooltip title="暂时不参与游戏">
                    <Button
                      className="live-room-icon-button"
                      icon={<CoffeeOutlined />}
                      onClick={() => {
                        setShowMobileMenu(false);
                        ws_userHangup();
                      }}
                    />
                  </Tooltip>
                  <span>暂时挂起</span>
                </div>
              ) : (
                <>
                  <div className="live-mobile-menu-item">
                    <Tooltip title="准备">
                      <Button
                        className="live-room-icon-button is-primary"
                        icon={<CheckOutlined />}
                        onClick={() => {
                          setShowMobileMenu(false);
                          ws_userReady();
                        }}
                      />
                    </Tooltip>
                    <span>准备游戏</span>
                  </div>
                  <div className="live-mobile-menu-item">
                    <BuyInSettingButton
                      className="live-room-icon-button"
                      compact
                      onOpen={() => setShowMobileMenu(false)}
                    />
                    <span>设置带入</span>
                  </div>
                </>
              )
            ) : null}
            {!self?.isReady ? (
              !self?.isSpectator ? (
                <div className="live-mobile-menu-item">
                  <Tooltip title="进入观战模式">
                    <Button
                      className="live-room-icon-button"
                      icon={<EyeOutlined />}
                      onClick={() => {
                        setShowMobileMenu(false);
                        ws_userWatch(true);
                      }}
                    />
                  </Tooltip>
                  <span>进入观战</span>
                </div>
              ) : (
                <div className="live-mobile-menu-item">
                  <Tooltip title="参与游戏">
                    <Button
                      className="live-room-icon-button is-primary"
                      icon={<EyeInvisibleOutlined />}
                      onClick={() => {
                        setShowMobileMenu(false);
                        ws_userWatch(false);
                      }}
                    />
                  </Tooltip>
                  <span>参与游戏</span>
                </div>
              )
            ) : null}
            <div className="live-mobile-menu-item">
              <Popconfirm
                title="如果在游戏中，将会自动弃牌。确认离开？"
                okText="确定离开"
                cancelText="留下"
                onConfirm={() => {
                  setShowMobileMenu(false);
                  ws_userLeave();
                }}
                onCancel={() => setShowConfirm(false)}
                visible={showConfirm}
                overlayClassName="live-room-popconfirm"
              >
                <Tooltip title="退出房间">
                  <Button
                    className="live-room-icon-button"
                    icon={<LoginOutlined />}
                    onClick={() => setShowConfirm(true)}
                  />
                </Tooltip>
              </Popconfirm>
              <span>退出房间</span>
            </div>
          </div>

          <div className="live-room-quick-actions">
            <Tooltip title="聊天与牌局记录">
              <Button
                className="live-room-icon-button live-chat-details-trigger"
                icon={<MessageOutlined />}
                aria-label="聊天与牌局记录"
                onClick={() => {
                  setShowMobileMenu(false);
                  setDetailsTab("chat");
                  setShowDetails(true);
                }}
              />
            </Tooltip>
            <Tooltip title="积分信息">
              <Button
                className="live-room-icon-button live-chips-details-trigger"
                icon={<TrophyOutlined />}
                aria-label="积分信息"
                onClick={() => {
                  setShowMobileMenu(false);
                  setDetailsTab("chips");
                  setShowDetails(true);
                }}
              />
            </Tooltip>
            <Tooltip title="我的数据">
              <Button
                className="live-room-icon-button live-stats-details-trigger"
                icon={<BarChartOutlined />}
                aria-label="我的数据"
                onClick={() => {
                  setShowMobileMenu(false);
                  setDetailsTab("stats");
                  setShowDetails(true);
                }}
              />
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="live-room-main">
        <aside
          className="live-room-side-panel live-room-side-panel--chat"
          aria-label="聊天与牌局记录"
        >
          <GameHistory previewLogs={previewDetails?.logs} />
        </aside>

        <section className="live-table-column">
          <div className="live-table-stage" ref={stageRef}>
            {layout ? (
              <div
                className="live-table-felt"
                aria-hidden="true"
                style={{
                  left: layout.felt.x,
                  top: layout.felt.y,
                  width: layout.felt.w,
                  height: layout.felt.h,
                }}
              >
                <div />
                <span className="live-table-room-code">
                  ROOM&nbsp;&nbsp;{roomid || "—"}
                </span>
              </div>
            ) : null}

            {layout
              ? users.slice(0, 9).map((id, index) => (
                  <User
                    id={`${id}`}
                    seat={seatNames[index]}
                    box={layout.seats[index]}
                    key={id}
                  />
                ))
              : null}

            {layout ? (
              <div
                className="live-board"
                data-wrap={layout.board.wrap ? "true" : undefined}
                style={
                  {
                    left: layout.board.x,
                    top: layout.board.y,
                    width: layout.board.w,
                    "--board-card-w": `${layout.board.cardW}px`,
                  } as React.CSSProperties
                }
              >
                <div className="live-pot">
                  <span>总底池</span>
                  <i>●</i>
                  {/* key 随底池变化重挂载,触发跳动动画 */}
                  <strong key={game?.pots || 0}>
                    {(game?.pots || 0).toLocaleString("en-US")}
                  </strong>
                </div>
                <div className="live-community-cards">
                  {boardCards.map((card, index) => (
                    <Poker
                      card={card}
                      key={`${card ? `${card.num}${card.suit}` : index}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {chipFlights.map((flight) => (
              <span
                key={flight.key}
                className="live-chip-flight"
                aria-hidden="true"
                style={
                  {
                    left: flight.fromX,
                    top: flight.fromY,
                    animationDelay: `${flight.delay}ms`,
                    "--fly-x": `${flight.toX - flight.fromX}px`,
                    "--fly-y": `${flight.toY - flight.fromY}px`,
                  } as React.CSSProperties
                }
              />
            ))}

            {selectSettleStatus ? (
              <div className="live-settle-picker">
                <div className="live-settle-picker__heading">
                  <div>
                    <small>ALL-IN 发牌</small>
                    <strong>请选择发牌次数</strong>
                  </div>
                  <span>
                    <CountDown time={30} total={30} />
                  </span>
                </div>
                <div className="live-settle-picker__actions">
                  {[1, 2, 3, 4].map((times) => (
                    <Button
                      type="primary"
                      key={times}
                      onClick={() => setSettleTimes(times)}
                    >
                      {times === 1 ? "发一次" : `发${times}次`}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <Owner />
        </section>

        <aside
          className="live-room-side-panel live-room-side-panel--chips"
          aria-label="积分信息"
        >
          <ChipsRecord previewRecords={previewDetails?.chipsRecords} />
        </aside>
      </main>

      {showDetails ? (
        <>
          <button
            className={`live-room-drawer-backdrop is-${detailsTab}`}
            aria-label="关闭牌局记录"
            onClick={() => setShowDetails(false)}
          />
          <aside className={`live-room-drawer is-${detailsTab}`}>
            <div className="live-room-drawer__heading">
              <div>
                <small>ROOM DETAILS</small>
                <strong>牌桌信息</strong>
              </div>
              <Button
                className="live-room-icon-button"
                icon={<CloseOutlined />}
                onClick={() => setShowDetails(false)}
              />
            </div>

            <nav className="live-room-drawer__tabs" aria-label="牌桌信息">
              <button
                type="button"
                className={detailsTab === "chat" ? "is-active" : ""}
                onClick={() => setDetailsTab("chat")}
              >
                <MessageOutlined />
                <span>聊天与牌局</span>
              </button>
              <button
                type="button"
                className={detailsTab === "chips" ? "is-active" : ""}
                onClick={() => setDetailsTab("chips")}
              >
                <TrophyOutlined />
                <span>积分信息</span>
              </button>
              <button
                type="button"
                className={detailsTab === "stats" ? "is-active" : ""}
                onClick={() => setDetailsTab("stats")}
              >
                <BarChartOutlined />
                <span>我的数据</span>
              </button>
            </nav>

            <div className="live-room-drawer__content">
              {detailsTab === "chat" ? (
                <GameHistory previewLogs={previewDetails?.logs} />
              ) : detailsTab === "chips" ? (
                <ChipsRecord
                  previewRecords={previewDetails?.chipsRecords}
                />
              ) : (
                <PlayerAnalytics />
              )}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
