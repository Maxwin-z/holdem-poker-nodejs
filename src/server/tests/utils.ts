import { userMap } from "../service";
import { Game } from "../service/Room";
import { prettify } from "../utils/game-engine";

export function logGame(game: Game) {
  // const posMap: {
  //   [x: number]: string[];
  // } = {
  //   2: ["SB ", "BB "],
  //   3: ["SB ", "BB ", "D  "],
  //   4: ["SB ", "BB ", "CO ", "D  "],
  //   5: ["SB ", "BB ", "UTG", "CO ", "D  "],
  //   6: ["SB ", "BB ", "UTG", "MP ", "CO ", "D  "],
  // };
  // (posMap[game.sortedUsers.length] || []).forEach(
  //   (pos, i) => (userMap[game.sortedUsers[i]].positon = pos)
  // );
  // console.log("after pos", userMap);
  const userLog = game.sortedUsers
    .map((t) => {
      const user = userMap[t];
      const log = `${user.positon}, ${user.stack}: ${prettify(
        user.hands
      )}   bets: ${user.bets.join(", ")}  ${user.isActing ? "√" : ""} ${
        user.isAllIn ? "AllIn" : ""
      } ${user.isFolded ? "Fold" : ""} ${user.needAction ? "⏳" : "✅"}\t`;
      return user.isFolded ? log.strikethrough.gray : log;
    })
    .join("\n");
  console.log(userLog);
  // console.log(userMap);
  let pots = 0;
  game.sortedUsers.forEach(
    (t) => (pots += userMap[t].bets.reduce((a, b) => a + b, 0))
  );
  console.log(`POTS: ${pots}    Board: ${prettify(game.boardCards)}`);
}
