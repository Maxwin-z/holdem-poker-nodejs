/**
 * Board texture analysis (ported from gto-poker-overlay engine.ts).
 */

import { CardId, rankOf, suitOf } from "./cards";
import { BoardTexture } from "./types";

export interface BoardAnalysis {
  texture: BoardTexture;
  isMonotone: boolean;
  isTwoTone: boolean;
  isRainbow: boolean;
  isPaired: boolean;
  isConnected: boolean;
  highCard: number; // 0-12 (2=0, A=12)
  hasAce: boolean;
  numBroadway: number;
  flushDrawPossible: boolean;
  straightDrawPossible: boolean;
}

export function analyzeBoard(cards: CardId[]): BoardAnalysis {
  if (cards.length === 0) {
    return {
      texture: "dry", isMonotone: false, isTwoTone: false, isRainbow: true,
      isPaired: false, isConnected: false, highCard: 0, hasAce: false,
      numBroadway: 0, flushDrawPossible: false, straightDrawPossible: false,
    };
  }

  const suits = cards.map(suitOf);
  const ranks = cards.map(rankOf);
  const rankSet = new Set(ranks);

  const suitCounts: Record<number, number> = {};
  suits.forEach((s) => {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  });
  const maxSuit = Math.max(...Object.values(suitCounts));
  const isMonotone = maxSuit >= 3;
  const isTwoTone = maxSuit === 2 && cards.length >= 3;
  const isRainbow =
    maxSuit === 1 || (cards.length === 3 && Object.keys(suitCounts).length === 3);

  const isPaired = rankSet.size < cards.length;

  const sorted = [...ranks].sort((a, b) => a - b);
  let gaps = 0;
  let connected = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff === 0) continue;
    if (diff === 1) connected++;
    else if (diff === 2) gaps++;
    else gaps += 2;
  }
  const isConnected = connected >= 2;

  const highCard = Math.max(...ranks);
  const hasAce = ranks.includes(12);
  const numBroadway = ranks.filter((r) => r >= 8).length;

  const flushDrawPossible = isTwoTone || isMonotone;
  const straightDrawPossible = isConnected || gaps <= 1;

  let texture: BoardTexture;
  if (isMonotone) {
    texture = "monotone";
  } else if (isPaired && !isConnected) {
    texture = "paired_dry";
  } else if (isPaired && isConnected) {
    texture = "paired_wet";
  } else if (isConnected && flushDrawPossible) {
    texture = "very_wet";
  } else if (isConnected || flushDrawPossible) {
    texture = "wet";
  } else if (gaps <= 1 || isTwoTone) {
    texture = "semi_wet";
  } else {
    texture = "dry";
  }

  return {
    texture, isMonotone, isTwoTone, isRainbow, isPaired, isConnected,
    highCard, hasAce, numBroadway, flushDrawPossible, straightDrawPossible,
  };
}

export const BOARD_TEXTURE_CN: Record<BoardTexture, string> = {
  dry: "干燥",
  semi_wet: "半湿润",
  wet: "湿润",
  very_wet: "非常湿润",
  monotone: "同花面",
  paired_dry: "对子干燥面",
  paired_wet: "对子湿润面",
};
