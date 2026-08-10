import type { GtoLogEntry } from "../../ApiType";
import { useEffect, useState } from "react";
import type {
  ChartPosition,
  PreflopAction,
  PreflopAdvice,
} from "../../gto/preflop/types";
import PreflopRangeGrid from "./PreflopRangeGrid";
import PostflopAdviceCard from "./PostflopAdviceCard";
import GtoTips from "./GtoTips";

const ACTION_META: Record<
  PreflopAction,
  { label: string; color: string }
> = {
  fold: { label: "弃牌", color: "#8a8f98" },
  call: { label: "跟注", color: "#3b82f6" },
  raise: { label: "加注", color: "#22c55e" },
  allin: { label: "全下", color: "#a855f7" },
};

export default function GtoAdviceCard({
  entry,
  stale,
  globalCollapsed,
}: {
  entry: GtoLogEntry;
  stale?: boolean;
  globalCollapsed?: boolean;
}) {
  if (entry.data.kind === "postflop") {
    return (
      <PostflopAdviceCard
        entry={entry}
        stale={stale}
        globalCollapsed={globalCollapsed}
      />
    );
  }
  return (
    <PreflopGtoAdviceCard
      entry={entry}
      stale={stale}
      globalCollapsed={globalCollapsed}
    />
  );
}

function PreflopGtoAdviceCard({
  entry,
  stale,
  globalCollapsed,
}: {
  entry: GtoLogEntry;
  stale?: boolean;
  globalCollapsed?: boolean;
}) {
  const advice = entry.data as PreflopAdvice;
  const [expanded, setExpanded] = useState(!stale && !globalCollapsed);
  useEffect(() => {
    if (stale) setExpanded(false);
  }, [stale]);
  // 仅响应全局眼睛切换：重新按全局设置决定展开状态，stale 卡片保持折叠。
  useEffect(() => {
    if (stale) return;
    setExpanded(!globalCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalCollapsed]);

  const rfiTabs: ChartPosition[] = ["UTG", "MP", "CO", "BTN", "SB"];
  const heroChart = advice.heroPosition;
  const spotTab: ChartPosition = rfiTabs.includes(heroChart)
    ? heroChart
    : "BB";
  const tabs: ChartPosition[] = rfiTabs.includes(heroChart)
    ? rfiTabs
    : ["BB", ...rfiTabs];
  const [tab, setTab] = useState<ChartPosition>(spotTab);
  const [gridMode, setGridMode] = useState<"action" | "strength">("strength");
  const dist = advice.actionDistribution;
  const hero = advice.hero;
  const recMeta = ACTION_META[advice.recommended];
  const rows = (Object.keys(ACTION_META) as PreflopAction[])
    .filter((key) => dist[key] > 0)
    .map((key) => ({
      key,
      ...ACTION_META[key],
      value: dist[key],
    }))
    .sort((a, b) => b.value - a.value);

  const activeGrid =
    tab === heroChart ? advice.rangeGrid : advice.rfiGrids[tab];
  const sizeText =
    advice.recommendedSizeBB != null
      ? ` ${advice.recommendedSizeBB}bb${
          advice.recommendedSizeChips != null
            ? `（${advice.recommendedSizeChips} 筹码）`
            : ""
        }`
      : "";

  if (!expanded) {
    return (
      <div
        className="gto-advice-card gto-advice-card--collapsed"
        onClick={() => setExpanded(true)}
        role="button"
      >
        <span className="gto-advice-card__badge">GTO</span>
        <span className="gto-advice-card__summary">翻前</span>
        <span className="gto-advice-card__toggle">
          {stale ? "已过行动阶段 ▸" : "▸"}
        </span>
      </div>
    );
  }

  return (
    <div className="gto-advice-card" style={{ borderColor: recMeta.color }}>
      <div className="gto-advice-card__head">
        <span className="gto-advice-card__badge">GTO</span>
        <strong>翻前建议</strong>
        <small>
          {advice.heroPositionLabel} · {advice.stackBB}bb · 底池{" "}
          {advice.potBB}bb
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

      <div className="gto-advice-card__main">
        <span
          className="gto-advice-card__action"
          style={{ color: recMeta.color }}
        >
          {recMeta.label}
          {sizeText}
        </span>
        {hero && (
          <span className="gto-advice-card__hero">
            你拿 {hero.hand}：
            {hero.message.replace(/（频率约 [\d.]+%）/, "")}
            <em className="gto-advice-card__hero-freq">
              手牌频率 {hero.frequency}%
            </em>
          </span>
        )}
      </div>

      <div className="gto-advice-card__bars-title">
        全范围行动频率（组合加权，非单牌概率）
      </div>
      <div className="gto-advice-card__bars">
        {rows.map((row) => (
          <div className="gto-advice-card__bar-row" key={row.key}>
            <span style={{ color: row.color }}>{row.label}</span>
            <div className="gto-advice-card__bar">
              <div
                className="gto-advice-card__bar-fill"
                style={{ width: `${Math.max(row.value, 2)}%`, background: row.color }}
              />
            </div>
            <em>{row.value}%</em>
          </div>
        ))}
      </div>
      <div className="gto-advice-card__range">
        <div className="gto-advice-card__mode">
          <button
            type="button"
            className={gridMode === "action" ? "is-active" : ""}
            onClick={() => setGridMode("action")}
          >
            动作
          </button>
          <button
            type="button"
            className={gridMode === "strength" ? "is-active" : ""}
            onClick={() => setGridMode("strength")}
          >
            牌力
          </button>
        </div>
        <div className="gto-advice-card__tabs">
          {tabs.map((pos) => (
            <button
              type="button"
              key={pos}
              className={`gto-advice-card__tab ${
                tab === pos ? "is-active" : ""
              } ${heroChart === pos ? "is-current" : ""}`}
              onClick={() => setTab(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
        <div className="gto-advice-card__grid-title">
          {tab === heroChart
            ? `${advice.heroPositionLabel}（你的位置） · ${advice.scenario}`
            : `${tab} · 开池加注（RFI）`}
        </div>
        {activeGrid && (
          <PreflopRangeGrid
            grid={activeGrid}
            heroHandKey={advice.heroHandKey}
            mode={gridMode}
          />
        )}
      </div>

      <div className="gto-advice-card__foot">
        <small>参考范围：{advice.dataSource}</small>
      </div>

      <div
        className="gto-advice-card__bottom-action"
        data-testid="gto-bottom-action"
      >
        <small className="gto-advice-card__bottom-action-title">行动建议</small>
        <span
          className="gto-advice-card__action"
          style={{ color: recMeta.color }}
        >
          {recMeta.label}
          {sizeText}
        </span>
      </div>

      <GtoTips
        hint={
          <>
            频率条是<strong>整个参考范围</strong>的组合加权占比；对你手里的{" "}
            {hero ? hero.hand : "手牌"}，图表建议{" "}
            <strong>
              {recMeta.label}
              {sizeText}
            </strong>
            {hero ? `（手牌频率 ${hero.frequency}%）` : ""}。
          </>
        }
        adjustments={advice.adjustments}
        limitations={advice.limitations}
      />
    </div>
  );
}
