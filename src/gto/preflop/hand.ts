/**
 * Hand key utilities: parsing, combo counts and a preflop strength ordering
 * used for tighten/loosen adjustments. The ordering is an approximation
 * (Chen-style score), good enough for marginal-hand selection.
 */

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export const RANK_INDEX: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6,
  "5": 5, "4": 4, "3": 3, "2": 2,
};

/** Chen-style points: A=10, K=8, Q=7, J=6, T=5, 9=4.5, ..., 2=1. */
const CHEN_POINT: Record<string, number> = {
  A: 10, K: 8, Q: 7, J: 6, T: 5, "9": 4.5, "8": 4, "7": 3.5, "6": 3,
  "5": 2.5, "4": 2, "3": 1.5, "2": 1,
};

export function isValidHandKey(key: string): boolean {
  return /^([2-9TJQKA])([2-9TJQKA])([so])?$/.test(key);
}

/**
 * Expand shorthand range notation into explicit hand keys:
 * "22+" -> all pairs from 22 to AA
 * "A2s+" -> A2s..AKs, "K9o+" -> K9o..KQo
 * "T9s" stays as-is.
 */
export function expandRange(range: string): string[] {
  const out: string[] = [];
  for (const raw of range.split(",")) {
    const token = raw.trim().toUpperCase();
    if (!token) continue;
    if (token.endsWith("+")) {
      out.push(...expandPlus(token.slice(0, -1)));
    } else {
      out.push(normalizeHandKey(token));
    }
  }
  return out;
}

function expandPlus(base: string): string[] {
  if (base.length === 2 && base[0] === base[1]) {
    // Pairs: "22+" -> 22,33,...,AA.
    const idx = RANKS.indexOf(base[0] as (typeof RANKS)[number]);
    if (idx < 0) throw new Error(`无法解析范围 "${base}+"`);
    const out: string[] = [];
    for (let i = 0; i <= idx; i++) out.push(RANKS[i] + RANKS[i]);
    return out;
  }
  const m = base.match(/^([2-9TJQKA])([2-9TJQKA])([SO])$/);
  if (!m) throw new Error(`无法解析范围 "${base}+"`);
  const hi = m[1];
  const lo = m[2];
  const suit = m[3].toLowerCase();
  const hiIdx = RANKS.indexOf(hi as (typeof RANKS)[number]);
  const loIdx = RANKS.indexOf(lo as (typeof RANKS)[number]);
  if (hiIdx < 0 || loIdx < 0 || loIdx <= hiIdx) {
    throw new Error(`无法解析范围 "${base}+"`);
  }
  const out: string[] = [];
  for (let i = loIdx; i > hiIdx; i--) {
    out.push(RANKS[hiIdx] + RANKS[i] + suit);
  }
  return out;
}

/**
 * Normalize a hand input into a canonical class key:
 * - "AhKh" / "AH KH" -> "AKs"
 * - "AKs" -> "AKs"
 * - "AA" -> "AA"
 */
export function normalizeHandKey(input: string): string {
  const cleaned = input.replace(/[\s,_-]/g, "").toUpperCase();
  const concrete = cleaned.match(/^([2-9TJQKA])([HCDS])([2-9TJQKA])([HCDS])$/);
  if (concrete) {
    const [r1, s1, r2, s2] = [concrete[1], concrete[2], concrete[3], concrete[4]];
    const rankKey = rankPairKey(r1, r2);
    if (r1 === r2) return rankKey;
    return rankKey + (s1 === s2 ? "s" : "o");
  }
  const klass = cleaned.match(/^([2-9TJQKA])([2-9TJQKA])([SO])$/);
  if (klass) {
    const [r1, r2, s] = [klass[1], klass[2], klass[3]];
    const rankKey = rankPairKey(r1, r2);
    if (r1 === r2) return rankKey;
    return rankKey + s.toLowerCase();
  }
  if (/^([2-9TJQKA])\1$/.test(cleaned)) return cleaned;
  throw new Error(`无法解析手牌 "${input}"，请使用 AKs/AKo/AA 或 AhKh 格式`);
}

function rankPairKey(r1: string, r2: string): string {
  const hi = RANK_INDEX[r1] >= RANK_INDEX[r2] ? r1 : r2;
  const lo = RANK_INDEX[r1] >= RANK_INDEX[r2] ? r2 : r1;
  return hi + lo;
}

/** Number of combos for a hand class: pair 6, suited 4, offsuit 12. */
export function comboCount(handKey: string): number {
  const key = normalizeHandKey(handKey);
  if (key.length === 2) return 6;
  return key.endsWith("s") ? 4 : 12;
}

function gapBonus(r1: string, r2: string): number {
  const gap = Math.abs(RANK_INDEX[r1] - RANK_INDEX[r2]);
  if (gap === 1) return 1;
  if (gap === 2) return 0;
  if (gap === 3) return -1;
  if (gap === 4) return -2;
  return -5;
}

/** Chen-style preflop strength score (higher = stronger). */
export function handScore(handKey: string): number {
  const key = normalizeHandKey(handKey);
  if (key.length === 2) {
    return Math.max(5, CHEN_POINT[key[0]] * 2);
  }
  const hi = key[0];
  const lo = key[1];
  let score = CHEN_POINT[hi];
  if (RANK_INDEX[hi] - RANK_INDEX[lo] <= 1 && RANK_INDEX[hi] - RANK_INDEX[lo] >= 0) {
    // Small bonus for connectedness on top of gap bonus below.
  }
  score += gapBonus(hi, lo) / 2;
  if (key.endsWith("s")) score += 2;
  if (RANK_INDEX[hi] === 14 && RANK_INDEX[lo] === 13) score += 0.5;
  return score;
}

/** Preflop hand-strength tier for range-grid coloring. */
export type HandStrength = "strong" | "medium" | "weak";

/**
 * Premium hands: pairs 99+ plus the big broadways and suited aces on top.
 * Used as the "strong" tier.
 */
const STRONG_PREMIUM = new Set([
  "99", "TT", "JJ", "QQ", "KK", "AA",
  "AKs", "AKo", "AQs", "AQo", "AJs", "ATs",
  "KQs", "KJs", "QJs", "JTs",
]);

/**
 * Playable offsuit hands (medium tier). Everything else offsuit is weak:
 * A2o-A8o, K2o-K9o, Q2o-Q9o, J2o-J9o, T2o-T8o, and all connectors/gappers
 * below T9 are dominated junk.
 */
const MEDIUM_OFFSUIT = new Set([
  "A9o", "ATo", "AJo",
  "KTo", "KJo", "KQo",
  "QTo", "QJo",
  "JTo",
  "T9o",
]);

function isWeakFormula(key: string): boolean {
  const hi = key[0];
  if (key[0] === key[1]) return false; // pairs are never weak
  const hiV = RANK_INDEX[hi];
  const loV = RANK_INDEX[key[1]];
  const gap = hiV - loV;
  const suited = key.endsWith("s");
  if (!suited) {
    // Only a small set of offsuit hands is playable; the rest is weak.
    return !MEDIUM_OFFSUIT.has(key);
  }
  // Suited: low suited gappers and tiny connectors are weak.
  if (hiV <= 4) return true;
  if (hiV <= 9 && gap >= 2) return true;
  if (gap >= 4 && hiV <= 12) return true;
  return false;
}

/** Classify a hand key into strong / medium / weak. */
export function handStrength(handKey: string): HandStrength {
  const key = normalizeHandKey(handKey);
  if (STRONG_PREMIUM.has(key)) return "strong";
  if (isWeakFormula(key)) return "weak";
  return "medium";
}

function buildAllHands(): string[] {
  const hands: string[] = [];
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i; j < RANKS.length; j++) {
      const key = RANKS[i] + RANKS[j];
      if (i === j) {
        hands.push(key);
      } else {
        hands.push(key + "s");
        hands.push(key + "o");
      }
    }
  }
  return hands;
}

/** All 169 hand classes, strongest first (approximate ordering). */
export const HAND_ORDER: string[] = buildAllHands().sort((a, b) => handScore(b) - handScore(a));

/** All 169 hand classes, weakest first. */
export const HAND_ORDER_WEAK_FIRST: string[] = [...HAND_ORDER].reverse();
