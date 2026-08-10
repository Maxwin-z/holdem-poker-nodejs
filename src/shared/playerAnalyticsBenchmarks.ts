import type {
  AnalyticsInsight,
  PlayerAnalyticsCore,
} from "./playerAnalytics";

export type AnalyticsBenchmarkMode = "6max" | "9max";

export type BenchmarkMetricKey =
  | "vpip"
  | "pfr"
  | "threeBet"
  | "aggressionFrequency"
  | "aggressionFactor"
  | "wentToShowdown"
  | "wonAtShowdown";

export type BenchmarkStatus = "low" | "standard" | "high";

export interface BenchmarkRange {
  low: number;
  high: number;
  /** Upper bound used to draw the visual scale, not a hard statistical limit. */
  scaleMax: number;
}

export interface AnalyticsBenchmarkProfile {
  label: string;
  description: string;
  vpipPfrGap: { low: number; high: number };
  metrics: Record<BenchmarkMetricKey, BenchmarkRange>;
}

export const PLAYER_ANALYTICS_BENCHMARKS: Record<
  AnalyticsBenchmarkMode,
  AnalyticsBenchmarkProfile
> = {
  "6max": {
    label: "6-max",
    description: "常规六人桌 · 约 100BB 现金局",
    vpipPfrGap: { low: 3, high: 5 },
    metrics: {
      vpip: { low: 21, high: 26, scaleMax: 45 },
      pfr: { low: 18, high: 22, scaleMax: 38 },
      threeBet: { low: 6, high: 10, scaleMax: 18 },
      aggressionFrequency: { low: 40, high: 55, scaleMax: 80 },
      aggressionFactor: { low: 2, high: 4, scaleMax: 6 },
      wentToShowdown: { low: 27, high: 32, scaleMax: 50 },
      wonAtShowdown: { low: 49, high: 54, scaleMax: 75 },
    },
  },
  "9max": {
    label: "9-max",
    description: "常规九人桌 · 约 100BB 现金局",
    vpipPfrGap: { low: 2, high: 4 },
    metrics: {
      vpip: { low: 14, high: 16, scaleMax: 36 },
      pfr: { low: 11, high: 14, scaleMax: 30 },
      threeBet: { low: 5, high: 8, scaleMax: 16 },
      aggressionFrequency: { low: 45, high: 60, scaleMax: 85 },
      aggressionFactor: { low: 2, high: 4, scaleMax: 6 },
      wentToShowdown: { low: 27, high: 32, scaleMax: 50 },
      wonAtShowdown: { low: 49, high: 54, scaleMax: 75 },
    },
  },
};

export function benchmarkStatus(
  value: number,
  range: BenchmarkRange
): BenchmarkStatus {
  if (value < range.low) return "low";
  if (value > range.high) return "high";
  return "standard";
}

export function benchmarkMarker(value: number, range: BenchmarkRange): number {
  return Math.max(0, Math.min(100, (value / range.scaleMax) * 100));
}

function confidenceLabel(sample: number) {
  if (sample < 50) return "可信度较低";
  if (sample < 300) return "可信度中等";
  return "可信度较高";
}

export function combinedAnalyticsInsights(
  core: PlayerAnalyticsCore,
  mode: AnalyticsBenchmarkMode
): AnalyticsInsight[] {
  if (core.hands < 40) {
    return [{
      tone: "neutral",
      title: "继续积累样本",
      detail: `当前 ${core.hands} 手；40 手后开始组合判断，300 手后结论更稳定。`,
    }];
  }

  const profile = PLAYER_ANALYTICS_BENCHMARKS[mode];
  const ranges = profile.metrics;
  const vpip = core.vpip.value || 0;
  const pfr = core.pfr.value || 0;
  const gap = Math.round((vpip - pfr) * 10) / 10;
  const threeBet = core.threeBet.value;
  const agg = core.aggressionFrequency.value;
  const af = core.aggressionFactor;
  const wtsd = core.wentToShowdown.value;
  const wsd = core.wonAtShowdown.value;
  const insights: AnalyticsInsight[] = [];

  const loosePassive = vpip > ranges.vpip.high && gap > profile.vpipPfrGap.high;
  const looseAggressive =
    vpip > ranges.vpip.high &&
    pfr > ranges.pfr.high &&
    gap <= profile.vpipPfrGap.high + 2;
  const tight = vpip < ranges.vpip.low && pfr < ranges.pfr.low;
  const preflopBalanced =
    vpip >= ranges.vpip.low && vpip <= ranges.vpip.high &&
    pfr >= ranges.pfr.low && pfr <= ranges.pfr.high &&
    gap >= profile.vpipPfrGap.low && gap <= profile.vpipPfrGap.high;
  const showdownOvercall =
    wtsd !== null && wsd !== null &&
    wtsd > ranges.wentToShowdown.high && wsd < ranges.wonAtShowdown.low;
  const showdownOverfold =
    wtsd !== null && wsd !== null &&
    wtsd < ranges.wentToShowdown.low && wsd > ranges.wonAtShowdown.high;
  const highPressure =
    threeBet !== null && agg !== null && af !== null &&
    threeBet > ranges.threeBet.high &&
    agg > ranges.aggressionFrequency.high &&
    af > ranges.aggressionFactor.high;

  if (loosePassive && showdownOvercall) {
    insights.push({
      tone: "warning",
      title: "松弱跟注站倾向",
      detail: `VPIP ${vpip}% / PFR ${pfr}%（差 ${gap}），同时 WTSD ${wtsd}%、W$SD ${wsd}%。入池偏宽、主动加注不足且较常用弱牌跟到摊牌；优先复盘冷跟、Limp 和河牌抓诈。${confidenceLabel(Math.min(core.hands, core.wonAtShowdown.denominator))}。`,
    });
  } else if (loosePassive) {
    insights.push({
      tone: "warning",
      title: "松弱型翻前结构",
      detail: `VPIP ${vpip}% / PFR ${pfr}%，相差 ${gap} 个百分点。宽范围入池但加注没有同步增加，通常意味着 Limp 或冷跟偏多。${confidenceLabel(core.hands)}。`,
    });
  } else if (looseAggressive && highPressure) {
    insights.push({
      tone: "warning",
      title: "松凶高压型倾向",
      detail: `VPIP/PFR 为 ${vpip}/${pfr}，3-Bet ${threeBet}%、Agg% ${agg}%、AF ${af} 均偏高。具备持续施压特征，但需检查轻率 3-Bet、多街诈唬和薄价值是否过量。${confidenceLabel(Math.min(core.hands, core.threeBet.denominator, core.aggressionFrequency.denominator))}。`,
    });
  } else if (looseAggressive) {
    insights.push({
      tone: "neutral",
      title: "松凶型翻前结构",
      detail: `VPIP/PFR 为 ${vpip}/${pfr}，差值仅 ${gap}。宽范围主要通过加注进入，属于主动型结构；需要结合 3-Bet 与翻后激进度判断是否过火。${confidenceLabel(core.hands)}。`,
    });
  } else if (tight) {
    insights.push({
      tone: "warning",
      title: "偏紧型范围结构",
      detail: `VPIP/PFR 为 ${vpip}/${pfr}，两项均低于 ${profile.label} 参考。检查 CO、BTN、SB 的开池与盲注防守，避免只等待强牌。${confidenceLabel(core.hands)}。`,
    });
  } else if (preflopBalanced) {
    insights.push({
      tone: "positive",
      title: "紧凶结构较健康",
      detail: `VPIP/PFR 为 ${vpip}/${pfr}，差值 ${gap} 落在 ${profile.vpipPfrGap.low}–${profile.vpipPfrGap.high} 的参考范围，入池选择与主动加注关系较均衡。${confidenceLabel(core.hands)}。`,
    });
  } else {
    insights.push({
      tone: "neutral",
      title: "VPIP–PFR 结构观察",
      detail: `当前 VPIP/PFR 为 ${vpip}/${pfr}，相差 ${gap} 个百分点；请结合位置分布判断差值来自合理防守还是过多跟注。${confidenceLabel(core.hands)}。`,
    });
  }

  if (showdownOvercall && !(loosePassive && showdownOvercall)) {
    insights.push({
      tone: "warning",
      title: "摊牌跟注可能过宽",
      detail: `WTSD ${wtsd}% 偏高且 W$SD ${wsd}% 偏低，是多街跟注和河牌抓诈过宽的常见组合。优先复盘一对类牌力面对持续下注的决策。${confidenceLabel(core.wonAtShowdown.denominator)}。`,
    });
  } else if (showdownOverfold) {
    insights.push({
      tone: "warning",
      title: "可能只用强牌到摊牌",
      detail: `WTSD ${wtsd}% 偏低而 W$SD ${wsd}% 偏高，常见于转牌或河牌弃牌过多。检查中等牌力的跟注范围，避免对手可以无成本持续施压。${confidenceLabel(core.wonAtShowdown.denominator)}。`,
    });
  } else if (
    wtsd !== null && wsd !== null &&
    wtsd >= ranges.wentToShowdown.low && wtsd <= ranges.wentToShowdown.high &&
    wsd >= ranges.wonAtShowdown.low && wsd <= ranges.wonAtShowdown.high
  ) {
    insights.push({
      tone: "positive",
      title: "摊牌频率与质量较均衡",
      detail: `WTSD ${wtsd}% / W$SD ${wsd}% 均在参考范围，说明到达摊牌的频率与牌力质量暂未出现明显背离。${confidenceLabel(core.wonAtShowdown.denominator)}。`,
    });
  }

  if (agg !== null && af !== null && core.aggressionFrequency.denominator >= 20) {
    const lowAgg = agg < ranges.aggressionFrequency.low;
    const highAgg = agg > ranges.aggressionFrequency.high;
    const lowAf = af < ranges.aggressionFactor.low;
    const highAf = af > ranges.aggressionFactor.high;
    if (lowAgg && lowAf) {
      insights.push({
        tone: "warning",
        title: "翻后整体偏被动",
        detail: `Agg% ${agg}% 与 AF ${af} 同时偏低，下注和加注不足、跟注占比较高。检查价值下注、保护性下注和合理半诈唬是否被错过。${confidenceLabel(core.aggressionFrequency.denominator)}。`,
      });
    } else if (highAgg && highAf && !highPressure) {
      insights.push({
        tone: "warning",
        title: "翻后持续施压偏多",
        detail: `Agg% ${agg}% 与 AF ${af} 同时偏高。主动性强，但需检查多街开火是否有足够价值牌和听牌支撑。${confidenceLabel(core.aggressionFrequency.denominator)}。`,
      });
    } else if (lowAgg && highAf && showdownOverfold) {
      insights.push({
        tone: "warning",
        title: "Fit-or-Fold 倾向",
        detail: `Agg% ${agg}% 偏低、AF ${af} 偏高，同时 WTSD 低而 W$SD 高：多数时候弃牌，继续时又以强牌主动出击，范围容易被读懂。增加合理防守并保护检查范围。${confidenceLabel(Math.min(core.aggressionFrequency.denominator, core.wonAtShowdown.denominator))}。`,
      });
    } else if (
      !lowAgg && !highAgg &&
      af >= ranges.aggressionFactor.low && af <= ranges.aggressionFactor.high
    ) {
      insights.push({
        tone: "positive",
        title: "翻后主动性较均衡",
        detail: `Agg% ${agg}% / AF ${af} 均处于参考区间，下注、加注与跟注的总体比例暂未发现明显失衡。${confidenceLabel(core.aggressionFrequency.denominator)}。`,
      });
    }
  }

  if (
    threeBet !== null && core.threeBet.denominator >= 20 &&
    pfr < ranges.pfr.low && threeBet < ranges.threeBet.low
  ) {
    insights.push({
      tone: "warning",
      title: "翻前主动与反击均不足",
      detail: `PFR ${pfr}%、3-Bet ${threeBet}% 同时偏低。除了减少冷跟，也要检查价值再加注和后位反偷是否被遗漏。${confidenceLabel(core.threeBet.denominator)}。`,
    });
  }

  if (core.gtoAlignment.value !== null && core.gtoAlignment.denominator >= 20) {
    insights.push({
      tone: core.gtoAlignment.value >= 55 ? "positive" : "warning",
      title: "GTO 行动匹配度",
      detail: `所选行动在 GTO 混合策略中的平均频率为 ${core.gtoAlignment.value}%，基于 ${core.gtoAlignment.denominator} 次决策。`,
    });
  }

  return insights.slice(0, 5);
}
