import type { Card, GameLogEntry, GtoLogEntry } from "../../ApiType";

/**
 * 服务端把牌局日志作为 HTML 字符串下发（见 server/service/Room.ts 的
 * publishLog2all）。这里把这些字符串还原成结构化的行，前端才能按
 * "手牌 → 街道 → 行动" 的层级排版，而不是一行一个气泡。
 *
 * 解析只依赖服务端已有的 class 标记，不需要改动服务端。
 */

export type SettleLine = {
  name: string;
  hole: Card[];
  best: Card[];
  handsType: string;
  profit: number;
};

export type FeedLine =
  | { kind: "handStart"; hand: number }
  | { kind: "handEnd"; hand: number }
  | { kind: "street"; label: string; cards: Card[] }
  | {
      kind: "action";
      name: string;
      pos: string;
      act: string;
      verb: string;
      amount: number | null;
    }
  | ({ kind: "settle" } & SettleLine)
  | { kind: "chat"; name: string; text: string }
  | { kind: "note"; html: string };

const RE_HAND_NO = /第\s*(\d+)\s*手/;
const RE_STREET = /^<span class="log-round-title">([\s\S]*?)<\/span>([\s\S]*)$/;
const RE_ACTION =
  /^<strong class="log-player">([\s\S]*?)<\/strong>(?:<span class="log-pos">([\s\S]*?)<\/span>)?\s*<span class="log-act log-act--([a-z]+)">([\s\S]*?)<\/span>\s*(\d*)/;
const RE_SETTLE =
  /^<strong class="log-player">([\s\S]*?)<\/strong>([\s\S]*?)<span class="log-profit log-profit--(?:win|lose)">([+-]?\d+)<\/span>/;
const RE_CHAT = /^<strong>([\s\S]*?)<\/strong>:([\s\S]*)$/;

export function parseCards(text: string): Card[] {
  const cards: Card[] = [];
  const re = /(\d+)([cdhs])/g;
  let match = re.exec(text);
  while (match) {
    cards.push({ num: parseInt(match[1], 10), suit: match[2] });
    match = re.exec(text);
  }
  return cards;
}

function unescapeChat(text: string): string {
  // 服务端把空格转成 &nbsp; 后再拼接，这里还原成纯文本交给 React 渲染，
  // 不再走 dangerouslySetInnerHTML。
  return text
    .replace(/^[\s﻿]*/, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSettleBody(body: string): Pick<
  SettleLine,
  "hole" | "best" | "handsType"
> {
  const holeMatch = body.match(/【([\s\S]*?)】/);
  if (!holeMatch) return { hole: [], best: [], handsType: "" };
  const rest = body.slice(body.indexOf("】") + 1).trim();
  const bestMatch = rest.match(/^((?:\d+[cdhs])+)\s*([\s\S]*)$/);
  return {
    hole: parseCards(holeMatch[1]),
    best: bestMatch ? parseCards(bestMatch[1]) : [],
    handsType: (bestMatch ? bestMatch[2] : rest).trim(),
  };
}

const parseCache = new Map<string, FeedLine>();

export function parseLogLine(log: string): FeedLine {
  const cached = parseCache.get(log);
  if (cached) return cached;
  const parsed = parseLogLineUncached(log);
  // 一局能产生上千条日志，缓存需要有上限。
  if (parseCache.size > 4000) parseCache.clear();
  parseCache.set(log, parsed);
  return parsed;
}

function parseLogLineUncached(log: string): FeedLine {
  if (log.includes("log-banner--start")) {
    const match = log.match(RE_HAND_NO);
    return { kind: "handStart", hand: match ? parseInt(match[1], 10) : 0 };
  }
  if (log.includes("log-banner--end")) {
    const match = log.match(RE_HAND_NO);
    return { kind: "handEnd", hand: match ? parseInt(match[1], 10) : 0 };
  }

  const street = log.match(RE_STREET);
  if (street) {
    return {
      kind: "street",
      label: street[1].trim(),
      cards: parseCards(street[2]),
    };
  }

  const action = log.match(RE_ACTION);
  if (action) {
    return {
      kind: "action",
      name: action[1],
      pos: (action[2] || "").trim(),
      act: action[3],
      verb: action[4].trim(),
      amount: action[5] ? parseInt(action[5], 10) : null,
    };
  }

  const settle = log.match(RE_SETTLE);
  if (settle) {
    return {
      kind: "settle",
      name: settle[1],
      profit: parseInt(settle[3], 10),
      ...parseSettleBody(settle[2]),
    };
  }

  const chat = log.match(RE_CHAT);
  if (chat) {
    return { kind: "chat", name: chat[1], text: unescapeChat(chat[2]) };
  }

  return { kind: "note", html: log };
}

export type FeedItem =
  | { key: string; type: "line"; line: FeedLine }
  | { key: string; type: "showdown"; rows: SettleLine[] }
  | { key: string; type: "gto"; entry: GtoLogEntry };

export type FeedHand = {
  hand: number;
  items: FeedItem[];
  chatCount: number;
  gtoCount: number;
  ended: boolean;
  /** 本手赢得最多的玩家，折叠态用来一行交代结果。 */
  best: { name: string; profit: number } | null;
  /** 服务端只在发公共牌时发街道行，翻前要自己补一个小标题。 */
  sawStreet: boolean;
};

export type FeedFilter = "all" | "chat" | "gto";

function newHand(hand: number): FeedHand {
  return {
    hand,
    items: [],
    chatCount: 0,
    gtoCount: 0,
    ended: false,
    best: null,
    sawStreet: false,
  };
}

/**
 * 把扁平日志按"手"分组。手的边界来自服务端已有的开始/结束横幅，
 * 横幅本身被吃掉，改由分组头部呈现。
 */
export function buildFeed(logs: GameLogEntry[]): FeedHand[] {
  const hands: FeedHand[] = [];
  let current: FeedHand | null = null;

  const ensure = () => {
    if (!current) {
      current = newHand(0);
      hands.push(current);
    }
    return current;
  };

  logs.forEach((log, index) => {
    if (typeof log !== "string") {
      const hand = ensure();
      // 断线重连后日志可能从半手开始，此时用 GTO 条目补上手数。
      if (!hand.hand && log.handSeq) hand.hand = log.handSeq;
      hand.gtoCount += 1;
      hand.items.push({ key: `${index}-gto`, type: "gto", entry: log });
      return;
    }

    const line = parseLogLine(log);

    if (line.kind === "handStart") {
      current = newHand(line.hand);
      hands.push(current);
      return;
    }
    if (line.kind === "handEnd") {
      const hand = ensure();
      if (!hand.hand) hand.hand = line.hand;
      hand.ended = true;
      return;
    }

    const hand = ensure();

    if (line.kind === "chat") hand.chatCount += 1;

    if (line.kind === "street") hand.sawStreet = true;

    // 翻前没有街道行，第一个行动前补一个，让每条街都有小标题。
    // 半手接进来的日志（没有开始横幅）不知道现在是哪条街，就不硬补。
    if (line.kind === "action" && !hand.sawStreet && hand.hand > 0) {
      hand.sawStreet = true;
      hand.items.push({
        key: `${index}-preflop`,
        type: "line",
        line: { kind: "street", label: "翻前", cards: [] },
      });
    }

    if (line.kind === "settle") {
      if (!hand.best || line.profit > hand.best.profit) {
        hand.best = { name: line.name, profit: line.profit };
      }
      // 连续的结算行合并成一个摊牌块。
      const last = hand.items[hand.items.length - 1];
      if (last && last.type === "showdown") {
        last.rows.push(line);
        return;
      }
      hand.items.push({
        key: `${index}-showdown`,
        type: "showdown",
        rows: [line],
      });
      return;
    }

    hand.items.push({ key: `${index}-line`, type: "line", line });
  });

  return hands;
}

export function filterHands(
  hands: FeedHand[],
  filter: FeedFilter
): FeedHand[] {
  if (filter === "all") return hands;
  return hands
    .map((hand) => ({
      ...hand,
      items: hand.items.filter((item) =>
        filter === "gto"
          ? item.type === "gto"
          : item.type === "line" && item.line.kind === "chat"
      ),
    }))
    .filter((hand) => hand.items.length > 0);
}

const RANK_LABEL: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
};

export function cardLabel(card: Card): string {
  const rank = RANK_LABEL[card.num] || `${card.num}`;
  const suit =
    card.suit === "c"
      ? "♣"
      : card.suit === "d"
      ? "♦"
      : card.suit === "h"
      ? "♥"
      : card.suit === "s"
      ? "♠"
      : "";
  return `${rank}${suit}`;
}

export function isRedSuit(card: Card): boolean {
  return card.suit === "d" || card.suit === "h";
}
