export type AnalyticsBenchmarkMode = "6max" | "9max";

export type BenchmarkMetricKey =
  | "vpip"
  | "pfr"
  | "threeBet"
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

