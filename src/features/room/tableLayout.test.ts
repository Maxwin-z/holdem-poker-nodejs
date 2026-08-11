import { layoutTable, rectsOverlap, SEAT_W, SEAT_H } from "./tableLayout";

// 舞台尺寸 = .live-table-stage 实测尺寸(不含 header 与底部自家区)。
// 数值对应设计稿验证过的五种典型屏幕。
const CASES: {
  name: string;
  w: number;
  h: number;
  phone: boolean;
  mode: "portrait" | "landscape";
}[] = [
  { name: "iPhone 竖屏", w: 378, h: 520, phone: true, mode: "portrait" },
  { name: "iPad 竖屏", w: 740, h: 628, phone: false, mode: "portrait" },
  { name: "iPad 横屏", w: 996, h: 419, phone: false, mode: "landscape" },
  { name: "14 寸笔记本", w: 1252, h: 451, phone: false, mode: "landscape" },
  { name: "27 寸宽屏", w: 1892, h: 680, phone: false, mode: "landscape" },
];

describe("layoutTable", () => {
  CASES.forEach((c) => {
    it(`${c.name}:模式正确且零重叠`, () => {
      const layout = layoutTable(c.w, c.h, c.phone);
      expect(layout).not.toBeNull();
      expect(layout!.mode).toBe(c.mode);
      expect(layout!.hits).toBe(0);
      expect(layout!.seats).toHaveLength(9);

      // 复核:座位两两不相交,也不压公共牌区
      const { seats, board } = layout!;
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          expect(rectsOverlap(seats[i], seats[j])).toBe(false);
        }
        expect(rectsOverlap(seats[i], board)).toBe(false);
      }
    });
  });

  it("高度不足的横屏触发错位(14 寸笔记本)", () => {
    const layout = layoutTable(1252, 451, false)!;
    expect(layout.seats.filter((s) => s.staggered).length).toBeGreaterThan(0);
  });

  it("高度充足的宽屏保持纯椭圆并放大到上限(27 寸)", () => {
    const layout = layoutTable(1892, 680, false)!;
    expect(layout.seats.filter((s) => s.staggered)).toHaveLength(0);
    expect(layout.scale).toBe(1.2);
  });

  it("公共牌始终比手牌大一档", () => {
    for (const c of CASES) {
      const layout = layoutTable(c.w, c.h, c.phone)!;
      // 手牌 40px @ scale,公共牌 board.cardW
      expect(layout.board.cardW).toBeGreaterThan(40 * layout.scale);
    }
  });

  it("座位盒不越出舞台边界", () => {
    for (const c of CASES) {
      const layout = layoutTable(c.w, c.h, c.phone)!;
      for (const s of layout.seats) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(c.w + 0.5);
        expect(s.y + s.h).toBeLessThanOrEqual(c.h + 0.5);
      }
    }
  });

  it("手机模式为顶部悬浮按钮预留空间", () => {
    const layout = layoutTable(378, 520, true)!;
    for (const s of layout.seats) {
      expect(s.y).toBeGreaterThanOrEqual(48);
    }
  });

  it("座位盒尺寸与 scale 一致", () => {
    const layout = layoutTable(1252, 451, false)!;
    for (const s of layout.seats) {
      expect(s.w).toBeCloseTo(SEAT_W * s.scale, 0);
      expect(s.h).toBeCloseTo(SEAT_H * s.scale, 0);
    }
  });

  it("过小的舞台返回 null", () => {
    expect(layoutTable(100, 100, false)).toBeNull();
    expect(layoutTable(0, 0, true)).toBeNull();
  });
});
