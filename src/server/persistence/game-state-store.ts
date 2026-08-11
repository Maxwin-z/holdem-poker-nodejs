import * as fs from "fs";
import * as path from "path";

/**
 * Structurally identical to the analytics/replay database handle, so the
 * Cloudflare Durable Object adapter over `state.storage.sql` works here too.
 */
export type GameStateDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
};

/** Bump whenever a snapshot field changes meaning; older rows are dropped. */
export const SNAPSHOT_VERSION = 1;

/** Rooms nobody touched for a day are not worth resurrecting. */
const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

export type PersistedRoom = {
  roomId: string;
  updatedAt: number;
  data: Record<string, any>;
};

function isTestRun() {
  // Guarded: the Cloudflare worker imports this module and its `process`
  // shim does not carry a real argv.
  try {
    return (
      process.env.NODE_ENV === "test" ||
      (process.argv || []).some((argument) => argument.includes("mocha"))
    );
  } catch (error) {
    return false;
  }
}

function defaultDatabasePath() {
  const configured = process.env.GAME_STATE_DB;
  if (configured) return configured;
  if (isTestRun()) return ":memory:";
  const directory = path.join(process.cwd(), "data");
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "game-state.sqlite");
}

/**
 * Durable mirror of the live `roomMap`. The server keeps playing out of
 * memory; this only exists so a restart can rebuild the same tables instead
 * of dropping every seated player back to the lobby.
 */
export class GameStateStore {
  private db: GameStateDatabase;
  /** Skip rewriting rooms whose serialized form did not move. */
  private lastWritten: Map<string, string> = new Map();

  constructor(source: string | GameStateDatabase = defaultDatabasePath()) {
    if (typeof source === "string") {
      const sqlite = require("node:sqlite") as {
        DatabaseSync: new (filename: string) => GameStateDatabase;
      };
      this.db = new sqlite.DatabaseSync(source);
      this.db.exec("PRAGMA journal_mode = WAL;");
    } else {
      this.db = source;
    }
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_rooms (
        room_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  /**
   * Writes every live room and drops the rows of rooms that disappeared, so
   * the table always mirrors the whole world rather than accumulating ghosts.
   */
  saveAll(rooms: PersistedRoom[]) {
    const upsert = this.db.prepare(`
      INSERT INTO game_rooms (room_id, version, updated_at, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET
        version = excluded.version,
        updated_at = excluded.updated_at,
        data = excluded.data
    `);
    const live = new Set<string>();
    rooms.forEach((room) => {
      live.add(room.roomId);
      const payload = JSON.stringify(room.data);
      if (this.lastWritten.get(room.roomId) === payload) return;
      upsert.run(room.roomId, SNAPSHOT_VERSION, room.updatedAt, payload);
      this.lastWritten.set(room.roomId, payload);
    });

    const stored = this.db
      .prepare("SELECT room_id FROM game_rooms")
      .all()
      .map((row: any) => String(row.room_id));
    const remove = this.db.prepare("DELETE FROM game_rooms WHERE room_id = ?");
    stored.forEach((roomId) => {
      if (live.has(roomId)) return;
      remove.run(roomId);
      this.lastWritten.delete(roomId);
    });
  }

  /**
   * Returns the rooms worth restoring, discarding rows written by an older
   * snapshot format, rows that no longer parse, and rooms that went stale.
   */
  loadAll(now: number = Date.now()): PersistedRoom[] {
    const rows = this.db
      .prepare("SELECT room_id, version, updated_at, data FROM game_rooms")
      .all();
    const remove = this.db.prepare("DELETE FROM game_rooms WHERE room_id = ?");
    const rooms: PersistedRoom[] = [];
    rows.forEach((row: any) => {
      const roomId = String(row.room_id);
      const updatedAt = Number(row.updated_at) || 0;
      const drop = (reason: string) => {
        console.warn(`drop room snapshot ${roomId}: ${reason}`);
        remove.run(roomId);
      };
      if (Number(row.version) !== SNAPSHOT_VERSION) {
        return drop("snapshot version mismatch");
      }
      if (now - updatedAt > MAX_SNAPSHOT_AGE_MS) {
        return drop("snapshot expired");
      }
      let data: Record<string, any>;
      try {
        data = JSON.parse(String(row.data));
      } catch (error) {
        return drop(`unreadable snapshot (${error})`);
      }
      if (!data || typeof data !== "object") {
        return drop("empty snapshot");
      }
      rooms.push({ roomId, updatedAt, data });
      this.lastWritten.set(roomId, String(row.data));
    });
    return rooms;
  }

  clear() {
    this.db.exec("DELETE FROM game_rooms");
    this.lastWritten.clear();
  }
}

let singleton: GameStateStore | null = null;
let disabled = isTestRun();

export function setGameStateStore(store: GameStateStore | null) {
  singleton = store;
  disabled = store === null;
}

/**
 * Off by default under mocha: the existing suites rebuild `roomMap` between
 * cases and would otherwise pay full serialization on every action.
 */
export function getGameStateStore(): GameStateStore | null {
  if (disabled) return null;
  if (!singleton) singleton = new GameStateStore();
  return singleton;
}
