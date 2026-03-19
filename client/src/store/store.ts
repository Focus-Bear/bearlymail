import { configureStore } from '@reduxjs/toolkit';

import categoryReducer from './slices/categorySlice';
import emailReducer from './slices/emailSlice';

export const store = configureStore({
  reducer: {
    email: emailReducer,
    category: categoryReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
