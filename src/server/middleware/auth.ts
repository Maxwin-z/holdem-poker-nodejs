import { Context } from "koa";
import * as jwt from "jsonwebtoken";
import { secret } from "../config";

export default async (ctx: Context, next: () => Promise<any>) => {
  console.log(ctx.url, ctx.method);
  const urls = ["/currentroom", "/createroom", "/joinroom"];
  if (urls.indexOf(ctx.url) != -1) {
    try {
      ctx.user = jwt.verify(ctx.headers.authorization || "", secret);
    } catch (e) {
      return (ctx.error = "invalid token, logout plz");
    }
  }
  await next();
  console.log(
    new Date(),
    ctx.request.method,
    ctx.status,
    /^(4|5)/.test(`${ctx.status}`) ? ctx.url.red : ctx.url.green
  );
};
