import { Button, Input, message, Popconfirm, Tooltip } from "antd";
import { Card as PokerCard } from "../../ApiType";
import {
  LoginOutlined,
  CopyOutlined,
  CoffeeOutlined,
  CaretRightOutlined,
  CheckOutlined,
  PauseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
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

export function Room() {
  const dispatch = useAppDispatch();
  const centerRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fixedSidebar, setFixedSidebar] = useState(false);
  const roomid = useAppSelector(selectRoomID);
  const users = useAppSelector(selectUsers) || [];
  const room = useAppSelector(selectRoom);
  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const selectSettleStatus = useAppSelector(getSelectSettleStatus);
  const isSettling = game?.isSettling || false;
  const nextGameTime = Math.floor(
    ((game?.nextGameTime || Date.now()) - Date.now()) / 1000
  );
  const cards: PokerCard[] = [...(game?.boardCards || [])];

  function setSettleTimes(times: number) {
    ws_settleTimes(times);
    dispatch(setSelectSettleTimes(false));
  }

  useEffect(() => {
    function handleResize() {
      // const centerDiv: HTMLDivElement = centerRef.current!;
      // centerDiv.style.height = `${window.innerHeight - 40}px`;
      const minWidth = 1200;
      const minHeight = 600;
      const ratio = Math.min(window.innerWidth / minWidth, window.innerHeight / minHeight);
      setZoom(Math.min(1, ratio));
      setShowSidebar(ratio > 0.8);
    }
    window.addEventListener("resize", handleResize);
    handleResize();
  }, []);

  return (
    <div
      ref={centerRef}
      style={{
        margin: 20,
        display: "flex",
        flexDirection: "row",
        flex: 1,
        overflow: "hidden",
      }}
    >
      <div
        className="card"
        style={{
          marginRight: 10,
          overflow: "auto",
          minWidth: 200,
          display: showSidebar || fixedSidebar ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <GameHistory />
      </div>
      <div
        className="card"
        style={{
          marginRight: 10,
          flex: 4,
          position: "relative",
          zoom: zoom,
        }}
      >
        <div style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          display: zoom > 0.8 ? "none" : "flex",
        }}>
          <Button onClick={() => setFixedSidebar(!fixedSidebar)}>
            侧边栏
          </Button>
        </div>
        <Spectators />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: `${100/zoom}%`,
            height: `${100/zoom}%`,
          }}
        >
          <div className="roominfo flex-row flex-center">
            <Input style={{ width: 90 }} value={roomid} readOnly />
            <Tooltip title="复制房间ID">
              <Button
                icon={<CopyOutlined />}
                style={{ marginRight: 10 }}
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(roomid || "");
                    message.success("复制成功");
                  } else {
                    message.error("无法获取剪切板权限，请手动复制");
                  }
                }}
              />
            </Tooltip>
            {self?.isRoomOwner ? (
              room?.isGaming ? (
                <Tooltip title="下一场暂停游戏">
                  <Button
                    icon={<PauseOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_pauseGame}
                  >
                    暂停
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="开始游戏">
                  <Button
                    type="primary"
                    icon={<CaretRightOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_startGame}
                  >
                    开始
                  </Button>
                </Tooltip>
              )
            ) : null}
            {!self?.isSpectator ? (
              self?.isReady ? (
                <Tooltip title="暂时不参与游戏">
                  <Button
                    icon={<CoffeeOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_userHangup}
                  >
                    休息
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="准备">
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_userReady}
                  >
                    准备
                  </Button>
                </Tooltip>
              )
            ) : null}
            {!self?.isReady ? (
              !self?.isSpectator ? (
                <Tooltip title="进入观战模式">
                  <Button
                    icon={<EyeOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={() => ws_userWatch(true)}
                  >
                    观战
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="参与游戏">
                  <Button
                    type="primary"
                    icon={<EyeInvisibleOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={() => ws_userWatch(false)}
                  >
                    参战
                  </Button>
                </Tooltip>
              )
            ) : null}

            <Popconfirm
              title="如果在游戏中，将会自动弃牌。确认离开？"
              okText="确定离开"
              cancelText="留下"
              onConfirm={() => ws_userLeave()}
              onCancel={() => setShowConfirm(false)}
              visible={showConfirm}
            >
              <Tooltip title="退出房间">
                <Button
                  icon={<LoginOutlined />}
                  onClick={() => {
                    setShowConfirm(true);
                  }}
                >
                  退出
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
          <div className="flex1 flex-row flex-center">
            {users.map((id) => (
              <User id={`${id}`} key={id} />
            ))}
          </div>
          <div className="flex1 flex-column flex-center">
            <div style={{ width: 100 }}>
              {isSettling ? (
                <CountDown time={nextGameTime} total={10} />
              ) : (
                <div>&nbsp;</div>
              )}
            </div>
            <div className="boards flex-row flex-center">
              {[...cards, null, null, null, null, null]
                .splice(0, 5)
                .map((card, i) => (
                  <Poker
                    card={card}
                    key={`${card ? `${card.num}${card.suit}` : i}`}
                  />
                ))}
            </div>
            <div className="pots">底池: {game?.pots || 0}</div>
          </div>
          {selectSettleStatus ? (
            <div style={{ margin: "auto", padding: "20px 0" }}>
              <div>
                请选择发牌次数
                <span style={{ width: 100 }}>
                  <CountDown time={30} total={30} />
                </span>
              </div>
              <div>
                <Button
                  type="primary"
                  style={{ marginRight: 10 }}
                  onClick={() => setSettleTimes(1)}
                >
                  发一次
                </Button>
                <Button
                  type="primary"
                  style={{ marginRight: 10 }}
                  onClick={() => setSettleTimes(2)}
                >
                  发两次
                </Button>
                <Button
                  type="primary"
                  style={{ marginRight: 10 }}
                  onClick={() => setSettleTimes(3)}
                >
                  发三次
                </Button>
                <Button
                  type="primary"
                  style={{ marginRight: 10 }}
                  onClick={() => setSettleTimes(4)}
                >
                  发四次
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex1">
            <Owner zoom={zoom} />
          </div>
        </div>
      </div>
      <div className="card" style={{ 
        minWidth: 230, 
        overflow: "auto", 
        display: showSidebar || fixedSidebar ? "flex" : "none" 
      }}>
        <ChipsRecord />
      </div>
    </div>
  );
}
