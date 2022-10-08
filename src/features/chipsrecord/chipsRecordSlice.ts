import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { stat } from "fs";
import { SimpleChipsRecord, SimpleRoomChipsRecords } from "../../ApiType";
import { RootState } from "../../app/store";

export type ChipsRecordState = SimpleRoomChipsRecords;

const initialState: ChipsRecordState = {
  roomid: "",
  chipsRecords: [],
};

export const chipsRecordSlice = createSlice({
  name: "chipsrecord",
  initialState,
  reducers: {
    setChipsRecord(state, action: PayloadAction<SimpleRoomChipsRecords>) {
      state.roomid = action.payload.roomid;
      state.chipsRecords = action.payload.chipsRecords;
      console.log("save crs");
      let crs: { [x: string]: any } = {};
      try {
        crs = JSON.parse(localStorage["chipsRecords"]);
      } catch (ignore) {
        crs = {};
      }
      crs[state.roomid] = {
        date: Date.now(),
        records: state.chipsRecords,
      };
      localStorage["chipsRecords"] = JSON.stringify(crs);
    },
  },
});

export const { setChipsRecord } = chipsRecordSlice.actions;
export const selectChipsRecord = (state: RootState) => state.chipsrecord;
export default chipsRecordSlice.reducer;
