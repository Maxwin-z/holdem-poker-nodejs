import { Avatar, Popover, Tooltip } from "antd";
import { ApiOutlined, CoffeeOutlined } from "@ant-design/icons";
import { shallowEqual, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { CountDown } from "./CountDown";
import { Poker } from "./Poker";
import { AllIn, BigBlind, Dealer, SmallBlind } from "./Symbol";
import { card2html } from "../gamehistory/GameHistory";

export function User({ id, seat }: { id: string; seat: string }) {
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
  const actionText = user.isFoled
    ? "已弃牌"
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
        stack >= 100000 ? "has-large-stack" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
        <Popover
          content={
            <div
              dangerouslySetInnerHTML={{
                __html: `${card2html(
                  user.maxCards || []
                )} <strong style="color: #FF6F00">+$${
                  user.profits
                }</strong> `,
              }}
            />
          }
          trigger="click"
          visible={user.isWinner && user.profits >= 0}
        >
          <Avatar className="live-seat__avatar">
            {name.slice(0, 2).toUpperCase()}
          </Avatar>
        </Popover>
        <div className="live-seat__copy">
          <div className="live-seat__name">
            <span>{name}</span>
            {position ? (
              <span className="live-seat__position" title={position}>
                {posComp}
              </span>
            ) : null}
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

      <div className="live-seat__meta">
        <span className={isActing ? "is-thinking" : ""}>{actionText}</span>
        {bet > 0 ? <b>+{bet.toLocaleString("en-US")}</b> : null}
        {showHands && user.handsType ? (
          <em>{user.handsType}</em>
        ) : null}
      </div>

      {isActing ? (
        <div className="live-seat__countdown">
          <CountDown
            time={Math.floor((actionEndTime - Date.now()) / 1000)}
            now={Date.now()}
          />
        </div>
      ) : null}
    </div>
  );
}
