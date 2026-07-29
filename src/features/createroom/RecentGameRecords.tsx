import { ClockCircleOutlined, HistoryOutlined } from "@ant-design/icons";
import { SimpleChipsRecord } from "../../ApiType";

export type RecentGameEntry = {
  roomid: string;
  date: number;
  records: SimpleChipsRecord[];
};

function formatChips(value: number) {
  return value.toLocaleString("en-US");
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentGameRecords({
  previewRecords,
}: {
  previewRecords?: RecentGameEntry[];
}) {
  let storedRecords: {
    [roomid: string]: {
      date: number;
      records: SimpleChipsRecord[];
    };
  } = {};

  if (!previewRecords) {
    try {
      storedRecords = JSON.parse(localStorage["chipsRecords"] || "({})");
    } catch (ignore) {}
  }

  const recentGames: RecentGameEntry[] = previewRecords
    ? [...previewRecords]
    : Object.keys(storedRecords).map((roomid) => ({
        roomid,
        date: storedRecords[roomid].date,
        records: storedRecords[roomid].records,
      }));

  recentGames.sort((first, second) => second.date - first.date);

  return (
    <section className="lobby-recent">
      <div className="lobby-recent__heading">
        <div>
          <span className="lobby-eyebrow">RECENT SESSIONS</span>
          <h2>最近牌局</h2>
        </div>
        <HistoryOutlined />
      </div>

      {recentGames.length ? (
        <div className="lobby-recent__list">
          {recentGames.map((game, gameIndex) => {
            const totalBuyIn = game.records.reduce(
              (sum, record) => sum + record.buyIn,
              0
            );
            return (
              <details
                className="lobby-session-card"
                key={game.roomid}
                open={gameIndex === 0}
              >
                <summary>
                  <div className="lobby-session-card__room">
                    <span>#{game.roomid}</span>
                    <strong>{game.records.length} 人牌局</strong>
                  </div>
                  <div className="lobby-session-card__meta">
                    <span>
                      <ClockCircleOutlined />
                      {formatDate(game.date)}
                    </span>
                    <strong>总买入 {formatChips(totalBuyIn)}</strong>
                  </div>
                  <i />
                </summary>

                <div className="lobby-session-table">
                  <div className="lobby-session-table__header">
                    <span>玩家</span>
                    <span>筹码</span>
                    <span>买入</span>
                    <span>盈亏</span>
                  </div>
                  {game.records.map((record) => {
                    const profit = record.chips - record.buyIn;
                    return (
                      <div
                        className="lobby-session-table__row"
                        key={record.id}
                      >
                        <div>
                          <span>
                            {record.name.slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{record.name}</strong>
                        </div>
                        <b>{formatChips(record.chips)}</b>
                        <b>{formatChips(record.buyIn)}</b>
                        <b
                          className={
                            profit > 0
                              ? "is-positive"
                              : profit < 0
                              ? "is-negative"
                              : ""
                          }
                        >
                          {profit > 0 ? "+" : ""}
                          {formatChips(profit)}
                        </b>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="lobby-recent__empty">
          <HistoryOutlined />
          <strong>还没有完成的牌局</strong>
          <span>牌局结束后，积分记录会保存在这里。</span>
        </div>
      )}
    </section>
  );
}
