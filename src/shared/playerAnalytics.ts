export type AnalyticsWindow = 20 | 50 | 100 | 500 | 2000 | 5000;

export interface RateMetric {
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface EvLossMetric {
  /** Total estimated EV lost across graded decisions in the window (bb). */
  totalBB: number;
  /** Estimated EV lost per 100 hands (bb/100), null without graded hands. */
  per100Hands: number | null;
  /** Number of decisions carrying an EV-loss estimate. */
  scoredActions: number;
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
  /** EV-loss based grading (primary learning metric; gtoAlignment kept for
   *  continuity as the frequency-match view). */
  evLoss: EvLossMetric;
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
  /** Total estimated EV lost on this street in the window (bb). */
  evLossBB: number | null;
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
