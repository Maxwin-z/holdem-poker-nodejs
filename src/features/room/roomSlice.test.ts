import { SimpleGame, SimpleRoom, SimpleSelf, SimpleUser } from "../../ApiType";
import roomReducer, { setGame, setRoom, setSelf } from "./roomSlice";

test("clears stale self hand data when a resting player's hand settles", () => {
  const restingUser = {
    id: "self",
    isReady: false,
    isInCurrentGame: true,
  } as SimpleUser;
  const room = {
    roomid: "room",
    isGaming: true,
    users: [restingUser],
  } as SimpleRoom;
  const self = {
    id: "self",
    hands: [{ num: 14, suit: "s" }],
    handsType: "上一手牌型",
  } as SimpleSelf;
  const settlingGame = {
    isSettling: true,
  } as SimpleGame;

  let state = roomReducer(undefined, setRoom(room));
  state = roomReducer(state, setSelf(self));
  state = roomReducer(state, setGame(settlingGame));

  expect(state.self?.hands).toEqual([]);
  expect(state.self?.handsType).toBe("");
});
