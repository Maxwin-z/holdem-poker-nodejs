import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export interface GameHistory {
  logs: string[];
}

const initialState: GameHistory = {
  logs: [],
};

export const gameHistory = createSlice({
  name: "gamehistory",
  initialState,
  reducers: {
    addLogs(state, action: PayloadAction<string[]>) {
      state.logs = [...state.logs, ...action.payload];
    },
  },
});

export const { addLogs } = gameHistory.actions;
export const selectGameHistory = (state: RootState) => state.gamehistory.logs;
export default gameHistory.reducer;
