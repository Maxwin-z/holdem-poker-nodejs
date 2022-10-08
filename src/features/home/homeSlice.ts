import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { stat } from "fs";
import { join } from "path";
import { ApiRsp } from "../../ApiType";
import { RootState, AppThunk } from "../../app/store";
import { createroom, joinroom, loadToken, roominfo } from "./homeAPI";

type Status = "idle" | "loading" | "failed";

export interface HomeState {
  token: string;
  status: Status;
  roomid: string;
}

const initialState: HomeState = {
  token: loadToken(),
  status: "idle",
  roomid: "",
};

export const loadRoomInfoAsync = createAsyncThunk("home/roominfo", async () => {
  return await roominfo();
});

export const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    updateToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      localStorage["token"] = state.token;
    },
    logout: (state) => {
      localStorage["token"] = "";
      localStorage["name"] = "";
      state.token = "";
    },
    clearRoomID: (state, action: PayloadAction<any>) => {
      state.roomid = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadRoomInfoAsync.pending, (state) => {
        state.status = "loading";
      })
      .addCase(loadRoomInfoAsync.fulfilled, (state, action) => {
        state.status = "idle";
        const rsp: ApiRsp = action.payload;
        if (rsp.code == 0) {
          state.roomid = rsp.data;
        }
      });
  },
});

export const { updateToken, logout, clearRoomID } = homeSlice.actions;

export const selectToken = (state: RootState) => state.home.token;
export const selectRoomID = (state: RootState) =>
  state.home.roomid || state.createroom.roomid;

export default homeSlice.reducer;
