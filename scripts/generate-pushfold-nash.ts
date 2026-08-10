/**
 * Nash push/fold table generator.
 *
 * Replaces the authored approximations in src/gto/preflop/data/pushfold.ts
 * with locally solved (near-)Nash jam/call ranges:
 *
 * 1. A fixed-seed Monte Carlo estimates preflop all-in equity for every
 *    unordered pair of the 169 hand classes (suit-aware combo sampling,
 *    exact disjoint-combo counts for card-removal weights).
 * 2. Damped fictitious play solves the jam/call games:
 *    - HU: SB open-jams S bb effective, BB calls or folds.
 *    - 3-handed: BTN open-jams, SB then BB may call (double-calls ignored).
 * 3. Ranges are emitted to src/gto/preflop/data/pushfold-nash.ts in the
 *    same PushFoldTable shape the advice engine already consumes.
 *
 * Run: ./node_modules/.bin/ts-node --transpile-only scripts/generate-pushfold-nash.ts
 *
 * The result is a Monte Carlo approximation of Nash (equity noise ~±0.6%,
 * class-level card-removal weights), which is far closer to equilibrium
 * than the previous hand-authored tables.
 */

import * as fs from "fs";
import * as path from "path";
import { evaluateHand } from "../src/gto/postflop/hand-eval";
import {
  BB_CALL_VS_BTN_SHOVE as AUTHORED_BB_VS_BTN,
  BB_CALL_VS_SB_SHOVE as AUTHORED_BB_VS_SB,
  BTN_SHOVE as AUTHORED_BTN,
  SB_SHOVE as AUTHORED_SB,
} from "../src/gto/preflop/data/pushfold";
import { expandRange } from "../src/gto/preflop/hand";

const SAMPLES_PER_PAIR = Number(process.env.PUSHFOLD_SAMPLES || 8000);
const ITERATIONS = 400;
const DAMPING = 0.25;
const STACKS = [5, 8, 10, 12, 15, 20];

// ---------------------------------------------------------------
// Hand classes and combos (card id = rank*4 + suit, rank 0..12=A).
// ---------------------------------------------------------------

const RANK_CHARS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

interface HandClass {
  key: string;
  combos: [number, number][];
}

function buildClasses(): HandClass[] {
  const classes: HandClass[] = [];
  for (let hi = 12; hi >= 0; hi--) {
    for (let lo = hi; lo >= 0; lo--) {
      if (hi === lo) {
        const combos: [number, number][] = [];
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = s1 + 1; s2 < 4; s2++) {
            combos.push([hi * 4 + s1, hi * 4 + s2]);
          }
        }
        classes.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo], combos });
      } else {
        const suited: [number, number][] = [];
        const offsuit: [number, number][] = [];
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = 0; s2 < 4; s2++) {
            const combo: [number, number] = [hi * 4 + s1, lo * 4 + s2];
            if (s1 === s2) suited.push(combo);
            else offsuit.push(combo);
          }
        }
        classes.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo] + "s", combos: suited });
        classes.push({ key: RANK_CHARS[hi] + RANK_CHARS[lo] + "o", combos: offsuit });
      }
    }
  }
  return classes;
}

const CLASSES = buildClasses();
const N = CLASSES.length; // 169

// ---------------------------------------------------------------
// Deterministic RNG.
// ---------------------------------------------------------------

let seed = 0x2f6e2b1 >>> 0;
function rand(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

// ---------------------------------------------------------------
// Pairwise equity + disjoint-combo counts.
// ---------------------------------------------------------------

/** eq[i*N+j] = equity of class i vs class j (0-1). */
const eq = new Float64Array(N * N);
/** pairs[i*N+j] = number of disjoint (comboI, comboJ) pairs. */
const pairs = new Float64Array(N * N);

function computeEquities() {
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const A = CLASSES[i].combos;
      const B = CLASSES[j].combos;

      let disjoint = 0;
      for (const a of A) {
        for (const b of B) {
          if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) {
            disjoint++;
          }
        }
      }
      pairs[i * N + j] = disjoint;
      pairs[j * N + i] = disjoint;
      if (disjoint === 0) {
        eq[i * N + j] = 0.5;
        eq[j * N + i] = 0.5;
        continue;
      }

      let win = 0;
      let tie = 0;
      let total = 0;
      const board = [0, 0, 0, 0, 0];
      for (let s = 0; s < SAMPLES_PER_PAIR; s++) {
        const a = A[(rand() * A.length) | 0];
        let b = B[(rand() * B.length) | 0];
        let guard = 0;
        while (
          (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) &&
          guard++ < 32
        ) {
          b = B[(rand() * B.length) | 0];
        }
        if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) {
          continue;
        }
        let count = 0;
        let g2 = 0;
        while (count < 5 && g2++ < 64) {
          const c = (rand() * 52) | 0;
          if (c === a[0] || c === a[1] || c === b[0] || c === b[1]) continue;
          let dup = false;
          for (let k = 0; k < count; k++) if (board[k] === c) dup = true;
          if (dup) continue;
          board[count++] = c;
        }
        if (count < 5) continue;
        const ra = evaluateHand([a[0], a[1], board[0], board[1], board[2], board[3], board[4]]);
        const rb = evaluateHand([b[0], b[1], board[0], board[1], board[2], board[3], board[4]]);
        if (ra > rb) win++;
        else if (ra === rb) tie++;
        total++;
      }
      const e = total > 0 ? (win + tie * 0.5) / total : 0.5;
      eq[i * N + j] = e;
      eq[j * N + i] = 1 - e;
    }
    if (i % 20 === 0) {
      console.log(`equity: class ${i}/${N} (${Date.now() - t0}ms)`);
    }
  }
  console.log(`equity table done in ${Date.now() - t0}ms`);
}

/** Card-removal weight of villain class j given hero class i. */
function weightOf(i: number, j: number): number {
  return pairs[i * N + j] / CLASSES[i].combos.length;
}

// ---------------------------------------------------------------
// Solvers (damped fictitious play, thresholded to pure ranges).
// ---------------------------------------------------------------

function damp(current: number[], target: number[]) {
  for (let k = 0; k < N; k++) {
    current[k] += DAMPING * (target[k] - current[k]);
  }
}

function thresholded(strategy: number[]): Set<number> {
  const set = new Set<number>();
  strategy.forEach((value, index) => {
    if (value >= 0.5) set.add(index);
  });
  return set;
}

/** Equity of class j against a weighted range (with removal weights). */
function equityVsWeightedRange(j: number, range: number[]): number {
  let mass = 0;
  let acc = 0;
  for (let i = 0; i < N; i++) {
    if (range[i] <= 0) continue;
    const w = range[i] * weightOf(j, i);
    mass += w;
    acc += w * eq[j * N + i];
  }
  return mass > 0 ? acc / mass : 0.5;
}

interface HuSolution {
  jam: Set<number>;
  call: Set<number>;
}

/** HU: SB jams S effective, BB calls/folds. EVs in bb from each seat. */
function solveHeadsUp(S: number): HuSolution {
  const jam = new Array(N).fill(1);
  const call = new Array(N).fill(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // BB best response: call iff eq*2S - S > -1.
    const callBR = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      const e = equityVsWeightedRange(j, jam);
      callBR[j] = e * 2 * S - S > -1 ? 1 : 0;
    }
    damp(call, callBR);
    // SB best response: jam iff EV(jam) > EV(fold) = -0.5.
    const jamBR = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let mass = 0;
      let ev = 0;
      for (let j = 0; j < N; j++) {
        const w = weightOf(i, j);
        mass += w;
        ev += w * ((1 - call[j]) * 1 + call[j] * (eq[i * N + j] * 2 * S - S));
      }
      jamBR[i] = (mass > 0 ? ev / mass : 1) > -0.5 ? 1 : 0;
    }
    damp(jam, jamBR);
  }
  return { jam: thresholded(jam), call: thresholded(call) };
}

interface BtnSolution {
  jam: Set<number>;
  sbCall: Set<number>;
  bbCall: Set<number>;
}

/**
 * 3-handed: BTN jams S effective, SB (then BB) call or fold. Double calls
 * are ignored (rare; slightly loosens calls, slightly tightens jams).
 */
function solveButton(S: number): BtnSolution {
  const jam = new Array(N).fill(1);
  const sbCall = new Array(N).fill(0);
  const bbCall = new Array(N).fill(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const sbBR = new Array(N).fill(0);
    const bbBR = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      const e = equityVsWeightedRange(j, jam);
      // SB call: pot 2S + 1 dead BB, invest S (0.5 already posted).
      sbBR[j] = e * (2 * S + 1) - S > -0.5 ? 1 : 0;
      // BB call after SB folds: pot 2S + 0.5 dead SB.
      bbBR[j] = e * (2 * S + 0.5) - S > -1 ? 1 : 0;
    }
    damp(sbCall, sbBR);
    damp(bbCall, bbBR);

    const jamBR = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let mass = 0;
      let pSb = 0;
      let evSb = 0;
      let pBb = 0;
      let evBb = 0;
      for (let j = 0; j < N; j++) {
        const w = weightOf(i, j);
        mass += w;
        pSb += w * sbCall[j];
        evSb += w * sbCall[j] * (eq[i * N + j] * (2 * S + 1) - S);
        pBb += w * bbCall[j];
        evBb += w * bbCall[j] * (eq[i * N + j] * (2 * S + 0.5) - S);
      }
      if (mass <= 0) {
        jamBR[i] = 1;
        continue;
      }
      const callSb = pSb / mass;
      const callBb = pBb / mass;
      const evWhenSbCalls = pSb > 0 ? evSb / pSb : 0;
      const evWhenBbCalls = pBb > 0 ? evBb / pBb : 0;
      const ev =
        callSb * evWhenSbCalls +
        (1 - callSb) * (callBb * evWhenBbCalls + (1 - callBb) * 1.5);
      jamBR[i] = ev > 0 ? 1 : 0;
    }
    damp(jam, jamBR);
  }
  return {
    jam: thresholded(jam),
    sbCall: thresholded(sbCall),
    bbCall: thresholded(bbCall),
  };
}

// ---------------------------------------------------------------
// Output + sanity checks.
// ---------------------------------------------------------------

function keysOf(set: Set<number>): string[] {
  return CLASSES.map((c, index) => (set.has(index) ? c.key : ""))
    .filter(Boolean);
}

function comboMass(set: Set<number>): number {
  let mass = 0;
  set.forEach((index) => {
    mass += CLASSES[index].combos.length;
  });
  return mass;
}

function pct(set: Set<number>): string {
  return `${((comboMass(set) / 1326) * 100).toFixed(1)}%`;
}

function mustContain(name: string, set: Set<number>, keys: string[]) {
  const have = new Set(keysOf(set));
  for (const key of keys) {
    if (!have.has(key)) {
      throw new Error(`${name}: expected ${key} in range — suspect an EV accounting bug`);
    }
  }
}

function authoredMass(tables: { stackBB: number; hands: string[] }[], stack: number): number {
  const table = tables.reduce((best, t) =>
    Math.abs(t.stackBB - stack) < Math.abs(best.stackBB - stack) ? t : best
  );
  const set = new Set<string>();
  for (const h of table.hands) for (const k of expandRange(h)) set.add(k);
  let mass = 0;
  CLASSES.forEach((c) => {
    if (set.has(c.key)) mass += c.combos.length;
  });
  return mass;
}

function main() {
  console.log(`solving with ${SAMPLES_PER_PAIR} samples/pair, ${ITERATIONS} iterations`);
  computeEquities();

  const hu = new Map<number, HuSolution>();
  const btn = new Map<number, BtnSolution>();
  for (const S of STACKS) {
    hu.set(S, solveHeadsUp(S));
    btn.set(S, solveButton(S));
  }

  // Ranges tighten monotonically as stacks deepen; borderline Monte Carlo
  // flips are cleaned by intersecting each stack with the shallower one.
  for (let k = 1; k < STACKS.length; k++) {
    const prev = STACKS[k - 1];
    const cur = STACKS[k];
    for (const pick of [
      (s: number) => hu.get(s)!.jam,
      (s: number) => hu.get(s)!.call,
      (s: number) => btn.get(s)!.jam,
      (s: number) => btn.get(s)!.bbCall,
    ]) {
      const wider = pick(prev);
      const narrower = pick(cur);
      narrower.forEach((index) => {
        if (!wider.has(index)) narrower.delete(index);
      });
    }
  }

  for (const S of STACKS) {
    const h = hu.get(S)!;
    const b = btn.get(S)!;
    console.log(
      `S=${S}bb  SB jam ${pct(h.jam)}  BB call ${pct(h.call)}  BTN jam ${pct(b.jam)}  BB call-vs-BTN ${pct(b.bbCall)}`
    );
  }

  // Sanity: premium hands always jam; ranges widen as stacks shrink.
  for (const S of STACKS) {
    mustContain(`SB jam ${S}bb`, hu.get(S)!.jam, ["AA", "KK", "QQ", "AKs", "AKo"]);
    mustContain(`BB call ${S}bb`, hu.get(S)!.call, ["AA", "KK", "QQ", "AKs"]);
    mustContain(`BTN jam ${S}bb`, btn.get(S)!.jam, ["AA", "KK", "QQ", "AKs"]);
  }
  // Anchor validation against the published HU Nash jam/fold equilibrium
  // (HoldemResources-style charts): 10bb SB jams ~58.3% and BB calls
  // ~37.4%; 15bb ~45%/~28%; 20bb ~41%/~22%. A miss outside these bands
  // means an EV-accounting bug, not a discovery.
  const frac = (set: Set<number>) => comboMass(set) / 1326;
  const anchors: Array<[string, number, number, number]> = [
    ["SB jam 10bb", frac(hu.get(10)!.jam), 0.54, 0.62],
    ["BB call 10bb", frac(hu.get(10)!.call), 0.33, 0.41],
    ["SB jam 15bb", frac(hu.get(15)!.jam), 0.40, 0.50],
    ["BB call 15bb", frac(hu.get(15)!.call), 0.24, 0.32],
    ["SB jam 20bb", frac(hu.get(20)!.jam), 0.34, 0.46],
    ["BB call 20bb", frac(hu.get(20)!.call), 0.18, 0.26],
  ];
  for (const [name, value, lo, hi] of anchors) {
    if (value < lo || value > hi) {
      throw new Error(
        `${name} = ${(value * 100).toFixed(1)}% outside published Nash band [${lo * 100}%, ${hi * 100}%]`
      );
    }
    console.log(`anchor ok: ${name} = ${(value * 100).toFixed(1)}%`);
  }
  // Informational: the retired authored tables were practical/tight and sit
  // well inside true jam-or-fold Nash; print the comparison for the record.
  for (const [name, tables, solved] of [
    ["SB jam", AUTHORED_SB, (s: number) => hu.get(s)!.jam],
    ["BTN jam", AUTHORED_BTN, (s: number) => btn.get(s)!.jam],
    ["BB call vs SB", AUTHORED_BB_VS_SB, (s: number) => hu.get(s)!.call],
    ["BB call vs BTN", AUTHORED_BB_VS_BTN, (s: number) => btn.get(s)!.bbCall],
  ] as const) {
    for (const S of [10, 15]) {
      const authored = authoredMass(tables, S);
      const mass = comboMass(solved(S));
      console.log(
        `${name} ${S}bb: solved ${mass} combos vs authored ${authored} (${(
          (mass / authored) * 100
        ).toFixed(0)}%)`
      );
    }
  }

  const table = (stackBB: number, set: Set<number>) =>
    `  {\n    stackBB: ${stackBB},\n    hands: R(\n      "${keysOf(set).join(",")}"\n    ),\n  },`;

  const file = `/**
 * Locally solved (near-)Nash push/fold tables. GENERATED FILE — do not edit
 * by hand; regenerate with:
 *   ./node_modules/.bin/ts-node --transpile-only scripts/generate-pushfold-nash.ts
 *
 * Method: fixed-seed Monte Carlo preflop equities (${SAMPLES_PER_PAIR} samples per
 * class pair, ~±0.6% noise) + damped fictitious play (${ITERATIONS} iterations)
 * on the jam/call games. Card removal handled with exact disjoint-combo
 * counts at hand-class granularity. 3-handed BTN solve ignores double
 * calls. Explicit hand-key lists; absent hands fold.
 */

import type { AdviceTrust } from "../../trust";
import type { PushFoldTable } from "./pushfold";

const R = (hands: string) => hands.split(",").map((h) => h.trim());

/** Provenance of these tables (locally solved). */
export const PUSHFOLD_NASH_TRUST: AdviceTrust = "solved";

/** SB open-jams vs BB (heads-up / folded to SB). */
export const SB_SHOVE_NASH: PushFoldTable[] = [
${STACKS.map((S) => table(S, hu.get(S)!.jam)).join("\n")}
];

/** BB calls a SB open-jam. */
export const BB_CALL_VS_SB_SHOVE_NASH: PushFoldTable[] = [
${STACKS.map((S) => table(S, hu.get(S)!.call)).join("\n")}
];

/** BTN open-jams vs the blinds (3+ handed). */
export const BTN_SHOVE_NASH: PushFoldTable[] = [
${STACKS.map((S) => table(S, btn.get(S)!.jam)).join("\n")}
];

/** BB calls a BTN (or CO) open-jam after the SB folds. */
export const BB_CALL_VS_BTN_SHOVE_NASH: PushFoldTable[] = [
${STACKS.map((S) => table(S, btn.get(S)!.bbCall)).join("\n")}
];
`;

  const out = path.join(__dirname, "..", "src", "gto", "preflop", "data", "pushfold-nash.ts");
  fs.writeFileSync(out, file);
  console.log(`wrote ${out}`);
}

main();
