import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit";
import counterReducer from "../features/counter/counterSlice";
import homeReducer from "../features/home/homeSlice";
import registerReducer from "../features/register/registerSlice";
import createRoomReducer from "../features/createroom/createRoomSlice";
import roomReducer from "../features/room/roomSlice";
import chipsRecordReducer from "../features/chipsrecord/chipsRecordSlice";
import gameHistoryReducer from "../features/gamehistory/gameHistorySlice";

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    home: homeReducer,
    register: registerReducer,
    createroom: createRoomReducer,
    room: roomReducer,
    chipsrecord: chipsRecordReducer,
    gamehistory: gameHistoryReducer,
  },
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
