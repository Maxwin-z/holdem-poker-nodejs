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
  const color = card?.suit == "d" || card?.suit == "h" ? "hd" : "";
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
  return (
    <div className={`poker-card ${color} ${empty}`}>
      <QueueAnim delay={0} type="bottom" className="full">
        {card ? (
          <div key="a" className="full flex-column flex-center content">
            {num2s(card?.num || 0)}
            {suit2s(card?.suit || "")}
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
