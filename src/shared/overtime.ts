export interface OvertimeCostInput {
  bigBlind: number;
  pots: number;
  playerCount: number;
  availableStack: number;
}

/**
 * Returns the integer number of chips paid to each other player for overtime.
 *
 * The affordability cap deliberately uses the total player count to preserve
 * the original rule that the buyer must retain at least one share after paying
 * everyone else.
 */
export function calculateOvertimeCost({
  bigBlind,
  pots,
  playerCount,
  availableStack,
}: OvertimeCostInput): number {
  if (
    !Number.isFinite(bigBlind) ||
    !Number.isFinite(pots) ||
    !Number.isFinite(playerCount) ||
    !Number.isFinite(availableStack)
  ) {
    return 0;
  }

  const normalizedPlayerCount = Math.floor(playerCount);
  const normalizedBigBlind = Math.floor(bigBlind);
  const normalizedPots = Math.max(0, Math.floor(pots));
  const normalizedStack = Math.max(0, Math.floor(availableStack));

  if (
    normalizedPlayerCount < 2 ||
    normalizedBigBlind < 1 ||
    normalizedStack <= normalizedPlayerCount
  ) {
    return 0;
  }

  const desiredCost = Math.ceil(
    Math.min(
      normalizedBigBlind,
      Math.max(1, normalizedPots / 4 / normalizedPlayerCount)
    )
  );
  const affordableCost = Math.floor(
    normalizedStack / normalizedPlayerCount
  );

  return Math.max(0, Math.min(desiredCost, affordableCost));
}
