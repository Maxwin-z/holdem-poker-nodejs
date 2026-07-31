import { Button } from "antd";
import QueueAnim from "rc-queue-anim";
import { useEffect } from "react";
import { Card as PokerCard } from "../../ApiType";
import { ws_userShowHands } from "../../app/websocket";

export function Poker({
  card,
  index = 0,
  showHand = false,
}: {
  card: PokerCard | null;
  index?: number;
  showHand?: boolean;
}) {
  const suitClass = card ? `poker-card--${card.suit}` : "";
  const empty = !card ? "empty" : "";
  function num2s(n: number) {
    switch (n) {
      case 14:
        return "A";
      case 13:
        return "K";
      case 12:
        return "Q";
      case 11:
        return "J";
      case 0:
        return "";
    }
    return n;
  }
  function suit2s(suit: string) {
    switch (suit) {
      case "c":
        return "♣︎";
      case "d":
        return "♦︎";
      case "h":
        return "♥︎";
      case "s":
        return "♠︎";
    }
    return "";
  }
  useEffect(() => {}, [card]);
  const rank = num2s(card?.num || 0);
  const suit = suit2s(card?.suit || "");

  return (
    <div
      className={`poker-card ${suitClass} ${empty}`}
      aria-label={card ? `${rank}${suit}` : "空牌位"}
    >
      <QueueAnim delay={0} type="bottom" className="full">
        {card ? (
          <div key="a" className="full content">
            <span className="poker-card__corner" aria-hidden="true">
              <strong>{rank}</strong>
              <i>{suit}</i>
            </span>
            <span className="poker-card__hero-suit" aria-hidden="true">
              {suit}
            </span>
            {showHand ? (
              <Button type="primary" onClick={() => ws_userShowHands(index)}>
                亮牌
              </Button>
            ) : null}
          </div>
        ) : null}
      </QueueAnim>
    </div>
  );
}
