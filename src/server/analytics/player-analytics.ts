import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { PreflopAdvice } from "../../gto/preflop/types";
import type { PostflopAdvice } from "../../gto/postflop/types";
import type {
  AnalyticsInsight,
  AnalyticsWindow,
  PlayerAnalyticsReport,
  RateMetric,
} from "../../shared/playerAnalytics";
import { gradeAiReplayAction } from "../../shared/aiReplay";
import { estimateEvLossBB } from "../../shared/evLoss";

export type AnalyticsSqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
};

type Advice = PreflopAdvice | PostflopAdvice;

const round = (value: number, digits = 1) => {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};

const rate = (numerator: number, denominator: number): RateMetric => ({
  value: denominator > 0 ? round((numerator / denominator) * 100) : null,
  numerator,
  denominator,
});

export function analyticsUserKey(token: string): string {
  // Never persist the current JWT because its payload contains credentials.
  return createHash("sha256").update(token).digest("hex");
}

function defaultDatabasePath() {
  const configured = process.env.PLAYER_ANALYTICS_DB;
  if (configured) return configured;
  if (
    process.env.NODE_ENV === "test" ||
    process.argv.some((argument) => argument.includes("mocha"))
  ) {
    return ":memory:";
  }
  const directory = path.join(process.cwd(), "data");
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "player-analytics.sqlite");
}

export class PlayerAnalyticsStore {
  private db: AnalyticsSqliteDatabase;

  constructor(source: string | AnalyticsSqliteDatabase = defaultDatabasePath()) {
    if (typeof source === "string") {
      const sqlite = require("node:sqlite") as {
        DatabaseSync: new (filename: string) => AnalyticsSqliteDatabase;
      };
      this.db = new sqlite.DatabaseSync(source);
      this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    } else {
      this.db = source;
    }
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_hands (
        hand_id TEXT NOT NULL,
        user_key TEXT NOT NULL,
        player_name TEXT NOT NULL,
        room_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        position TEXT NOT NULL,
        stack_bb REAL NOT NULL,
        player_count INTEGER NOT NULL,
        has_bot INTEGER NOT NULL DEFAULT 0,
        vpip INTEGER NOT NULL DEFAULT 0,
        pfr INTEGER NOT NULL DEFAULT 0,
        saw_flop INTEGER NOT NULL DEFAULT 0,
        went_showdown INTEGER NOT NULL DEFAULT 0,
        won_showdown INTEGER NOT NULL DEFAULT 0,
        won_hand INTEGER NOT NULL DEFAULT 0,
        profit_bb REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (hand_id, user_key)
      );

      CREATE TABLE IF NOT EXISTS player_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hand_id TEXT NOT NULL,
        user_key TEXT NOT NULL,
        street INTEGER NOT NULL,
        position TEXT NOT NULL,
        action TEXT NOT NULL,
        amount_bb REAL,
        facing_raise INTEGER NOT NULL DEFAULT 0,
        raise_level INTEGER NOT NULL DEFAULT 0,
        gto_probability REAL,
        gto_recommended_action TEXT,
        gto_recommended_size_bb REAL,
        size_error_ratio REAL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (hand_id, user_key)
          REFERENCES player_hands(hand_id, user_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_player_hands_user_time
        ON player_hands(user_key, completed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_player_actions_user_hand
        ON player_actions(user_key, hand_id, street);
    `);
    // Older databases predate EV-loss grading; the column is additive.
    try {
      this.db.exec("ALTER TABLE player_actions ADD COLUMN ev_loss_bb REAL");
    } catch (_) {
      // Column already exists.
    }
  }

  beginHand(input: {
    handId: string;
    roomId: string;
    playerCount: number;
    hasBot: boolean;
    players: Array<{
      token: string;
      name: string;
      position: string;
      stackBB: number;
    }>;
  }) {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO player_hands (
        hand_id, user_key, player_name, room_id, started_at,
        position, stack_bb, player_count, has_bot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    input.players.forEach((player) => {
      statement.run(
        input.handId,
        analyticsUserKey(player.token),
        player.name,
        input.roomId,
        now,
        player.position || "—",
        player.stackBB,
        input.playerCount,
        input.hasBot ? 1 : 0
      );
    });
  }

  recordAction(input: {
    handId: string;
    token: string;
    street: number;
    position: string;
    action: string;
    amountBB?: number;
    facingRaise: boolean;
    raiseLevel: number;
    advice?: Advice;
  }) {
    const userKey = analyticsUserKey(input.token);
    const adviceAction = input.action === "check" && input.advice?.kind === "preflop"
      ? "call"
      : input.action;
    const distribution = input.advice?.actionDistribution as
      | Record<string, number>
      | undefined;
    const probability = distribution?.[adviceAction];
    const recommendedSizeBB = input.advice?.recommendedSizeBB;
    const isSizedAction = ["bet", "raise", "allin"].includes(input.action);
    const sizeErrorRatio =
      isSizedAction &&
      input.amountBB !== undefined &&
      recommendedSizeBB !== undefined &&
      recommendedSizeBB > 0
        ? Math.abs(input.amountBB - recommendedSizeBB) / recommendedSizeBB
        : undefined;

    let evLossBB: number | undefined;
    if (input.advice) {
      const grading = gradeAiReplayAction(adviceAction, input.advice);
      // amountBB is already in big blinds, so a unit big blind makes the
      // estimator's chips→bb conversion an identity.
      const estimate = estimateEvLossBB({
        advice: input.advice,
        action: adviceAction,
        amountToChips: input.amountBB,
        bigBlindChips: 1,
        actionScore: grading?.actionScore,
      });
      evLossBB = estimate?.evLossBB;
    }

    this.db.prepare(`
      INSERT INTO player_actions (
        hand_id, user_key, street, position, action, amount_bb,
        facing_raise, raise_level, gto_probability,
        gto_recommended_action, gto_recommended_size_bb,
        size_error_ratio, ev_loss_bb, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.handId,
      userKey,
      input.street,
      input.position || "—",
      input.action,
      input.amountBB === undefined ? null : input.amountBB,
      input.facingRaise ? 1 : 0,
      input.raiseLevel,
      probability === undefined ? null : probability,
      input.advice?.recommended || null,
      recommendedSizeBB === undefined ? null : recommendedSizeBB,
      sizeErrorRatio === undefined ? null : sizeErrorRatio,
      evLossBB === undefined ? null : evLossBB,
      Date.now()
    );

    if (input.street === 0) {
      const voluntary = ["call", "raise", "allin"].includes(input.action);
      const aggressive = ["raise", "allin"].includes(input.action);
      this.db.prepare(`
        UPDATE player_hands
        SET vpip = MAX(vpip, ?), pfr = MAX(pfr, ?)
        WHERE hand_id = ? AND user_key = ?
      `).run(voluntary ? 1 : 0, aggressive ? 1 : 0, input.handId, userKey);
    }
  }

  markSawFlop(handId: string, tokens: string[]) {
    const statement = this.db.prepare(`
      UPDATE player_hands SET saw_flop = 1
      WHERE hand_id = ? AND user_key = ?
    `);
    tokens.forEach((token) => statement.run(handId, analyticsUserKey(token)));
  }

  recordSettlement(input: {
    handId: string;
    token: string;
    profitBB: number;
    won: boolean;
    showdown: boolean;
    final: boolean;
  }) {
    this.db.prepare(`
      UPDATE player_hands
      SET profit_bb = profit_bb + ?,
          won_hand = MAX(won_hand, ?),
          went_showdown = MAX(went_showdown, ?),
          won_showdown = MAX(won_showdown, ?),
          completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END
      WHERE hand_id = ? AND user_key = ?
    `).run(
      input.profitBB,
      input.won ? 1 : 0,
      input.showdown ? 1 : 0,
      input.showdown && input.won ? 1 : 0,
      input.final ? 1 : 0,
      Date.now(),
      input.handId,
      analyticsUserKey(input.token)
    );
  }

  getReport(token: string, window: AnalyticsWindow): PlayerAnalyticsReport {
    const userKey = analyticsUserKey(token);
    const limit = window;
    const handRows = this.db.prepare(`
      SELECT * FROM player_hands
      WHERE user_key = ? AND completed_at IS NOT NULL
      ORDER BY completed_at DESC LIMIT ?
    `).all(userKey, limit) as any[];
    const actions = handRows.length === 0
      ? []
      : this.db.prepare(`
          SELECT actions.*
          FROM player_actions AS actions
          INNER JOIN (
            SELECT hand_id
            FROM player_hands
            WHERE user_key = ? AND completed_at IS NOT NULL
            ORDER BY completed_at DESC
            LIMIT ?
          ) AS selected_hands ON selected_hands.hand_id = actions.hand_id
          WHERE actions.user_key = ?
          ORDER BY actions.created_at ASC
        `).all(userKey, limit, userKey) as any[];

    const hands = handRows.length;
    const sumHands = (key: string) =>
      handRows.reduce((total, row) => total + Number(row[key] || 0), 0);
    const vpipHands = sumHands("vpip");
    const pfrHands = sumHands("pfr");
    const sawFlop = sumHands("saw_flop");
    const showdown = sumHands("went_showdown");
    const showdownWins = sumHands("won_showdown");
    const netBB = round(
      handRows.reduce((total, row) => total + Number(row.profit_bb || 0), 0),
      2
    );

    const preflopOpenResponses = actions.filter(
      (action) => action.street === 0 && action.raise_level === 1
    );
    const threeBets = preflopOpenResponses.filter((action) =>
      ["raise", "allin"].includes(action.action)
    ).length;
    const postflop = actions.filter((action) => action.street > 0);
    const postflopAggressive = postflop.filter((action) =>
      ["bet", "raise", "allin"].includes(action.action)
    ).length;
    const postflopCalls = postflop.filter((action) => action.action === "call").length;
    const postflopFolds = postflop.filter((action) => action.action === "fold").length;
    const scoredActions = actions.filter(
      (action) => action.gto_probability !== null
    );
    const gtoScore = scoredActions.reduce(
      (total, action) => total + Number(action.gto_probability),
      0
    );
    const evScoredActions = actions.filter(
      (action) =>
        action.ev_loss_bb !== null && action.ev_loss_bb !== undefined
    );
    const totalEvLossBB = round(
      evScoredActions.reduce(
        (total, action) => total + Number(action.ev_loss_bb),
        0
      ),
      2
    );

    const core = {
      hands,
      vpip: rate(vpipHands, hands),
      pfr: rate(pfrHands, hands),
      threeBet: rate(threeBets, preflopOpenResponses.length),
      aggressionFrequency: rate(
        postflopAggressive,
        postflopAggressive + postflopCalls + postflopFolds
      ),
      aggressionFactor:
        postflopCalls > 0 ? round(postflopAggressive / postflopCalls, 2) : null,
      wentToShowdown: rate(showdown, sawFlop),
      wonAtShowdown: rate(showdownWins, showdown),
      gtoAlignment: {
        value: scoredActions.length > 0 ? round(gtoScore / scoredActions.length) : null,
        numerator: round(gtoScore),
        denominator: scoredActions.length,
      },
      evLoss: {
        totalBB: totalEvLossBB,
        per100Hands:
          evScoredActions.length > 0 && hands > 0
            ? round((totalEvLossBB / hands) * 100, 2)
            : null,
        scoredActions: evScoredActions.length,
      },
      netBB,
      bbPer100: hands > 0 ? round((netBB / hands) * 100, 2) : 0,
    };

    const positionGroups = handRows.reduce<Map<string, any[]>>((groups, row) => {
      const current = groups.get(row.position) || [];
      current.push(row);
      groups.set(row.position, current);
      return groups;
    }, new Map<string, any[]>());
    const positions = Array.from(positionGroups.entries()).map(([position, rows]) => ({
      position,
      hands: rows.length,
      vpip: rows.length ? round((rows.reduce((n: number, row: any) => n + row.vpip, 0) / rows.length) * 100) : null,
      pfr: rows.length ? round((rows.reduce((n: number, row: any) => n + row.pfr, 0) / rows.length) * 100) : null,
      netBB: round(rows.reduce((n: number, row: any) => n + row.profit_bb, 0), 2),
    })).sort((a, b) => b.hands - a.hands);

    const streetNames = ["flop", "turn", "river"] as const;
    const streets = streetNames.map((street, index) => {
      const rows = actions.filter((action) => action.street === index + 1);
      const aggressive = rows.filter((action) =>
        ["bet", "raise", "allin"].includes(action.action)
      ).length;
      const calls = rows.filter((action) => action.action === "call").length;
      const folds = rows.filter((action) => action.action === "fold").length;
      const scored = rows.filter((action) => action.gto_probability !== null);
      const evScored = rows.filter(
        (action) => action.ev_loss_bb !== null && action.ev_loss_bb !== undefined
      );
      return {
        street,
        actions: rows.length,
        fold: folds,
        call: calls,
        aggressive,
        aggressionFrequency: aggressive + calls + folds > 0
          ? round((aggressive / (aggressive + calls + folds)) * 100)
          : null,
        gtoAlignment: scored.length
          ? round(scored.reduce((n, row) => n + row.gto_probability, 0) / scored.length)
          : null,
        evLossBB: evScored.length
          ? round(
              evScored.reduce((n, row) => n + Number(row.ev_loss_bb), 0),
              2
            )
          : null,
      };
    });

    return {
      window,
      generatedAt: new Date().toISOString(),
      style: classifyStyle(core.vpip.value, core.pfr.value, core.aggressionFactor, hands),
      core,
      positions,
      streets,
      insights: buildInsights(core, hands),
    };
  }
}

function classifyStyle(
  vpip: number | null,
  pfr: number | null,
  aggressionFactor: number | null,
  hands: number
): PlayerAnalyticsReport["style"] {
  if (hands < 20 || vpip === null || pfr === null) {
    return { code: "developing", label: "样本积累中", summary: "至少积累 20 手后，牌风判断会更可靠。" };
  }
  const gap = vpip - pfr;
  if (vpip < 18) return { code: "nit", label: "偏紧型", summary: "入池范围较窄，注意不要错过后位和盲注位的盈利机会。" };
  if (vpip > 34 && gap > 12) return { code: "calling-station", label: "松弱型", summary: "入池较多但主动加注不足，容易用边缘牌被动跟注。" };
  if (vpip > 30 && gap <= 10) return { code: "lag", label: "松凶型 LAG", summary: "入池范围较宽且主动性强，需要留意过度激进。" };
  if (vpip <= 28 && gap <= 10 && (aggressionFactor || 0) >= 1.5) {
    return { code: "tag", label: "紧凶型 TAG", summary: "选择性入池并保持主动，是较稳健的常见盈利风格。" };
  }
  return { code: "balanced", label: "均衡型", summary: "整体松紧与主动性较均衡，可进一步关注位置和街道差异。" };
}

function buildInsights(core: PlayerAnalyticsReport["core"], hands: number): AnalyticsInsight[] {
  if (hands < 20) {
    return [{ tone: "neutral", title: "继续积累样本", detail: `当前 ${hands} 手；达到 20 手后开始给出方向性判断，100 手后更有参考价值。` }];
  }
  const insights: AnalyticsInsight[] = [];
  const vpip = core.vpip.value || 0;
  const pfr = core.pfr.value || 0;
  if (vpip > 34) insights.push({ tone: "warning", title: "翻前入池偏宽", detail: `VPIP 为 ${vpip}%，建议优先收紧前位边缘牌。` });
  else if (vpip < 18) insights.push({ tone: "warning", title: "翻前可能过紧", detail: `VPIP 为 ${vpip}%，可检查 CO、BTN 和 SB 是否错过开池机会。` });
  else insights.push({ tone: "positive", title: "入池范围较稳定", detail: `VPIP 为 ${vpip}%，整体处于常见合理区间。` });
  if (vpip - pfr > 12) insights.push({ tone: "warning", title: "跟注多于主动加注", detail: `VPIP 与 PFR 相差 ${round(vpip - pfr)} 个百分点，考虑减少冷跟并提高主动加注比例。` });
  if (core.evLoss.per100Hands !== null && core.evLoss.scoredActions >= 20) {
    insights.push({
      tone: core.evLoss.per100Hands <= 12 ? "positive" : "warning",
      title: "决策 EV 损失",
      detail: `估算每百手因决策偏差损失约 ${core.evLoss.per100Hands}bb（${core.evLoss.scoredActions} 次已评分决策）。混合策略内的行动不计损失。`,
    });
  }
  if (core.gtoAlignment.value !== null && core.gtoAlignment.denominator >= 20) {
    insights.push({
      tone: core.gtoAlignment.value >= 55 ? "positive" : "warning",
      title: "GTO 行动匹配度",
      detail: `所选行动在 GTO 混合策略中的平均频率为 ${core.gtoAlignment.value}%，基于 ${core.gtoAlignment.denominator} 次决策。`,
    });
  }
  return insights.slice(0, 5);
}

let singleton: PlayerAnalyticsStore | undefined;

export function setPlayerAnalyticsStore(store: PlayerAnalyticsStore) {
  singleton = store;
}

export function getPlayerAnalyticsStore(): PlayerAnalyticsStore {
  if (!singleton) singleton = new PlayerAnalyticsStore();
  return singleton;
}
