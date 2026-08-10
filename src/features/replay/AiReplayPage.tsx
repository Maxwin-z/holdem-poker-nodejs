import {
  ArrowLeftOutlined,
  CopyOutlined,
  RobotOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Button, Empty, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { Card } from "../../ApiType";
import { positionLabelByActionOrder } from "../../gto/preflop/positions";
import type { PostflopAdvice } from "../../gto/postflop/types";
import { classifyAiReplaySize } from "../../shared/aiReplay";
import type {
  AiReplayDeviationLevel,
  AiReplayDecision,
  AiReplayHand,
  AiReplayListResponse,
  AiReplaySummary,
  ReplayStreet,
} from "../../shared/aiReplay";
import PreflopRangeGrid from "../gamehistory/PreflopRangeGrid";
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
      text: `实际行动仅以${probability !== undefined ? ` ${formatAmount(probability)}%` : "较低"}频率出现，存在明显偏差`,
    });
  } else if (decision.comparison.classification === "deviation") {
    assessments.push({ icon: "❌", tone: "danger", text: "实际行动不在当前 GTO 参考策略中" });
  } else {
    assessments.push({ icon: "⚠️", tone: "warning", text: "当前行动缺少可用的 GTO 评分" });
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

function ReplayTableSeat({
  participant,
  seat,
  bigBlind,
}: {
  participant: AiReplayHand["participants"][number];
  seat: string;
  bigBlind: number;
}) {
  const isBot = participant.type === "bot";
  const endingStack = participant.endingStack ?? participant.startingStack;
  return (
    <article className={`replay-table-seat replay-table-seat--${seat} ${isBot ? "is-bot" : "is-hero"}`}>
      <div className="replay-table-seat__cards">
        <CardRow cards={participant.cards} compact />
      </div>
      <div className="replay-table-seat__profile">
        <span className="replay-table-seat__avatar">
          {isBot ? <RobotOutlined /> : participant.name.slice(0, 1)}
        </span>
        <span className="replay-table-seat__copy">
          <span>
            <strong>{participant.name}</strong>
            <em>{isBot ? "AI" : "玩家"}</em>
          </span>
          <b>{(endingStack / bigBlind).toFixed(1)}bb</b>
        </span>
      </div>
      <span className="replay-table-seat__position">{participant.position}</span>
    </article>
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

function BotSamplingChart({ decision }: { decision: AiReplayDecision }) {
  const choices = (decision.botStrategy?.canonicalChoices || []) as Array<{
    action?: string; probability?: number; sizeChips?: number;
  }>;
  if (!decision.botStrategy || choices.length === 0) return null;
  const distribution = choices.reduce<Record<string, number>>((result, choice) => {
    if (choice.action) result[choice.action] = Number(choice.probability || 0) * 100;
    return result;
  }, {});
  return (
    <details className="bot-strategy">
      <summary><RobotOutlined /> AI 决策过程</summary>
      <div className="bot-strategy__body">
        <div className="bot-strategy__meta">
          <span>策略源 <b>{decision.botStrategy.source}</b></span>
          {decision.botStrategy.sample !== undefined && (
            <span>随机采样 <b>{decision.botStrategy.sample.toFixed(4)}</b></span>
          )}
        </div>
        <DistributionChart distribution={distribution} actual={decision.actual.action} />
        <p>机器人会在校准后的混合策略中按概率采样，因此实际行动不一定等于最高频动作。</p>
      </div>
    </details>
  );
}

function DecisionCard({
  decision,
  holeCards,
  displayPosition,
  bigBlind,
  targetId,
  active,
}: {
  decision: AiReplayDecision;
  holeCards: Card[];
  displayPosition: string;
  bigBlind: number;
  targetId: string;
  active: boolean;
}) {
  const advice = decision.advice;
  const preflop = advice?.kind === "preflop" ? advice : undefined;
  const postflop = advice?.kind === "postflop" ? advice : undefined;
  const distribution = advice
    ? (preflop?.hero?.actionDistribution || advice.actionDistribution) as unknown as Record<string, number>
    : {};
  const recommendation = decision.comparison.recommendedAction;
  const sizes = advice ? strategyActionSizes(advice) : {};
  const assessments = advice ? buildDecisionAssessments(decision, advice, sizes, bigBlind) : [];
  return (
    <article
      className={`decision-card decision-card--action-${actionTone(decision.actual.action)} ${active ? "is-quick-nav-active" : ""}`}
      id={targetId}
      tabIndex={-1}
    >
      <header className="decision-card__header">
        <span className={`decision-card__avatar ${decision.actorType === "bot" ? "is-bot" : ""}`}>
          {decision.actorType === "bot" ? <RobotOutlined /> : decision.actorName.slice(0, 1)}
        </span>
        <div>
          <strong>{decision.actorName}</strong>
          <small>{displayPosition} · {decision.actorType === "bot" ? "AI" : "玩家"}</small>
        </div>
        <span className={`decision-card__actual is-${actionTone(decision.actual.action)}`}>
          <small>实际行动</small>
          <b>{ACTION_LABEL[decision.actual.action] || decision.actual.action}</b>
          {decision.actual.amountTo !== undefined && <em>到 {decision.actual.amountTo}</em>}
        </span>
        <span className={`decision-card__grade is-${decision.comparison.classification}`}>
          {CLASS_LABEL[decision.comparison.classification]}
        </span>
      </header>

      <div className="decision-card__cards">
        <span>
          <small>{decision.actorType === "human" ? "你的手牌" : `${decision.actorName} 手牌`}</small>
          <CardRow cards={holeCards} compact />
        </span>
        <span>
          <small>当前公共牌</small>
          {decision.context.board.length > 0 ? (
            <CardRow cards={decision.context.board} compact />
          ) : (
            <em>翻前暂无公共牌</em>
          )}
        </span>
      </div>

      <div className="decision-metrics">
        <span><small>行动前底池</small><b>{decision.context.potBefore}</b></span>
        <span><small>需要跟注</small><b>{decision.context.amountToCall}</b></span>
        <span><small>策略主推荐</small><b>{recommendation ? ACTION_LABEL[recommendation] || recommendation : "—"}</b></span>
        <span><small>实际动作频率</small><b>{decision.comparison.actualActionProbability ?? "—"}{decision.comparison.actualActionProbability !== undefined ? "%" : ""}</b></span>
      </div>

      {advice && (
        <div className="decision-card__analysis">
          <section>
            <h4>行动频率</h4>
            <DistributionChart distribution={distribution} actual={decision.actual.action} sizes={sizes} />
          </section>
          <section className="decision-card__why">
            <h4>差异分析</h4>
            {assessments.map((assessment, index) => (
              <p className={`decision-assessment is-${assessment.tone}`} key={index}>
                <b>{assessment.icon}</b><span>{assessment.text}</span>
              </p>
            ))}
            {postflop?.reasoning && <p className="is-reasoning">ℹ️ 策略逻辑：{postflop.reasoning}</p>}
            {advice.notes.map((note, index) => <p className="is-note" key={`note-${index}`}>ℹ️ {note}</p>)}
          </section>
        </div>
      )}

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

      {preflop && (
        <details className="preflop-range-panel">
          <summary>查看 {displayPosition} 策略范围表</summary>
          <PreflopRangeGrid
            grid={preflop.rangeGrid}
            heroHandKey={preflop.heroHandKey}
            mode="action"
          />
        </details>
      )}
      {postflop && <ComboExplorer advice={postflop} />}
      <BotSamplingChart decision={decision} />
    </article>
  );
}

function ReplayDetail({ replay, onBack }: { replay: AiReplayHand; onBack(): void }) {
  // Participant snapshots are persisted in seat order: SB, BB, early seats..., BTN.
  // Re-derive labels so replays saved before the position-label fix also render correctly.
  const displayParticipants = replay.participants.map((participant, seatIndex) => {
    const count = replay.participants.length;
    const actorIndex = seatIndex >= 2 ? seatIndex - 2 : count - 2 + seatIndex;
    return {
      ...participant,
      position: positionLabelByActionOrder(count, actorIndex),
    };
  });
  const cardsByParticipant = new Map(
    displayParticipants.map((participant) => [participant.id, participant.cards])
  );
  const positionsByParticipant = new Map(
    displayParticipants.map((participant) => [participant.id, participant.position])
  );
  const streets = (["preflop", "flop", "turn", "river"] as ReplayStreet[])
    .map((street) => ({ street, decisions: replay.decisions.filter((decision) => decision.street === street) }))
    .filter((entry) => entry.decisions.length > 0);
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
  const quickNavGroups = streets.map(({ street, decisions }) => ({
    street,
    targetId: `replay-street-${street}`,
    decisions: decisions.map((decision) => ({
      decision,
      targetId: `replay-decision-${decision.id}`,
      position: positionsByParticipant.get(decision.actorId) || decision.position,
    })),
  }));
  const [activeTarget, setActiveTarget] = useState(quickNavGroups[0]?.targetId || "");

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>(".replay-main");
    const targetIds = quickNavGroups.reduce<string[]>((ids, group) => [
      ...ids,
      group.targetId,
      ...group.decisions.map((item) => item.targetId),
    ], []);
    if (!scrollRoot || targetIds.length === 0) return;
    setActiveTarget(targetIds[0]);
    const updateActiveTarget = () => {
      const focusLine = scrollRoot.getBoundingClientRect().top + 24;
      let nextTarget = targetIds[0];
      targetIds.forEach((targetId) => {
        const element = document.getElementById(targetId);
        if (element && element.getBoundingClientRect().top <= focusLine) nextTarget = targetId;
      });
      setActiveTarget((current) => current === nextTarget ? current : nextTarget);
    };
    updateActiveTarget();
    scrollRoot.addEventListener("scroll", updateActiveTarget, { passive: true });
    window.addEventListener("resize", updateActiveTarget);
    return () => {
      scrollRoot.removeEventListener("scroll", updateActiveTarget);
      window.removeEventListener("resize", updateActiveTarget);
    };
    // A replay is immutable after completion; the public id is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.publicId]);

  const navigateToTarget = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (!element) return;
    setActiveTarget(targetId);
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => element.focus({ preventScroll: true }), 350);
  };
  return (
    <main className="replay-detail">
      <div className="replay-detail__mobile-back">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>我的复盘</Button>
      </div>
      <section className="replay-hero">
        <div className="replay-hero__title">
          <span>AI HAND REVIEW</span>
          <h1>{hero?.position || replay.heroPosition} · {replay.botCount + 1} 人桌复盘</h1>
          <p>{formatDate(replay.completedAt)} · 大盲 {replay.bigBlind} · 策略 {replay.strategyVersion}</p>
        </div>
        <Button
          className="replay-share"
          icon={<CopyOutlined />}
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
        >复制公开链接</Button>

        <div className="replay-result-card">
          <span><small>你的手牌</small><CardRow cards={replay.heroCards} /></span>
          <span><small>公共牌</small><CardRow cards={replay.board} compact /></span>
          <strong className={replay.heroProfitBB >= 0 ? "is-win" : "is-loss"}>
            <TrophyOutlined />
            {replay.heroProfitBB > 0 ? "+" : ""}{replay.heroProfitBB.toFixed(1)}bb
          </strong>
        </div>

        <div className="replay-kpis">
          <span><small>已评分玩家决策</small><b>{replay.scoredDecisionCount}</b></span>
          <span><small>整手偏差度</small><b className={`is-deviation-${replay.deviationLevel}`}>{replay.deviationScore === null ? "—" : Math.round(replay.deviationScore)} <em>{DEVIATION_LABEL[replay.deviationLevel]}</em></b></span>
          <span><small>严重偏差</small><b>{replay.severeDecisionCount} <em>{replay.maxDecisionDeviation === null ? "" : `峰值 ${Math.round(replay.maxDecisionDeviation)}`}</em></b></span>
          <span><small>起始筹码</small><b>{hero ? (hero.startingStack / replay.bigBlind).toFixed(0) : "—"}bb</b></span>
        </div>
      </section>

      <section className="replay-table-stage" aria-label="牌桌座位与手牌">
        <div className="replay-table-felt" aria-hidden="true"><i /></div>
        <div className="replay-table-center">
          <small>FINAL BOARD</small>
          <CardRow cards={replay.board} compact />
          <span>盲注 {replay.smallBlind} / {replay.bigBlind}</span>
        </div>
        {bots.slice(0, 9).map((participant, index) => (
          <ReplayTableSeat
            participant={participant}
            seat={botSeats[index]}
            bigBlind={replay.bigBlind}
            key={participant.id}
          />
        ))}
        {hero && (
          <ReplayTableSeat participant={hero} seat="hero" bigBlind={replay.bigBlind} />
        )}
      </section>

      <section className="replay-timeline">
        {streets.map(({ street, decisions }) => (
          <section
            className={`replay-street ${activeTarget === `replay-street-${street}` ? "is-quick-nav-active" : ""}`}
            id={`replay-street-${street}`}
            key={street}
            tabIndex={-1}
          >
            <header>
              <span>{STREET_LABEL[street]}</span>
              {decisions[0].context.board.length > 0 && <CardRow cards={decisions[0].context.board} compact />}
              <i>{decisions.length} 次决策</i>
            </header>
            {decisions.map((decision) => (
              <DecisionCard
                decision={decision}
                holeCards={cardsByParticipant.get(decision.actorId) || []}
                displayPosition={positionsByParticipant.get(decision.actorId) || decision.position}
                bigBlind={replay.bigBlind}
                targetId={`replay-decision-${decision.id}`}
                active={activeTarget === `replay-decision-${decision.id}`}
                key={decision.id}
              />
            ))}
          </section>
        ))}
      </section>

      <nav className="replay-quick-nav" aria-label="牌局快速跳转">
        <header>
          <span>快速定位</span>
          <b>{replay.decisionCount}</b>
        </header>
        <div className="replay-quick-nav__body">
          {quickNavGroups.map((group) => {
            const groupTargets = [group.targetId, ...group.decisions.map((item) => item.targetId)];
            const groupActive = groupTargets.includes(activeTarget);
            return (
              <section className={groupActive ? "is-active" : ""} key={group.street}>
                <button
                  className="replay-quick-nav__street"
                  type="button"
                  aria-current={activeTarget === group.targetId ? "location" : undefined}
                  onClick={() => navigateToTarget(group.targetId)}
                >
                  <span>{STREET_LABEL[group.street]}</span>
                  <small>{group.decisions.length}</small>
                </button>
                <div>
                  {group.decisions.map(({ decision, targetId, position }) => (
                    <button
                      className={`replay-quick-nav__action is-${actionTone(decision.actual.action)}`}
                      type="button"
                      aria-current={activeTarget === targetId ? "location" : undefined}
                      title={`${position} ${decision.actorName}：${ACTION_LABEL[decision.actual.action] || decision.actual.action}`}
                      onClick={() => navigateToTarget(targetId)}
                      key={targetId}
                    >
                      <i />
                      <span><b>{position}</b>{decision.actorName}</span>
                      <small>{ACTION_LABEL[decision.actual.action] || decision.actual.action}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </nav>
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
      .then(setDetail)
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
          <ReplayDetail replay={detail} onBack={() => navigate(null)} />
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
