import {
  createRoom,
  createUser,
  roomMap,
  startGame,
  userBet,
  userEnterRoom,
  userFold,
  userMap,
  userReady,
} from "../service";
import { Game } from "../service/Room";
import { prettify } from "../utils/game-engine";
import { logGame } from "./utils";

describe("AutoPlay", () => {
  const tokens = new Array(6).fill(0).map((_, i) => `token-${i}`);

  beforeEach(() => {
    Object.keys(userMap).forEach((k) => delete userMap[k]);
    Object.keys(roomMap).forEach((k) => delete roomMap[k]);
  });

  it("100 Round", () => {
    tokens.forEach((t) => {
      createUser(t, t.toUpperCase(), "/pig");
    });
    const room = createRoom(tokens[0], 1, 200);
    tokens.forEach((t) => {
      userEnterRoom(t, room.id);
      userReady(t);
    });
    startGame(tokens[0]);
    const game = room.game;

    logGame(game);
    for (let i = 0; i < 1000; ++i) {
      tokens.forEach((t) => {
        const user = userMap[t];
        if (user.isActing) {
          const preBet: number = Math.max(
            ...game.sortedUsers.map((t) => userMap[t].bets[game.round])
          );
          const availableChips =
            user.stack -
            [...user.bets].splice(0, game.round).reduce((a, b) => a + b, 0);
          const rand = Math.floor(Math.random() * 3);
          if (rand == 0) {
            // call
            userFold(user.token);
          } else if (rand == 1) {
            // fold
            userBet(user.token, Math.min(preBet, availableChips));
          } else {
            // raise * 2
            userBet(user.token, Math.min(preBet * 2, availableChips));
          }
          // logGame(game);
        }
      });
    }
  });
});
