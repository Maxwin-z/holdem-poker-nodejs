import { Avatar, Button, Tooltip } from "antd";
import { DoubleRightOutlined, DoubleLeftOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useAppSelector } from "../../app/hooks";
import { selectSpectators } from "./roomSlice";
export function Spectators() {
  const [show, setShow] = useState(false);
  const spectators = useAppSelector(selectSpectators);
  return (
    <div className="spectators">
      {spectators.length > 0 ? (
        <>
          <Tooltip title={`观战者(${spectators.length})`}>
            <Button
              shape="circle"
              icon={!show ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
              onClick={() => setShow(!show)}
            />
          </Tooltip>
          {show
            ? spectators.map((u) => (
                <Tooltip key={u.id} title={u.name}>
                  <Avatar key={u.id}>{u.name[0]}</Avatar>
                </Tooltip>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
