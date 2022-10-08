import { Context } from "koa";
require("colors");
import colors from "colors";

export default async (ctx: Context, next: () => Promise<any>) => {
  Object.defineProperty(ctx, "json", {
    set(json) {
      ctx.type = "application/json";
      ctx.body = JSON.stringify(json);
    },
  });
  Object.defineProperty(ctx, "data", {
    set(data) {
      ctx.type = "application/json";
      ctx.body = JSON.stringify({
        code: 0,
        data,
      });
    },
  });
  Object.defineProperty(ctx, "error", {
    set(error) {
      ctx.type = "application/json";
      ctx.body = JSON.stringify({
        code: -1,
        error:
          typeof error === "string" ? error : error.message || error.toString(),
      });
    },
  });
  try {
    await next();
  } catch (e) {
    console.log("[ERROR in response]\n".red, e);
    ctx.error = e;
  }
};
