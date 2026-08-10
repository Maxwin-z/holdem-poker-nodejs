import { Avatar, Tooltip } from "antd";
import { ApiOutlined, CoffeeOutlined, RobotOutlined } from "@ant-design/icons";
import { shallowEqual, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { CountDown } from "./CountDown";
import { Poker } from "./Poker";
import { AllIn, BigBlind, Dealer, SmallBlind } from "./Symbol";
import { SeatBox } from "./tableLayout";

export function User({
  id,
  seat,
  box,
}: {
  id: string;
  seat: string;
  box?: SeatBox;
}) {
  const user = useSelector((state: RootState) => {
    const users = state.room.room?.users;
    if (!users) return null;
    const index = users.findIndex((item) => item.id === id);
    return users[index] || null;
  }, shallowEqual);

  if (!user) return null;

  const name = user.name || "";
  const stack = user.stack || 0;
  const bet = user.bet || 0;
  const isActing = user.isActing || false;
  const actionEndTime = user.actionEndTime || Date.now();
  const showHands = Boolean(
    user.hands && (user.hands[0] || user.hands[1])
  );
  const position = user.position;
  const posComp =
    position === "SB" ? (
      <SmallBlind />
    ) : position === "BB" ? (
      <BigBlind />
    ) : position === "D" ? (
      <Dealer />
    ) : null;
  const inGame = user.isInCurrentGame && !user.isFoled;
  const isWinner = user.isWinner && user.profits >= 0;
  const actionText = user.pendingBotRemoval && !inGame
    ? "下一手离桌"
    : !user.isReady && !inGame
    ? "休息"
    : user.isFoled
    ? "已弃牌"
    : showHands && user.handsType
    ? user.handsType
    : user.isAllIn
    ? "All-in"
    : user.actionName || (isActing ? "思考中" : "等待");

  return (
    <div
      className={[
        "live-seat",
        `live-seat--${seat}`,
        !inGame ? "is-folded" : "",
        isActing ? "is-active" : "",
        isWinner ? "is-winner" : "",
        user.isBot ? "is-bot" : "",
        user.pendingBotRemoval ? "is-pending-removal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        box
          ? {
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            }
          : undefined
      }
    >
      <div
        className="live-seat__unit"
        style={box ? { transform: `scale(${box.scale})` } : undefined}
      >
        {user.hasCards ? (
          <div
            className={`live-seat__cards ${
              showHands ? "has-visible-cards" : ""
            }`}
          >
            {showHands
              ? [...(user.hands || []), null, null]
                  .splice(0, 2)
                  .map((card, index) => (
                    <Poker
                      card={card}
                      key={`${card ? `${card.num}${card.suit}` : index}`}
                    />
                  ))
              : [0, 1].map((index) => (
                  <span className="live-card-back" key={index}>
                    <i>♠</i>
                  </span>
                ))}
          </div>
        ) : null}

        <div className="live-seat__profile">
          <div className="live-seat__avatar-wrap">
            <Avatar className={`live-seat__avatar ${user.isBot ? "is-bot" : ""}`}>
              {name.slice(0, 2).toUpperCase()}
            </Avatar>
            {user.isBot ? (
              <span className="live-seat__bot-badge" title="AI机器人">
                <RobotOutlined />
              </span>
            ) : null}
            {isActing ? (
              <div className="live-seat__countdown">
                <CountDown
                  time={Math.max(
                    0,
                    Math.ceil((actionEndTime - Date.now()) / 1000)
                  )}
                  total={user.actionTimeLimit}
                  now={Date.now()}
                  variant="ring"
                />
              </div>
            ) : null}
          </div>
          <div className="live-seat__copy">
            <div className="live-seat__name">
              <span>{name}</span>
            </div>
            <strong>{stack.toLocaleString("en-US")}</strong>
          </div>
          <div className="live-seat__status">
            {user.isOffline ? (
              <Tooltip title="掉线">
                <ApiOutlined />
              </Tooltip>
            ) : !user.isReady ? (
              <Tooltip title="挂起">
                <CoffeeOutlined />
              </Tooltip>
            ) : user.isAllIn ? (
              <AllIn />
            ) : null}
          </div>
        </div>

        {position ? (
          <span className="live-seat__position" title={position}>
            {posComp}
          </span>
        ) : null}

        {isWinner ? (
          <div className="live-seat__meta is-win" role="status">
            <small>WIN</small>
            <span>{user.handsType || "本手胜出"}</span>
            <b>+{user.profits.toLocaleString("en-US")}</b>
          </div>
        ) : (
          <div className="live-seat__meta">
            <span className={isActing ? "is-thinking" : ""} title={actionText}>
              {actionText}
            </span>
            {bet > 0 ? <b>+{bet.toLocaleString("en-US")}</b> : null}
          </div>
        )}
      </div>
    </div>
  );
}
