import {
  ArrowLeftOutlined,
  CopyOutlined,
  RobotOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Button, Empty, Spin } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "../../ApiType";
import { positionLabelByActionOrder } from "../../gto/preflop/positions";
import type { PostflopAdvice } from "../../gto/postflop/types";
import { buildAiReplayComparison, classifyAiReplaySize } from "../../shared/aiReplay";
import type {
  AiReplayDeviationLevel,
  AiReplayDecision,
  AiReplayHand,
  AiReplayListResponse,
  AiReplayParticipant,
  AiReplaySummary,
  ReplayStreet,
} from "../../shared/aiReplay";
import PreflopRangeGrid from "../gamehistory/PreflopRangeGrid";
import { buildReplaySteps } from "./replaySteps";
import type { ReplaySeatView, ReplayStep, ReplayStepStreet } from "./replaySteps";
import "./AiReplayPage.css";

const ACTION_LABEL: Record<string, string> = {
  fold: "弃牌",
  check: "过牌",
  call: "跟注",
  bet: "下注",
  raise: "加注",
  allin: "全下",
};

const STREET_LABEL: Record<ReplayStreet, string> = {
  preflop: "翻前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
};

const STEP_STREET_LABEL: Record<ReplayStepStreet, string> = {
  ...STREET_LABEL,
  result: "结果",
};

const CLASS_LABEL: Record<string, string> = {
  recommended: "主推荐",
  "mixed-acceptable": "混合策略",
  "low-frequency": "低频选择",
  deviation: "策略偏差",
  unscored: "未评分",
};

const DEVIATION_LABEL: Record<AiReplayDeviationLevel, string> = {
  close: "贴近策略",
  minor: "轻微偏差",
  notable: "明显偏差",
  severe: "严重偏差",
  unscored: "未评分",
};

const REPLAY_BOT_SEATS: Record<number, string[]> = {
  1: ["top-center"],
  2: ["top-left", "top-right"],
  3: ["upper-left", "top-center", "upper-right"],
  4: ["middle-left", "top-left", "top-right", "middle-right"],
  5: ["lower-left", "upper-left", "top-center", "upper-right", "lower-right"],
  6: ["lower-left", "middle-left", "top-left", "top-right", "middle-right", "lower-right"],
  7: ["lower-left", "middle-left", "upper-left", "top-center", "upper-right", "middle-right", "lower-right"],
  8: ["lower-left", "middle-left", "upper-left", "top-left", "top-right", "upper-right", "middle-right", "lower-right"],
  9: ["lower-left", "middle-left", "upper-left", "top-left", "top-center", "top-right", "upper-right", "middle-right", "lower-right"],
};

// Percent coordinates on the stage for every named seat slot. Action tags sit
// on the segment between the seat and the table center.
const SEAT_COORDS: Record<string, { x: number; y: number }> = {
  "top-left": { x: 32, y: 8 },
  "top-center": { x: 50, y: 6 },
  "top-right": { x: 68, y: 8 },
  "upper-left": { x: 13, y: 24 },
  "upper-right": { x: 87, y: 24 },
  "middle-left": { x: 12, y: 46 },
  "middle-right": { x: 88, y: 46 },
  "lower-left": { x: 14, y: 66 },
  "lower-right": { x: 86, y: 66 },
  hero: { x: 50, y: 85 },
};
const STAGE_CENTER = { x: 50, y: 42 };

function betSpot(coord: { x: number; y: number }) {
  return {
    x: coord.x + (STAGE_CENTER.x - coord.x) * 0.42,
    y: coord.y + (STAGE_CENTER.y - coord.y) * 0.5,
  };
}

function dealerSpot(coord: { x: number; y: number }) {
  return {
    x: coord.x + (STAGE_CENTER.x - coord.x) * 0.22 + (coord.x <= 50 ? 6 : -6),
    y: coord.y + (STAGE_CENTER.y - coord.y) * 0.22,
  };
}

function actionTone(action: string): "fold" | "call" | "raise" {
  if (action === "fold") return "fold";
  if (action === "raise" || action === "bet" || action === "allin") return "raise";
  return "call";
}

type ReplayAdvice = NonNullable<AiReplayDecision["advice"]>;
type StrategySize = { chips?: number; bb?: number };
type AssessmentTone = "success" | "warning" | "danger";

interface DecisionAssessment {
  icon: "✅" | "⚠️" | "❌";
  tone: AssessmentTone;
  text: string;
}

function aggressiveAction(action: string) {
  return action === "bet" || action === "raise" || action === "allin";
}

function strategyActionSizes(advice: ReplayAdvice): Record<string, StrategySize> {
  const sizes: Record<string, StrategySize> = {};
  if (advice.kind === "preflop") {
    advice.actions.forEach((action) => {
      if (aggressiveAction(action.action) && (action.sizeChips !== undefined || action.sizeBB !== undefined)) {
        sizes[action.action] = { chips: action.sizeChips, bb: action.sizeBB };
      }
    });
  } else if (advice.recommendedSizeChips !== undefined || advice.recommendedSizeBB !== undefined) {
    ["bet", "raise", "allin"].forEach((action) => {
      if (Number(advice.actionDistribution[action as keyof typeof advice.actionDistribution] || 0) > 0) {
        sizes[action] = {
          chips: advice.recommendedSizeChips,
          bb: advice.recommendedSizeBB,
        };
      }
    });
  }
  return sizes;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBB(chips: number, bigBlind: number) {
  const value = chips / bigBlind;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}BB`;
}

function strategySizeLabel(size: StrategySize) {
  const parts: string[] = [];
  if (size.chips !== undefined) parts.push(`${formatAmount(size.chips)} 筹码`);
  if (size.bb !== undefined) parts.push(`${formatAmount(size.bb)}bb`);
  return parts.length ? `建议到 ${parts.join(" · ")}` : "";
}

function buildDecisionAssessments(
  decision: AiReplayDecision,
  advice: ReplayAdvice,
  sizes: Record<string, StrategySize>,
  bigBlind: number
): DecisionAssessment[] {
  const assessments: DecisionAssessment[] = [];
  const probability = decision.comparison.actualActionProbability;
  if (decision.comparison.classification === "recommended") {
    assessments.push({ icon: "✅", tone: "success", text: "实际行动与 GTO 主推荐一致" });
  } else if (decision.comparison.classification === "mixed-acceptable") {
    assessments.push({
      icon: "⚠️",
      tone: "warning",
      text: `实际行动属于可接受的混合策略${probability !== undefined ? `，频率 ${formatAmount(probability)}%` : ""}`,
    });
  } else if (decision.comparison.classification === "low-frequency") {
    assessments.push({
      icon: "⚠️",
      tone: "warning",
      text: `实际行动仅以${probability !== undefined ? ` ${formatAmount(probability)}%` : "较低"}的低频率出现`,
    });
  } else if (decision.comparison.classification === "deviation") {
    assessments.push({ icon: "❌", tone: "danger", text: "实际行动不在当前 GTO 参考策略中" });
  } else {
    assessments.push({ icon: "⚠️", tone: "warning", text: "当前行动缺少可用的 GTO 评分" });
  }
  if (decision.comparison.softened) {
    assessments.push({
      icon: "⚠️",
      tone: "warning",
      text: "参考图表将该手牌固定为单一动作，评分已按手牌强度与该位置整体频率放宽",
    });
  }

  const actualAction = advice.kind === "preflop" && decision.actual.action === "check"
    ? "call"
    : decision.actual.action;
  if (aggressiveAction(actualAction) && decision.actual.amountTo !== undefined) {
    const actionSize = sizes[actualAction] || {};
    const recommendedChips = decision.comparison.recommendedSizeChips ??
      actionSize.chips ??
      (actionSize.bb !== undefined ? actionSize.bb * bigBlind : undefined);
    const recommendedBB = decision.comparison.recommendedSizeBB ??
      actionSize.bb ??
      (recommendedChips !== undefined ? recommendedChips / bigBlind : undefined);
    if (recommendedChips !== undefined && recommendedBB !== undefined) {
      const differenceChips = decision.actual.amountTo - recommendedChips;
      const differenceBB = differenceChips / bigBlind;
      const differenceRatio = recommendedChips > 0 ? Math.abs(differenceChips / recommendedChips) : 0;
      // Recalculate instead of trusting persisted classifications so older
      // replays also use the current proportional grading thresholds.
      const sizeClass = classifyAiReplaySize(decision.actual.amountTo, recommendedChips);
      const actualBB = decision.actual.amountTo / bigBlind;
      const direction = differenceChips > 0 ? "偏大" : "偏小";
      const comparison = Math.abs(differenceChips) < 0.001
        ? "完全一致"
        : `${direction} ${formatAmount(Math.abs(differenceChips))} 筹码（${formatAmount(Math.abs(differenceBB))}bb，${formatAmount(differenceRatio * 100)}%）`;
      const baseText = `实际到 ${formatAmount(decision.actual.amountTo)}（${formatAmount(actualBB)}bb），GTO 建议到 ${formatAmount(recommendedChips)}（${formatAmount(recommendedBB)}bb）；${comparison}`;
      assessments.push(sizeClass === "matched"
        ? { icon: "✅", tone: "success", text: `加注尺寸合理：${baseText}` }
        : sizeClass === "minor"
          ? { icon: "⚠️", tone: "warning", text: `加注尺寸存在偏差：${baseText}` }
          : { icon: "❌", tone: "danger", text: `加注尺寸明显偏离：${baseText}` });
    }
  }
  return assessments;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  error?: string;
}

function routeReplayId(): string | null {
  const match = window.location.pathname.match(/^\/replays\/([a-f0-9]{32})$/i);
  return match ? match[1] : null;
}

async function api<T>(url: string, authenticated = false): Promise<T> {
  const response = await fetch(url, {
    headers: authenticated
      ? { authorization: localStorage["token"] || "" }
      : undefined,
  });
  const payload = await response.json() as ApiEnvelope<T>;
  if (payload.code !== 0) throw new Error(payload.error || "请求失败");
  return payload.data;
}

function rank(num: number) {
  if (num === 14) return "A";
  if (num === 13) return "K";
  if (num === 12) return "Q";
  if (num === 11) return "J";
  if (num === 10) return "T";
  return String(num);
}

function suitSymbol(suit: string) {
  return suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : "♠";
}

function PlayingCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <span className={`replay-card replay-card--${card.suit} ${compact ? "is-compact" : ""}`}>
      <strong>{rank(card.num)}</strong>
      <i>{suitSymbol(card.suit)}</i>
    </span>
  );
}

function TextCard({ value }: { value: string }) {
  const suit = value.slice(-1);
  return (
    <span className={`replay-card replay-card--${suit} is-combo`}>
      <strong>{value.slice(0, -1)}</strong>
      <i>{suitSymbol(suit)}</i>
    </span>
  );
}

function CardRow({ cards, compact = false }: { cards: Card[]; compact?: boolean }) {
  return (
    <span className="replay-card-row">
      {cards.map((card, index) => (
        <PlayingCard key={`${card.num}-${card.suit}-${index}`} card={card} compact={compact} />
      ))}
    </span>
  );
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function ReplayListItem({
  replay,
  active,
  onClick,
}: {
  replay: AiReplaySummary;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button className={`replay-list-item ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="replay-list-item__top">
        <b>{replay.heroPosition}</b>
        <CardRow cards={replay.heroCards} compact />
        <time>{formatDate(replay.completedAt)}</time>
      </span>
      <span className={`replay-list-item__deviation is-${replay.deviationLevel}`}>
        <span>
          <small>偏差度</small>
          <b>{replay.deviationScore === null ? "—" : Math.round(replay.deviationScore)}</b>
          <em>{DEVIATION_LABEL[replay.deviationLevel]}</em>
        </span>
        <i aria-hidden="true">
          <u style={{ width: `${replay.deviationScore || 0}%` }} />
        </i>
      </span>
      <span className="replay-list-item__bottom">
        <span><RobotOutlined /> {replay.scoredDecisionCount} 次玩家决策</span>
        <strong className={replay.heroProfitBB >= 0 ? "is-win" : "is-loss"}>
          {replay.heroProfitBB > 0 ? "+" : ""}{replay.heroProfitBB.toFixed(1)}bb
        </strong>
      </span>
    </button>
  );
}

function DistributionChart({
  distribution,
  actual,
  sizes = {},
}: {
  distribution: Record<string, number>;
  actual: string;
  sizes?: Record<string, StrategySize>;
}) {
  const rows = Object.keys(distribution)
    .map((action) => ({ action, value: Number(distribution[action] || 0) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="replay-distribution">
      {rows.map((row) => (
        <div className={`replay-distribution__row ${row.action === actual ? "is-actual" : ""}`} key={row.action}>
          <span className="replay-distribution__action">
            <span>{ACTION_LABEL[row.action] || row.action}</span>
            {sizes[row.action] && <small>{strategySizeLabel(sizes[row.action])}</small>}
          </span>
          <div><i style={{ width: `${Math.max(2, row.value)}%` }} /></div>
          <b>{row.value.toFixed(row.value % 1 ? 1 : 0)}%</b>
        </div>
      ))}
    </div>
  );
}

/**
 * Visualizes how the bot's dice roll picked an action: the mixed strategy
 * is drawn as a stacked bar (segments in sampling order, widths by
 * probability) and the marker sits at the sampled roll, inside the segment
 * that was selected.
 */
function StrategySampleBar({
  choices,
  sample,
}: {
  choices: Array<{ action?: string; probability?: number; sizeChips?: number }>;
  sample: number;
}) {
  const segments = choices
    .map((choice) => ({
      action: choice.action || "",
      probability: Math.max(0, Number(choice.probability || 0)),
      sizeChips: choice.sizeChips,
    }))
    .filter((segment) => segment.action && segment.probability > 0);
  const total = segments.reduce((sum, segment) => sum + segment.probability, 0);
  if (!segments.length || total <= 0) return null;
  // Mirror the sampler: roll = sample * total walks the segments in array
  // order, so on a proportional bar the marker sits at exactly `sample`.
  const roll = sample * total;
  let cumulative = 0;
  let hitIndex = segments.length - 1;
  for (let index = 0; index < segments.length; index += 1) {
    cumulative += segments[index].probability;
    if (roll <= cumulative) {
      hitIndex = index;
      break;
    }
  }
  const hit = segments[hitIndex];
  return (
    <div className="replay-sample">
      <div className="replay-sample__track">
        <div className="replay-sample__bar">
          {segments.map((segment, index) => (
            <i
              key={index}
              className={`is-${segment.action === "allin" ? "allin" : actionTone(segment.action)}`}
              style={{ width: `${(segment.probability / total) * 100}%` }}
              title={`${actionTagText(segment.action, segment.sizeChips)} · ${((segment.probability / total) * 100).toFixed(1)}%`}
            />
          ))}
        </div>
        <span
          className="replay-sample__marker"
          style={{ left: `${Math.max(0, Math.min(100, sample * 100))}%` }}
        />
      </div>
      <small>
        采样 <b>{sample.toFixed(4)}</b>，落入 <b>{actionTagText(hit.action, hit.sizeChips)}</b> 区间
      </small>
    </div>
  );
}

function ComboExplorer({ advice }: { advice: PostflopAdvice }) {
  const details = advice.continuingRangeDetails;
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<"low" | "high" | "class">("low");
  if (!details || details.combos.length === 0) return null;
  const combos = [...details.combos].sort((a, b) => {
    if (sort === "high") return b.heroEquity - a.heroEquity;
    if (sort === "class") return a.handClass.localeCompare(b.handClass);
    return a.heroEquity - b.heroEquity;
  });
  const visible = expanded ? combos : combos.slice(0, 30);
  return (
    <section className="combo-explorer">
      <div className="combo-explorer__head">
        <div>
          <strong>模型假设的对手继续范围</strong>
          <small>
            候选 {details.candidateComboCount} · 评估 {details.evaluatedComboCount}
            {details.sampled ? " · 已抽样" : " · 完整评估"}
          </small>
        </div>
        <div className="combo-explorer__sort">
          <button className={sort === "low" ? "is-active" : ""} onClick={() => setSort("low")}>危险优先</button>
          <button className={sort === "high" ? "is-active" : ""} onClick={() => setSort("high")}>优势优先</button>
          <button className={sort === "class" ? "is-active" : ""} onClick={() => setSort("class")}>牌型</button>
        </div>
      </div>
      <div className="combo-grid">
        {visible.map((combo, index) => {
          const pct = Math.round(combo.heroEquity * 100);
          return (
            <article className="combo-tile" key={`${combo.cards.join("-")}-${index}`}>
              <span className="combo-tile__cards">
                <TextCard value={combo.cards[0]} />
                <TextCard value={combo.cards[1]} />
              </span>
              <span>
                <b>{combo.handClass}</b>
                <small>英雄权益</small>
              </span>
              <strong style={{ color: pct >= 60 ? "#55d99a" : pct < 40 ? "#ff7979" : "#f1c75b" }}>
                {pct}%
              </strong>
              <i className="combo-tile__meter"><em style={{ width: `${pct}%` }} /></i>
            </article>
          );
        })}
      </div>
      {combos.length > 30 && (
        <button className="combo-explorer__more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "收起组合" : `展开全部 ${combos.length} 个组合`}
        </button>
      )}
    </section>
  );
}

/* ── 牌桌回放 ─────────────────────────────────────────── */

interface DisplayParticipant extends AiReplayParticipant {
  displayPosition: string;
}

function actionTagText(action: string, amount?: number) {
  if (action === "fold" || action === "check") return ACTION_LABEL[action];
  const label = action === "raise" ? "加注到" : ACTION_LABEL[action] || action;
  return amount !== undefined ? `${label} ${formatAmount(amount)}` : label;
}

function blindTagText(streetBet: number, smallBlind: number, bigBlind: number) {
  if (streetBet === smallBlind) return `小盲 ${formatAmount(streetBet)}`;
  if (streetBet === bigBlind) return `大盲 ${formatAmount(streetBet)}`;
  return formatAmount(streetBet);
}

function ReplayStage({
  replay,
  participants,
  coords,
  step,
  showBotCards,
}: {
  replay: AiReplayHand;
  participants: DisplayParticipant[];
  coords: Record<string, { x: number; y: number }>;
  step: ReplayStep;
  showBotCards: boolean;
}) {
  const isSettle = step.kind === "settle";
  const hasLiveBets = Object.keys(step.seats).some((id) => step.seats[id].streetBet > 0);
  const dealerParticipant = participants.find((participant) => participant.displayPosition === "BTN")
    || participants[participants.length - 1];
  const dealerCoord = dealerParticipant ? coords[dealerParticipant.id] : undefined;
  const boardSlots = Array.from({ length: 5 });
  return (
    <div className="replay-stage" aria-label="牌桌回放">
      <div className="replay-stage__felt" aria-hidden="true"><i /></div>
      <div className="replay-stage__center">
        <small>{isSettle ? "本手结束" : `${STEP_STREET_LABEL[step.street]}${step.street === "preflop" ? "" : "圈"}`}</small>
        <span className="replay-stage__pot">
          <small>{hasLiveBets ? "底池·含下注" : "底池"}</small>
          <b>{isSettle ? step.wonPot ?? 0 : step.pot}</b>
          <em>{formatBB(isSettle ? step.wonPot ?? 0 : step.pot, replay.bigBlind)}</em>
        </span>
        <span className="replay-stage__board">
          {boardSlots.map((_, index) => {
            const card = step.board[index];
            if (!card) return <span className="replay-stage__board-slot" key={index} />;
            const revealed = index >= step.board.length - step.newCardCount;
            return (
              <span className={revealed ? "replay-stage__board-new" : ""} key={index}>
                <PlayingCard card={card} compact />
              </span>
            );
          })}
        </span>
      </div>
      {participants.map((participant) => {
        const seat: ReplaySeatView = step.seats[participant.id] || {
          id: participant.id,
          remaining: participant.startingStack,
          streetBet: 0,
          folded: false,
          allIn: false,
        };
        const coord = coords[participant.id];
        if (!coord) return null;
        const isHero = participant.type === "human";
        const acting = step.kind === "act" && step.actorId === participant.id;
        const revealCards = isHero || showBotCards || (isSettle && seat.showdown);
        const spot = betSpot(coord);
        let tag: { tone: string; text: string; bb?: string } | null = null;
        if (isSettle) {
          if (seat.winner && seat.profit !== undefined && seat.profit > 0) {
            tag = { tone: "win", text: `+${formatAmount(seat.profit)}`, bb: formatBB(seat.profit, replay.bigBlind) };
          }
        } else if (seat.action) {
          tag = {
            tone: actionTone(seat.action),
            text: actionTagText(seat.action, seat.actionAmount),
            bb: seat.actionAmount !== undefined ? formatBB(seat.actionAmount, replay.bigBlind) : undefined,
          };
        } else if (seat.streetBet > 0) {
          tag = { tone: "blind", text: blindTagText(seat.streetBet, replay.smallBlind, replay.bigBlind) };
        }
        return (
          <div key={participant.id}>
            <article
              className={[
                "replay-stage-seat",
                isHero ? "is-hero" : "is-bot",
                seat.folded ? "is-folded" : "",
                acting ? "is-acting" : "",
                isSettle && seat.winner ? "is-winner" : "",
              ].join(" ")}
              style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
            >
              <div className="replay-stage-seat__cards">
                {revealCards ? (
                  <CardRow cards={participant.cards} compact />
                ) : (
                  <>
                    <span className="replay-card is-compact is-back" />
                    <span className="replay-card is-compact is-back" />
                  </>
                )}
              </div>
              <div className="replay-stage-seat__profile">
                {seat.allIn && <span className="replay-stage-seat__allin">ALL-IN</span>}
                <span className="replay-stage-seat__avatar">
                  {isHero ? participant.name.slice(0, 1) : <RobotOutlined />}
                </span>
                <span className="replay-stage-seat__copy">
                  <strong>{participant.name}{participant.botStyle ? ` · ${participant.botStyle}` : ""}</strong>
                  <b>{formatAmount(seat.remaining)}<em>{formatBB(seat.remaining, replay.bigBlind)}</em></b>
                </span>
                <span className="replay-stage-seat__position">{participant.displayPosition}</span>
              </div>
            </article>
            {tag && (
              <span
                className={`replay-action-tag is-${tag.tone} ${acting ? "is-live" : ""}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              >
                {(tag.tone === "call" || tag.tone === "raise" || tag.tone === "blind") && <i className="replay-action-tag__chip" />}
                <b>{tag.text}</b>
                {tag.bb && <em>{tag.bb}</em>}
              </span>
            )}
          </div>
        );
      })}
      {dealerCoord && (
        <span
          className="replay-dealer-button"
          style={{ left: `${dealerSpot(dealerCoord).x}%`, top: `${dealerSpot(dealerCoord).y}%` }}
        >D</span>
      )}
    </div>
  );
}

/* ── 右侧联动分析面板 ─────────────────────────────────── */

function PanelShell({
  eyebrow,
  title,
  badge,
  children,
}: {
  eyebrow: string;
  title: string;
  badge?: { text: string; className: string };
  children: React.ReactNode;
}) {
  return (
    <article className="replay-panel">
      <header className="replay-panel__head">
        <small>{eyebrow}</small>
        <strong>{title}</strong>
        {badge && <span className={`replay-grade ${badge.className}`}>{badge.text}</span>}
      </header>
      <div className="replay-panel__body">{children}</div>
    </article>
  );
}

function DealPanel({ replay, participants }: { replay: AiReplayHand; participants: DisplayParticipant[] }) {
  return (
    <PanelShell eyebrow="牌局开始" title={`发牌 · 盲注 ${replay.smallBlind} / ${replay.bigBlind}`}>
      <div className="replay-panel__players">
        {participants.map((participant) => (
          <div key={participant.id}>
            <span className={`replay-panel__player-avatar ${participant.type === "human" ? "is-hero" : ""}`}>
              {participant.type === "human" ? participant.name.slice(0, 1) : <RobotOutlined />}
            </span>
            <span>{participant.name}</span>
            <em>{participant.displayPosition}{participant.botStyle ? ` · ${participant.botStyle}` : ""}</em>
            <b>{formatAmount(participant.startingStack)} ({formatBB(participant.startingStack, replay.bigBlind)})</b>
          </div>
        ))}
      </div>
      <p className="replay-panel__note">使用 ◀ ▶ 或键盘方向键逐步回放，此面板会跟随当前步骤更新。</p>
    </PanelShell>
  );
}

function StreetPanel({ replay, step }: { replay: AiReplayHand; step: ReplayStep }) {
  const alive = Object.keys(step.seats).filter((id) => !step.seats[id].folded).length;
  return (
    <PanelShell
      eyebrow={`进入${STEP_STREET_LABEL[step.street]}圈`}
      title={step.board.map((card) => `${rank(card.num)}${suitSymbol(card.suit)}`).join(" ") || "—"}
    >
      <div className="replay-panel__metrics">
        <span><small>底池</small><b>{step.pot} ({formatBB(step.pot, replay.bigBlind)})</b></span>
        <span><small>剩余玩家</small><b>{alive} 人</b></span>
      </div>
    </PanelShell>
  );
}

function BotPanel({ replay, step, participant }: {
  replay: AiReplayHand;
  step: ReplayStep;
  participant?: DisplayParticipant;
}) {
  const decision = step.decision!;
  const choices = (decision.botStrategy?.canonicalChoices || []) as Array<{
    action?: string; probability?: number; sizeChips?: number;
  }>;
  const distribution = choices.reduce<Record<string, number>>((result, choice) => {
    if (choice.action) result[choice.action] = Number(choice.probability || 0) * 100;
    return result;
  }, {});
  const advice = decision.advice;
  const classification = decision.comparison.classification;
  const normalizedActual = advice?.kind === "preflop" && decision.actual.action === "check"
    ? "call"
    : decision.actual.action;
  return (
    <PanelShell
      eyebrow="AI 行动"
      title={`${decision.actorName} · ${participant?.displayPosition || decision.position}`}
      badge={{
        text: actionTagText(decision.actual.action, decision.actual.amountTo),
        className: `is-bot-action is-${actionTone(decision.actual.action)}`,
      }}
    >
      {decision.botStrategy && (
        <>
          <div className="replay-panel__meta">
            {participant?.botStyle && <span>风格 <b>{participant.botStyle}</b></span>}
            <span>策略源 <b>{decision.botStrategy.source}</b></span>
            {decision.botStrategy.sample !== undefined && choices.length === 0 && (
              <span>采样 <b>{decision.botStrategy.sample.toFixed(4)}</b></span>
            )}
          </div>
          {Object.keys(distribution).length > 0 && (
            <DistributionChart distribution={distribution} actual={decision.actual.action} />
          )}
          {decision.botStrategy.sample !== undefined && (
            <StrategySampleBar choices={choices} sample={decision.botStrategy.sample} />
          )}
          <p className="replay-panel__note">机器人在校准后的混合策略中按概率采样，实际行动不一定等于最高频动作。</p>
        </>
      )}
      {!decision.botStrategy && (
        <p className="replay-panel__note">该 AI 行动没有记录策略抽样信息。</p>
      )}
      {advice && (
        <section className="replay-panel__section">
          <div className="replay-panel__section-head">
            <h4>GTO 参考策略</h4>
            <span className={`replay-grade is-${classification}`}>{CLASS_LABEL[classification]}</span>
          </div>
          <p className="replay-panel__note">
            主推荐 {ACTION_LABEL[advice.recommended] || advice.recommended}
            {advice.recommendedSizeChips !== undefined &&
              `到 ${formatAmount(advice.recommendedSizeChips)}（${formatBB(advice.recommendedSizeChips, replay.bigBlind)}）`}
            ，以下为该位置整体范围的动作频率与建议尺寸。
          </p>
          <DistributionChart
            distribution={advice.actionDistribution as unknown as Record<string, number>}
            actual={normalizedActual}
            sizes={strategyActionSizes(advice)}
          />
        </section>
      )}
    </PanelShell>
  );
}

function HeroPanel({
  replay,
  step,
  heroDecisionTotal,
  participant,
}: {
  replay: AiReplayHand;
  step: ReplayStep;
  heroDecisionTotal: number;
  participant?: DisplayParticipant;
}) {
  const decision = step.decision!;
  const advice = decision.advice;
  const preflop = advice?.kind === "preflop" ? advice : undefined;
  const postflop = advice?.kind === "postflop" ? advice : undefined;
  const distribution = advice
    ? (preflop?.hero?.actionDistribution || advice.actionDistribution) as unknown as Record<string, number>
    : {};
  const sizes = advice ? strategyActionSizes(advice) : {};
  const assessments = advice ? buildDecisionAssessments(decision, advice, sizes, replay.bigBlind) : [];
  const classification = decision.comparison.classification;
  const recommendation = decision.comparison.recommendedAction;
  // The stored comparison only carries a size when the actual action was
  // aggressive; fall back to the advice's own size for the recommendation.
  const recommendedSize = decision.comparison.recommendedSizeChips ??
    (recommendation ? sizes[recommendation]?.chips : undefined);
  const actualMatchesRecommendation = decision.comparison.actionMatch;
  return (
    <PanelShell
      eyebrow={`我的决策 ${step.heroDecisionIndex}/${heroDecisionTotal}`}
      title={`${STEP_STREET_LABEL[step.street]} · ${participant?.displayPosition || decision.position}`}
      badge={{ text: CLASS_LABEL[classification], className: `is-${classification}` }}
    >
      <div className="replay-panel__versus">
        <div>
          <small>我的选择</small>
          <b>
            {actionTagText(decision.actual.action, decision.actual.amountTo)}
            {decision.actual.amountTo !== undefined && <em>{formatBB(decision.actual.amountTo, replay.bigBlind)}</em>}
          </b>
        </div>
        <span className={actualMatchesRecommendation ? "is-good" : classification === "deviation" ? "is-bad" : "is-warn"}>
          {actualMatchesRecommendation ? "＝" : "≠"}
        </span>
        <div>
          <small>GTO 主推荐</small>
          <b>
            {recommendation ? actionTagText(recommendation, recommendedSize) : "—"}
            {recommendedSize !== undefined && <em>{formatBB(recommendedSize, replay.bigBlind)}</em>}
          </b>
        </div>
      </div>
      {decision.actual.origin === "timeout" && (
        <p className="replay-panel__note is-origin">⏱ 该行动由超时自动执行。</p>
      )}
      {decision.actual.origin === "safe-fallback" && (
        <p className="replay-panel__note is-origin">⏱ 该行动由系统安全兜底执行。</p>
      )}
      {assessments.map((assessment, index) => (
        <p className={`decision-assessment is-${assessment.tone}`} key={index}>
          <b>{assessment.icon}</b><span>{assessment.text}</span>
        </p>
      ))}
      {advice && (
        <section className="replay-panel__section">
          <h4>行动频率分布</h4>
          <DistributionChart distribution={distribution} actual={decision.actual.action} sizes={sizes} />
        </section>
      )}
      <div className="replay-panel__metrics">
        <span><small>行动前底池</small><b>{decision.context.potBefore} ({formatBB(decision.context.potBefore, replay.bigBlind)})</b></span>
        <span><small>需要跟注</small><b>{decision.context.amountToCall}</b></span>
        <span><small>策略主推荐</small><b>{recommendation ? ACTION_LABEL[recommendation] || recommendation : "—"}</b></span>
        <span><small>实际动作频率</small><b>{decision.comparison.actualActionProbability ?? "—"}{decision.comparison.actualActionProbability !== undefined ? "%" : ""}</b></span>
      </div>
      {postflop && (
        <div className="equity-strip">
          <span style={{ "--equity": `${Math.round(postflop.equityVsRandom * 100)}%` } as React.CSSProperties}>
            <small>对随机范围</small><b>{Math.round(postflop.equityVsRandom * 100)}%</b><i />
          </span>
          {postflop.equityVsRange !== undefined && (
            <span style={{ "--equity": `${Math.round(postflop.equityVsRange * 100)}%` } as React.CSSProperties}>
              <small>对继续范围</small><b>{Math.round(postflop.equityVsRange * 100)}%</b><i />
            </span>
          )}
        </div>
      )}
      {(postflop?.reasoning || (advice && advice.notes.length > 0)) && (
        <section className="replay-panel__section replay-panel__why">
          <h4>策略解读</h4>
          {postflop?.reasoning && <p>ℹ️ {postflop.reasoning}</p>}
          {advice && advice.notes.map((note, index) => <p key={index}>ℹ️ {note}</p>)}
        </section>
      )}
      {preflop && (
        <details className="preflop-range-panel">
          <summary>查看 {participant?.displayPosition || decision.position} 策略范围表</summary>
          <PreflopRangeGrid
            grid={preflop.rangeGrid}
            heroHandKey={preflop.heroHandKey}
            mode="action"
          />
        </details>
      )}
      {postflop && <ComboExplorer advice={postflop} />}
    </PanelShell>
  );
}

function SettlePanel({
  replay,
  step,
  heroSteps,
  steps,
  onJump,
}: {
  replay: AiReplayHand;
  step: ReplayStep;
  heroSteps: number[];
  steps: ReplayStep[];
  onJump(index: number): void;
}) {
  const namesById = new Map(replay.participants.map((participant) => [participant.id, participant.name]));
  const winners = replay.participants.filter((participant) => step.seats[participant.id]?.winner);
  return (
    <PanelShell
      eyebrow="本手结果"
      title={winners.length ? `${winners.map((winner) => winner.name).join("、")} 收池` : "本手结束"}
      badge={{
        text: `偏离度 ${replay.deviationScore === null ? "—" : Math.round(replay.deviationScore)}`,
        className: `is-deviation-badge is-${replay.deviationLevel}`,
      }}
    >
      <div className="replay-panel__lines">
        <span><small>底池</small><b>{step.wonPot ?? 0} ({formatBB(step.wonPot ?? 0, replay.bigBlind)})</b></span>
        <span>
          <small>我的盈亏</small>
          <b className={replay.heroProfitBB >= 0 ? "is-win" : "is-loss"}>
            {replay.heroProfitChips > 0 ? "+" : ""}{formatAmount(replay.heroProfitChips)} ({replay.heroProfitBB > 0 ? "+" : ""}{replay.heroProfitBB.toFixed(1)} BB)
          </b>
        </span>
        <span><small>整手评级</small><b className={`is-deviation-${replay.deviationLevel}`}>{DEVIATION_LABEL[replay.deviationLevel]}</b></span>
      </div>
      {replay.runouts.length > 1 && (
        <section className="replay-panel__section">
          <h4>多次发牌</h4>
          {replay.runouts.map((runout, index) => (
            <div className="replay-panel__runout" key={index}>
              <CardRow cards={runout.board} compact />
              <small>
                {runout.players.filter((player) => player.winner)
                  .map((player) => `${namesById.get(player.participantId) || "?"}${player.handType ? `（${player.handType}）` : ""}`)
                  .join("、") || "—"}
              </small>
            </div>
          ))}
        </section>
      )}
      {heroSteps.length > 0 && (
        <section className="replay-panel__section">
          <h4>我的决策回顾 · 点击回跳</h4>
          <div className="replay-panel__recap">
            {heroSteps.map((stepIndex) => {
              const heroStep = steps[stepIndex];
              const decision = heroStep.decision!;
              return (
                <button key={stepIndex} onClick={() => onJump(stepIndex)}>
                  <i className={`is-${decision.comparison.classification}`} />
                  <small>{STEP_STREET_LABEL[heroStep.street]}</small>
                  <span>{actionTagText(decision.actual.action, decision.actual.amountTo)}</span>
                  <b className={`is-${decision.comparison.classification}`}>
                    {CLASS_LABEL[decision.comparison.classification]}
                  </b>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </PanelShell>
  );
}

/* ── 详情页 ───────────────────────────────────────────── */

const TAB_STREETS: ReplayStreet[] = ["preflop", "flop", "turn", "river"];

function ReplayDetail({ replay, onBack }: { replay: AiReplayHand; onBack(): void }) {
  // Participant snapshots are persisted in seat order: SB, BB, early seats..., BTN.
  // Re-derive labels so replays saved before the position-label fix also render correctly.
  const displayParticipants: DisplayParticipant[] = useMemo(() => replay.participants.map((participant, seatIndex) => {
    const count = replay.participants.length;
    const actorIndex = seatIndex >= 2 ? seatIndex - 2 : count - 2 + seatIndex;
    return {
      ...participant,
      displayPosition: positionLabelByActionOrder(count, actorIndex),
    };
  }), [replay]);
  const participantsById = useMemo(
    () => new Map(displayParticipants.map((participant) => [participant.id, participant])),
    [displayParticipants]
  );
  const heroIndex = displayParticipants.findIndex((participant) => participant.type === "human");
  const hero = heroIndex >= 0 ? displayParticipants[heroIndex] : undefined;
  // Keep Hero pinned at the bottom while preserving the cyclic table adjacency.
  // The first rendered bot sits at lower-left, so it must be Hero's next seat,
  // and the last rendered bot at lower-right must be Hero's previous seat.
  const participantsAfterHero = heroIndex >= 0
    ? [
        ...displayParticipants.slice(heroIndex + 1),
        ...displayParticipants.slice(0, heroIndex),
      ]
    : displayParticipants;
  const bots = participantsAfterHero.filter((participant) => participant.type === "bot");
  const botSeats = REPLAY_BOT_SEATS[Math.min(9, bots.length)] || REPLAY_BOT_SEATS[9];
  const coords = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    if (hero) result[hero.id] = SEAT_COORDS.hero;
    bots.slice(0, 9).forEach((bot, index) => {
      result[bot.id] = SEAT_COORDS[botSeats[index]];
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.publicId]);

  const steps = useMemo(() => buildReplaySteps(replay), [replay]);
  const heroSteps = useMemo(
    () => steps.reduce<number[]>((result, step, index) => {
      if (step.heroDecisionIndex !== undefined) result.push(index);
      return result;
    }, []),
    [steps]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showBotCards, setShowBotCards] = useState(false);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const go = useCallback((index: number) => {
    setPlaying(false);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, index)));
  }, [steps.length]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1300);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [steps.length]);

  const streetMeta = useMemo(() => TAB_STREETS.map((street) => {
    const firstIndex = steps.findIndex((candidate) => candidate.street === street);
    const actionCount = steps.filter((candidate) => candidate.street === street && candidate.kind === "act").length;
    let cards: Card[] = [];
    const finalBoard = steps[steps.length - 1].board;
    if (street === "flop") cards = finalBoard.slice(0, 3);
    if (street === "turn") cards = finalBoard.slice(3, 4);
    if (street === "river") cards = finalBoard.slice(4, 5);
    return { street, firstIndex, actionCount, cards };
  }), [steps]);

  const timelineGroups = useMemo(() => {
    const groups: Array<{ street: ReplayStepStreet; indices: number[] }> = [];
    steps.forEach((candidate, index) => {
      const last = groups[groups.length - 1];
      if (!last || last.street !== candidate.street) {
        groups.push({ street: candidate.street, indices: [index] });
      } else {
        last.indices.push(index);
      }
    });
    return groups;
  }, [steps]);

  const goPrevHero = () => {
    for (let i = heroSteps.length - 1; i >= 0; i -= 1) {
      if (heroSteps[i] < stepIndex) return go(heroSteps[i]);
    }
    if (heroSteps.length) go(heroSteps[heroSteps.length - 1]);
  };
  const goNextHero = () => {
    for (let i = 0; i < heroSteps.length; i += 1) {
      if (heroSteps[i] > stepIndex) return go(heroSteps[i]);
    }
    if (heroSteps.length) go(heroSteps[0]);
  };

  const timelineDotMeta = (candidate: ReplayStep, index: number) => {
    if (candidate.kind === "deal" || candidate.kind === "street") {
      return { className: "replay-step-dot--street", label: `发${STEP_STREET_LABEL[candidate.street]}` };
    }
    if (candidate.kind === "settle") {
      return { className: "replay-step-dot--result", label: "结算" };
    }
    const decision = candidate.decision!;
    const actionText = actionTagText(decision.actual.action, decision.actual.amountTo);
    if (candidate.heroDecisionIndex !== undefined) {
      return {
        className: `replay-step-dot--hero is-${decision.comparison.classification}`,
        label: `我的决策 ${candidate.heroDecisionIndex}：${actionText}（${CLASS_LABEL[decision.comparison.classification]}）`,
      };
    }
    return {
      className: `replay-step-dot--bot is-${decision.comparison.classification}`,
      label: `${decision.actorName} ${actionText}（${CLASS_LABEL[decision.comparison.classification]}）`,
    };
  };

  return (
    <main className="replay-detail">
      <div className="replay-detail__mobile-back">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>我的复盘</Button>
      </div>
      <section className="replay-hero">
        <div className="replay-hero__title">
          <span>AI HAND REVIEW</span>
          <h1>{hero?.displayPosition || replay.heroPosition} · {replay.botCount + 1} 人桌复盘</h1>
          <p>{formatDate(replay.completedAt)} · 大盲 {replay.bigBlind} · 策略 {replay.strategyVersion}</p>
        </div>
        <Button
          className="replay-share"
          icon={<CopyOutlined />}
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
        >复制公开链接</Button>

        <div className="replay-hero__strip">
          <span><small>你的手牌</small><CardRow cards={replay.heroCards} compact /></span>
          <span>
            <small>公共牌</small>
            {replay.board.length ? <CardRow cards={replay.board} compact /> : <b><em>无</em></b>}
          </span>
          <span>
            <small>本手盈亏</small>
            <b className={`replay-hero__profit ${replay.heroProfitBB >= 0 ? "is-win" : "is-loss"}`}>
              <TrophyOutlined />
              {replay.heroProfitBB > 0 ? "+" : ""}{replay.heroProfitBB.toFixed(1)}bb
            </b>
          </span>
          <i className="replay-hero__divider" aria-hidden="true" />
          <span><small>已评分决策</small><b>{replay.scoredDecisionCount}</b></span>
          <span><small>整手偏差度</small><b className={`is-deviation-${replay.deviationLevel}`}>{replay.deviationScore === null ? "—" : Math.round(replay.deviationScore)} <em>{DEVIATION_LABEL[replay.deviationLevel]}</em></b></span>
          <span><small>严重偏差</small><b>{replay.severeDecisionCount} {replay.maxDecisionDeviation !== null && <em>峰值 {Math.round(replay.maxDecisionDeviation)}</em>}</b></span>
          <span><small>起始筹码</small><b>{hero ? (hero.startingStack / replay.bigBlind).toFixed(0) : "—"}bb</b></span>
        </div>
      </section>

      <section className="replay-workbench">
        <div className="replay-workbench__main">
          <nav className="replay-street-tabs" aria-label="按街道跳转">
            {streetMeta.map((meta) => (
              <button
                className={[
                  "replay-street-tab",
                  step.street === meta.street ? "is-active" : "",
                  meta.firstIndex < 0 ? "is-disabled" : meta.firstIndex > stepIndex && step.street !== meta.street ? "is-future" : "",
                ].join(" ")}
                disabled={meta.firstIndex < 0}
                onClick={() => go(meta.firstIndex)}
                key={meta.street}
              >
                <span>{STREET_LABEL[meta.street]}{meta.firstIndex >= 0 && <i>{meta.actionCount}</i>}</span>
                <small>
                  {meta.street === "preflop"
                    ? `${replay.participants.length} 人开局`
                    : meta.cards.length
                      ? meta.cards.map((card, index) => (
                          <em className={card.suit === "h" || card.suit === "d" ? "is-red" : ""} key={index}>
                            {rank(card.num)}{suitSymbol(card.suit)}
                          </em>
                        ))
                      : "未发生"}
                </small>
              </button>
            ))}
            <button
              className={`replay-street-tab replay-street-tab--result ${step.street === "result" ? "is-active" : ""}`}
              onClick={() => go(steps.length - 1)}
            >
              <span>结果 <i>🏁</i></span>
              <small>
                {replay.heroProfitBB > 0 ? "+" : ""}{replay.heroProfitBB.toFixed(1)}bb
              </small>
            </button>
          </nav>

          <ReplayStage
            replay={replay}
            participants={displayParticipants}
            coords={coords}
            step={step}
            showBotCards={showBotCards}
          />

          <div className="replay-controls">
            <div className="replay-controls__group">
              <button className="replay-ctl" onClick={() => go(0)} disabled={stepIndex === 0} aria-label="回到开局">⏮</button>
              <button className="replay-ctl" onClick={() => go(stepIndex - 1)} disabled={stepIndex === 0}>◀ 上一步</button>
              <button className="replay-ctl replay-ctl--primary" onClick={() => go(stepIndex + 1)} disabled={stepIndex >= steps.length - 1}>下一步 ▶</button>
              <button className="replay-ctl" onClick={() => go(steps.length - 1)} disabled={stepIndex >= steps.length - 1} aria-label="跳到结果">⏭</button>
            </div>
            {heroSteps.length > 0 && (
              <div className="replay-controls__group">
                <button className="replay-ctl" onClick={goPrevHero}>◁ 我的决策</button>
                <button className="replay-ctl" onClick={goNextHero}>我的决策 ▷</button>
              </div>
            )}
            <button
              className="replay-ctl"
              onClick={() => {
                if (playing) { setPlaying(false); return; }
                if (stepIndex >= steps.length - 1) setStepIndex(0);
                setPlaying(true);
              }}
            >
              {playing ? "⏸ 暂停" : "▶ 自动播放"}
            </button>
            <button
              className={`replay-ctl ${showBotCards ? "is-on" : ""}`}
              onClick={() => setShowBotCards((value) => !value)}
            >
              {showBotCards ? "隐藏 AI 手牌" : "显示 AI 手牌"}
            </button>
            <span className="replay-controls__step">第 <b>{stepIndex + 1}</b> / {steps.length} 步</span>
          </div>

          <div className="replay-step-timeline" aria-label="决策时间轴">
            {timelineGroups.map((group, groupIndex) => (
              <div
                className={`replay-step-group ${group.indices.includes(stepIndex) ? "is-active" : ""}`}
                key={`${group.street}-${groupIndex}`}
              >
                <small>{STEP_STREET_LABEL[group.street]}</small>
                <div>
                  {group.indices.map((index) => {
                    const meta = timelineDotMeta(steps[index], index);
                    return (
                      <button
                        className={`replay-step-dot ${meta.className} ${index === stepIndex ? "is-current" : ""}`}
                        title={meta.label}
                        aria-label={meta.label}
                        onClick={() => go(index)}
                        key={index}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="replay-step-legend">
            <span><i className="is-recommended" />主推荐</span>
            <span><i className="is-mixed-acceptable" />混合策略</span>
            <span><i className="is-low-frequency" />低频选择</span>
            <span><i className="is-deviation" />策略偏差</span>
            <span><i className="is-unscored" />未评分</span>
            <span className="replay-step-legend__hint">大圆点 = 我的决策，小圆点 = AI 行动，颜色 = 与策略的偏差评级</span>
          </div>
        </div>

        <aside className="replay-workbench__rail">
          {step.kind === "deal" && <DealPanel replay={replay} participants={displayParticipants} />}
          {step.kind === "street" && <StreetPanel replay={replay} step={step} />}
          {step.kind === "act" && step.heroDecisionIndex !== undefined && (
            <HeroPanel
              replay={replay}
              step={step}
              heroDecisionTotal={heroSteps.length}
              participant={participantsById.get(step.decision!.actorId)}
            />
          )}
          {step.kind === "act" && step.heroDecisionIndex === undefined && (
            <BotPanel replay={replay} step={step} participant={participantsById.get(step.decision!.actorId)} />
          )}
          {step.kind === "settle" && (
            <SettlePanel replay={replay} step={step} heroSteps={heroSteps} steps={steps} onJump={go} />
          )}
        </aside>
      </section>
    </main>
  );
}

export function AiReplayPage() {
  const [selectedId, setSelectedId] = useState<string | null>(routeReplayId());
  const [list, setList] = useState<AiReplayListResponse>({ items: [], total: 0 });
  const [detail, setDetail] = useState<AiReplayHand | null>(null);
  const [listLoading, setListLoading] = useState(Boolean(localStorage["token"]));
  const [detailLoading, setDetailLoading] = useState(Boolean(selectedId));
  const [error, setError] = useState("");

  useEffect(() => {
    const popstate = () => setSelectedId(routeReplayId());
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);

  useEffect(() => {
    if (!localStorage["token"]) return;
    setListLoading(true);
    api<AiReplayListResponse>("/api/me/ai-replays", true)
      .then(setList)
      .catch((requestError) => setError(String(requestError.message || requestError)))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setError("");
    api<AiReplayHand>(`/api/ai-replays/${selectedId}`)
      // Re-grade stored decisions so older replays also use the current
      // classification thresholds and deterministic-chart softening.
      .then((hand) => setDetail({
        ...hand,
        decisions: hand.decisions.map((decision) => decision.advice
          ? {
              ...decision,
              comparison: buildAiReplayComparison({
                action: decision.actual.action,
                amountTo: decision.actual.amountTo,
                advice: decision.advice,
                bigBlind: hand.bigBlind,
              }),
            }
          : decision),
      }))
      .catch((requestError) => setError(String(requestError.message || requestError)))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const ownedIds = useMemo(() => new Set(list.items.map((item) => item.publicId)), [list.items]);
  const navigate = (id: string | null) => {
    window.history.pushState({}, "", id ? `/replays/${id}` : "/replays");
    setSelectedId(id);
  };

  return (
    <div className={`replay-page ${selectedId ? "has-selection" : ""}`}>
      <aside className={`replay-sidebar ${list.items.length === 0 && selectedId ? "is-public" : ""}`}>
        <header>
          <button onClick={() => { window.location.href = "/"; }}><ArrowLeftOutlined /></button>
          <div><span>RIVER CLUB</span><strong>AI 牌局复盘</strong></div>
          <b>{list.total}/100</b>
        </header>
        <div className="replay-sidebar__intro">
          <small>RECENT AI HANDS</small>
          <h2>最近对局</h2>
          <p>根据行动频率与下注尺度计算偏差度，快速定位需要重点复盘的牌局。</p>
        </div>
        <div className="replay-list">
          {listLoading ? <Spin /> : list.items.length ? list.items.map((item) => (
            <ReplayListItem key={item.publicId} replay={item} active={item.publicId === selectedId} onClick={() => navigate(item.publicId)} />
          )) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={localStorage["token"] ? "还没有完成的 AI 对局" : "登录后查看你的复盘列表"} />
          )}
        </div>
      </aside>
      <section className="replay-main">
        {detailLoading ? <div className="replay-loading"><Spin size="large" /></div> : detail ? (
          <ReplayDetail replay={detail} onBack={() => navigate(null)} key={detail.publicId} />
        ) : (
          <div className="replay-empty">
            {error ? <><strong>暂时无法打开复盘</strong><p>{error}</p></> : <><RobotOutlined /><strong>选择一手牌开始复盘</strong><p>桌面端可在左侧切换牌局，移动端会进入独立详情页。</p></>}
          </div>
        )}
        {detail && !ownedIds.has(detail.publicId) && <span className="replay-public-badge">公开分享的牌局</span>}
      </section>
    </div>
  );
}
