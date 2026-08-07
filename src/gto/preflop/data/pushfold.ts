/**
 * Short-stack push/fold tables (hero in BB / villain shove), 100bb-style
 * guidance simplified to an all-in-or-fold game.
 *
 * IMPORTANT: these are authored approximations of standard HU push/fold
 * charts (rake-free), NOT exact Nash solutions. They are intentionally
 * slightly loose, matching the product's "standard, slightly loose" goal.
 * Exact short-stack Nash solving is planned for a later phase.
 */

export interface PushFoldTable {
  /** Nearest stack bucket the table applies to (in bb). */
  stackBB: number;
  hands: string[];
}

const R = (hands: string) => hands.split(",").map((h) => h.trim());

/** SB shoves vs BB (heads-up / folded to SB). */
export const SB_SHOVE: PushFoldTable[] = [
  {
    stackBB: 10,
    hands: R(
      "22+,A2s+,A5o+,K2s+,K9o+,Q5s+,QTo+,J7s+,JTo+,T7s+,T9s,97s+,98s,87s,86s,76s,65s,54s"
    ),
  },
  {
    stackBB: 15,
    hands: R(
      "22+,A2s+,A9o+,K4s+,KTo+,Q8s+,QJo,J8s+,JTo,T8s+,98s,97s,87s,76s,65s"
    ),
  },
  {
    stackBB: 20,
    hands: R("22+,A2s+,ATo+,K7s+,KQo,Q9s+,QJo,J9s+,JTo,T9s,98s,87s,76s"),
  },
];

/** BTN shoves vs blinds (3+ handed). */
export const BTN_SHOVE: PushFoldTable[] = [
  {
    stackBB: 10,
    hands: R("22+,A2s+,A8o+,K3s+,KTo+,Q7s+,QJo,J8s+,JTo,T8s+,98s,87s,76s"),
  },
  {
    stackBB: 15,
    hands: R("22+,A2s+,ATo+,K7s+,KQo,Q9s+,QJo,J9s+,JTo,T9s,98s,87s"),
  },
];

/** BB calls a SB shove. */
export const BB_CALL_VS_SB_SHOVE: PushFoldTable[] = [
  {
    stackBB: 10,
    hands: R("22+,A2s+,A5o+,K4s+,K9o+,Q8s+,QTo+,J8s+,JTo,T8s+,98s,87s"),
  },
  {
    stackBB: 15,
    hands: R("22+,A2s+,A8o+,K6s+,KTo+,Q9s+,QJo,J9s+,JTo,T9s,98s,87s"),
  },
  {
    stackBB: 20,
    hands: R("22+,A2s+,ATo+,K8s+,KQo,QTs+,QJo,JTs,T9s,98s"),
  },
];

/** BB calls a BTN (or CO) shove. */
export const BB_CALL_VS_BTN_SHOVE: PushFoldTable[] = [
  {
    stackBB: 10,
    hands: R("22+,A2s+,A9o+,K5s+,KTo+,Q9s+,QJo,J9s+,JTo,T9s,98s"),
  },
  {
    stackBB: 15,
    hands: R("22+,A3s+,ATo+,K8s+,KQo,QTs+,QJo,JTs,T9s,98s"),
  },
];

export function nearestTable(
  tables: PushFoldTable[],
  stackBB: number
): PushFoldTable {
  let best = tables[0];
  for (const t of tables) {
    if (Math.abs(t.stackBB - stackBB) < Math.abs(best.stackBB - stackBB)) {
      best = t;
    }
  }
  return best;
}
