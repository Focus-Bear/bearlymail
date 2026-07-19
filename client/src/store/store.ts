import { configureStore } from '@reduxjs/toolkit';

import categoryReducer from './slices/categorySlice';
import inboxDataReducer from './slices/inboxDataSlice';
import inboxUIReducer from './slices/inboxUISlice';

export const store = configureStore({
  reducer: {
    inboxData: inboxDataReducer,
    inboxUI: inboxUIReducer,
    category: categoryReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
