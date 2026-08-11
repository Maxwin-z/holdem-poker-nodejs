import { roomMap, userMap } from "../service";
import { getGameStateStore } from "./game-state-store";
import { restoreRoom, snapshotRoom } from "./snapshot";

export {
  GameStateStore,
  getGameStateStore,
  setGameStateStore,
  SNAPSHOT_VERSION,
} from "./game-state-store";
export type { GameStateDatabase } from "./game-state-store";

/** Long enough to coalesce one action's burst of mutations, short enough
 *  that a crash loses at most the action currently being handled. */
const FLUSH_DEBOUNCE_MS = 25;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Marks the world dirty and writes it out at the end of the current burst.
 * Safe to call from anywhere, including timer callbacks and error paths.
 */
export function scheduleGameStateFlush() {
  if (!getGameStateStore() || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushGameStateNow();
  }, FLUSH_DEBOUNCE_MS);
  // A pending snapshot should never hold the process open.
  const handle = flushTimer as unknown as { unref?: () => void };
  if (typeof handle.unref === "function") handle.unref();
}

export function flushGameStateNow() {
  const store = getGameStateStore();
  if (!store) return;
  try {
    const now = Date.now();
    store.saveAll(
      Object.keys(roomMap).map((roomId) => ({
        roomId,
        updatedAt: now,
        data: snapshotRoom(roomMap[roomId], userMap),
      }))
    );
  } catch (error) {
    // Persistence must never take the live table down with it.
    console.warn("persist game state failed", error);
  }
}

/**
 * Rebuilds every stored room into the live maps and resumes the timers the
 * snapshot could not carry. Call once at startup, before serving traffic.
 */
export function restoreGameState(): number {
  const store = getGameStateStore();
  if (!store) return 0;

  let rooms: ReturnType<typeof store.loadAll>;
  try {
    rooms = store.loadAll();
  } catch (error) {
    console.warn("read persisted game state failed", error);
    return 0;
  }

  let restored = 0;
  rooms.forEach((entry) => {
    if (roomMap[entry.roomId]) return; // never clobber a live room
    try {
      const { room, users } = restoreRoom(entry.data);
      if (room.users.length < 1) return;
      users.forEach((user) => {
        userMap[user.token] = user;
        // Humans get the usual disconnect grace to come back before the
        // table gives their seat away. Bots are never "offline".
        if (!user.isBot) user.startAutoLeaveTimer();
      });
      roomMap[room.id] = room;
      room.game.resumeAfterRestore();
      restored += 1;
    } catch (error) {
      console.warn(`restore room ${entry.roomId} failed`, error);
    }
  });

  if (restored > 0) {
    console.log(`restored ${restored} room(s) from persisted game state`);
  }
  return restored;
}
