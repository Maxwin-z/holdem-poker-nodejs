import { SimpleChipsRecord } from "../../ApiType";
import {
  buildRecentGamesCsv,
  RecentGameEntry,
  sortRecordsByGroupedProfit,
} from "./recentGameSort";

function record(
  id: string,
  name: string,
  chips: number,
  buyIn: number
): SimpleChipsRecord {
  return { id, name, chips, buyIn };
}

describe("sortRecordsByGroupedProfit", () => {
  it("把同名玩家排在一起，组按盈亏之和降序，组内按盈亏降序", () => {
    const records = [
      record("m1", "Maxwin", 1000, 1000), // 0
      record("leo", "Leo", 500, 1000), // -500
      record("momo", "Momo", 1500, 1000), // +500
      record("m2", "Maxwin", 2000, 1000), // +1000
      record("m3", "Maxwin", 300, 1000), // -700
    ];

    const sorted = sortRecordsByGroupedProfit(records);

    expect(sorted.map((item) => item.id)).toEqual([
      "momo", // Momo 组盈亏和 +500，排最前
      "m2", // Maxwin 组盈亏和 +300
      "m1",
      "m3", // Maxwin 组内按盈亏降序：+1000, 0, -700
      "leo", // Leo -500 排最后
    ]);
  });

  it("同名行保持连续且不合并", () => {
    const records = [
      record("a", "Nana", 900, 1000),
      record("b", "Maxwin", 1200, 1000),
      record("c", "Nana", 1300, 1000),
      record("d", "Maxwin", 800, 1000),
    ];

    const sorted = sortRecordsByGroupedProfit(records);

    expect(sorted).toHaveLength(4);
    expect(sorted.map((item) => item.name)).toEqual([
      "Nana",
      "Nana",
      "Maxwin",
      "Maxwin",
    ]);
  });

  it("空列表返回空列表", () => {
    expect(sortRecordsByGroupedProfit([])).toEqual([]);
  });
});

describe("buildRecentGamesCsv", () => {
  const games: RecentGameEntry[] = [
    {
      roomid: "8K21",
      date: new Date(2026, 0, 15, 9, 30).getTime(),
      records: [
        record("m1", "Maxwin", 2000, 1000), // +1000
        record("leo", "Leo", 500, 1000), // -500
        record("m2", "Maxwin", 300, 1000), // -700
      ],
    },
    {
      roomid: "A,1",
      date: new Date(2026, 1, 2, 18, 5).getTime(),
      records: [record("nana", 'Nana"Q', 1500, 1000)],
    },
  ];

  it("带 BOM、表头和按排序后的行", () => {
    const csv = buildRecentGamesCsv(games);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe("牌局,时间,玩家,筹码,买入,盈亏");
    // 第一局：Maxwin 组（和 +300）在前、Leo 组（-500）在后
    expect(lines[1]).toContain("8K21");
    expect(lines[1]).toContain("Maxwin");
    expect(lines[1]).toContain("2000,1000,1000");
    expect(lines[2]).toContain("Maxwin");
    expect(lines[2]).toContain("300,1000,-700");
    expect(lines[3]).toContain("Leo");
    expect(lines[3]).toContain("500,1000,-500");
  });

  it("对含逗号、引号的内容做转义", () => {
    const csv = buildRecentGamesCsv([games[1]]);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");

    expect(lines[1]).toContain('"A,1"');
    expect(lines[1]).toContain('"Nana""Q"');
  });
});
