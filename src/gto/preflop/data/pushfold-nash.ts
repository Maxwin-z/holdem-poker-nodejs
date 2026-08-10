/**
 * Locally solved (near-)Nash push/fold tables. GENERATED FILE — do not edit
 * by hand; regenerate with:
 *   ./node_modules/.bin/ts-node --transpile-only scripts/generate-pushfold-nash.ts
 *
 * Method: fixed-seed Monte Carlo preflop equities (8000 samples per
 * class pair, ~±0.6% noise) + damped fictitious play (400 iterations)
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
  {
    stackBB: 5,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q7o,Q6s,Q6o,Q5s,Q5o,Q4s,Q4o,Q3s,Q3o,Q2s,Q2o,JJ,JTs,JTo,J9s,J9o,J8s,J8o,J7s,J7o,J6s,J6o,J5s,J5o,J4s,J4o,J3s,J3o,J2s,TT,T9s,T9o,T8s,T8o,T7s,T7o,T6s,T6o,T5s,T4s,T3s,T2s,99,98s,98o,97s,97o,96s,95s,94s,88,87s,87o,86s,86o,85s,84s,77,76s,76o,75s,74s,66,65s,64s,63s,55,54s,53s,44,43s,33,22"
    ),
  },
  {
    stackBB: 8,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q7o,Q6s,Q6o,Q5s,Q5o,Q4s,Q3s,Q2s,JJ,JTs,JTo,J9s,J9o,J8s,J8o,J7s,J7o,J6s,J5s,J4s,J3s,J2s,TT,T9s,T9o,T8s,T8o,T7s,T7o,T6s,T5s,T4s,99,98s,98o,97s,97o,96s,95s,88,87s,87o,86s,85s,84s,77,76s,76o,75s,74s,66,65s,64s,55,54s,53s,44,43s,33,22"
    ),
  },
  {
    stackBB: 10,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q7o,Q6s,Q5s,Q4s,Q3s,Q2s,JJ,JTs,JTo,J9s,J9o,J8s,J8o,J7s,J6s,J5s,J4s,J3s,TT,T9s,T9o,T8s,T8o,T7s,T6s,T5s,T4s,99,98s,98o,97s,97o,96s,95s,88,87s,87o,86s,85s,77,76s,76o,75s,74s,66,65s,64s,55,54s,53s,44,43s,33,22"
    ),
  },
  {
    stackBB: 12,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,JJ,JTs,JTo,J9s,J9o,J8s,J8o,J7s,J6s,J5s,J4s,TT,T9s,T9o,T8s,T8o,T7s,T6s,99,98s,98o,97s,96s,95s,88,87s,87o,86s,85s,77,76s,75s,74s,66,65s,64s,55,54s,53s,44,33,22"
    ),
  },
  {
    stackBB: 15,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K5s,K4s,K3s,K2s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q7s,Q6s,Q5s,Q4s,JJ,JTs,JTo,J9s,J9o,J8s,J7s,J6s,J5s,TT,T9s,T9o,T8s,T8o,T7s,T6s,99,98s,98o,97s,96s,88,87s,86s,85s,77,76s,75s,66,65s,55,54s,44,33,22"
    ),
  },
  {
    stackBB: 20,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K7s,K6s,K5s,K4s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q7s,Q6s,JJ,JTs,JTo,J9s,J9o,J8s,J7s,TT,T9s,T9o,T8s,T7s,99,98s,98o,97s,96s,88,87s,86s,77,76s,75s,66,65s,55,54s,44,33,22"
    ),
  },
];

/** BB calls a SB open-jam. */
export const BB_CALL_VS_SB_SHOVE_NASH: PushFoldTable[] = [
  {
    stackBB: 5,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q7o,Q6s,Q6o,Q5s,Q5o,Q4s,Q4o,Q3s,Q3o,Q2s,Q2o,JJ,JTs,JTo,J9s,J9o,J8s,J8o,J7s,J7o,J6s,J6o,J5s,J5o,J4s,J3s,J2s,TT,T9s,T9o,T8s,T8o,T7s,T7o,T6s,T5s,T4s,99,98s,98o,97s,96s,95s,88,87s,86s,77,76s,66,55,44,33,22"
    ),
  },
  {
    stackBB: 8,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q6s,Q5s,Q4s,JJ,JTs,JTo,J9s,J9o,J8s,J7s,TT,T9s,T9o,T8s,99,98s,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 10,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K3s,K2s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q7s,JJ,JTs,JTo,J9s,J8s,TT,T9s,99,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 12,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K5s,K4s,QQ,QJs,QJo,QTs,QTo,Q9s,Q8s,JJ,JTs,JTo,J9s,TT,99,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 15,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K7s,QQ,QJs,QJo,QTs,QTo,Q9s,JJ,JTs,TT,99,88,77,66,55,44,33"
    ),
  },
  {
    stackBB: 20,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A3s,A2s,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,QQ,QJs,QTs,JJ,TT,99,88,77,66,55,44,33"
    ),
  },
];

/** BTN open-jams vs the blinds (3+ handed). */
export const BTN_SHOVE_NASH: PushFoldTable[] = [
  {
    stackBB: 5,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K3s,K2s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q7s,Q6s,Q5s,JJ,JTs,JTo,J9s,J9o,J8s,J7s,TT,T9s,T8s,T7s,99,98s,97s,88,87s,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 8,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K7s,K6s,K5s,K4s,QQ,QJs,QJo,QTs,QTo,Q9s,Q8s,JJ,JTs,JTo,J9s,J8s,TT,T9s,T8s,T7s,99,98s,97s,88,87s,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 10,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K8s,K7s,K6s,QQ,QJs,QJo,QTs,QTo,Q9s,Q8s,JJ,JTs,JTo,J9s,J8s,TT,T9s,T8s,T7s,99,98s,97s,88,87s,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 12,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K8s,K7s,QQ,QJs,QJo,QTs,QTo,Q9s,Q8s,JJ,JTs,JTo,J9s,J8s,TT,T9s,T8s,99,98s,97s,88,87s,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 15,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A5s,A5o,A4s,A3s,A2s,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K7s,QQ,QJs,QJo,QTs,QTo,Q9s,JJ,JTs,JTo,J9s,J8s,TT,T9s,T8s,99,98s,88,87s,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 20,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KK,KQs,KQo,KJs,KJo,KTs,K9s,K7s,QQ,QJs,QJo,QTs,Q9s,JJ,JTs,JTo,J9s,J8s,TT,T9s,T8s,99,98s,88,77,66,55,44,33,22"
    ),
  },
];

/** BB calls a BTN (or CO) open-jam after the SB folds. */
export const BB_CALL_VS_BTN_SHOVE_NASH: PushFoldTable[] = [
  {
    stackBB: 5,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,QQ,QJs,QJo,QTs,QTo,Q9s,Q9o,Q8s,Q8o,Q7s,Q6s,Q5s,Q4s,Q3s,JJ,JTs,JTo,J9s,J9o,J8s,J7s,TT,T9s,T9o,T8s,T7s,99,98s,97s,88,87s,86s,77,76s,66,65s,55,44,33,22"
    ),
  },
  {
    stackBB: 8,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K7s,QQ,QJs,QJo,QTs,QTo,Q9s,JJ,JTs,TT,99,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 10,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A2s,KK,KQs,KQo,KJs,KJo,KTs,KTo,K9s,QQ,QJs,QJo,QTs,JJ,JTs,TT,99,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 12,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A5s,A4s,A3s,A2s,KK,KQs,KQo,KJs,KJo,KTs,QQ,QJs,JJ,TT,99,88,77,66,55,44,33,22"
    ),
  },
  {
    stackBB: 15,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A6s,A5s,KK,KQs,KQo,KJs,KJo,KTs,QQ,QJs,JJ,TT,99,88,77,66,55,44"
    ),
  },
  {
    stackBB: 20,
    hands: R(
      "AA,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A8s,KK,KQs,KQo,KJs,QQ,JJ,TT,99,88,77,66,55"
    ),
  },
];
