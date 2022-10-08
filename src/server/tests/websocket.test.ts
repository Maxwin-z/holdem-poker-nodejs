import colors from "colors";
import { client as WebSocketClient, connection } from "websocket";

async function sleep(t: number) {
  return new Promise((rs) => setTimeout(rs, t));
}
let ws: WebSocketClient = new WebSocketClient();
let conn: connection;

async function createConnection(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.connect("ws://localhost:8080/");
    ws.on("connect", (c: connection) => {
      conn = c;
      conn.on("message", (msg) => {
        console.log(colors.green("from server:"), msg);
      });
      resolve();
    });
  });
}

describe("", function () {
  before(createConnection);
  after(() => {});
  it("test connection", async () => {
    for (let i = 0; i < 10; ++i) {
      console.log("send to server");
      conn.sendUTF("i am client");
      await sleep(1000);
    }
    conn.close();
  }).timeout(0);
});
