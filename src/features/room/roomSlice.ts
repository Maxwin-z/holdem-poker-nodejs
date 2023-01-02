import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  SimpleGame,
  SimpleRoom,
  SimpleSelf,
  SimpleUser,
  SimpleUserHands,
} from "../../ApiType";
import { RootState } from "../../app/store";

export interface RoomState {
  room: SimpleRoom | null;
  game: SimpleGame | null;
  self: SimpleSelf | null;
  selectSettleTimes: boolean;
}

const initialState: RoomState = {
  room: null,
  game: null,
  self: null,
  selectSettleTimes: false,
};

export const roomSlice = createSlice({
  name: "room",
  initialState,
  reducers: {
    setRoom(state, action: PayloadAction<SimpleRoom>) {
      state.room = action.payload;
    },
    setGame(state, action: PayloadAction<SimpleGame>) {
      state.game = action.payload;
    },
    setSelf(state, action: PayloadAction<SimpleSelf>) {
      state.self = action.payload;
    },
    setUser(state, action: PayloadAction<SimpleUser>) {
      const room = state.room;
      const user = action.payload;
      if (room) {
        room.users.forEach((u, i) => {
          if (u.id === user.id) {
            room.users[i] = user;
          }
        });
      }
    },
    setHands(state, action: PayloadAction<SimpleUserHands>) {
      const room = state.room;
      const { id, hands } = action.payload;
      const user = room?.users.find((u) => u.id == id);
      if (user) {
        user.hands = user.hands || [null, null];
        if (hands[0]) {
          user.hands[0] = hands[0];
        }
        if (hands[1]) {
          user.hands[1] = hands[1];
        }
      }
    },
    setSelectSettleTimes(state, action: PayloadAction<boolean>) {
      state.selectSettleTimes = action.payload;
    },
  },
  extraReducers: (builder) => {},
});

export const {
  setRoom,
  setGame,
  setSelf,
  setUser,
  setHands,
  setSelectSettleTimes,
} = roomSlice.actions;
export const selectRoomID = (state: RootState) => state.room.room?.roomid;
export const selectUsers = (state: RootState) => {
  const { room, self } = state.room;
  if (!room || !self) return [];
  const ids = room.users.filter((u) => !u.isSpectator).map((u) => u.id) || [];
  const selfIndex = ids.indexOf(self.id);
  return [...[...ids].splice(selfIndex + 1), ...[...ids].splice(0, selfIndex)];
};
export const selectSpectators = (state: RootState) => {
  const { room, self } = state.room;
  if (!room || !self) return [];
  return room.users.filter((u) => u.isSpectator);
};
export const selectRoom = (state: RootState) => {
  return state.room.room;
};
export const selectGame = (state: RootState) => {
  return state.room.game;
};
export const selectSelf = (state: RootState) => {
  const { room, self } = state.room;
  if (!room || !self) {
    return null;
  }
  const owner = room.users[room.users.findIndex((u) => u.id == self.id)];
  return Object.assign({}, owner, self);
};
export const getSelectSettleStatus = (state: RootState) => {
  return state.room.selectSettleTimes;
};

export default roomSlice.reducer;
