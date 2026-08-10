import {
  ArrowRightOutlined,
  ReloadOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Button, Empty, Spin, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsWindow,
  PlayerAnalyticsCore,
  PlayerAnalyticsReport,
  RateMetric,
} from "../../shared/playerAnalytics";
import {
  benchmarkMarker,
  benchmarkStatus,
  combinedAnalyticsInsights,
  PLAYER_ANALYTICS_BENCHMARKS,
} from "../../shared/playerAnalyticsBenchmarks";
import type {
  AnalyticsBenchmarkMode,
  BenchmarkMetricKey,
  BenchmarkStatus,
} from "../../shared/playerAnalyticsBenchmarks";
import type { ApiRsp } from "../../ApiType";
import "./PlayerAnalytics.css";

const WINDOWS: Array<{ value: AnalyticsWindow; label: string }> = [
  { value: 20, label: "近 20 手" },
  { value: 50, label: "近 50 手" },
  { value: 100, label: "近 100 手" },
  { value: 500, label: "近 500 手" },
  { value: 2000, label: "近 2,000 手" },
  { value: 5000, label: "近 5,000 手" },
];

const METRICS = [
  {
    key: "vpip",
    short: "VPIP",
    full: "Voluntarily Put Money in Pot",
    cn: "主动入池率",
    help: "翻前主动投入筹码的手数比例，不计算强制大小盲。反映你玩得松还是紧。",
    benchmarkKey: "vpip",
  },
  {
    key: "pfr",
    short: "PFR",
    full: "Preflop Raise",
    cn: "翻前加注率",
    help: "翻前至少加注一次的手数比例。与 VPIP 的差距可反映主动性。",
    benchmarkKey: "pfr",
  },
  {
    key: "threeBet",
    short: "3-Bet",
    full: "Three-Bet Percentage",
    cn: "翻前再加注率",
    help: "面对首次加注时再次加注的比例，只计算存在 3-Bet 机会的局面。",
    benchmarkKey: "threeBet",
  },
  {
    key: "aggressionFrequency",
    short: "Agg%",
    full: "Aggression Frequency",
    cn: "翻后主动行动频率",
    help: "翻后下注、加注或全下占下注、加注、跟注与弃牌的比例；过牌不计入标准 AFq 分母。",
    benchmarkKey: "aggressionFrequency",
  },
  {
    key: "wentToShowdown",
    short: "WTSD",
    full: "Went to Showdown",
    cn: "进入摊牌率",
    help: "看到翻牌后最终进入摊牌的比例，过高可能表示跟注过多。",
    benchmarkKey: "wentToShowdown",
  },
  {
    key: "wonAtShowdown",
    short: "W$SD",
    full: "Won Money at Showdown",
    cn: "摊牌获胜率",
    help: "进入摊牌后获胜的比例，需要结合 WTSD 和样本量一起理解。",
    benchmarkKey: "wonAtShowdown",
  },
  {
    key: "gtoAlignment",
    short: "GTO Match",
    full: "Game Theory Optimal Action Alignment",
    cn: "GTO 行动匹配度",
    help: "你所选行动在当时 GTO 混合策略中的平均执行概率，不是简单判断对错。",
    benchmarkKey: null,
  },
] as const;

function displayRate(metric: RateMetric) {
  return metric.value === null ? "—" : `${metric.value}%`;
}

function sampleText(metric: RateMetric) {
  return metric.denominator > 0
    ? `${metric.numerator} / ${metric.denominator} 次`
    : "暂无机会样本";
}

const DIAGNOSIS: Record<
  BenchmarkMetricKey,
  Record<BenchmarkStatus, { title: string; detail: string }>
> = {
  vpip: {
    low: { title: "入池偏紧", detail: "检查后位和盲注位是否错过了可盈利的开池与防守机会。" },
    standard: { title: "入池范围接近参考", detail: "整体松紧度稳定，下一步可重点检查不同位置的范围差异。" },
    high: { title: "入池偏松", detail: "重点复盘前位边缘牌，以及面对加注时是否存在过多冷跟。" },
  },
  pfr: {
    low: { title: "翻前主动性偏低", detail: "检查是否存在过多 Limp 或跟注，强牌和可玩牌可以更多主动加注。" },
    standard: { title: "翻前加注频率接近参考", detail: "主动性整体合理，建议继续结合 VPIP–PFR 差值判断。" },
    high: { title: "翻前加注偏频繁", detail: "检查前位开池、隔离加注及轻率再加注是否超出合理范围。" },
  },
  threeBet: {
    low: { title: "3-Bet 偏少", detail: "可能错过价值再加注和后位反偷机会，建议按位置复盘面对开池的范围。" },
    standard: { title: "3-Bet 频率接近参考", detail: "价值牌与轻量再加注的总体占比相对稳定。" },
    high: { title: "3-Bet 偏多", detail: "检查轻量 3-Bet 是否选对位置、对手和阻断牌，避免无计划扩大底池。" },
  },
  aggressionFrequency: {
    low: { title: "翻后主动频率偏低", detail: "下注和加注占比较少，检查是否错过价值下注、保护牌力和合理半诈唬。" },
    standard: { title: "翻后主动频率接近参考", detail: "主动与被动行动比例较均衡，建议继续结合 AF 和摊牌数据判断。" },
    high: { title: "翻后主动频率偏高", detail: "检查持续下注、多街开火和加注是否有足够价值牌与听牌支撑。" },
  },
  aggressionFactor: {
    low: { title: "翻后打法偏被动", detail: "下注和加注相对跟注较少，检查是否错过价值下注或合理施压。" },
    standard: { title: "翻后激进度接近参考", detail: "主动行动和跟注的比例较均衡，仍需结合牌面与位置判断。" },
    high: { title: "翻后激进度偏高", detail: "检查多街开火和加注是否有足够价值牌与听牌支撑。" },
  },
  wentToShowdown: {
    low: { title: "进入摊牌偏少", detail: "可能在转牌或河牌弃牌过多，建议复盘中等牌力和抓诈范围。" },
    standard: { title: "摊牌频率接近参考", detail: "进入摊牌的频率较均衡，需要与 W$SD 组合判断质量。" },
    high: { title: "进入摊牌偏多", detail: "可能存在跟注到底过多，尤其要检查河牌边缘抓诈。" },
  },
  wonAtShowdown: {
    low: { title: "摊牌胜率偏低", detail: "可能用较弱牌跟到摊牌，或前序街道的价值与抓诈边界不清晰。" },
    standard: { title: "摊牌质量接近参考", detail: "到达摊牌的牌力分布较健康，继续结合 WTSD 观察。" },
    high: { title: "摊牌胜率偏高", detail: "通常说明到摊牌的范围较强，也可能意味着弃掉了部分合理抓诈。" },
  },
};

function confidenceText(metric: RateMetric) {
  if (metric.denominator < 20) return "样本不足";
  if (metric.denominator < 100) return "可信度较低";
  if (metric.denominator < 300) return "可信度中等";
  return "可信度较高";
}

function BenchmarkScale({
  metricKey,
  metric,
  mode,
  unit = "%",
}: {
  metricKey: BenchmarkMetricKey;
  metric: RateMetric;
  mode: AnalyticsBenchmarkMode;
  unit?: string;
}) {
  const range = PLAYER_ANALYTICS_BENCHMARKS[mode].metrics[metricKey];
  if (metric.value === null) {
    return <div className="player-metric-card__diagnosis is-empty"><strong>等待样本</strong><p>出现可统计机会后，这里会显示参考区间和诊断。</p></div>;
  }
  const status = benchmarkStatus(metric.value, range);
  const diagnosis = DIAGNOSIS[metricKey][status];
  const lowWidth = (range.low / range.scaleMax) * 100;
  const standardWidth = ((range.high - range.low) / range.scaleMax) * 100;
  return (
    <>
      <div className="player-metric-card__benchmark">
        <div className="player-metric-card__zones">
          <span className="is-low" style={{ width: `${lowWidth}%` }} />
          <span className="is-standard" style={{ width: `${standardWidth}%` }} />
          <span className="is-high" />
          <i style={{ left: `${benchmarkMarker(metric.value, range)}%` }} />
        </div>
        <div className="player-metric-card__zone-labels">
          <span>偏低</span><strong>参考 {range.low}–{range.high}{unit}</strong><span>偏高</span>
        </div>
      </div>
      <div className={`player-metric-card__diagnosis is-${status}`}>
        <strong>{diagnosis.title}</strong>
        <p>{diagnosis.detail} <em>{confidenceText(metric)}</em></p>
      </div>
    </>
  );
}

function benchmarkStyle(
  core: PlayerAnalyticsCore,
  mode: AnalyticsBenchmarkMode
): PlayerAnalyticsReport["style"] {
  if (core.hands < 40 || core.vpip.value === null || core.pfr.value === null) {
    return { code: "developing", label: "样本积累中", summary: "至少积累 40 手后，再结合所选桌型判断长期牌风。" };
  }
  const profile = PLAYER_ANALYTICS_BENCHMARKS[mode];
  const vpip = core.vpip.value;
  const pfr = core.pfr.value;
  const gap = vpip - pfr;
  if (vpip < profile.metrics.vpip.low - 3) return { code: "nit", label: "偏紧型", summary: `相对 ${profile.label} 基准入池较少，留意后位与盲注位的盈利机会。` };
  if (vpip > profile.metrics.vpip.high + 8 && gap > profile.vpipPfrGap.high + 6) return { code: "calling-station", label: "松弱型", summary: `相对 ${profile.label} 基准入池较多，但主动加注不足。` };
  if (vpip > profile.metrics.vpip.high + 4 && gap <= profile.vpipPfrGap.high + 4) return { code: "lag", label: "松凶型 LAG", summary: `相对 ${profile.label} 基准范围较宽且主动，需要留意过度激进。` };
  if (gap <= profile.vpipPfrGap.high + 3 && pfr >= profile.metrics.pfr.low - 2) return { code: "tag", label: "紧凶型 TAG", summary: `相对 ${profile.label} 基准保持了较好的入池选择与主动性。` };
  return { code: "balanced", label: "均衡型", summary: `相对 ${profile.label} 基准整体均衡，可进一步关注位置与街道差异。` };
}

async function loadReport(window: AnalyticsWindow): Promise<PlayerAnalyticsReport> {
  const response = await fetch(`/api/me/stats?window=${window}`, {
    headers: { authorization: localStorage["token"] || "" },
  });
  const body = (await response.json()) as ApiRsp;
  if (body.code !== 0) throw new Error(body.error);
  return body.data as PlayerAnalyticsReport;
}

export function PlayerAnalytics({
  variant = "room",
  previewReport,
}: {
  variant?: "room" | "lobby";
  previewReport?: PlayerAnalyticsReport;
} = {}) {
  const [window, setWindow] = useState<AnalyticsWindow>(previewReport?.window || 100);
  const [benchmarkMode, setBenchmarkMode] = useState<AnalyticsBenchmarkMode>("6max");
  const [report, setReport] = useState<PlayerAnalyticsReport | null>(previewReport || null);
  const [loading, setLoading] = useState(!previewReport);

  const refresh = useCallback(async () => {
    if (previewReport) {
      setReport(previewReport);
      return;
    }
    setLoading(true);
    try {
      setReport(await loadReport(window));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "无法加载个人数据");
    } finally {
      setLoading(false);
    }
  }, [previewReport, window]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedProfile = PLAYER_ANALYTICS_BENCHMARKS[benchmarkMode];
  const displayedStyle = report ? benchmarkStyle(report.core, benchmarkMode) : null;
  const displayedInsights = report ? combinedAnalyticsInsights(report.core, benchmarkMode) : [];

  return (
    <section className={`player-analytics${variant === "lobby" ? " is-lobby" : ""}`}>
      {variant === "room" && (
        <a
          className="player-analytics__replay-entry"
          href="/replays"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="AI 牌局复盘（新窗口打开）"
        >
          <span className="player-analytics__replay-icon">
            <RobotOutlined />
          </span>
          <span className="player-analytics__replay-copy">
            <small>AI HAND REVIEW</small>
            <strong>AI 牌局复盘</strong>
            <span>逐手回看决策并对照 GTO 参考策略</span>
          </span>
          <span className="player-analytics__replay-action">
            查看复盘
            <ArrowRightOutlined />
          </span>
        </a>
      )}

      <header className="player-analytics__hero">
        <div>
          <small>PLAYER INSIGHTS</small>
          <h2>我的牌局分析</h2>
          <p>从翻前范围、翻后主动性和 GTO 决策三个方向理解自己的牌风。</p>
        </div>
        {!previewReport && (
          <Button
            className="player-analytics__refresh"
            icon={<ReloadOutlined />}
            onClick={refresh}
            loading={loading}
          >
            刷新
          </Button>
        )}
      </header>

      <div className="player-analytics__windows" aria-label="统计范围">
        {WINDOWS.map((item) => (
          <button
            type="button"
            key={item.value}
            className={window === item.value ? "is-active" : ""}
            onClick={() => setWindow(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="player-analytics__benchmark-switch">
        <div><small>REFERENCE SYSTEM</small><strong>参考体系</strong><span>{selectedProfile.description}</span></div>
        <div role="group" aria-label="参考体系">
          {(["6max", "9max"] as AnalyticsBenchmarkMode[]).map((mode) => (
            <button type="button" key={mode} className={benchmarkMode === mode ? "is-active" : ""} onClick={() => setBenchmarkMode(mode)}>
              {PLAYER_ANALYTICS_BENCHMARKS[mode].label}
            </button>
          ))}
        </div>
      </div>

      {loading && !report ? (
        <div className="player-analytics__state"><Spin tip="正在整理牌局数据" /></div>
      ) : !report || report.core.hands === 0 ? (
        <div className="player-analytics__state">
          <Empty description="完成一手牌后，这里会出现你的个人分析" />
        </div>
      ) : (
        <>
          <div className="player-analytics__overview">
            <div className={`player-style-card is-${displayedStyle?.code}`}>
              <span>当前牌风</span>
              <strong>{displayedStyle?.label}</strong>
              <p>{displayedStyle?.summary}</p>
              <small>基于 {report.core.hands} 手 · {selectedProfile.label} 参考体系</small>
            </div>
            <div className="player-result-card">
              <span>Win Rate · 每百手赢取大盲</span>
              <strong className={report.core.bbPer100 >= 0 ? "is-win" : "is-loss"}>
                {report.core.bbPer100 >= 0 ? "+" : ""}{report.core.bbPer100}
                <small> BB/100</small>
              </strong>
              <p>本范围净结果 {report.core.netBB >= 0 ? "+" : ""}{report.core.netBB} BB</p>
            </div>
          </div>

          <div className="player-metric-grid">
            {METRICS.map((definition) => {
              const metric = report.core[definition.key] as RateMetric;
              return (
                <article className="player-metric-card" key={definition.key}>
                  <div className="player-metric-card__title">
                    <strong>{definition.short}</strong>
                    <span>{definition.cn}</span>
                  </div>
                  <b>{displayRate(metric)}</b>
                  <small>{sampleText(metric)}</small>
                  {definition.benchmarkKey ? (
                    <BenchmarkScale metricKey={definition.benchmarkKey} metric={metric} mode={benchmarkMode} />
                  ) : (
                    <div className="player-metric-card__bar"><i style={{ width: `${Math.min(metric.value || 0, 100)}%` }} /></div>
                  )}
                  <details>
                    <summary>{definition.full}</summary>
                    <p>{definition.help}</p>
                  </details>
                </article>
              );
            })}
            <article className="player-metric-card">
              <div className="player-metric-card__title">
                <strong>AF</strong><span>激进因子</span>
              </div>
              <b>{report.core.aggressionFactor ?? "—"}</b>
              <small>(下注 + 加注) ÷ 跟注</small>
              <BenchmarkScale
                metricKey="aggressionFactor"
                metric={{ value: report.core.aggressionFactor, numerator: 0, denominator: report.core.aggressionFrequency.denominator }}
                mode={benchmarkMode}
                unit=""
              />
              <details>
                <summary>Aggression Factor</summary>
                <p>衡量翻后主动下注和加注相对于被动跟注的程度；没有跟注样本时不显示。</p>
              </details>
            </article>
            <article className="player-metric-card">
              <div className="player-metric-card__title">
                <strong>EV Loss</strong><span>决策 EV 损失</span>
              </div>
              <b className={report.core.evLoss.per100Hands !== null && report.core.evLoss.per100Hands > 12 ? "is-loss" : ""}>
                {report.core.evLoss.per100Hands === null
                  ? "—"
                  : `${report.core.evLoss.per100Hands} BB/100`}
              </b>
              <small>
                {report.core.evLoss.scoredActions > 0
                  ? `共损失约 ${report.core.evLoss.totalBB} BB · ${report.core.evLoss.scoredActions} 次已评分决策`
                  : "暂无已评分决策"}
              </small>
              <div className="player-metric-card__bar">
                <i style={{ width: `${Math.min((report.core.evLoss.per100Hands || 0) * 2, 100)}%` }} />
              </div>
              <details>
                <summary>Estimated EV Loss</summary>
                <p>估算每百手因偏离参考策略损失的大盲数。混合策略内的行动视为无损；数值越低越好，比行动匹配率更贴近真实决策质量。</p>
              </details>
            </article>
          </div>

          <section className="player-analysis-section">
            <div className="player-analysis-section__heading">
              <div><small>COACH NOTES</small><h3>数据解读</h3></div>
              <span>结论会随样本增加而调整</span>
            </div>
            <div className="player-insight-list">
              {displayedInsights.map((insight, index) => (
                <article className={`is-${insight.tone}`} key={`${insight.title}-${index}`}>
                  <i />
                  <div><strong>{insight.title}</strong><p>{insight.detail}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section className="player-analysis-section">
            <div className="player-analysis-section__heading">
              <div><small>POSITION</small><h3>位置表现</h3></div>
              <span>不同位置应使用不同入池范围</span>
            </div>
            <div className="player-position-table">
              <div className="is-head"><span>位置</span><span>手数</span><span>VPIP</span><span>PFR</span><span>净 BB</span></div>
              {report.positions.map((row) => (
                <div key={row.position}>
                  <strong>{row.position}</strong><span>{row.hands}</span>
                  <span>{row.vpip === null ? "—" : `${row.vpip}%`}</span>
                  <span>{row.pfr === null ? "—" : `${row.pfr}%`}</span>
                  <span className={row.netBB >= 0 ? "is-win" : "is-loss"}>{row.netBB >= 0 ? "+" : ""}{row.netBB}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="player-analysis-section">
            <div className="player-analysis-section__heading">
              <div><small>BY STREET</small><h3>各街行动</h3></div>
              <span>Agg% = 主动行动 ÷ 非过牌行动</span>
            </div>
            <div className="player-street-grid">
              {report.streets.map((row) => (
                <article key={row.street}>
                  <span>{row.street === "flop" ? "FLOP · 翻牌" : row.street === "turn" ? "TURN · 转牌" : "RIVER · 河牌"}</span>
                  <strong>{row.aggressionFrequency === null ? "—" : `${row.aggressionFrequency}%`} <small>Agg%</small></strong>
                  <div><i>行动 {row.actions}</i><i>跟注 {row.call}</i><i>弃牌 {row.fold}</i><i>主动 {row.aggressive}</i></div>
                  <p>
                    GTO Match {row.gtoAlignment === null ? "—" : `${row.gtoAlignment}%`}
                    {row.evLossBB !== null && row.evLossBB !== undefined
                      ? ` · EV -${row.evLossBB}bb`
                      : ""}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <p className="player-analytics__footnote">
            参考区间适用于约 100BB 的常规现金桌，不代表盈利保证。切换体系只改变诊断基准，不改变你的原始统计数据。
          </p>
        </>
      )}
    </section>
  );
}
