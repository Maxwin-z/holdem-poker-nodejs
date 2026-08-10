import Koa from "koa";
import koaBody from "koa-body";
import * as fs from "fs";
import path from "path";
import serve from "koa-static";
import websockify from "koa-websocket";
import router from "./api/index";
import ws from "./api/ws";
import responseMiddleware from "./middleware/response";
import authMiddleware from "./middleware/auth";

const app = websockify(new Koa());
const buildDirectory = path.join(__dirname, "../../../build");

app
  .use(async (ctx, next) => {
    await next();
    if (
      ctx.method === "GET" &&
      ctx.status === 404 &&
      !ctx.path.startsWith("/api/")
    ) {
      ctx.type = "text/html";
      ctx.body = fs.createReadStream(path.join(buildDirectory, "index.html"));
    }
  })
  .use(serve(buildDirectory))
  .use(koaBody({ multipart: true }))
  .use(responseMiddleware)
  .use(authMiddleware)
  .use(router.routes())
  .use(router.allowedMethods());

app.ws.use(ws);

const PORT = Number(process.env.PORT || 8086);
app.listen(PORT);
console.log(`server at: http://localhost:${PORT}`);
