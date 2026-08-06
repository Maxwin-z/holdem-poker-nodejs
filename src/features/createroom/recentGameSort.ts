import { SimpleChipsRecord } from "../../ApiType";

export interface RecentGameEntry {
  roomid: string;
  date: number;
  records: SimpleChipsRecord[];
}

function profitOf(record: SimpleChipsRecord) {
  return record.chips - record.buyIn;
}

/**
 * 把同名玩家的记录行排在一起（不合并行），
 * 组的位置按组内盈亏之和降序排，组内也按盈亏降序排。
 */
export function sortRecordsByGroupedProfit(
  records: SimpleChipsRecord[]
): SimpleChipsRecord[] {
  const groups = new Map<string, SimpleChipsRecord[]>();
  records.forEach((record) => {
    const group = groups.get(record.name);
    if (group) {
      group.push(record);
    } else {
      groups.set(record.name, [record]);
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      group,
      sumProfit: group.reduce((sum, record) => sum + profitOf(record), 0),
    }))
    .sort((first, second) => second.sumProfit - first.sumProfit)
    .flatMap(({ group }) =>
      [...group].sort(
        (first, second) => profitOf(second) - profitOf(first)
      )
    );
}

function escapeCsvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCsvDate(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * 生成按排序后顺序导出的 CSV 文本（带 BOM，方便 Excel 识别中文）。
 */
export function buildRecentGamesCsv(games: RecentGameEntry[]): string {
  const lines = ["牌局,时间,玩家,筹码,买入,盈亏"];
  games.forEach((game) => {
    const time = formatCsvDate(game.date);
    sortRecordsByGroupedProfit(game.records).forEach((record) => {
      lines.push(
        [
          escapeCsvCell(game.roomid),
          escapeCsvCell(time),
          escapeCsvCell(record.name),
          record.chips,
          record.buyIn,
          profitOf(record),
        ].join(",")
      );
    });
  });
  return "\uFEFF" + lines.join("\r\n");
}
