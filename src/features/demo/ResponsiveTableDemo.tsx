import React, { useState } from "react";
import "./ResponsiveTableDemo.css";

type Suit = "♠" | "♥" | "♦" | "♣";

type DemoCard = {
  rank: string;
  suit: Suit;
};

type DemoPlayer = {
  name: string;
  stack: number;
  initials: string;
  status?: string;
  bet?: number;
  position?: "D" | "SB" | "BB";
  cards?: DemoCard[];
  tone: string;
};

const formatChips = (value: number) =>
  new Intl.NumberFormat("zh-CN").format(Math.round(value));

const communityCards: DemoCard[] = [
  { rank: "A", suit: "♠" },
  { rank: "10", suit: "♥" },
  { rank: "7", suit: "♦" },
  { rank: "2", suit: "♣" },
];

const players: DemoPlayer[] = [
  {
    name: "Momo",
    stack: 128450,
    initials: "MO",
    status: "已跟注",
    bet: 80,
    position: "D",
    tone: "coral",
  },
  {
    name: "Leo",
    stack: 1940,
    initials: "LE",
    status: "思考中",
    bet: 160,
    position: "SB",
    tone: "blue",
  },
  {
    name: "River",
    stack: 3120,
    initials: "RI",
    status: "已弃牌",
    position: "BB",
    tone: "violet",
  },
  {
    name: "Kai",
    stack: 840,
    initials: "KA",
    status: "All-in",
    bet: 840,
    tone: "mint",
  },
  {
    name: "Nana",
    stack: 72210,
    initials: "NA",
    status: "等待",
    tone: "amber",
  },
  {
    name: "Owen",
    stack: 50820,
    initials: "OW",
    status: "已跟注",
    bet: 80,
    tone: "slate",
  },
  {
    name: "Sora",
    stack: 186400,
    initials: "SO",
    status: "等待",
    tone: "rose",
  },
  {
    name: "Ivy",
    stack: 9340,
    initials: "IV",
    status: "已过牌",
    tone: "cyan",
  },
];

function PlayingCard({
  card,
  hidden = false,
  compact = false,
}: {
  card?: DemoCard;
  hidden?: boolean;
  compact?: boolean;
}) {
  if (hidden) {
    return (
      <div
        className={`demo-playing-card demo-playing-card--back ${
          compact ? "demo-playing-card--compact" : ""
        }`}
        aria-label="暗牌"
      >
        <span>♠</span>
      </div>
    );
  }

  if (!card) {
    return (
      <div
        className={`demo-playing-card demo-playing-card--empty ${
          compact ? "demo-playing-card--compact" : ""
        }`}
        aria-label="尚未发牌"
      />
    );
  }

  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div
      className={`demo-playing-card ${isRed ? "is-red" : ""} ${
        compact ? "demo-playing-card--compact" : ""
      }`}
      aria-label={`${card.rank}${card.suit}`}
    >
      <strong>{card.rank}</strong>
      <span>{card.suit}</span>
    </div>
  );
}

function PlayerSeat({
  player,
  seat,
  active = false,
}: {
  player: DemoPlayer;
  seat: string;
  active?: boolean;
}) {
  const folded = player.status === "已弃牌";
  const hasLargeStack = player.stack >= 100000;
  return (
    <div
      className={`demo-seat demo-seat--${seat} ${
        folded ? "is-folded" : ""
      } ${hasLargeStack ? "has-large-stack" : ""} ${
        active ? "is-active" : ""
      }`}
      aria-current={active ? "true" : undefined}
    >
      <div className="demo-seat__cards" aria-hidden="true">
        <PlayingCard hidden compact />
        <PlayingCard hidden compact />
      </div>
      <div className="demo-seat__profile">
        <div className={`demo-avatar demo-avatar--${player.tone}`}>
          {player.initials}
        </div>
        <div className="demo-seat__copy">
          <div className="demo-seat__name">
            <span>{player.name}</span>
            {player.position ? (
              <em className={`demo-position demo-position--${player.position}`}>
                {player.position}
              </em>
            ) : null}
          </div>
          <strong>{formatChips(player.stack)}</strong>
        </div>
      </div>
      <div className="demo-seat__meta">
        <span className={player.status === "思考中" ? "is-thinking" : ""}>
          {player.status}
        </span>
        {player.bet ? <b>+{formatChips(player.bet)}</b> : null}
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className="demo-icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ResponsiveTableDemo() {
  const pot = 960;
  const bigBlind = 40;
  const currentBet = 120;
  const callAmount = 80;
  const stack = 124860;
  const minRaiseTo = 240;
  const maxRaiseTo = stack + currentBet;
  const [raiseTo, setRaiseTo] = useState(440);
  const [isHeroTurn, setIsHeroTurn] = useState(false);
  const [queuedAction, setQueuedAction] = useState<
    "check-fold" | "call" | null
  >(null);
  const [actionMessage, setActionMessage] = useState(
    "轮到你行动 · 剩余 18 秒"
  );
  const [detailsOpen, setDetailsOpen] = useState(
    () => window.innerWidth > 760
  );

  const presets = [
    { label: "¼ 池", value: currentBet + callAmount + pot * 0.25 },
    { label: "⅓ 池", value: currentBet + callAmount + pot / 3 },
    { label: "½ 池", value: currentBet + callAmount + pot * 0.5 },
    { label: "⅔ 池", value: currentBet + callAmount + (pot * 2) / 3 },
    { label: "底池", value: currentBet + callAmount + pot },
    { label: "All-in", value: maxRaiseTo, danger: true },
  ];

  const clampRaise = (value: number) =>
    Math.min(maxRaiseTo, Math.max(minRaiseTo, Math.round(value)));

  const chooseAction = (message: string) => {
    setActionMessage(message);
    window.setTimeout(() => {
      setActionMessage("Demo 模式 · 操作不会真正提交");
    }, 1600);
  };

  const toggleTurnPreview = () => {
    setIsHeroTurn((current) => !current);
    setQueuedAction(null);
    setActionMessage("轮到你行动 · 剩余 18 秒");
  };

  const chooseQueuedAction = (action: "check-fold" | "call") => {
    setQueuedAction((current) => (current === action ? null : action));
  };

  return (
    <main
      className={`poker-demo-shell ${
        isHeroTurn ? "is-hero-turn" : "is-waiting"
      }`}
    >
      <header className="demo-topbar">
        <div className="demo-brand">
          <span className="demo-brand__mark">♠</span>
          <div>
            <strong>River Club</strong>
            <span>响应式牌桌 · 交互 Demo</span>
          </div>
        </div>
        <div className="demo-hand-meta" aria-label="牌局信息">
          <span>
            <small>房间</small>
            <strong>#8K21</strong>
          </span>
          <span>
            <small>盲注</small>
            <strong>20 / 40</strong>
          </span>
          <span className="demo-hand-meta__desktop">
            <small>本手</small>
            <strong>#128</strong>
          </span>
        </div>
        <div className="demo-topbar__actions">
          <span className="demo-online-pill">
            <i />
            9 人在线
          </span>
          <IconButton label="复制房间号">⧉</IconButton>
          <IconButton
            label="牌桌设置"
            onClick={() => setDetailsOpen(!detailsOpen)}
          >
            ⋯
          </IconButton>
        </div>
      </header>

      <div className="demo-game-layout">
        <aside
          className={`demo-history-panel ${
            detailsOpen ? "is-open" : "is-closed"
          }`}
        >
          <div className="demo-panel-heading">
            <div>
              <span className="demo-eyebrow">TABLE INFO</span>
              <h2>本手动态</h2>
            </div>
            <button type="button" onClick={() => setDetailsOpen(false)}>
              ×
            </button>
          </div>
          <div className="demo-stats-grid">
            <div>
              <span>底池</span>
              <strong>{formatChips(pot)}</strong>
            </div>
            <div>
              <span>平均筹码</span>
              <strong>2,105</strong>
            </div>
          </div>
          <ol className="demo-action-list">
            <li>
              <i className="demo-timeline-dot demo-timeline-dot--muted" />
              <div>
                <span>River</span>
                <strong>弃牌</strong>
              </div>
            </li>
            <li>
              <i className="demo-timeline-dot" />
              <div>
                <span>Kai</span>
                <strong>加注至 160</strong>
              </div>
            </li>
            <li>
              <i className="demo-timeline-dot demo-timeline-dot--gold" />
              <div>
                <span>Momo</span>
                <strong>跟注 80</strong>
              </div>
            </li>
          </ol>
          <div className="demo-note">
            <span>设计说明</span>
            <p>
              桌面端保留全局信息；移动端收起为牌桌顶部摘要，避免遮挡核心操作。
            </p>
          </div>
        </aside>

        <div className="demo-table-column">
          <section className="demo-table-stage">
            <div
              className={`demo-table-status ${
                isHeroTurn ? "is-hero-turn" : "is-waiting"
              }`}
              aria-live="polite"
            >
              <span className="demo-street-pill">
                {isHeroTurn ? "TURN" : "WAIT"}
              </span>
              <span>
                {isHeroTurn ? actionMessage : "Leo 正在思考 · 剩余 12 秒"}
              </span>
              <button
                className="demo-turn-preview-toggle"
                type="button"
                onClick={toggleTurnPreview}
              >
                {isHeroTurn ? "看等待态" : "看操作态"}
              </button>
            </div>

            <div className="demo-table-grid">
              <div className="demo-felt" aria-hidden="true">
                <span className="demo-felt__line" />
                <span className="demo-felt__logo">
                  RIVER
                  <small>PRIVATE TABLE</small>
                </span>
              </div>

              <PlayerSeat player={players[0]} seat="top-left" />
              <PlayerSeat
                player={players[1]}
                seat="top-right"
                active={!isHeroTurn}
              />
              <PlayerSeat player={players[2]} seat="upper-left" />
              <PlayerSeat player={players[3]} seat="upper-right" />
              <PlayerSeat player={players[4]} seat="middle-left" />
              <PlayerSeat player={players[5]} seat="middle-right" />
              <PlayerSeat player={players[6]} seat="lower-left" />
              <PlayerSeat player={players[7]} seat="lower-right" />

              <div className="demo-board">
                <div className="demo-pot">
                  <span>总底池</span>
                  <strong>
                    <i>●</i>
                    {formatChips(pot)}
                  </strong>
                </div>
                <div className="demo-community-cards">
                  {communityCards.map((card) => (
                    <PlayingCard
                      card={card}
                      key={`${card.rank}${card.suit}`}
                    />
                  ))}
                  <PlayingCard />
                </div>
                <div className="demo-board__odds">
                  <span>你的牌力</span>
                  <strong>两对 · A 和 10</strong>
                </div>
              </div>

              <div className="demo-hero-seat">
                <div className="demo-hero-seat__cards">
                  <PlayingCard card={{ rank: "A", suit: "♥" }} />
                  <PlayingCard card={{ rank: "10", suit: "♣" }} />
                </div>
                <div className="demo-hero-seat__profile">
                  <div className="demo-avatar demo-avatar--hero">YOU</div>
                  <div>
                    <span>Maxwin</span>
                    <strong className="is-large-stack">
                      {formatChips(stack)}
                    </strong>
                  </div>
                </div>
                <span className="demo-hero-seat__bet">
                  已投入 {currentBet}
                </span>
              </div>
            </div>
          </section>

          <aside
            className={`demo-action-panel ${
              isHeroTurn ? "is-hero-turn" : "is-waiting"
            }`}
          >
            <div className="demo-action-panel__grabber" aria-hidden="true" />
            {isHeroTurn ? (
              <>
              <div className="demo-action-panel__summary">
                <div>
                  <span>加注至</span>
                  <strong>{formatChips(raiseTo)}</strong>
                </div>
                <div className="demo-action-panel__limits">
                  <span>最小 {formatChips(minRaiseTo)}</span>
                  <span>可用 {formatChips(maxRaiseTo)}</span>
                </div>
              </div>

              <div className="demo-raise-control">
                <input
                  aria-label="拖动选择加注数值"
                  type="range"
                  min={minRaiseTo}
                  max={maxRaiseTo}
                  step={bigBlind}
                  value={raiseTo}
                  onChange={(event) =>
                    setRaiseTo(clampRaise(Number(event.target.value)))
                  }
                />
                <div className="demo-number-entry">
                  <b>¥</b>
                  <input
                    aria-label="自定义加注数值"
                    type="number"
                    min={minRaiseTo}
                    max={maxRaiseTo}
                    step={bigBlind}
                    inputMode="numeric"
                    value={raiseTo}
                    onChange={(event) =>
                      setRaiseTo(clampRaise(Number(event.target.value)))
                    }
                  />
                </div>
              </div>

              <div className="demo-raise-presets" aria-label="快捷加注">
                {presets.map((preset) => {
                  const presetValue = clampRaise(preset.value);
                  return (
                    <button
                      type="button"
                      key={preset.label}
                      className={`${
                        raiseTo === presetValue ? "is-selected" : ""
                      } ${preset.danger ? "is-danger" : ""}`}
                      onClick={() => setRaiseTo(presetValue)}
                    >
                      <span>{preset.label}</span>
                      <small>{formatChips(presetValue)}</small>
                    </button>
                  );
                })}
              </div>

              <div className="demo-primary-actions">
                <button
                  type="button"
                  className="demo-action-button demo-action-button--fold"
                  onClick={() => chooseAction("已选择弃牌 · Demo 未提交")}
                >
                  <span>弃牌</span>
                  <small>FOLD</small>
                </button>
                <button
                  type="button"
                  className="demo-action-button demo-action-button--call"
                  onClick={() =>
                    chooseAction(`已选择跟注 ${callAmount} · Demo 未提交`)
                  }
                >
                  <span>跟注 {callAmount}</span>
                  <small>CALL</small>
                </button>
                <button
                  type="button"
                  className="demo-action-button demo-action-button--raise"
                  onClick={() =>
                    chooseAction(`已选择加注至 ${raiseTo} · Demo 未提交`)
                  }
                >
                  <span>加注 {formatChips(raiseTo)}</span>
                  <small>RAISE</small>
                </button>
              </div>
              </>
            ) : (
              <div className="demo-waiting-panel">
              <div className="demo-waiting-current">
                <span className="demo-waiting-pulse">
                  <i />
                </span>
                <div>
                  <span>当前行动</span>
                  <strong>等待 Leo 做决定</strong>
                </div>
                <time>
                  <b>12</b>
                  <small>秒</small>
                </time>
              </div>

              <div className="demo-pre-action-heading">
                <div>
                  <span>提前选择</span>
                  <small>轮到你时自动执行，也可再次点击取消</small>
                </div>
                <strong>
                  {queuedAction === "check-fold"
                    ? "已预选：自动过牌 / 弃牌"
                    : queuedAction === "call"
                      ? `已预选：跟注 ${callAmount}`
                      : "尚未预选"}
                </strong>
              </div>

              <div className="demo-waiting-actions">
                <button
                  type="button"
                  className={
                    queuedAction === "check-fold" ? "is-selected" : ""
                  }
                  aria-pressed={queuedAction === "check-fold"}
                  onClick={() => chooseQueuedAction("check-fold")}
                >
                  <span>自动过牌 / 弃牌</span>
                  <small>CHECK / FOLD</small>
                </button>
                <button
                  type="button"
                  className={queuedAction === "call" ? "is-selected" : ""}
                  aria-pressed={queuedAction === "call"}
                  onClick={() => chooseQueuedAction("call")}
                >
                  <span>跟注 {callAmount}</span>
                  <small>CALL WHEN READY</small>
                </button>
              </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
