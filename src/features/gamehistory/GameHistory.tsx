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
import { buildFeed, cardLabel, filterHands, isRedSuit } from "./feedModel";
import type {
  FeedFilter,
  FeedHand,
  FeedItem,
  SettleLine,
} from "./feedModel";

const GTO_COLLAPSED_KEY = "gtoAdviceCollapsed";

/** 最近这几手默认展开，更早的压成一行。 */
const AUTO_EXPANDED_HANDS = 2;

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "chat", label: "聊天" },
  { key: "gto", label: "GTO" },
];

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
  return {
    __html: log,
  };
}

function formatChips(value: number): string {
  return value.toLocaleString("en-US");
}

function CardChip({ card }: { card: Card }) {
  return (
    <b className={`live-feed__card ${isRedSuit(card) ? "is-red" : ""}`}>
      {cardLabel(card)}
    </b>
  );
}

function ShowdownBlock({ rows }: { rows: SettleLine[] }) {
  return (
    <div className="live-feed__showdown">
      <div className="live-feed__showdown-title">
        <span>摊牌</span>
        <i />
      </div>
      {rows.map((row, index) => (
        <div className="live-feed__showdown-row" key={`${row.name}-${index}`}>
          <span className="live-feed__who">{row.name}</span>
          {row.hole.length ? (
            <span className="live-feed__cards">
              {row.hole.map((card, i) => (
                <CardChip card={card} key={`${card.num}${card.suit}-${i}`} />
              ))}
            </span>
          ) : null}
          {row.handsType ? (
            <span className="live-feed__hand-type">{row.handsType}</span>
          ) : null}
          <span
            className={`live-feed__profit ${
              row.profit >= 0 ? "is-win" : "is-lose"
            }`}
          >
            {row.profit >= 0 ? "+" : "−"}
            {formatChips(Math.abs(row.profit))}
          </span>
        </div>
      ))}
    </div>
  );
}

function FeedRow({
  item,
  gtoCollapsed,
  isGtoStale,
}: {
  item: FeedItem;
  gtoCollapsed: boolean;
  isGtoStale: (entry: Extract<GameLogEntry, { type: "gto" }>) => boolean;
}) {
  if (item.type === "gto") {
    return (
      <GtoAdviceCard
        entry={item.entry}
        stale={isGtoStale(item.entry)}
        globalCollapsed={gtoCollapsed}
      />
    );
  }

  if (item.type === "showdown") {
    return <ShowdownBlock rows={item.rows} />;
  }

  const line = item.line;

  if (line.kind === "street") {
    return (
      <div className="live-feed__street">
        <span className="live-feed__street-label">{line.label}</span>
        {line.cards.length ? (
          <span className="live-feed__cards">
            {line.cards.map((card, i) => (
              <CardChip card={card} key={`${card.num}${card.suit}-${i}`} />
            ))}
          </span>
        ) : null}
        <i className="live-feed__rule" />
      </div>
    );
  }

  if (line.kind === "action") {
    return (
      <div className="live-feed__act">
        <span className="live-feed__who">{line.name}</span>
        {line.pos ? (
          <span className="live-feed__pos">{line.pos}</span>
        ) : null}
        <span className={`live-feed__verb is-${line.act}`}>{line.verb}</span>
        {line.amount != null ? (
          <span className="live-feed__amt">{formatChips(line.amount)}</span>
        ) : null}
      </div>
    );
  }

  if (line.kind === "chat") {
    return (
      <div className="live-feed__chat">
        <span className="live-feed__chat-who">{line.name}</span>
        <span className="live-feed__chat-text">{line.text}</span>
      </div>
    );
  }

  if (line.kind === "note") {
    return (
      <div
        className="live-feed__note"
        dangerouslySetInnerHTML={prettify(line.html)}
      />
    );
  }

  // handStart / handEnd / settle 已经在 buildFeed 里被分组消化掉了。
  return null;
}

function HandGroup({
  hand,
  isLive,
  expanded,
  onToggle,
  gtoCollapsed,
  isGtoStale,
}: {
  hand: FeedHand;
  isLive: boolean;
  expanded: boolean;
  onToggle: () => void;
  gtoCollapsed: boolean;
  isGtoStale: (entry: Extract<GameLogEntry, { type: "gto" }>) => boolean;
}) {
  const body = expanded ? (
    <div className="live-feed__hand-body">
      {hand.items.map((item) => (
        <FeedRow
          item={item}
          gtoCollapsed={gtoCollapsed}
          isGtoStale={isGtoStale}
          key={item.key}
        />
      ))}
    </div>
  ) : null;

  // 重连后开头可能是半手日志，没有手数就不摆分组头。
  if (!hand.hand) return <div className="live-feed__hand">{body}</div>;

  return (
    <div className="live-feed__hand">
      <button
        type="button"
        className={`live-feed__hand-head ${isLive ? "is-live" : ""} ${
          expanded ? "is-open" : ""
        }`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="live-feed__hand-caret">{expanded ? "▾" : "▸"}</span>
        {isLive ? <i className="live-feed__hand-dot" /> : null}
        <span className="live-feed__hand-no">第 {hand.hand} 手</span>
        {isLive ? (
          <span className="live-feed__hand-state">进行中</span>
        ) : null}
        {!expanded && hand.chatCount ? (
          <span className="live-feed__hand-chat">💬 {hand.chatCount}</span>
        ) : null}
        {hand.best ? (
          <span className="live-feed__hand-sum">
            {hand.best.name}
            <b className={hand.best.profit >= 0 ? "is-win" : "is-lose"}>
              {hand.best.profit >= 0 ? "+" : "−"}
              {formatChips(Math.abs(hand.best.profit))}
            </b>
          </span>
        ) : null}
      </button>
      {body}
    </div>
  );
}

export default function GameHistory({
  previewLogs,
}: {
  previewLogs?: GameLogEntry[];
}) {
  const [message, setMessage] = useState("");
  const [gtoCollapsed, setGtoCollapsed] = useState<boolean>(loadGtoCollapsed);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [handOverrides, setHandOverrides] = useState<Record<number, boolean>>(
    {}
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveLogs = useAppSelector(selectGameHistory);
  const game = useAppSelector(selectGame);
  const logs = previewLogs || liveLogs;
  const logRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatestRef = useRef(true);
  const latestLog = logs[logs.length - 1] || "";

  const hands = useMemo(() => buildFeed(logs), [logs]);
  const visibleHands = useMemo(
    () => filterHands(hands, filter),
    [hands, filter]
  );

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

  const lastHand = visibleHands[visibleHands.length - 1];
  const isExpanded = (hand: FeedHand, index: number) => {
    // 筛选模式下没有"折叠一行"的意义，命中的都展开。
    if (filter !== "all") return true;
    if (handOverrides[hand.hand] != null) return handOverrides[hand.hand];
    return index >= visibleHands.length - AUTO_EXPANDED_HANDS;
  };

  return (
    <section className="live-chat-panel">
      {/* 标题只交代面板身份；抽屉里的标签页已经写过一次，那边会隐藏它。 */}
      <header className="live-detail-panel__heading">
        <div>
          <small>TABLE FEED</small>
          <strong>牌局与聊天</strong>
        </div>
      </header>

      <div className="live-feed__toolbar">
        <nav className="live-feed__filters" aria-label="牌局记录筛选">
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={filter === item.key ? "is-active" : ""}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
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
      </div>

      <div
        className="live-chat-log"
        aria-live="polite"
        ref={logRef}
        onScroll={handleLogScroll}
      >
        {visibleHands.length ? (
          visibleHands.map((hand, index) => (
            <HandGroup
              hand={hand}
              isLive={!hand.ended && hand === lastHand}
              expanded={isExpanded(hand, index)}
              onToggle={() =>
                setHandOverrides((prev) => ({
                  ...prev,
                  [hand.hand]: !isExpanded(hand, index),
                }))
              }
              gtoCollapsed={gtoCollapsed}
              isGtoStale={isGtoStale}
              key={`${hand.hand}-${index}`}
            />
          ))
        ) : (
          <div className="live-detail-empty">
            <span>♠</span>
            <strong>
              {filter === "chat"
                ? "还没有聊天消息"
                : filter === "gto"
                ? "还没有 GTO 建议"
                : "还没有牌局记录"}
            </strong>
            <small>
              {filter === "chat"
                ? "牌桌上的聊天会显示在这里"
                : filter === "gto"
                ? "轮到你行动时会给出建议"
                : "行动和聊天消息会显示在这里"}
            </small>
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
