import { Card } from "../../ApiType";
import { useAppSelector } from "../../app/hooks";
import { selectGameHistory } from "./gameHistorySlice";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ws_sendMessage } from "../../app/websocket";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  SendOutlined,
} from "@ant-design/icons";
import GtoAdviceCard from "./GtoAdviceCard";
import type { GameLogEntry } from "../../ApiType";
import { selectGame } from "../room/roomSlice";

const GTO_COLLAPSED_KEY = "gtoAdviceCollapsed";

function loadGtoCollapsed(): boolean {
  // 默认折叠；用户切换后保存在本地。
  try {
    const stored = localStorage[GTO_COLLAPSED_KEY];
    if (stored == null) return true;
    return stored === "1";
  } catch {
    return true;
  }
}

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
  previewLogs?: GameLogEntry[];
}) {
  const [message, setMessage] = useState("");
  const [gtoCollapsed, setGtoCollapsed] = useState<boolean>(loadGtoCollapsed);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveLogs = useAppSelector(selectGameHistory);
  const game = useAppSelector(selectGame);
  const logs = previewLogs || liveLogs;
  const logRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatestRef = useRef(true);
  const latestLog = logs[logs.length - 1] || "";

  useLayoutEffect(() => {
    const logElement = logRef.current;
    if (!logElement || !shouldFollowLatestRef.current) return;
    logElement.scrollTop = logElement.scrollHeight;
  }, [latestLog, logs.length]);

  const handleLogScroll = () => {
    const logElement = logRef.current;
    if (!logElement) return;
    const distanceFromBottom =
      logElement.scrollHeight -
      logElement.scrollTop -
      logElement.clientHeight;
    shouldFollowLatestRef.current = distanceFromBottom <= 48;
  };

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

  const toggleGtoCollapsed = () => {
    setGtoCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage[GTO_COLLAPSED_KEY] = next ? "1" : "0";
      } catch {
        // 隐私模式等场景下写入失败时忽略，仅本次会话生效。
      }
      return next;
    });
  };

  // Auto-grow the input as content wraps to new lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [message]);

  const isGtoStale = (entry: Extract<GameLogEntry, { type: "gto" }>) =>
    !game ||
    game.handSeq !== entry.handSeq ||
    (!!game.acting && game.acting !== entry.actingId);

  // Alternate a subtle background between hands so the feed reads in
  // zebra stripes instead of relying on boxed start/end banners.
  const handParities = useMemo(() => {
    const out: number[] = [];
    let hand = 0;
    for (const log of logs) {
      if (typeof log === "string") {
        const match = log.match(/第\s*(\d+)\s*手开始/);
        if (match) hand = parseInt(match[1], 10);
      } else {
        hand = log.handSeq || hand;
      }
      out.push(hand % 2);
    }
    return out;
  }, [logs]);

  return (
    <section className="live-chat-panel">
      <header className="live-detail-panel__heading">
        <div>
          <small>TABLE FEED</small>
          <strong>牌局与聊天</strong>
        </div>
        <div className="live-detail-panel__heading-actions">
          <button
            type="button"
            className={`gto-eye-toggle ${gtoCollapsed ? "" : "is-active"}`}
            aria-label={gtoCollapsed ? "展开 GTO 建议" : "折叠 GTO 建议"}
            title={gtoCollapsed ? "展开 GTO 建议" : "折叠 GTO 建议"}
            onClick={toggleGtoCollapsed}
          >
            {gtoCollapsed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
          <span>{logs.length}</span>
        </div>
      </header>

      <div
        className="live-chat-log"
        aria-live="polite"
        ref={logRef}
        onScroll={handleLogScroll}
      >
        {logs.length ? (
          logs.map((log, index) =>
            typeof log === "string" ? (
              <div
                className={`live-chat-log__item ${
                  log.includes("</strong>:") ? "is-message" : "is-system"
                } ${handParities[index] ? "is-hand-alt" : ""}`}
                dangerouslySetInnerHTML={prettify(log)}
                key={`${index}-${log}`}
              />
            ) : (
              <GtoAdviceCard
                entry={log}
                stale={isGtoStale(log)}
                globalCollapsed={gtoCollapsed}
                key={`${index}-${log.type}-${log.text}-${log.handSeq}`}
              />
            )
          )
        ) : (
          <div className="live-detail-empty">
            <span>♠</span>
            <strong>还没有牌局记录</strong>
            <small>行动和聊天消息会显示在这里</small>
          </div>
        )}
      </div>

      <div className="live-chat-composer">
        <div className="live-chat-input">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="输入消息…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            aria-label="发送消息"
            disabled={!message.trim()}
            onClick={handleSend}
          >
            <SendOutlined />
          </button>
        </div>
        <span className="live-chat-composer__hint">⌘ / Ctrl + Enter</span>
      </div>
    </section>
  );
}
