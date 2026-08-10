import { createHash } from "crypto";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as path from "path";
import type { AnalyticsSqliteDatabase } from "../analytics/player-analytics";
import type {
  AiReplayDecision,
  AiReplayHand,
  AiReplayHandDeviation,
  AiReplayListResponse,
  AiReplayParticipant,
  AiReplayRunout,
  AiReplaySummary,
} from "../../shared/aiReplay";
import { calculateAiReplayHandDeviation } from "../../shared/aiReplay";
import type { Card } from "../../ApiType";

const SCHEMA_VERSION = 1;
// v2: EV-loss grading, trust labels, full-ring/depth preflop adjustments,
// Nash push/fold tables, multiway + action-line range tracking.
const STRATEGY_VERSION = "current-gto-v2";
const MAX_HANDS_PER_USER = 100;

function defaultDatabasePath() {
  const configured = process.env.AI_REPLAY_DB;
  if (configured) return configured;
  if (
    process.env.NODE_ENV === "test" ||
    process.argv.some((argument) => argument.includes("mocha"))
  ) {
    return ":memory:";
  }
  const directory = path.join(process.cwd(), "data");
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "ai-replays.sqlite");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (_) {
    return fallback;
  }
}

/** Stable across JWT re-issuance for the Cloudflare credential payload. */
export function replayOwnerKey(token: string): string {
  let identity = token;
  const decoded = jwt.decode(token);
  if (typeof decoded === "string") {
    identity = decoded;
  } else if (decoded && typeof decoded === "object") {
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.sub === "string" && payload.sub) identity = payload.sub;
    else if (typeof payload.credential === "string" && payload.credential) {
      identity = payload.credential;
    }
  }
  return createHash("sha256").update(`ai-replay:${identity}`).digest("hex");
}

export interface BeginAiReplayInput {
  publicId: string;
  ownerToken: string;
  roomId: string;
  handSeq: number;
  startedAt: number;
  smallBlind: number;
  bigBlind: number;
  heroId: string;
  participants: AiReplayParticipant[];
}

export interface CompleteAiReplayInput {
  publicId: string;
  ownerToken: string;
  completedAt: number;
  board: Card[];
  participants: AiReplayParticipant[];
  runouts: AiReplayRunout[];
  heroProfitChips: number;
}

export class AiReplayStore {
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
      CREATE TABLE IF NOT EXISTS ai_replay_hands (
        public_id TEXT PRIMARY KEY,
        owner_key TEXT NOT NULL,
        status TEXT NOT NULL,
        room_id TEXT NOT NULL,
        hand_seq INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        small_blind REAL NOT NULL,
        big_blind REAL NOT NULL,
        hero_id TEXT NOT NULL,
        hero_name TEXT NOT NULL,
        hero_position TEXT NOT NULL,
        hero_cards_json TEXT NOT NULL,
        board_json TEXT NOT NULL DEFAULT '[]',
        participants_json TEXT NOT NULL,
        runouts_json TEXT NOT NULL DEFAULT '[]',
        bot_count INTEGER NOT NULL,
        hero_profit_chips REAL NOT NULL DEFAULT 0,
        hero_profit_bb REAL NOT NULL DEFAULT 0,
        result TEXT,
        schema_version INTEGER NOT NULL,
        strategy_version TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_replay_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hand_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        street TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        position TEXT NOT NULL,
        actual_json TEXT NOT NULL,
        context_json TEXT NOT NULL,
        advice_json TEXT,
        bot_strategy_json TEXT,
        comparison_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(hand_id, sequence),
        FOREIGN KEY (hand_id) REFERENCES ai_replay_hands(public_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ai_replay_owner_time
        ON ai_replay_hands(owner_key, completed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_replay_decisions_hand
        ON ai_replay_decisions(hand_id, sequence);
    `);
  }

  beginHand(input: BeginAiReplayInput) {
    const hero = input.participants.find((participant) => participant.id === input.heroId);
    if (!hero) throw new Error("replay hero not found");
    this.db.prepare(`
      INSERT OR IGNORE INTO ai_replay_hands (
        public_id, owner_key, status, room_id, hand_seq, started_at,
        small_blind, big_blind, hero_id, hero_name, hero_position,
        hero_cards_json, participants_json, bot_count,
        schema_version, strategy_version
      ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.publicId,
      replayOwnerKey(input.ownerToken),
      input.roomId,
      input.handSeq,
      input.startedAt,
      input.smallBlind,
      input.bigBlind,
      input.heroId,
      hero.name,
      hero.position,
      json(hero.cards),
      json(input.participants),
      input.participants.filter((participant) => participant.type === "bot").length,
      SCHEMA_VERSION,
      STRATEGY_VERSION
    );
  }

  recordDecision(publicId: string, decision: Omit<AiReplayDecision, "id">) {
    this.db.prepare(`
      INSERT OR REPLACE INTO ai_replay_decisions (
        hand_id, sequence, street, actor_id, actor_type, actor_name,
        position, actual_json, context_json, advice_json,
        bot_strategy_json, comparison_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      publicId,
      decision.sequence,
      decision.street,
      decision.actorId,
      decision.actorType,
      decision.actorName,
      decision.position,
      json(decision.actual),
      json(decision.context),
      decision.advice ? json(decision.advice) : null,
      decision.botStrategy ? json(decision.botStrategy) : null,
      json(decision.comparison),
      decision.createdAt
    );
  }

  completeHand(input: CompleteAiReplayInput) {
    const bigBlindRow = this.db.prepare(`
      SELECT big_blind FROM ai_replay_hands WHERE public_id = ?
    `).get(input.publicId) as Record<string, unknown> | undefined;
    const bigBlind = Number(bigBlindRow?.big_blind || 1);
    const heroProfitBB = input.heroProfitChips / bigBlind;
    const result = heroProfitBB > 0 ? "win" : heroProfitBB < 0 ? "loss" : "tie";
    this.db.prepare(`
      UPDATE ai_replay_hands
      SET status = 'completed', completed_at = ?, board_json = ?,
          participants_json = ?, runouts_json = ?, hero_profit_chips = ?,
          hero_profit_bb = ?, result = ?
      WHERE public_id = ? AND owner_key = ?
    `).run(
      input.completedAt,
      json(input.board),
      json(input.participants),
      json(input.runouts),
      input.heroProfitChips,
      heroProfitBB,
      result,
      input.publicId,
      replayOwnerKey(input.ownerToken)
    );

    this.db.prepare(`
      DELETE FROM ai_replay_hands
      WHERE public_id IN (
        SELECT public_id FROM ai_replay_hands
        WHERE owner_key = ? AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT -1 OFFSET ?
      )
    `).run(replayOwnerKey(input.ownerToken), MAX_HANDS_PER_USER);
  }

  listForToken(token: string): AiReplayListResponse {
    const rows = this.db.prepare(`
      SELECT h.*,
        (SELECT COUNT(*) FROM ai_replay_decisions d WHERE d.hand_id = h.public_id) AS decision_count
      FROM ai_replay_hands h
      WHERE owner_key = ? AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT ?
    `).all(replayOwnerKey(token), MAX_HANDS_PER_USER) as Record<string, unknown>[];
    const decisionsByHand = new Map<string, AiReplayDecision[]>();
    if (rows.length) {
      const handIds = rows.map((row) => String(row.public_id));
      const placeholders = handIds.map(() => "?").join(", ");
      const decisionRows = this.db.prepare(`
        SELECT * FROM ai_replay_decisions
        WHERE actor_type = 'human' AND hand_id IN (${placeholders})
        ORDER BY hand_id, sequence ASC
      `).all(...handIds) as Record<string, unknown>[];
      decisionRows.forEach((decisionRow) => {
        const handId = String(decisionRow.hand_id);
        const decisions = decisionsByHand.get(handId) || [];
        decisions.push(this.decisionFromRow(decisionRow));
        decisionsByHand.set(handId, decisions);
      });
    }
    return {
      items: rows.map((row) => {
        const publicId = String(row.public_id);
        const deviation = calculateAiReplayHandDeviation(
          decisionsByHand.get(publicId) || []
        );
        return this.summaryFromRow(row, deviation);
      }),
      total: rows.length,
    };
  }

  getPublic(publicId: string): AiReplayHand | null {
    if (!/^[a-f0-9]{32}$/i.test(publicId)) return null;
    const row = this.db.prepare(`
      SELECT h.*,
        (SELECT COUNT(*) FROM ai_replay_decisions d WHERE d.hand_id = h.public_id) AS decision_count
      FROM ai_replay_hands h
      WHERE public_id = ? AND status = 'completed'
    `).get(publicId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const decisions = this.db.prepare(`
      SELECT * FROM ai_replay_decisions
      WHERE hand_id = ? ORDER BY sequence ASC
    `).all(publicId) as Record<string, unknown>[];
    const parsedDecisions = decisions.map((decision) => this.decisionFromRow(decision));
    const deviation = calculateAiReplayHandDeviation(parsedDecisions);
    return {
      ...this.summaryFromRow(row, deviation),
      startedAt: Number(row.started_at),
      smallBlind: Number(row.small_blind),
      participants: parse<AiReplayParticipant[]>(row.participants_json, []),
      runouts: parse<AiReplayRunout[]>(row.runouts_json, []),
      decisions: parsedDecisions,
      schemaVersion: Number(row.schema_version),
      strategyVersion: String(row.strategy_version),
    };
  }

  private decisionFromRow(decision: Record<string, unknown>): AiReplayDecision {
    return {
      id: Number(decision.id),
      sequence: Number(decision.sequence),
      street: decision.street as AiReplayDecision["street"],
      actorId: String(decision.actor_id),
      actorType: decision.actor_type as AiReplayDecision["actorType"],
      actorName: String(decision.actor_name),
      position: String(decision.position),
      actual: parse(decision.actual_json, { action: "unknown", origin: "human" }),
      context: parse(decision.context_json, {
        board: [], potBefore: 0, amountToCall: 0, minimumRaiseTo: 0,
        currentBet: 0, raiseCount: 0, players: [],
      }),
      advice: parse(decision.advice_json, undefined),
      botStrategy: parse(decision.bot_strategy_json, undefined),
      comparison: parse(decision.comparison_json, {
        actionMatch: false, classification: "unscored", reasons: [],
      }),
      createdAt: Number(decision.created_at),
    };
  }

  private summaryFromRow(
    row: Record<string, unknown>,
    deviation: AiReplayHandDeviation = calculateAiReplayHandDeviation([])
  ): AiReplaySummary {
    return {
      publicId: String(row.public_id),
      completedAt: Number(row.completed_at),
      handSeq: Number(row.hand_seq),
      heroName: String(row.hero_name),
      heroPosition: String(row.hero_position),
      heroCards: parse<Card[]>(row.hero_cards_json, []),
      board: parse<Card[]>(row.board_json, []),
      botCount: Number(row.bot_count),
      bigBlind: Number(row.big_blind),
      heroProfitChips: Number(row.hero_profit_chips),
      heroProfitBB: Number(row.hero_profit_bb),
      result: row.result as AiReplaySummary["result"],
      decisionCount: Number(row.decision_count || 0),
      ...deviation,
    };
  }
}

let singleton: AiReplayStore | undefined;

export function setAiReplayStore(store: AiReplayStore) {
  singleton = store;
}

export function getAiReplayStore(): AiReplayStore {
  if (!singleton) singleton = new AiReplayStore();
  return singleton;
}
