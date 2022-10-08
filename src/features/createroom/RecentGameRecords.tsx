import { Card } from "antd";
import Table, { ColumnsType } from "antd/lib/table";
import { SimpleChipsRecord } from "../../ApiType";
import { TableData } from "../chipsrecord/ChipsRecord";

export function RecentGameRecords() {
  let crs: {
    [roomid: string]: {
      date: number;
      records: SimpleChipsRecord[];
    };
  } = {};
  try {
    crs = JSON.parse(localStorage["chipsRecords"] || "({})");
  } catch (ignore) {}

  const arr: { roomid: string; date: number; records: SimpleChipsRecord[] }[] =
    [];
  Object.keys(crs).forEach((roomid) => {
    const cr = crs[roomid];
    arr.push({
      roomid,
      date: cr.date,
      records: cr.records,
    });
  });
  arr.sort((a, b) => b.date - a.date);

  const columns: ColumnsType<any> = [
    {
      title: "玩家",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "筹码",
      dataIndex: "chips",
      key: "chips",
      sorter: (a: TableData, b: TableData) => a.chips - b.chips,
    },
    {
      title: "买入",
      dataIndex: "buyIn",
      key: "buyIn",
      sorter: (a: TableData, b: TableData) => a.buyIn - b.buyIn,
    },
    {
      title: "盈亏",
      dataIndex: "profit",
      key: "profit",
      sorter: (a: TableData, b: TableData) => a.profit - b.profit,
    },
  ];

  return (
    <div>
      <h1 style={{ marginTop: 30 }}>最近的游戏记录</h1>
      {arr.map((item) => {
        const data: TableData[] = item.records.map((cr) => ({
          id: cr.id,
          name: cr.name,
          chips: cr.chips,
          buyIn: cr.buyIn,
          profit: cr.chips - cr.buyIn,
        }));
        return (
          <Card
            title={`时间${new Date(item.date)}`}
            bordered={false}
            key={item.roomid}
            style={{ marginBottom: 10 }}
          >
            <Table
              rowKey={"id"}
              columns={columns}
              dataSource={data}
              pagination={false}
            />
          </Card>
        );
      })}
    </div>
  );
}
