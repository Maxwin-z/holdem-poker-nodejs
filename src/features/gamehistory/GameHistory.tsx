import { Card } from "../../ApiType";
import { useAppSelector } from "../../app/hooks";
import { selectGameHistory } from "./gameHistorySlice";
import { useState } from "react";
import { ws_sendMessage } from "../../app/websocket";
import { SendOutlined } from "@ant-design/icons";

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
        return `<span style="color: #d85b5d">${ret}</span>`;
      }
      return ret;
    })
    .join("");
}

function prettify(log: string) {
  log = log.replace(/(\d+(c|d|h|s))/g, (cardText) => {
    const [, num, suit] = cardText.match(/(\d+)(\w)/) || [];
    const cardNumber = parseInt(num, 10);
    return card2html([{ num: cardNumber, suit }]);
  });
  if (log.match(/^(Flop|Turn|River|===)/)) {
    log = `<strong>${log}</strong>`;
  }
  return {
    __html: log,
  };
}

export default function GameHistory({
  previewLogs,
}: {
  previewLogs?: string[];
}) {
  const [message, setMessage] = useState("");
  const liveLogs = useAppSelector(selectGameHistory);
  const logs = previewLogs || liveLogs;

  const handleSend = () => {
    if (!message.trim()) return;
    ws_sendMessage(message);
    setMessage("");
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="live-chat-panel">
      <header className="live-detail-panel__heading">
        <div>
          <small>TABLE FEED</small>
          <strong>牌局与聊天</strong>
        </div>
        <span>{logs.length}</span>
      </header>

      <div className="live-chat-log" aria-live="polite">
        {logs.length ? (
          logs.map((log, index) => (
            <div
              className={`live-chat-log__item ${
                log.includes("</strong>:") ? "is-message" : "is-system"
              }`}
              dangerouslySetInnerHTML={prettify(log)}
              key={`${logs.length - index}-${log}`}
            />
          ))
        ) : (
          <div className="live-detail-empty">
            <span>♠</span>
            <strong>还没有牌局记录</strong>
            <small>行动和聊天消息会显示在这里</small>
          </div>
        )}
      </div>

      <div className="live-chat-composer">
        <textarea
          rows={1}
          placeholder="输入消息…"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span>⌘ / Ctrl + Enter</span>
        <button
          type="button"
          aria-label="发送消息"
          disabled={!message.trim()}
          onClick={handleSend}
        >
          <SendOutlined />
        </button>
      </div>
    </section>
  );
}
