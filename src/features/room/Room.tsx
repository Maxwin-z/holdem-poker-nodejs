import {
  Button,
  Col,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Tooltip,
} from "antd";
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
import { useAppSelector } from "../../app/hooks";
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
import { GameHistory } from "../gamehistory/GameHistory";
import { Spectators } from "./Spectators";

export function Room() {
  const centerRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const roomid = useAppSelector(selectRoomID);
  const users = useAppSelector(selectUsers) || [];
  const room = useAppSelector(selectRoom);
  const self = useAppSelector(selectSelf);
  const game = useAppSelector(selectGame);
  const selectSettleTime = useAppSelector(getSelectSettleStatus);
  const isSettling = game?.isSettling || false;
  const nextGameTime = Math.floor(
    ((game?.nextGameTime || Date.now()) - Date.now()) / 1000
  );
  const cards: PokerCard[] = [...(game?.boardCards || [])];

  function setSettleTimes(times: number) {
    ws_settleTimes(times);
    setSelectSettleTimes(false);
  }

  useEffect(() => {
    function handleResize() {
      const centerDiv: HTMLDivElement = centerRef.current!;
      centerDiv.style.height = `${window.innerHeight - 30}px`;
    }
    window.addEventListener("resize", handleResize);
    handleResize();
  }, []);

  return (
    <div
      ref={centerRef}
      style={{
        margin: 30,
        display: "flex",
        flexDirection: "row",
      }}
    >
      <div
        className="card"
        style={{
          marginRight: 20,
          overflow: "auto",
          minWidth: 200,
        }}
      >
        <GameHistory />
      </div>
      <div
        className="card"
        style={{
          marginRight: 20,
          flex: 4,
          position: "relative",
        }}
      >
        <Spectators />
        <div
          style={{
            display: "flex",
            height: "100%",
            flexDirection: "column",
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
          <div className="flex1">
            <Owner />
          </div>
        </div>
      </div>
      <div className="card">
        <ChipsRecord />
      </div>
      <Modal
        title="选择发牌次数"
        visible={selectSettleTime}
        footer={null}
        closable={false}
      >
        <Button
          type="primary"
          size="large"
          style={{ marginRight: 10 }}
          onClick={() => setSettleTimes(1)}
        >
          发一次
        </Button>
        <Button
          type="primary"
          size="large"
          style={{ marginRight: 10 }}
          onClick={() => setSettleTimes(2)}
        >
          发两次
        </Button>
        <Button
          type="primary"
          size="large"
          style={{ marginRight: 10 }}
          onClick={() => setSettleTimes(3)}
        >
          发三次
        </Button>
        <Button
          type="primary"
          size="large"
          style={{ marginRight: 10 }}
          onClick={() => setSettleTimes(4)}
        >
          发四次
        </Button>
      </Modal>
    </div>
  );
}
