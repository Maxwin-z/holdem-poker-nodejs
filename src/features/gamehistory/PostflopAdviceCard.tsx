import type { GtoLogEntry } from "../../ApiType";
import { useEffect, useState } from "react";
import type {
  PostflopAction,
} from "../../gto/postflop/types";

const ACTION_META: Record<
  PostflopAction,
  { label: string; color: string }
> = {
  fold: { label: "弃牌", color: "#8a8f98" },
  check: { label: "过牌", color: "#64748b" },
  call: { label: "跟注", color: "#3b82f6" },
  bet: { label: "下注", color: "#22c55e" },
  raise: { label: "加注", color: "#f59e0b" },
  allin: { label: "全下", color: "#a855f7" },
};

const STREET_LABEL: Record<string, string> = {
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
};

function cardColor(suit: string): string {
  return suit === "h" || suit === "d" ? "#d85b5d" : "#dfe8e4";
}

export default function PostflopAdviceCard({
  entry,
  stale,
}: {
  entry: GtoLogEntry;
  stale?: boolean;
}) {
  const [expanded, setExpanded] = useState(!stale);
  useEffect(() => {
    if (stale) setExpanded(false);
  }, [stale]);

  const advice = entry.data;
  if (advice.kind !== "postflop") return null;
  const hero = advice.hero;
  const recMeta = ACTION_META[advice.recommended];
  const dist = advice.actionDistribution;
  const rows = (Object.keys(ACTION_META) as PostflopAction[])
    .filter((key) => dist[key] > 0)
    .map((key) => ({
      key,
      ...ACTION_META[key],
      value: dist[key],
    }))
    .sort((a, b) => b.value - a.value);
  const lines = rows.map((row) => ({
    ...row,
    size:
      (row.key === "bet" || row.key === "raise" || row.key === "allin") &&
      advice.recommendedSizeChips != null
        ? advice.recommendedSizeChips
        : undefined,
  }));

  if (!expanded) {
    return (
      <div
        className="gto-advice-card gto-advice-card--collapsed"
        onClick={() => setExpanded(true)}
        role="button"
      >
        <span className="gto-advice-card__badge">GTO</span>
        <span className="gto-advice-card__summary">
          {STREET_LABEL[advice.street]} ·{" "}
          {hero ? `你拿 ${hero.hand}` : ""} · {recMeta.label}{" "}
          {dist[advice.recommended]}%
        </span>
        <span className="gto-advice-card__toggle">
          {stale ? "已过行动阶段 ▸" : "▸"}
        </span>
      </div>
    );
  }

  return (
    <div className="gto-advice-card">
      <div className="gto-advice-card__head">
        <span className="gto-advice-card__badge">GTO</span>
        <strong>{STREET_LABEL[advice.street]}建议</strong>
        <small>
          {advice.heroPositionLabel} · 底池 {advice.potChips} 筹码 ·{" "}
          {advice.effectiveStackBB}bb
        </small>
        <button
          type="button"
          className="gto-advice-card__collapse"
          aria-label="折叠"
          onClick={() => setExpanded(false)}
        >
          −
        </button>
      </div>

      <div className="postflop-advice__board">
        {advice.board.map((card, i) => {
          const suit = card.slice(-1);
          return (
            <span
              className="postflop-advice__board-card"
              key={`${card}-${i}`}
              style={{ color: cardColor(suit) }}
            >
              {card.slice(0, -1)}
              {suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : "♠"}
            </span>
          );
        })}
      </div>

      <div className="gto-advice-card__main">
        <div className="gto-advice-card__actions">
          {lines.map((line) => (
            <span
              key={line.key}
              className="gto-advice-card__action"
              style={{ color: line.color }}
            >
              {line.label}
              {line.size !== undefined ? ` ${line.size} 筹码` : ""} {line.value}%
            </span>
          ))}
        </div>
        {hero && (
          <span className="gto-advice-card__hero">
            你拿 {hero.hand}：{hero.message}
            <em className="gto-advice-card__hero-freq">
              推荐频率 {hero.frequency}%
            </em>
          </span>
        )}
      </div>

      <div className="postflop-advice__equity">
        {advice.equityVsRange !== undefined && (
          <span>
            对继续范围权益{" "}
            <strong>{Math.round(advice.equityVsRange * 100)}%</strong>
            {advice.equityRangeCombos !== undefined
              ? `（${advice.equityRangeCombos} 组合）`
              : ""}
          </span>
        )}
        <span>
          对随机权益{" "}
          <strong>{Math.round(advice.equityVsRandom * 100)}%</strong>
        </span>
      </div>

      <div className="gto-advice-card__bars-title">
        行动频率分布（GTO 混合策略）
      </div>
      <div className="gto-advice-card__bars">
        {rows.map((row) => (
          <div className="gto-advice-card__bar-row" key={row.key}>
            <span style={{ color: row.color }}>{row.label}</span>
            <div className="gto-advice-card__bar">
              <div
                className="gto-advice-card__bar-fill"
                style={{
                  width: `${Math.max(row.value, 2)}%`,
                  background: row.color,
                }}
              />
            </div>
            <em>{row.value}%</em>
          </div>
        ))}
      </div>
      <div className="gto-advice-card__hint">
        频率条是该局面<strong>GTO 混合策略</strong>的占比；推荐动作为其中
        频率最高的一项，可参考分布做混合。
      </div>

      {advice.notes.length > 0 && (
        <div className="postflop-advice__notes">
          {advice.notes.map((note, i) => (
            <small key={i}>· {note}</small>
          ))}
        </div>
      )}

      {((advice.limitations && advice.limitations.length > 0) ||
        (advice.adjustments && advice.adjustments.length > 0)) && (
        <div className="gto-advice-card__insight">
          {advice.limitations && advice.limitations.length > 0 && (
            <div className="gto-advice-card__insight-group">
              <div className="gto-advice-card__insight-title">
                近似 / 简化说明
              </div>
              {advice.limitations.map((note, i) => (
                <small key={`lim-${i}`}>· {note}</small>
              ))}
            </div>
          )}
          {advice.adjustments && advice.adjustments.length > 0 && (
            <div className="gto-advice-card__insight-group">
              <div className="gto-advice-card__insight-title">
                实际情况偏移建议
              </div>
              {advice.adjustments.map((note, i) => (
                <small key={`adj-${i}`}>· {note}</small>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="gto-advice-card__foot">
        <small>参考范围：{advice.dataSource}</small>
      </div>
    </div>
  );
}
