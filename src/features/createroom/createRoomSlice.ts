import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { message } from "antd";
import { ApiRsp } from "../../ApiType";
import { RootState } from "../../app/store";
import { createroom, joinroom } from "../home/homeAPI";

type Status = "idle" | "loading" | "failed";

export interface CreateRoomState {
  createRoomStatus: Status;
  joinRoomStatus: Status;
  roomid: string;
}

const initialState: CreateRoomState = {
  roomid: "",
  createRoomStatus: "idle",
  joinRoomStatus: "idle",
};

export const createRoomAsync = createAsyncThunk(
  "home/createroom",
  async ({
    sb,
    buyIn,
    reBuyLimit,
  }: {
    sb: number;
    buyIn: number;
    reBuyLimit: number;
  }) => {
    return await createroom(sb, buyIn, reBuyLimit);
  }
);

export const joinRoomAsync = createAsyncThunk(
  "home/joinroom",
  async (roomid: string) => {
    return await joinroom(roomid);
  }
);

export const createRoomSlice = createSlice({
  name: "createroom",
  initialState,
  reducers: {
    clearCreateRoomID: (state, action: PayloadAction<any>) => {
      state.roomid = "";
    },
  },
  extraReducers: (builder) => {
    builder

      .addCase(createRoomAsync.pending, (state) => {
        state.createRoomStatus = "loading";
      })
      .addCase(createRoomAsync.fulfilled, (state, action) => {
        state.createRoomStatus = "idle";
        const rsp: ApiRsp = action.payload;
        if (rsp.code == 0) {
          state.roomid = rsp.data;
        } else {
          message.error(rsp.error);
        }
      })
      .addCase(joinRoomAsync.pending, (state) => {
        state.joinRoomStatus = "loading";
      })
      .addCase(joinRoomAsync.fulfilled, (state, action) => {
        state.joinRoomStatus = "idle";
        const rsp: ApiRsp = action.payload;
        if (rsp.code == 0) {
          state.roomid = rsp.data;
        } else {
          message.error(rsp.error);
        }
      });
  },
});

export const { clearCreateRoomID } = createRoomSlice.actions;

export const selectStatus = (state: RootState) => ({
  createRoomStatus: state.createroom.createRoomStatus,
  joinRoomStatus: state.createroom.joinRoomStatus,
});

export default createRoomSlice.reducer;
