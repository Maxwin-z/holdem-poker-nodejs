import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";
import type { GameLogEntry } from "../../ApiType";

export interface GameHistory {
  logs: GameLogEntry[];
}

const initialState: GameHistory = {
  logs: [],
};

export const gameHistory = createSlice({
  name: "gamehistory",
  initialState,
  reducers: {
    addLogs(state, action: PayloadAction<GameLogEntry[]>) {
      state.logs = [...state.logs, ...action.payload];
    },
  },
});

export const { addLogs } = gameHistory.actions;
export const selectGameHistory = (state: RootState) => state.gamehistory.logs;
export default gameHistory.reducer;
