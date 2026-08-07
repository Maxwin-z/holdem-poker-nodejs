/**
 * Seat-to-position mapping for 2-9 handed games (10 handed is treated as
 * 9 handed). Positions are normalized onto the 6-max chart keys used by
 * the underlying strategy data.
 */

import type { ChartPosition, PositionLabel } from "./types";

/**
 * Position labels by distance from the button (0 = button, 1 = SB, ...).
 * The list is in clockwise order starting from the button.
 */
const POSITIONS_BY_DISTANCE: Record<number, PositionLabel[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "CO", "UTG"],
  6: ["BTN", "SB", "BB", "CO", "MP", "UTG"],
  7: ["BTN", "SB", "BB", "CO", "HJ", "MP", "UTG"],
  8: ["BTN", "SB", "BB", "CO", "HJ", "LJ", "MP", "UTG"],
  9: ["BTN", "SB", "BB", "CO", "HJ", "LJ", "MP", "UTG+1", "UTG"],
};

const LABEL_TO_CHART: Record<PositionLabel, ChartPosition> = {
  BTN: "BTN",
  SB: "SB",
  BB: "BB",
  CO: "CO",
  HJ: "MP",
  LJ: "MP",
  MP: "MP",
  "UTG+1": "UTG",
  UTG: "UTG",
};

/** Normalize player count; 10 is treated as 9. */
export function normalizePlayerCount(playerCount: number): number {
  if (!Number.isFinite(playerCount)) {
    throw new Error(`玩家数量必须是数字，收到 ${playerCount}`);
  }
  const count = Math.floor(playerCount);
  if (count === 10) return 9;
  if (count < 2 || count > 9) {
    throw new Error(`玩家数量需在 2-9 之间（10 人按 9 人处理），收到 ${count}`);
  }
  return count;
}

export interface SeatPosition {
  label: PositionLabel;
  chart: ChartPosition;
  /** True in heads-up, where the button seat also posts the small blind. */
  headsUpButton: boolean;
}

/**
 * Resolve the position of a seat given its distance from the button
 * (0 = button seat, 1 = small blind, 2 = big blind, ...).
 */
export function positionForDistance(
  playerCount: number,
  distanceFromButton: number
): SeatPosition {
  const count = normalizePlayerCount(playerCount);
  const labels = POSITIONS_BY_DISTANCE[count];
  if (!Number.isInteger(distanceFromButton) || distanceFromButton < 0 || distanceFromButton >= labels.length) {
    throw new Error(
      `距离按钮的座位序号无效：${distanceFromButton}（应有 0-${labels.length - 1}）`
    );
  }
  const label = labels[distanceFromButton];
  if (count === 2 && distanceFromButton === 0) {
    // Heads-up: the button posts the small blind and acts as SB preflop.
    return { label: "BTN", chart: "SB", headsUpButton: true };
  }
  return { label, chart: LABEL_TO_CHART[label], headsUpButton: false };
}

/**
 * 把牌局里的“行动顺序序号”映射成 6-max 图表位置。
 *
 * 本牌局的行牌顺序与标准 6-max 相反：翻前从 CO 开始，依次
 * CO -> MP -> UTG -> BTN -> SB -> BB（即 sortedUsers[2] 开始行动）。
 * 而 GreenCharts2024 图表按键（UTG/MP/CO/BTN/SB/BB）按标准顺序定义：
 * 第 1 个行动者是 UTG、第 2 个是 MP……因此同一个座位不能拿“距按钮
 * 距离”当图表键，要按它在行动顺序里的序号取标准位置，才能命中图表。
 *
 * 对 2-10 人桌都适用（10 人桌按 9 人标签，多出的早位并到 UTG）。
 *
 * @param playerCount 实际玩家数（2-10）
 * @param actorIndex  翻前行动顺序序号：0 = 第一个行动者，依此类推
 */
export function chartPositionByActionOrder(
  playerCount: number,
  actorIndex: number
): ChartPosition {
  const n = Math.floor(playerCount);
  if (!Number.isFinite(playerCount) || n < 2 || n > 10) {
    throw new Error(`玩家数量必须是 2-10 之间的数字，收到 ${playerCount}`);
  }
  const count = Math.min(Math.max(n, 2), 9);
  if (n === 2) {
    // 单挑：按钮位即小盲，图表键为 SB。
    return actorIndex <= 0 ? "SB" : "BB";
  }
  // 实际玩家数的距离标签（10 人桌按 9 人标签，超出部分钳到 UTG）。
  const labels: PositionLabel[] = [];
  for (let d = 0; d < n; d++) {
    labels.push(positionForDistance(count, Math.min(d, count - 1)).label);
  }
  // 标准行动顺序 = 早位（距离 >= 3）按距离逆序，然后 BTN/SB/BB。
  const sequence: ChartPosition[] = [
    ...labels
      .slice(3)
      .reverse()
      .map((label) => LABEL_TO_CHART[label]),
    LABEL_TO_CHART[labels[0]],
    LABEL_TO_CHART[labels[1]],
    LABEL_TO_CHART[labels[2]],
  ];
  return sequence[Math.min(actorIndex, sequence.length - 1)];
}

/** All positions for a game, indexed by distance from the button. */
export function positionsForGame(playerCount: number): SeatPosition[] {
  const count = normalizePlayerCount(playerCount);
  return POSITIONS_BY_DISTANCE[count].map((_, i) =>
    positionForDistance(count, i)
  );
}

/**
 * Convert a seat index into a distance from the button.
 * `seatIndex` and `buttonIndex` are indexes into the same active-seat array.
 */
export function distanceFromButton(
  seatIndex: number,
  buttonIndex: number,
  playerCount: number
): number {
  const count = normalizePlayerCount(playerCount);
  if (
    !Number.isInteger(seatIndex) ||
    !Number.isInteger(buttonIndex) ||
    seatIndex < 0 ||
    buttonIndex < 0 ||
    seatIndex >= count ||
    buttonIndex >= count
  ) {
    throw new Error("座位序号无效");
  }
  return (seatIndex - buttonIndex + count) % count;
}
