export const INITIAL_ACTION_TIME_SECONDS = 20;
/** Solo AI practice: the only human at the table gets 3 minutes to think. */
export const PRACTICE_ACTION_TIME_SECONDS = 180;
export const OVERTIME_ACTION_TIME_SECONDS = 30;
export const URGENT_ACTION_TIME_SECONDS = 10;
export const DISCONNECTED_ACTION_GRACE_SECONDS = 30;

/**
 * AI practice = exactly one human at the table, everyone else an AI bot.
 * Shared so the server timer and the client UI agree on the same condition.
 */
export function isAiPracticeTable(users: { isBot: boolean }[]): boolean {
  const bots = users.filter((user) => user.isBot).length;
  return bots > 0 && users.length - bots === 1;
}
