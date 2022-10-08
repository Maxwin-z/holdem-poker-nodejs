import { Table } from "antd";
import { ColumnsType } from "antd/lib/table";
import { useAppSelector } from "../../app/hooks";
import { selectChipsRecord } from "./chipsRecordSlice";

export interface TableData {
  id: string;
  name: string;
  chips: number;
  buyIn: number;
  profit: number;
}

export function ChipsRecord() {
  const roomChipsRecords = useAppSelector(selectChipsRecord);
  const data: TableData[] = roomChipsRecords.chipsRecords.map((cr) => ({
    id: cr.id,
    name: cr.name,
    chips: cr.chips,
    buyIn: cr.buyIn,
    profit: cr.chips - cr.buyIn,
  }));
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
    <Table
      rowKey={"id"}
      columns={columns}
      dataSource={data}
      pagination={false}
    />
  );
}
