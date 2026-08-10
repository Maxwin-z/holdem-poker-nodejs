import { SimpleChipsRecord } from "../../ApiType";
import { CreateRoom } from "../createroom/CreateRoom";
import { RecentGameEntry } from "../createroom/RecentGameRecords";
import { Register } from "../register/Register";
import type { PlayerAnalyticsReport } from "../../shared/playerAnalytics";

const firstSession: SimpleChipsRecord[] = [
  { id: "maxwin", name: "Maxwin", chips: 124860, buyIn: 100000 },
  { id: "sora", name: "Sora", chips: 186400, buyIn: 120000 },
  { id: "momo", name: "Momo", chips: 128450, buyIn: 140000 },
  { id: "nana", name: "Nana", chips: 72210, buyIn: 80000 },
];

const secondSession: SimpleChipsRecord[] = [
  { id: "maxwin", name: "Maxwin", chips: 88400, buyIn: 100000 },
  { id: "leo", name: "Leo", chips: 116600, buyIn: 100000 },
  { id: "owen", name: "Owen", chips: 95200, buyIn: 100000 },
];

const previewRecords: RecentGameEntry[] = [
  {
    roomid: "8K21",
    date: Date.now() - 1000 * 60 * 38,
    records: firstSession,
  },
  {
    roomid: "6P7A",
    date: Date.now() - 1000 * 60 * 60 * 25,
    records: secondSession,
  },
];

const previewAnalytics: PlayerAnalyticsReport = {
  window: 100,
  generatedAt: new Date().toISOString(),
  style: {
    code: "tag",
    label: "紧凶型 TAG",
    summary: "选择性入池并保持主动，整体结构较稳健。",
  },
  core: {
    hands: 100,
    vpip: { value: 24, numerator: 24, denominator: 100 },
    pfr: { value: 20, numerator: 20, denominator: 100 },
    threeBet: { value: 8, numerator: 4, denominator: 50 },
    aggressionFrequency: { value: 48, numerator: 48, denominator: 100 },
    aggressionFactor: 3,
    wentToShowdown: { value: 29, numerator: 12, denominator: 41 },
    wonAtShowdown: { value: 51, numerator: 6, denominator: 12 },
    gtoAlignment: { value: 62, numerator: 62, denominator: 100 },
    netBB: 18.6,
    bbPer100: 18.6,
  },
  positions: [
    { position: "BTN", hands: 21, vpip: 33, pfr: 29, netBB: 13.4 },
    { position: "CO", hands: 18, vpip: 28, pfr: 22, netBB: 7.8 },
    { position: "HJ", hands: 16, vpip: 19, pfr: 19, netBB: 3.1 },
    { position: "BB", hands: 20, vpip: 30, pfr: 10, netBB: -5.7 },
  ],
  streets: [
    { street: "flop", actions: 48, fold: 12, call: 13, aggressive: 23, aggressionFrequency: 48, gtoAlignment: 66 },
    { street: "turn", actions: 27, fold: 8, call: 7, aggressive: 12, aggressionFrequency: 44, gtoAlignment: 61 },
    { street: "river", actions: 16, fold: 5, call: 5, aggressive: 6, aggressionFrequency: 38, gtoAlignment: 57 },
  ],
  insights: [],
};

export function HomeUiPreview() {
  const previewState =
    new URLSearchParams(window.location.search).get("state") || "login";

  if (previewState === "lobby") {
    return (
      <CreateRoom
        previewName="Maxwin"
        previewRecords={previewRecords}
        previewAnalytics={previewAnalytics}
      />
    );
  }

  return <Register />;
}
