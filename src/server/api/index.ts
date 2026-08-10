import Router from "@koa/router";
import * as jwt from "jsonwebtoken";
import { secret } from "../config";
import { createRoom, roomMap, userEnterRoom, userMap } from "../service";
import User from "../service/User";
import { getPreflopAdvice } from "../../gto/preflop/advice";
import { getPostflopAdvice } from "../../gto/postflop/advice";
import { getPlayerAnalyticsStore } from "../analytics/player-analytics";
import type { AnalyticsWindow } from "../../shared/playerAnalytics";
import { getAiReplayStore } from "../replay/ai-replay-store";

const router = new Router();
export default router;

router.get("/root", (ctx) => {
  ctx.body = "api root";
});

router.get("/json", (ctx) => {
  ctx.data = {
    name: "maxwin",
  };
});

// router.get("/debug", (ctx) => {
//   ctx.data = {
//     users: userMap,
//     rooms: roomMap,
//   };
// });

router.post("/register", (ctx) => {
  const { name, password, avatar } = ctx.request.body;
  if (name === null || name === "") {
    throw new Error(`register name is empty`);
  }
  if (name.indexOf("@") !== -1) {
    throw new Error(`用户名不能有特殊字符`);
  }
  if (password === null || password === "") {
    throw new Error(`password is empty`);
  }
  const token = jwt.sign(name + "@" + password, secret);
  if (!userMap[token]) {
    userMap[token] = new User(token, name, avatar);
  }
  ctx.data = token;
});

router.get("/currentroom", (ctx) => {
  const token = ctx.header.authorization;
  if (!token) throw "need login";
  if (!userMap[token]) {
    userMap[token] = new User(token, ctx.user, "");
  }
  ctx.data = userMap[token].roomid || null;
});

router.get("/api/me/stats", (ctx) => {
  const token = ctx.header.authorization;
  if (!token) throw "need login";
  const requested = String(ctx.query.window || "100");
  const window = ([20, 50, 100, 500, 2000, 5000].includes(Number(requested))
    ? Number(requested)
    : 100) as AnalyticsWindow;
  ctx.data = getPlayerAnalyticsStore().getReport(token, window);
});

router.get("/api/me/ai-replays", (ctx) => {
  const token = ctx.header.authorization;
  if (!token) throw "need login";
  ctx.data = getAiReplayStore().listForToken(token);
});

router.get("/api/ai-replays/:publicId", (ctx) => {
  const replay = getAiReplayStore().getPublic(ctx.params.publicId);
  if (!replay) throw "牌局复盘不存在或已过期";
  ctx.data = replay;
});

router.post("/createroom", (ctx) => {
  const token = ctx.header.authorization;
  if (!token) throw "need login";
  if (!userMap[token]) {
    userMap[token] = new User(token, ctx.user, "");
  }
  const { sb, buyin } = ctx.request.body;
  const room = createRoom(token, sb, buyin);
  ctx.data = room.id;
});

router.post("/joinroom", (ctx) => {
  const token = ctx.header.authorization;
  if (!token) throw "need login";
  if (!userMap[token]) {
    userMap[token] = new User(token, ctx.user, "");
  }
  const { roomid } = ctx.request.body;
  userEnterRoom(token, roomid);
  ctx.data = roomid;
});

router.post("/gto/preflop", (ctx) => {
  const body = (ctx.request.body || {}) as Record<string, unknown>;
  ctx.data = getPreflopAdvice(body as any);
});

router.post("/gto/postflop", (ctx) => {
  const body = (ctx.request.body || {}) as Record<string, unknown>;
  ctx.data = getPostflopAdvice(body as any);
});
