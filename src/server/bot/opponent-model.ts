import type { BotAction, OpponentTendencies } from "./types";

interface PlayerStats {
  hands: number;
  vpipHands: number;
  pfrHands: number;
  foldToRaiseOpportunities: number;
  foldsToRaise: number;
  postflopActions: number;
  postflopFolds: number;
  postflopCalls: number;
  postflopAggressive: number;
  handWasVpip: boolean;
  handWasPfr: boolean;
}

function emptyStats(): PlayerStats {
  return {
    hands: 0,
    vpipHands: 0,
    pfrHands: 0,
    foldToRaiseOpportunities: 0,
    foldsToRaise: 0,
    postflopActions: 0,
    postflopFolds: 0,
    postflopCalls: 0,
    postflopAggressive: 0,
    handWasVpip: false,
    handWasPfr: false,
  };
}

const ratio = (part: number, total: number) =>
  total > 0 ? part / total : 0;

/** Room-scoped observations. It only models human actions visible at table. */
export class OpponentModel {
  private stats: Record<string, PlayerStats> = {};

  /** Plain data for the room snapshot; read tendencies survive a restart. */
  snapshot(): Record<string, PlayerStats> {
    return JSON.parse(JSON.stringify(this.stats));
  }

  static fromSnapshot(data: unknown): OpponentModel {
    const model = new OpponentModel();
    if (data && typeof data === "object") {
      Object.entries(data as Record<string, Partial<PlayerStats>>).forEach(
        ([token, stats]) => {
          model.stats[token] = { ...emptyStats(), ...stats };
        }
      );
    }
    return model;
  }

  beginHand(tokens: string[]) {
    tokens.forEach((token) => {
      const stats = this.stats[token] || (this.stats[token] = emptyStats());
      stats.hands += 1;
      stats.handWasVpip = false;
      stats.handWasPfr = false;
    });
  }

  observe(input: {
    token: string;
    round: number;
    action: BotAction;
    facingRaise: boolean;
  }) {
    const stats = this.stats[input.token] ||
      (this.stats[input.token] = emptyStats());
    if (input.round === 0) {
      if (["call", "raise", "allin"].includes(input.action) && !stats.handWasVpip) {
        stats.handWasVpip = true;
        stats.vpipHands += 1;
      }
      if (["raise", "allin"].includes(input.action) && !stats.handWasPfr) {
        stats.handWasPfr = true;
        stats.pfrHands += 1;
      }
      if (input.facingRaise && input.action === "fold") {
        stats.foldToRaiseOpportunities += 1;
        stats.foldsToRaise += 1;
      } else if (input.facingRaise) {
        stats.foldToRaiseOpportunities += 1;
      }
      return;
    }

    stats.postflopActions += 1;
    if (input.action === "fold") stats.postflopFolds += 1;
    if (input.action === "call") stats.postflopCalls += 1;
    if (["bet", "raise", "allin"].includes(input.action)) {
      stats.postflopAggressive += 1;
    }
  }

  summarize(tokens: string[]): OpponentTendencies | undefined {
    const rows = tokens.map((token) => this.stats[token]).filter(Boolean);
    const hands = rows.reduce((sum, row) => sum + row.hands, 0);
    if (hands < Math.max(8, tokens.length * 4)) return undefined;
    const total = (key: keyof PlayerStats) =>
      rows.reduce((sum, row) => sum + Number(row[key]), 0);
    return {
      sampleHands: hands,
      vpip: ratio(total("vpipHands"), hands),
      pfr: ratio(total("pfrHands"), hands),
      foldToRaise: ratio(
        total("foldsToRaise"),
        total("foldToRaiseOpportunities")
      ),
      postflopFold: ratio(total("postflopFolds"), total("postflopActions")),
      postflopCall: ratio(total("postflopCalls"), total("postflopActions")),
      postflopAggression: ratio(
        total("postflopAggressive"),
        total("postflopActions")
      ),
    };
  }
}
