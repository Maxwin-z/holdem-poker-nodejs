import { createAsyncThunk, createSlice, ThunkDispatch } from '@reduxjs/toolkit';
import { message } from 'antd';
import { ApiRsp } from '../../ApiType';
import { RootState, AppThunk } from '../../app/store';
import { updateToken } from '../home/homeSlice';
import { registerApi } from './registerAPI';

export interface RegisterState {
  error: string;
  status: 'idle' | 'loading' | 'failed';
}

const initialState: RegisterState = {
  error: '',
  status: 'idle'
};

export const registerAsync = createAsyncThunk(
  'register/api',
  async ({
    account,
    dispatch
  }: {
    account: { name: string; password: string };
    dispatch: ThunkDispatch<any, any, any>;
  }) => {
    const rsp = await registerApi(account);
    if (rsp.code == 0) {
      localStorage['name'] = account.name;
      dispatch(updateToken(rsp.data));
    } else {
      message.error(rsp.error);
    }
    return rsp;
  }
);

export const registerSlice = createSlice({
  name: 'register',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(registerAsync.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(registerAsync.fulfilled, (state, action) => {
        state.status = 'idle';
        const rsp: ApiRsp = action.payload;
        if (rsp.code == -1) {
          state.error = rsp.error;
        }
      });
  }
});

export const getTokenFromSever =
  (rsp: ApiRsp): AppThunk =>
  (dispatch, getState) => {
    if (rsp.code == 0) {
      dispatch(updateToken(rsp.data));
    }
  };

export const selectError = (state: RootState) => state.register.error;

export default registerSlice.reducer;
