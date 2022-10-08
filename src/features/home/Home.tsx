import React, { useEffect, useState } from "react";
import { PageHeader, Button, Avatar, Dropdown, Menu } from "antd";
import { DownOutlined } from "@ant-design/icons";

import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { Register } from "../register/Register";
import {
  selectToken,
  logout,
  selectRoomID,
  loadRoomInfoAsync,
} from "./homeSlice";
import { Room } from "../room/Room";
import { CreateRoom } from "../createroom/CreateRoom";
import { connect2server } from "../../app/websocket";

export function Home() {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectToken);
  const roomid = useAppSelector(selectRoomID);

  useEffect(() => {
    if (token) {
      dispatch(loadRoomInfoAsync());
    }
  }, [token]);

  useEffect(() => {
    if (roomid) {
      dispatch(connect2server(roomid));
      console.log("got room", roomid);
    }
  }, [roomid]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      {!token ? <Register /> : roomid ? <Room></Room> : <CreateRoom />}
    </div>
  );
}
