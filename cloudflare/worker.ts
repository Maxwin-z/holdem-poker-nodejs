import * as jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import {
  attachPokerWebSocket,
  detachPokerWebSocket,
  handlePokerWebSocketMessage,
  PokerWebSocket,
} from "../src/server/api/ws";
import {
  createRoom,
  userEnterRoom,
  userMap,
} from "../src/server/service";
import User from "../src/server/service/User";

interface Env {
  ASSETS: Fetcher;
  POKER_SERVER: DurableObjectNamespace;
  JWT_SECRET: string;
}

interface SocketMessageEvent {
  data: string | ArrayBuffer;
}

type CloudflarePokerWebSocket = WebSocket & PokerWebSocket;

const API_PATHS = new Set([
  "/root",
  "/json",
  "/register",
  "/currentroom",
  "/createroom",
  "/joinroom",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function success(data: unknown): Response {
  return json({ code: 0, data });
}

function errorResponse(error: unknown): Response {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);
  return json({ code: -1, error: message });
}

async function readJson(request: Request): Promise<Record<string, any>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  return request.json();
}

function authenticatedUser(request: Request, secret: string) {
  const token = request.headers.get("authorization") || "";
  return {
    token,
    name: nameFromToken(token, secret),
  };
}

function nameFromToken(token: string, secret: string): string {
  const payload = jwt.verify(token, secret);
  if (typeof payload === "string") {
    return payload.split("@")[0];
  }
  if (typeof payload.name === "string" && payload.name.length > 0) {
    return payload.name;
  }
  throw new Error("invalid token");
}

function ensureUser(token: string, name: string): User {
  if (!userMap[token]) {
    userMap[token] = new User(token, name, "");
  }
  return userMap[token];
}

export class PokerServer {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return this.openWebSocket(request);
      }

      const url = new URL(request.url);
      switch (`${request.method} ${url.pathname}`) {
        case "GET /root":
          return new Response("api root");
        case "GET /json":
          return success({ name: "maxwin" });
        case "POST /register":
          return this.register(request);
        case "GET /currentroom":
          return this.currentRoom(request);
        case "POST /createroom":
          return this.createRoom(request);
        case "POST /joinroom":
          return this.joinRoom(request);
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      console.error("request failed", error);
      return errorResponse(error);
    }
  }

  private async register(request: Request): Promise<Response> {
    const { name, password, avatar = "" } = await readJson(request);
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("register name is empty");
    }
    if (name.includes("@")) {
      throw new Error("用户名不能有特殊字符");
    }
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("password is empty");
    }

    // Preserve the original name+password session identity without exposing
    // the plaintext password in the decodable JWT payload.
    const credential = createHmac("sha256", this.env.JWT_SECRET)
      .update(`${name}\0${password}`)
      .digest("base64url");
    const token = jwt.sign({ name, credential }, this.env.JWT_SECRET);
    if (!userMap[token]) {
      userMap[token] = new User(token, name, String(avatar));
    }
    return success(token);
  }

  private currentRoom(request: Request): Response {
    const { token, name } = authenticatedUser(request, this.env.JWT_SECRET);
    return success(ensureUser(token, name).roomid || null);
  }

  private async createRoom(request: Request): Promise<Response> {
    const { token, name } = authenticatedUser(request, this.env.JWT_SECRET);
    ensureUser(token, name);
    const { sb, buyin } = await readJson(request);
    const room = createRoom(token, Number(sb), Number(buyin));
    return success(room.id);
  }

  private async joinRoom(request: Request): Promise<Response> {
    const { token, name } = authenticatedUser(request, this.env.JWT_SECRET);
    ensureUser(token, name);
    const { roomid } = await readJson(request);
    userEnterRoom(token, String(roomid));
    return success(String(roomid));
  }

  private openWebSocket(request: Request): Response {
    const token = request.headers.get("sec-websocket-protocol") || "";
    const name = nameFromToken(token, this.env.JWT_SECRET);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as CloudflarePokerWebSocket;

    server.accept();
    attachPokerWebSocket(server, token, name);
    server.addEventListener("message", (event: SocketMessageEvent) => {
      const message =
        typeof event.data === "string"
          ? event.data
          : new TextDecoder().decode(event.data);
      handlePokerWebSocketMessage(server, message);
    });
    let detached = false;
    const detach = () => {
      if (!detached) {
        detached = true;
        detachPokerWebSocket(server, token);
      }
    };
    server.addEventListener("close", detach);
    server.addEventListener("error", detach);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        "sec-websocket-protocol": token,
      },
    } as ResponseInit & { webSocket: WebSocket });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isWebSocket =
      request.headers.get("upgrade")?.toLowerCase() === "websocket";

    if (isWebSocket || API_PATHS.has(url.pathname)) {
      const id = env.POKER_SERVER.idFromName("global");
      return env.POKER_SERVER.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
