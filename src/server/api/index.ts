import Router from "@koa/router";
import * as jwt from "jsonwebtoken";
import { secret } from "../config";
import { createRoom, userEnterRoom, userMap } from "../service";
import User from "../service/User";

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

router.post("/register", (ctx) => {
  const { name, avatar } = ctx.request.body;
  if (!name) {
    throw new Error(`register name is empty`);
  }
  const token = jwt.sign(name, secret);
  if (userMap[token]) {
    throw `用户名${name}已注册`;
  }
  userMap[token] = new User(token, name, avatar);
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
