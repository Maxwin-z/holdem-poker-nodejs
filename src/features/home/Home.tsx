import { useEffect, useRef } from "react";
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
import { joinRoomAsync } from "../createroom/createRoomSlice";
import {
  getInvitedRoomID,
  removeRoomInviteFromURL,
} from "../room/roomInvite";

export function Home() {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectToken);
  const roomid = useAppSelector(selectRoomID);
  const invitedRoomID = getInvitedRoomID();
  const inviteJoinStarted = useRef(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (invitedRoomID) {
      if (inviteJoinStarted.current) {
        return;
      }
      inviteJoinStarted.current = true;
      dispatch(joinRoomAsync(invitedRoomID)).then((action) => {
        if (
          joinRoomAsync.fulfilled.match(action) &&
          action.payload.code === 0
        ) {
          removeRoomInviteFromURL();
        }
      });
      return;
    }

    dispatch(loadRoomInfoAsync());
  }, [dispatch, invitedRoomID, token]);

  useEffect(() => {
    if (roomid) {
      dispatch(connect2server(roomid));
      console.log("got room", roomid);
    }
  }, [dispatch, roomid]);

  return (
    <div className="home-root">
      {!token ? (
        <Register inviteRoomID={invitedRoomID} />
      ) : roomid ? (
        <Room />
      ) : (
        <CreateRoom initialRoomID={invitedRoomID} />
      )}
    </div>
  );
}
