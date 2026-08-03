import { canRunItOut, getVisibleBoardCards } from "./runItOut";

const publicFlop = [
  { num: 2, suit: "c" },
  { num: 3, suit: "d" },
  { num: 4, suit: "h" },
];
const privateRunout = [
  ...publicFlop,
  { num: 5, suit: "s" },
  { num: 6, suit: "c" },
];

test("shows the private five-card board only to a player who received it", () => {
  expect(getVisibleBoardCards(publicFlop, privateRunout)).toEqual(
    privateRunout
  );
  expect(getVisibleBoardCards(publicFlop, [])).toEqual(publicFlop);
});

test("offers run it out only once to a hand participant during incomplete settlement", () => {
  const eligible = {
    isSettling: true,
    publicCardCount: 3,
    isInCurrentGame: true,
    isSpectator: false,
    privateCardCount: 0,
  };

  expect(canRunItOut(eligible)).toBe(true);
  expect(canRunItOut({ ...eligible, isSettling: false })).toBe(false);
  expect(canRunItOut({ ...eligible, publicCardCount: 5 })).toBe(false);
  expect(canRunItOut({ ...eligible, isInCurrentGame: false })).toBe(false);
  expect(canRunItOut({ ...eligible, isSpectator: true })).toBe(false);
  expect(canRunItOut({ ...eligible, privateCardCount: 5 })).toBe(false);
});
