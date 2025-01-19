import { Card } from "../../ApiType";
import { useAppSelector } from "../../app/hooks";
import { selectGameHistory } from "./gameHistorySlice";
import { useState } from "react";
import { ws_sendMessage } from "../../app/websocket";
export function card2html(cards: Card[]): string {
  return cards
    .map((card) => {
      const n = card.num;
      const s = card.suit;
      const ret =
        (n === 14
          ? "A"
          : n === 13
          ? "K"
          : n === 12
          ? "Q"
          : n === 11
          ? "J"
          : n === 10
          ? "T"
          : `${n}`) +
        (s === "c"
          ? "♣︎"
          : s === "d"
          ? "♦︎"
          : s === "h"
          ? "♥︎"
          : s === "s"
          ? "♠︎"
          : "");
      if (s === "d" || s === "h") {
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

export default function GameHistory() {
  const [message, setMessage] = useState("");
  
  const handleSend = () => {
    if (!message.trim()) return;
    ws_sendMessage(message);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSend();
    }
  };

  const logs = useAppSelector(selectGameHistory);
  return (
    <>
    <div style={{ overflow: "auto", flex: 1 }}>
      {logs.map((log, i) => (
        <div
          dangerouslySetInnerHTML={prettify(log)}
          key={logs.length - i}
        ></div>
      ))}
      </div>
      <div style={{ display: "flex", flexDirection: "row" }}>
        <input 
          placeholder="CMD/Ctrl+Enter发送"
          style={{ flex: 1, minWidth: 100 }} 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button 
          style={{ marginLeft: 10, whiteSpace: "nowrap" }}
          onClick={handleSend}
        >
          &gt;
        </button>
      </div>
    </>
  );
}
