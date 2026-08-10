export type AnalyticsWindow = 20 | 50 | 100 | 500 | 2000 | 5000;

export interface RateMetric {
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface PlayerAnalyticsCore {
  hands: number;
  vpip: RateMetric;
  pfr: RateMetric;
  threeBet: RateMetric;
  aggressionFrequency: RateMetric;
  aggressionFactor: number | null;
  wentToShowdown: RateMetric;
  wonAtShowdown: RateMetric;
  gtoAlignment: RateMetric;
  netBB: number;
  bbPer100: number;
}

export interface PositionAnalyticsRow {
  position: string;
  hands: number;
  vpip: number | null;
  pfr: number | null;
  netBB: number;
}

export interface StreetAnalyticsRow {
  street: "flop" | "turn" | "river";
  actions: number;
  fold: number;
  call: number;
  aggressive: number;
  aggressionFrequency: number | null;
  gtoAlignment: number | null;
}

export interface AnalyticsInsight {
  tone: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
}

export interface PlayerAnalyticsReport {
  window: AnalyticsWindow;
  generatedAt: string;
  style: {
    code: "developing" | "tag" | "lag" | "nit" | "calling-station" | "balanced";
    label: string;
    summary: string;
  };
  core: PlayerAnalyticsCore;
  positions: PositionAnalyticsRow[];
  streets: StreetAnalyticsRow[];
  insights: AnalyticsInsight[];
}
