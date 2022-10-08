import { Card } from "../../ApiType";
import { useAppSelector } from "../../app/hooks";
import { selectGameHistory } from "./gameHistorySlice";

export function card2html(cards: Card[]): string {
  return cards
    .map((card) => {
      const n = card.num;
      const s = card.suit;
      const ret =
        (n == 14
          ? "A"
          : n == 13
          ? "K"
          : n == 12
          ? "Q"
          : n == 11
          ? "J"
          : `${n}`) +
        (s == "c"
          ? "♣︎"
          : s == "d"
          ? "♦︎"
          : s == "h"
          ? "♥︎"
          : s == "s"
          ? "♠︎"
          : "");
      if (s == "d" || s == "h") {
        return `<span style="color: #ae2f11">${ret}</span>`;
      } else {
        return ret;
      }
    })
    .join("");
}

function prettify(log: string) {
  log = log.replace(/(\d+(c|d|h|s))/g, (c) => {
    const [_, num, s] = c.match(/(\d+)(\w)/) || [];
    const n = parseInt(num, 10);
    return card2html([{ num: n, suit: s }]);
  });
  if (log.match(/^(Flop|Turn|River|===)/)) {
    log = `<strong>${log}</strong>`;
  }
  return {
    __html: log,
  };
}

export function GameHistory() {
  const logs = useAppSelector(selectGameHistory);
  return (
    <div>
      {logs.map((log, i) => (
        <div
          dangerouslySetInnerHTML={prettify(log)}
          key={logs.length - i}
        ></div>
      ))}
    </div>
  );
}
