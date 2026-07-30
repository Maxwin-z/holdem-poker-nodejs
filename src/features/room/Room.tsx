import { Button, message, Popconfirm, Tooltip } from "antd";
import {
  Card as PokerCard,
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
  MessageOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { useState } from "react";
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

const seatNames = [
  // Keep the rotated player list moving continuously around the table.
  "lower-left",
  "middle-left",
  "upper-left",
  "top-left",
  "top-right",
  "upper-right",
  "middle-right",
  "lower-right",
];

type RoomPreviewDetails = {
  logs?: string[];
  chipsRecords?: SimpleChipsRecord[];
};

export function Room({
  previewDetails,
}: {
  previewDetails?: RoomPreviewDetails;
} = {}) {
  const dispatch = useAppDispatch();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"chat" | "chips">("chat");
  const roomid = useAppSelector(selectRoomID);
  const users = useAppSelector(selectUsers) || [];
  const room = useAppSelector(selectRoom);
  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const selectSettleStatus = useAppSelector(getSelectSettleStatus);
  const cards: PokerCard[] = [...(game?.boardCards || [])];
  const boardCards = [...cards, null, null, null, null, null].splice(0, 5);
  const onlineCount =
    room?.users.filter((user) => !user.isOffline).length || 0;

  function setSettleTimes(times: number) {
    ws_settleTimes(times);
    dispatch(setSelectSettleTimes(false));
  }

  function copyRoomID() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomid || "");
      message.success("复制成功");
    } else {
      message.error("无法获取剪切板权限，请手动复制");
    }
  }

  return (
    <div className="live-room-shell">
      <header className="live-room-topbar">
        <div className="live-room-brand">
          <span className="live-room-brand__mark">♠</span>
          <div>
            <strong>River Club</strong>
            <span>九人桌 · 房间 {roomid || "—"}</span>
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

        <div className="live-room-controls">
          <span className="live-room-online">
            <i />
            {onlineCount} 人在线
          </span>
          <Spectators />
          <Tooltip title="复制房间 ID">
            <Button
              className="live-room-icon-button"
              icon={<CopyOutlined />}
              onClick={copyRoomID}
            />
          </Tooltip>
          {self?.isRoomOwner ? (
            room?.isGaming ? (
              <Tooltip title="下一场暂停游戏">
                <Button
                  className="live-room-icon-button"
                  icon={<PauseOutlined />}
                  onClick={ws_pauseGame}
                />
              </Tooltip>
            ) : (
              <Tooltip title="开始游戏">
                <Button
                  className="live-room-icon-button is-primary"
                  icon={<CaretRightOutlined />}
                  onClick={ws_startGame}
                />
              </Tooltip>
            )
          ) : null}
          {!self?.isSpectator ? (
            self?.isReady ? (
              <Tooltip title="暂时不参与游戏">
                <Button
                  className="live-room-icon-button"
                  icon={<CoffeeOutlined />}
                  onClick={ws_userHangup}
                />
              </Tooltip>
            ) : (
              <Tooltip title="准备">
                <Button
                  className="live-room-icon-button is-primary"
                  icon={<CheckOutlined />}
                  onClick={ws_userReady}
                />
              </Tooltip>
            )
          ) : null}
          {!self?.isReady ? (
            !self?.isSpectator ? (
              <Tooltip title="进入观战模式">
                <Button
                  className="live-room-icon-button"
                  icon={<EyeOutlined />}
                  onClick={() => ws_userWatch(true)}
                />
              </Tooltip>
            ) : (
              <Tooltip title="参与游戏">
                <Button
                  className="live-room-icon-button is-primary"
                  icon={<EyeInvisibleOutlined />}
                  onClick={() => ws_userWatch(false)}
                />
              </Tooltip>
            )
          ) : null}
          <Tooltip title="聊天与牌局记录">
            <Button
              className="live-room-icon-button live-chat-details-trigger"
              icon={<MessageOutlined />}
              onClick={() => {
                setDetailsTab("chat");
                setShowDetails(true);
              }}
            />
          </Tooltip>
          <Tooltip title="积分信息">
            <Button
              className="live-room-icon-button live-chips-details-trigger"
              icon={<TrophyOutlined />}
              onClick={() => {
                setDetailsTab("chips");
                setShowDetails(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="如果在游戏中，将会自动弃牌。确认离开？"
            okText="确定离开"
            cancelText="留下"
            onConfirm={() => ws_userLeave()}
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
          <div className="live-table-stage">
            <div className="live-table-felt" aria-hidden="true">
              <div />
              <span className="live-table-room-code">
                ROOM&nbsp;&nbsp;{roomid || "—"}
              </span>
            </div>

            {users.slice(0, 8).map((id, index) => (
              <User
                id={`${id}`}
                seat={seatNames[index]}
                key={id}
              />
            ))}

            <div className="live-board">
              <div className="live-pot">
                <span>总底池</span>
                <i>●</i>
                <strong>{(game?.pots || 0).toLocaleString("en-US")}</strong>
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
            </nav>

            <div className="live-room-drawer__content">
              {detailsTab === "chat" ? (
                <GameHistory previewLogs={previewDetails?.logs} />
              ) : (
                <ChipsRecord
                  previewRecords={previewDetails?.chipsRecords}
                />
              )}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
