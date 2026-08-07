// ============================================================
// Perfect-hash lookup tables for the poker hand evaluator.
//
// Algorithm ported from phevaluator by Henry Lee,
//   Apache-2.0, https://github.com/HenryRLee/PokerHandEvaluator
//
// This file PORTS the technique (it does not copy verbatim source):
//   * A "rank" lookup for non-flush hands, keyed by a dynamic-programming
//     perfect hash of the quinary (per-rank count) vector.
//   * A "flush" lookup for flush hands, keyed by the 13-bit mask of which
//     ranks are present in the flush suit.
//
// We generate both tables at module load. Generation enumerates the 7462
// distinct 5-card equivalence classes once, ranks them strongest->weakest,
// then fills the lookup tables. Generation is deterministic and fast
// (a few milliseconds), so the tables are reproducible rather than being
// committed as opaque magic numbers.
//
// CONVENTION (internal): a smaller value == a stronger hand, matching
// phevaluator. Values run 1 (royal flush) .. 7462 (7-5-4-3-2 high card).
// The public hand-eval.ts wrapper converts this to the project's
// "higher == better, category*1e6 + tiebreaker" convention.
// ============================================================

export const NUM_EQUIV_CLASSES = 7462;

// Internal hand-category ordering, strongest first. Used only for ranking
// the equivalence classes during table generation. (Plain enum, not const
// enum: this project's tsconfig enables isolatedModules.)
enum Cat {
  STRAIGHT_FLUSH = 8,
  QUADS = 7,
  FULL_HOUSE = 6,
  FLUSH = 5,
  STRAIGHT = 4,
  TRIPS = 3,
  TWO_PAIR = 2,
  PAIR = 1,
  HIGH_CARD = 0,
}

const MAX_CARDS = 7;
const NUM_RANKS = 13;
const MAX_PER_RANK = 4;

// dp[k][r] over a fixed per-rank cap. We build a full dp[cap+1][cards+1][ranks+1].
function buildDP(): number[][][] {
  // dp[c][k][r] = number of ways to choose a quinary vector of total k cards
  // over the first r ranks, with each rank count in [0..c].
  const dp: number[][][] = [];
  for (let c = 0; c <= MAX_PER_RANK; c++) {
    dp[c] = [];
    for (let k = 0; k <= MAX_CARDS; k++) {
      dp[c][k] = new Array(NUM_RANKS + 1).fill(0);
    }
  }
  for (let c = 0; c <= MAX_PER_RANK; c++) {
    // zero ranks -> only k=0 is achievable (1 way)
    dp[c][0][0] = 1;
    for (let r = 1; r <= NUM_RANKS; r++) {
      for (let k = 0; k <= MAX_CARDS; k++) {
        let sum = 0;
        for (let i = 0; i <= Math.min(c, k); i++) {
          sum += dp[c][k - i][r - 1];
        }
        dp[c][k][r] = sum;
      }
    }
  }
  return dp;
}

const DP = buildDP();

/** Perfect hash of a quinary vector: how many quinary vectors (with the same
 *  cap) sort before this one, in the DP ordering. */
function hashQuinary(quinary: number[], numCards: number): number {
  let sum = 0;
  let k = numCards;
  // iterate ranks from high index (12) down to 0
  for (let r = NUM_RANKS; r >= 1; r--) {
    const cnt = quinary[r - 1];
    // number of vectors that come "before" this one at this rank position
    for (let i = 0; i < cnt; i++) {
      sum += DP[MAX_PER_RANK][k - i][r - 1];
    }
    k -= cnt;
  }
  return sum;
}

// Largest hash value we can produce for 7 cards, +1 for table size.
const RANK_TABLE_SIZE = DP[MAX_PER_RANK][MAX_CARDS][NUM_RANKS];
const RANK_TABLE = new Int32Array(RANK_TABLE_SIZE).fill(0);
const FLUSH_TABLE = new Int32Array(1 << NUM_RANKS);

function packRanks(ranks: number[]): number {
  let v = 0;
  for (const r of ranks) v = v * 13 + r;
  return v;
}

// All straight rank masks (A-high down to 5-high; wheel A=12 wraps to low).
function straightMasks(): Set<number> {
  const out = new Set<number>();
  for (let hi = 12; hi >= 4; hi--) {
    let mask = 0;
    for (let k = 0; k < 5; k++) mask |= 1 << (hi - k);
    out.add(mask);
  }
  // wheel A-2-3-4-5: bits 12,0,1,2,3
  out.add((1 << 12) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3));
  return out;
}

const STRAIGHT_MASK_SET = straightMasks();

interface Shape {
  cat: Cat;
  tiebreak: number;
  quinary?: number[];
  mask?: number;
}

function allShapes(): Shape[] {
  const shapes: Shape[] = [];

  // ---- straight flush & flush (mask-based) ----
  for (const mask of STRAIGHT_MASK_SET) {
    shapes.push({ cat: Cat.STRAIGHT_FLUSH, tiebreak: mask, mask });
  }
  for (let mask = 0; mask < 1 << NUM_RANKS; mask++) {
    if (STRAIGHT_MASK_SET.has(mask)) continue;
    const n = popcount(mask);
    if (n === 5) shapes.push({ cat: Cat.FLUSH, tiebreak: mask, mask });
  }

  // ---- quads: 4 of rank q + kicker k ----
  for (let q = 12; q >= 0; q--) {
    for (let k = 12; k >= 0; k--) {
      if (k === q) continue;
      const quin = new Array(13).fill(0);
      quin[q] = 4;
      quin[k] = 1;
      shapes.push({ cat: Cat.QUADS, tiebreak: packRanks([q, k]), quinary: quin });
    }
  }

  // ---- full house: trips t + pair p ----
  for (let t = 12; t >= 0; t--) {
    for (let p = 12; p >= 0; p--) {
      if (p === t) continue;
      const quin = new Array(13).fill(0);
      quin[t] = 3;
      quin[p] = 2;
      shapes.push({ cat: Cat.FULL_HOUSE, tiebreak: packRanks([t, p]), quinary: quin });
    }
  }

  // ---- straight (no flush) ----
  for (const mask of STRAIGHT_MASK_SET) {
    const quin = new Array(13).fill(0);
    for (const r of maskToDesc(mask)) quin[r] = 1;
    shapes.push({ cat: Cat.STRAIGHT, tiebreak: mask, quinary: quin });
  }

  // ---- trips: trips t + two distinct kickers ----
  for (let t = 12; t >= 0; t--) {
    for (let k1 = 12; k1 >= 0; k1--) {
      if (k1 === t) continue;
      for (let k2 = k1 - 1; k2 >= 0; k2--) {
        if (k2 === t) continue;
        const quin = new Array(13).fill(0);
        quin[t] = 3;
        quin[k1] = 1;
        quin[k2] = 1;
        shapes.push({ cat: Cat.TRIPS, tiebreak: packRanks([t, k1, k2]), quinary: quin });
      }
    }
  }

  // ---- two pair: hp + lp + kicker k ----
  for (let hp = 12; hp >= 0; hp--) {
    for (let lp = hp - 1; lp >= 0; lp--) {
      for (let k = 12; k >= 0; k--) {
        if (k === hp || k === lp) continue;
        const quin = new Array(13).fill(0);
        quin[hp] = 2;
        quin[lp] = 2;
        quin[k] = 1;
        shapes.push({ cat: Cat.TWO_PAIR, tiebreak: packRanks([hp, lp, k]), quinary: quin });
      }
    }
  }

  // ---- one pair: pair p, three distinct kickers ----
  for (let p = 12; p >= 0; p--) {
    for (let k1 = 12; k1 >= 0; k1--) {
      if (k1 === p) continue;
      for (let k2 = k1 - 1; k2 >= 0; k2--) {
        if (k2 === p) continue;
        for (let k3 = k2 - 1; k3 >= 0; k3--) {
          if (k3 === p) continue;
          const quin = new Array(13).fill(0);
          quin[p] = 2;
          quin[k1] = 1;
          quin[k2] = 1;
          quin[k3] = 1;
          shapes.push({ cat: Cat.PAIR, tiebreak: packRanks([p, k1, k2, k3]), quinary: quin });
        }
      }
    }
  }

  // ---- high card: 5 distinct ranks, not a straight ----
  for (let mask = 0; mask < 1 << NUM_RANKS; mask++) {
    if (popcount(mask) !== 5) continue;
    if (STRAIGHT_MASK_SET.has(mask)) continue;
    const quin = new Array(13).fill(0);
    for (const r of maskToDesc(mask)) quin[r] = 1;
    shapes.push({ cat: Cat.HIGH_CARD, tiebreak: packRanks(maskToDesc(mask)), quinary: quin });
  }

  return shapes;
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

// ranks present in mask, descending (high rank index first)
function maskToDesc(mask: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

// value (1..7462) -> internal category (Cat) and within-category ordinal
// (1 = weakest in that category). These let the public wrapper produce the
// project's "category * 1e6 + tiebreak, higher == better" rank.
export const VALUE_TO_CATEGORY = new Int8Array(NUM_EQUIV_CLASSES + 1);
export const VALUE_TO_ORDINAL = new Int32Array(NUM_EQUIV_CLASSES + 1);

let generated = false;
function generateTables(): void {
  if (generated) return;
  generated = true;

  const shapes = allShapes();
  // Sort strongest first: higher category first, then higher tiebreak.
  shapes.sort((a, b) => b.cat - a.cat || b.tiebreak - a.tiebreak);

  const catCount: Record<number, number> = {};
  for (const s of shapes) catCount[s.cat] = (catCount[s.cat] || 0) + 1;
  const catSeen: Record<number, number> = {};

  for (let i = 0; i < shapes.length; i++) {
    const value = i + 1; // 1 = strongest
    const s = shapes[i];
    // shapes are strongest-first, so the k-th seen in a category is the
    // k-th strongest; ordinal (1=weakest) = catCount - k + 1.
    catSeen[s.cat] = (catSeen[s.cat] || 0) + 1;
    VALUE_TO_CATEGORY[value] = s.cat;
    VALUE_TO_ORDINAL[value] = catCount[s.cat] - catSeen[s.cat] + 1;

    if (s.mask !== undefined && (s.cat === Cat.FLUSH || s.cat === Cat.STRAIGHT_FLUSH)) {
      FLUSH_TABLE[s.mask] = value;
    } else if (s.quinary) {
      const h = hashQuinary(s.quinary, 5);
      RANK_TABLE[h] = value;
    }
  }

  if (shapes.length !== NUM_EQUIV_CLASSES) {
    throw new Error(
      `eval-tables: generated ${shapes.length} equivalence classes, expected ${NUM_EQUIV_CLASSES}`,
    );
  }
}

const memo6 = new Map<number, number>();
const memo7 = new Map<number, number>();

function bestNonFlushValue(quinary: number[], numCards: number): number {
  generateTables();
  if (numCards === 5) {
    return RANK_TABLE[hashQuinary(quinary, 5)];
  }
  const memo = numCards === 6 ? memo6 : memo7;
  const key = hashQuinary(quinary, numCards);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let best = Number.POSITIVE_INFINITY;
  const toRemove = numCards - 5;

  const work = quinary.slice();
  const recurse = (rank: number, remaining: number): void => {
    if (remaining === 0) {
      const v = RANK_TABLE[hashQuinary(work, 5)];
      if (v > 0 && v < best) best = v;
      return;
    }
    if (rank < 0) return;
    const max = Math.min(work[rank], remaining);
    for (let drop = 0; drop <= max; drop++) {
      work[rank] -= drop;
      recurse(rank - 1, remaining - drop);
      work[rank] += drop;
    }
  };
  recurse(12, toRemove);

  memo.set(key, best);
  return best;
}

export function lookupValue(
  quinary: number[],
  numCards: number,
  flushMask: number
): number {
  generateTables();
  const nonFlush = bestNonFlushValue(quinary, numCards);
  if (flushMask < 0) return nonFlush;

  const flushValue = bestFlushValue(flushMask);
  return Math.min(nonFlush, flushValue);
}

function bestFlushValue(flushMask: number): number {
  const n = popcount(flushMask);
  if (n === 5) return FLUSH_TABLE[flushMask];
  let best = Number.POSITIVE_INFINITY;
  const bits: number[] = [];
  for (let r = 0; r < NUM_RANKS; r++) if (flushMask & (1 << r)) bits.push(r);
  const choose = (start: number, picked: number[]): void => {
    if (picked.length === 5) {
      let m = 0;
      for (const b of picked) m |= 1 << b;
      const v = FLUSH_TABLE[m];
      if (v > 0 && v < best) best = v;
      return;
    }
    for (let i = start; i < bits.length; i++) {
      picked.push(bits[i]);
      choose(i + 1, picked);
      picked.pop();
    }
  };
  choose(0, []);
  return best;
}

// Eagerly build tables at module load so first eval is fast and the count
// invariant (7462) is checked immediately.
generateTables();
