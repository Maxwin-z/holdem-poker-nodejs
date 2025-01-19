import Koa from "koa";
import koaBody from "koa-body";
import path from "path";
import serve from "koa-static";
import websockify from "koa-websocket";
import router from "./api/index";
import ws from "./api/ws";
import responseMiddleware from "./middleware/response";
import authMiddleware from "./middleware/auth";

const app = websockify(new Koa());

app
  .use(serve(path.join(__dirname, "../../../build")))
  .use(koaBody({ multipart: true }))
  .use(responseMiddleware)
  .use(authMiddleware)
  .use(router.routes())
  .use(router.allowedMethods());

app.ws.use(ws);

const PORT = 8086;
app.listen(PORT);
console.log(`server at: http://localhost:${PORT}`);
