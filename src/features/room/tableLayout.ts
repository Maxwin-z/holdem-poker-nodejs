import { useEffect, useRef, useState } from "react";

// 原子座位单元的碰撞盒(scale = 1 时),所有内容(手牌/胶囊/行动条/徽章)都收在盒内。
export const SEAT_W = 132;
export const SEAT_H = 108;

// 座位顺序与 Room 的 seatNames 一致:lower-left → 左列 → 顶排 → 右列 → lower-right。
// 椭圆角度以屏幕坐标系为准(y 向下,270° 为正上方),底部弧留给自己。
const ANGLES = [145, 180, 215, 243, 270, 297, 325, 0, 35];

const MIN_SCALE = 0.6;
const SCALE_STEP = 0.03;

export type Rect = { x: number; y: number; w: number; h: number };

export type SeatBox = Rect & { scale: number; staggered: boolean };

export type BoardRect = Rect & { cardW: number; wrap: boolean };

export type TableLayout = {
  mode: "portrait" | "landscape";
  scale: number;
  seats: SeatBox[];
  board: BoardRect;
  felt: Rect;
  /** 未能消除的碰撞对数量;目标尺寸下恒为 0,极矮小窗时兜底缩放后可能残留 */
  hits: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boardRect(stage: Rect, mode: "portrait" | "landscape", s: number): BoardRect {
  const cx = stage.x + stage.w / 2;
  const cy = stage.y + stage.h / 2;
  if (mode === "portrait") {
    // 竖屏公共牌 3 + 2 两行排布,夹在左右两列之间
    const cw = stage.w < 360 ? 36 : 44;
    const w = cw * 3 + 2 * 6;
    const h = 34 + 2 * (cw * 1.4) + 14;
    return { x: cx - w / 2, y: cy - h / 2, w, h, cardW: cw, wrap: true };
  }
  const bs = clamp(s + 0.08, 0.8, 1);
  const cw = Math.round(52 * bs);
  const w = cw * 5 + 4 * 6;
  const h = 40 + cw * 1.4 + 10;
  return { x: cx - w / 2, y: cy - h / 2 + 2, w, h, cardW: cw, wrap: false };
}

type Slot = { x: number; y: number; staggered: boolean };

function ellipseSlots(stage: Rect, s: number): Slot[] {
  const cx = stage.x + stage.w / 2;
  const cy = stage.y + stage.h / 2;
  const rx = stage.w / 2 - (SEAT_W * s) / 2 - 2;
  const ry = stage.h / 2 - (SEAT_H * s) / 2 - 2;
  return ANGLES.map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), staggered: false };
  });
}

function portraitSlots(stage: Rect, s: number): Slot[] {
  const cx = stage.x + stage.w / 2;
  const hw = (SEAT_W * s) / 2;
  const hh = (SEAT_H * s) / 2;
  const topY = stage.y + hh;
  const spread = Math.min((stage.w - SEAT_W * s) / 2 - 2, SEAT_W * s + 18);
  const lx = stage.x + hw;
  const rx = stage.x + stage.w - hw;
  const colTop = topY + SEAT_H * s + 8;
  const colBot = stage.y + stage.h - hh;
  const ys = [colBot, (colBot + colTop) / 2, colTop]; // lower / middle / upper
  return [
    { x: lx, y: ys[0] }, { x: lx, y: ys[1] }, { x: lx, y: ys[2] },
    { x: cx - spread, y: topY }, { x: cx, y: topY }, { x: cx + spread, y: topY },
    { x: rx, y: ys[2] }, { x: rx, y: ys[1] }, { x: rx, y: ys[0] },
  ].map((p) => ({ ...p, staggered: false }));
}

// 错位:左右纵列里与「中间座位」纵向重叠的上下座位沿 X 向内收,
// 中间座位保持最外侧,收进幅度受公共牌区边界约束。
function staggerPass(slots: Slot[], s: number, board: BoardRect) {
  const W = SEAT_W * s;
  const H = SEAT_H * s;
  for (const g of [
    { ids: [0, 1, 2], dir: +1 },
    { ids: [8, 7, 6], dir: -1 },
  ]) {
    const mid = slots[g.ids[1]];
    for (const idx of [g.ids[0], g.ids[2]]) {
      const n = slots[idx];
      const vOverlap = Math.abs(n.y - mid.y) < H + 4;
      const hGap = Math.abs(n.x - mid.x);
      if (vOverlap && hGap < W + 6) {
        let nx = n.x + g.dir * (W + 6 - hGap);
        const inEdge = g.dir > 0 ? nx + W / 2 : nx - W / 2;
        const limit = g.dir > 0 ? board.x - 10 : board.x + board.w + 10;
        if (g.dir > 0 ? inEdge > limit : inEdge < limit) {
          nx = g.dir > 0 ? limit - W / 2 : limit + W / 2;
        }
        n.x = nx;
        n.staggered = true;
      }
    }
  }
}

function countCollisions(boxes: Rect[], board: BoardRect) {
  let hits = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i], boxes[j])) hits++;
    }
    if (rectsOverlap(boxes[i], board)) hits++;
  }
  return hits;
}

function feltRect(stage: Rect, mode: "portrait" | "landscape", s: number): Rect {
  const w = stage.w - SEAT_W * s * (mode === "portrait" ? 1.35 : 1.05);
  const h = stage.h - SEAT_H * s * (mode === "portrait" ? 1.5 : 0.85);
  return { x: stage.x + (stage.w - w) / 2, y: stage.y + (stage.h - h) / 2, w, h };
}

/**
 * 计算 9 个对手座位、公共牌区与桌面呢面的位置。
 * stageW/stageH 是 .live-table-stage 的实测尺寸(不含底部自家区,桌面 header 在舞台之外)。
 * phone 模式下 header 是悬浮在舞台上的角按钮,所以额外留出顶部内边距。
 */
export function layoutTable(
  stageW: number,
  stageH: number,
  phone: boolean
): TableLayout | null {
  if (stageW < 120 || stageH < 120) return null;
  const pad = 4;
  const topInset = phone ? 48 : 0;
  const stage: Rect = {
    x: pad,
    y: topInset + pad,
    w: stageW - pad * 2,
    h: stageH - topInset - pad * 2,
  };
  if (stage.w < 80 || stage.h < 80) return null;

  // 手机宽度一律三边纵列(左3·顶3·右3);其余按舞台宽高比切换
  const mode: "portrait" | "landscape" =
    phone || stage.w / stage.h < 1.2 ? "portrait" : "landscape";
  const s0 =
    mode === "portrait"
      ? clamp(stage.w / 520, 0.62, 0.9)
      : clamp(stage.w / 1150, 0.78, 1);

  let out: TableLayout | null = null;
  for (let s = s0; s >= MIN_SCALE; s -= SCALE_STEP) {
    const board = boardRect(stage, mode, s);
    const slots = mode === "portrait" ? portraitSlots(stage, s) : ellipseSlots(stage, s);
    staggerPass(slots, s, board);
    const W = SEAT_W * s;
    const H = SEAT_H * s;
    const seats: SeatBox[] = slots.map((p) => ({
      x: p.x - W / 2,
      y: p.y - H / 2,
      w: W,
      h: H,
      scale: s,
      staggered: p.staggered,
    }));
    const hits = countCollisions(seats, board);
    out = {
      mode,
      scale: +s.toFixed(2),
      seats,
      board,
      felt: feltRect(stage, mode, s),
      hits,
    };
    if (!hits) break;
  }
  return out;
}

const PHONE_MAX_WIDTH = 600; // 与 RoomResponsive.css 的 @media (max-width: 600px) 保持一致

// 本项目的 TS lib 较旧,没有 ResizeObserver 的内置类型
type ResizeObserverLike = { observe(el: Element): void; disconnect(): void };
declare const ResizeObserver:
  | (new (callback: () => void) => ResizeObserverLike)
  | undefined;

/** 用 ResizeObserver 实测舞台尺寸并驱动 layoutTable。 */
export function useTableLayout<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const lastKey = useRef("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const phone = window.innerWidth <= PHONE_MAX_WIDTH;
      const key = `${Math.round(rect.width)}x${Math.round(rect.height)}:${phone}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      setLayout(layoutTable(rect.width, rect.height, phone));
    };

    update();
    const observer =
      typeof ResizeObserver !== "undefined" && ResizeObserver
        ? new ResizeObserver(update)
        : null;
    observer?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return { ref, layout };
}
