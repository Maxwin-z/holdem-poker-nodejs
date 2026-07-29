import { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { Register } from "../register/Register";
import {
  selectToken,
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
    <div className="home-root">
      {!token ? <Register /> : roomid ? <Room /> : <CreateRoom />}
    </div>
  );
}
