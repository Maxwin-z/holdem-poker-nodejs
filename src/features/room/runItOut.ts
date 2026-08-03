import { Card } from "../../ApiType";

export function canRunItOut({
  isSettling,
  publicCardCount,
  isInCurrentGame,
  isSpectator,
  privateCardCount,
}: {
  isSettling: boolean;
  publicCardCount: number;
  isInCurrentGame: boolean;
  isSpectator: boolean;
  privateCardCount: number;
}) {
  return (
    isSettling &&
    publicCardCount < 5 &&
    isInCurrentGame &&
    !isSpectator &&
    privateCardCount === 0
  );
}

export function getVisibleBoardCards(
  publicBoardCards: Card[],
  runItOutBoardCards: Card[]
) {
  return runItOutBoardCards.length === 5
    ? runItOutBoardCards
    : publicBoardCards;
}
