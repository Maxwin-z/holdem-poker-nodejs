import { EyeOutlined } from "@ant-design/icons";
import QueueAnim from "rc-queue-anim";
import { Card as PokerCard } from "../../ApiType";
import { ws_userShowHands } from "../../app/websocket";
import { SuitIcon } from "./SuitIcon";

export function Poker({
  card,
  index = 0,
  showHand = false,
}: {
  card: PokerCard | null;
  index?: number;
  showHand?: boolean;
}) {
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

  if (!card) {
    return (
      <div className="poker-card empty" aria-label="空牌位">
        <div className="full" />
      </div>
    );
  }

  const suitClass = `poker-card--${card.suit}`;
  const rank = num2s(card.num);
  const suit = suit2s(card.suit);

  return (
    <div
      className={`poker-card ${suitClass}`}
      aria-label={`${rank}${suit}`}
    >
      <QueueAnim delay={0} type="bottom" className="full">
        <div key="a" className="full content">
          <span className="poker-card__corner" aria-hidden="true">
            {/* 只有 10 是两位数,单独收窄,其余点数才能放到最大 */}
            <strong className={`${rank}`.length > 1 ? "is-wide" : ""}>
              {rank}
            </strong>
          </span>
          <span className="poker-card__hero-suit" aria-hidden="true">
            <SuitIcon suit={card.suit} />
          </span>
          {showHand ? (
            <button
              type="button"
              className="poker-card__reveal"
              title="亮牌"
              aria-label="亮牌"
              onClick={() => ws_userShowHands(index)}
            >
              <EyeOutlined />
            </button>
          ) : null}
        </div>
      </QueueAnim>
    </div>
  );
}
