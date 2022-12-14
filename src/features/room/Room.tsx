import { Button, Input, message, Popconfirm, Row, Tooltip } from "antd";
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
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import {
  selectSelf,
  selectRoomID,
  selectUsers,
  selectGame,
  selectRoom,
} from "./roomSlice";
import {
  ws_pauseGame,
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
  const isSettling = game?.isSettling || false;
  const nextGameTime = Math.floor(
    ((game?.nextGameTime || Date.now()) - Date.now()) / 1000
  );
  const cards: PokerCard[] = [...(game?.boardCards || [])];

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
            <Tooltip title="????????????ID">
              <Button
                icon={<CopyOutlined />}
                style={{ marginRight: 10 }}
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(roomid || "");
                    message.success("????????????");
                  } else {
                    message.error("?????????????????????????????????????????????");
                  }
                }}
              />
            </Tooltip>
            {self?.isRoomOwner ? (
              room?.isGaming ? (
                <Tooltip title="?????????????????????">
                  <Button
                    icon={<PauseOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_pauseGame}
                  >
                    ??????
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="????????????">
                  <Button
                    type="primary"
                    icon={<CaretRightOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_startGame}
                  >
                    ??????
                  </Button>
                </Tooltip>
              )
            ) : null}
            {!self?.isSpectator ? (
              self?.isReady ? (
                <Tooltip title="?????????????????????">
                  <Button
                    icon={<CoffeeOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_userHangup}
                  >
                    ??????
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="??????">
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={ws_userReady}
                  >
                    ??????
                  </Button>
                </Tooltip>
              )
            ) : null}
            {!self?.isReady ? (
              !self?.isSpectator ? (
                <Tooltip title="??????????????????">
                  <Button
                    icon={<EyeOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={() => ws_userWatch(true)}
                  >
                    ??????
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="????????????">
                  <Button
                    type="primary"
                    icon={<EyeInvisibleOutlined />}
                    style={{ marginRight: 10 }}
                    onClick={() => ws_userWatch(false)}
                  >
                    ??????
                  </Button>
                </Tooltip>
              )
            ) : null}

            <Popconfirm
              title="?????????????????????????????????????????????????????????"
              okText="????????????"
              cancelText="??????"
              onConfirm={() => ws_userLeave()}
              onCancel={() => setShowConfirm(false)}
              visible={showConfirm}
            >
              <Tooltip title="????????????">
                <Button
                  icon={<LoginOutlined />}
                  onClick={() => {
                    setShowConfirm(true);
                  }}
                >
                  ??????
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
            <div className="pots">??????: {game?.pots || 0}</div>
          </div>
          <div className="flex1">
            <Owner />
          </div>
        </div>
      </div>
      <div className="card">
        <ChipsRecord />
      </div>
    </div>
  );
}
