import { useMemo, useState } from "react";
import { SimpleChipsRecord } from "../../ApiType";
import { useAppSelector } from "../../app/hooks";
import { selectChipsRecord } from "./chipsRecordSlice";

export interface TableData {
  id: string;
  name: string;
  chips: number;
  buyIn: number;
  profit: number;
}

type SortKey = "name" | "chips" | "buyIn" | "profit";

function formatChips(value: number) {
  return value.toLocaleString("en-US");
}

export function ChipsRecord({
  previewRecords,
}: {
  previewRecords?: SimpleChipsRecord[];
}) {
  const roomChipsRecords = useAppSelector(selectChipsRecord);
  const records = previewRecords || roomChipsRecords.chipsRecords;
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);

  const data = useMemo<TableData[]>(
    () =>
      records
        .map((record) => ({
          id: record.id,
          name: record.name,
          chips: record.chips,
          buyIn: record.buyIn,
          profit: record.chips - record.buyIn,
        }))
        .sort((first, second) => {
          if (sortKey === "name") {
            return first.name.localeCompare(second.name) * sortDirection;
          }
          return (first[sortKey] - second[sortKey]) * sortDirection;
        }),
    [records, sortDirection, sortKey]
  );

  const totalBuyIn = data.reduce((sum, record) => sum + record.buyIn, 0);
  const totalChips = data.reduce((sum, record) => sum + record.chips, 0);

  const changeSort = (nextSortKey: SortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === 1 ? -1 : 1);
    } else {
      setSortKey(nextSortKey);
      setSortDirection(nextSortKey === "name" ? 1 : -1);
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDirection === 1 ? " ↑" : " ↓") : "";

  return (
    <section className="live-chips-panel">
      <header className="live-detail-panel__heading">
        <div>
          <small>CHIP LEDGER</small>
          <strong>积分信息</strong>
        </div>
        <span>{data.length} 人</span>
      </header>

      <div className="live-chip-summary">
        <div>
          <span>总买入</span>
          <strong>{formatChips(totalBuyIn)}</strong>
        </div>
        <div>
          <span>当前筹码</span>
          <strong>{formatChips(totalChips)}</strong>
        </div>
      </div>

      {data.length ? (
        <div className="live-chip-table">
          <div className="live-chip-table__header">
            <button type="button" onClick={() => changeSort("name")}>
              玩家{sortIndicator("name")}
            </button>
            <button type="button" onClick={() => changeSort("chips")}>
              筹码{sortIndicator("chips")}
            </button>
            <button type="button" onClick={() => changeSort("buyIn")}>
              买入{sortIndicator("buyIn")}
            </button>
            <button type="button" onClick={() => changeSort("profit")}>
              盈亏{sortIndicator("profit")}
            </button>
          </div>
          <div className="live-chip-table__body">
            {data.map((record, index) => (
              <div className="live-chip-table__row" key={record.id}>
                <div className="live-chip-player">
                  <span>{record.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{record.name}</strong>
                    <small>#{String(index + 1).padStart(2, "0")}</small>
                  </div>
                </div>
                <b>{formatChips(record.chips)}</b>
                <b>{formatChips(record.buyIn)}</b>
                <b
                  className={
                    record.profit > 0
                      ? "is-positive"
                      : record.profit < 0
                      ? "is-negative"
                      : ""
                  }
                >
                  {record.profit > 0 ? "+" : ""}
                  {formatChips(record.profit)}
                </b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="live-detail-empty">
          <span>●</span>
          <strong>还没有积分记录</strong>
          <small>玩家买入后会自动同步到这里</small>
        </div>
      )}
    </section>
  );
}
