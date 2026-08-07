import type { PreflopGrid } from "../../gto/preflop/types";
import { handStrength } from "../../gto/preflop/hand";
import type { HandStrength } from "../../gto/preflop/hand";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

export function gridCellForHand(handKey: string): { r: number; c: number } {
  return { r: RANKS.indexOf(handKey[0]), c: RANKS.indexOf(handKey[1]) };
}

/** 0=fold, 1=call, 2=raise, 3=allin. */
const GRID_COLORS = ["#343a40", "#1d4ed8", "#15803d", "#7c3aed"];
const GRID_LABELS = ["弃牌", "跟注", "加注", "全下"];
const STRENGTH_COLORS: Record<HandStrength, string> = {
  strong: "#e11d48",
  medium: "#d97706",
  weak: "#475569",
};
const STRENGTH_LABELS: Record<HandStrength, string> = {
  strong: "强牌",
  medium: "中等",
  weak: "弱牌",
};

export default function PreflopRangeGrid({
  grid,
  heroHandKey,
  mode = "action",
}: {
  grid: PreflopGrid;
  heroHandKey?: string;
  mode?: "action" | "strength";
}) {
  const heroPos = heroHandKey ? gridCellForHand(heroHandKey) : null;

  return (
    <div className="range-grid">
      <div className="range-grid__row range-grid__row--header">
        <span className="range-grid__rank" />
        {grid.cols.map((rank) => (
          <span className="range-grid__rank" key={rank}>
            {rank}
          </span>
        ))}
      </div>
      {grid.cells.map((row, i) => (
        <div className="range-grid__row" key={grid.rows[i]}>
          <span className="range-grid__rank">{grid.rows[i]}</span>
          {row.map((code, j) => {
            const isHero = !!heroPos && heroPos.r === i && heroPos.c === j;
            const rank1 = grid.rows[i];
            const rank2 = grid.cols[j];
            const handKey =
              i === j
                ? rank1 + rank2
                : i < j
                ? rank1 + rank2 + "s"
                : rank2 + rank1 + "o";
            const tier =
              mode === "strength" ? handStrength(handKey) : undefined;
            const background =
              mode === "strength"
                ? STRENGTH_COLORS[tier as HandStrength]
                : GRID_COLORS[code];
            const label =
              mode === "strength"
                ? STRENGTH_LABELS[tier as HandStrength]
                : GRID_LABELS[code];
            return (
              <span
                key={j}
                className={`range-grid__cell range-grid__cell--${code} ${
                  isHero ? "is-hero" : ""
                }`}
                style={{ background }}
                title={label}
              >
                {handKey}
              </span>
            );
          })}
        </div>
      ))}
      <div className="range-grid__legend">
        {mode === "strength"
          ? (Object.keys(STRENGTH_LABELS) as HandStrength[]).map((tier) => (
              <span className="range-grid__legend-item" key={tier}>
                <i style={{ background: STRENGTH_COLORS[tier] }} />
                {STRENGTH_LABELS[tier]}
              </span>
            ))
          : GRID_LABELS.map((label, code) => (
              <span className="range-grid__legend-item" key={label}>
                <i style={{ background: GRID_COLORS[code] }} />
                {label}
              </span>
            ))}
        <span className="range-grid__legend-item">
          <i className="is-hero-dot" />
          你的手牌（黄框）
        </span>
      </div>
    </div>
  );
}
