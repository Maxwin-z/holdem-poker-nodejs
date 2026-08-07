/**
 * Preflop raise sizing, following the sizing notes shipped with
 * GreenCharts2024 (RFI 3bb EP / 2.5bb late; ISO 4bb+1bb IP, 5bb+1bb OOP;
 * OOP 3bet ~4x open, IP 3bet ~3.5x open; 4bet ~2.3x 3bet).
 */

import type { ChartPosition } from "./types";

export function roundBB(x: number): number {
  return Math.round(x * 2) / 2;
}

export function toChips(bb: number, bigBlindChips?: number): number | undefined {
  if (!bigBlindChips || !Number.isFinite(bigBlindChips) || bigBlindChips <= 0) {
    return undefined;
  }
  return Math.round(bb * bigBlindChips);
}

const OOP: ChartPosition[] = ["SB", "BB"];

export function isOOP(position: ChartPosition): boolean {
  return OOP.includes(position);
}

/** Raise-first-in size in bb. */
export function rfiSizeBB(position: ChartPosition): number {
  switch (position) {
    case "CO":
    case "BTN":
      return 2.5;
    default:
      return 3;
  }
}

/** Isolation-raise size over limpers in bb. */
export function isoSizeBB(position: ChartPosition, limpers: number): number {
  const base = isOOP(position) ? 5 : 4;
  return base + Math.max(0, Math.floor(limpers));
}

/** 3bet size (total raise-to) in bb. */
export function threeBetSizeBB(
  openSizeBB: number,
  callers: number,
  position: ChartPosition
): number {
  const base = isOOP(position) ? openSizeBB * 4 : openSizeBB * 3.5;
  const min = isOOP(position) ? 10 : 9;
  return Math.max(min, roundBB(base + Math.max(0, Math.floor(callers))));
}

/** 4bet size (total raise-to) in bb. */
export function fourBetSizeBB(threeBetSizeBB_: number): number {
  return roundBB(threeBetSizeBB_ * 2.3);
}

/** Chips already committed preflop as blinds. */
export function investedBB(position: ChartPosition): number {
  if (position === "BB") return 1;
  if (position === "SB") return 0.5;
  return 0;
}
