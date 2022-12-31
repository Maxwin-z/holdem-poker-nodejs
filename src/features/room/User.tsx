import { Avatar, Popover, Tooltip } from "antd";
import { ApiOutlined, CoffeeOutlined } from "@ant-design/icons";
import { shallowEqual, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { CountDown } from "./CountDown";
import { Poker } from "./Poker";
import { AllIn, BigBlind, Dealer, SmallBlind } from "./Symbol";
import { card2html } from "../gamehistory/GameHistory";
export function User({ id }: { id: string }) {
  const user = useSelector((state: RootState) => {
    const users = state.room.room?.users;
    if (!users) return null;
    const index = users.findIndex((u) => u.id == id);
    return users[index];
  }, shallowEqual);
  const name = user?.name || "";
  const stack = user?.stack || 0;
  const bet = user?.bet || 0;
  const isActing = user?.isActing || false;
  const actionEndTime = user?.actionEndTime || Date.now();
  const showHands = user?.hands && (user?.hands[0] || user?.hands[1]);
  const position = user?.position;
  const posComp =
    position == "SB" ? (
      <SmallBlind />
    ) : position == "BB" ? (
      <BigBlind />
    ) : position == "D" ? (
      <Dealer />
    ) : null;
  const inGame = user?.isInCurrentGame && !user?.isFoled;
  return (
    <div className="user flex-column flex-center">
      <div
        className={`userinfo flex-column flex-center ${!inGame ? "fold" : ""}`}
      >
        <Popover
          content={
            <div
              dangerouslySetInnerHTML={{
                __html: `${card2html(
                  user?.maxCards || []
                )} <strong style="color: #FF6F00">+$${user?.profits}</strong> `,
              }}
            ></div>
          }
          trigger="click"
          visible={user?.isWinner && user.profits >= 0}
        >
          <Avatar>{name.length > 0 ? name[0] : ""}</Avatar>
        </Popover>
        <div>{name}</div>
        <div className="stack">
          <span className="coins">$</span>
          {stack}
        </div>
      </div>
      {isActing ? (
        <CountDown
          time={Math.floor((actionEndTime - Date.now()) / 1000)}
          now={Date.now()}
        />
      ) : (
        <div>&nbsp;</div>
      )}

      <div className="bet">
        {user?.actionName}
        {bet > 0 ? (
          <span>
            <span className="coins">$</span>
            {bet}
          </span>
        ) : (
          <div>&nbsp;</div>
        )}
      </div>
      {showHands ? (
        <div className="card-box ">
          <div className="handstype">{user?.handsType}</div>
          {user?.hands.map((card, i) => (
            <Poker
              card={card}
              key={`${card ? `${card.num}${card.suit}` : i}`}
            />
          ))}
        </div>
      ) : null}

      <div className="status">
        {user?.isOffline ? (
          <Tooltip title="掉线">
            <ApiOutlined />
          </Tooltip>
        ) : !user?.isReady ? (
          <Tooltip title="挂起">
            <CoffeeOutlined />
          </Tooltip>
        ) : null}
      </div>
      {position != "" ? <div className="position">{posComp}</div> : null}
      <div className="allin">{user?.isAllIn ? <AllIn /> : null}</div>
    </div>
  );
}
