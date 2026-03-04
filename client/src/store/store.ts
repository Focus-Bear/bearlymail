import { configureStore } from '@reduxjs/toolkit';

import emailReducer from './slices/emailSlice';

export const store = configureStore({
  reducer: {
    email: emailReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

