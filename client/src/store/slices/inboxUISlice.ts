import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { ANIMATION_TYPE_ARCHIVE, ANIMATION_TYPE_PRIORITY } from 'constants/strings';

export interface AnimatingOutItem {
  id: string;
  type: typeof ANIMATION_TYPE_ARCHIVE | typeof ANIMATION_TYPE_PRIORITY;
  /** Star count set when triggering a priority animation — used to render a destination label */
  starCount?: number;
}

export interface InboxUIState {
  optimisticallyArchived: string[];
  optimisticallySnoozed: string[];
  animatingOut: AnimatingOutItem[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  summaryLoading: boolean;
  fetchError: string | null;
}

const initialState: InboxUIState = {
  optimisticallyArchived: [],
  optimisticallySnoozed: [],
  animatingOut: [],
  loading: true,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  summaryLoading: false,
  fetchError: null,
};

const inboxUISlice = createSlice({
  name: 'inboxUI',
  initialState,
  reducers: {
    addOptimisticArchive: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallyArchived.includes(action.payload)) {
        state.optimisticallyArchived.push(action.payload);
      }
    },
    removeOptimisticArchive: (state, action: PayloadAction<string>) => {
      state.optimisticallyArchived = state.optimisticallyArchived.filter(id => id !== action.payload);
    },
    addOptimisticSnooze: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallySnoozed.includes(action.payload)) {
        state.optimisticallySnoozed.push(action.payload);
      }
    },
    removeOptimisticSnooze: (state, action: PayloadAction<string>) => {
      state.optimisticallySnoozed = state.optimisticallySnoozed.filter(id => id !== action.payload);
    },
    addAnimatingOut: (state, action: PayloadAction<AnimatingOutItem>) => {
      if (!state.animatingOut.find(item => item.id === action.payload.id)) {
        state.animatingOut.push(action.payload);
      }
    },
    removeAnimatingOut: (state, action: PayloadAction<string>) => {
      state.animatingOut = state.animatingOut.filter(item => item.id !== action.payload);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setDecrypting: (state, action: PayloadAction<boolean>) => {
      state.decrypting = action.payload;
    },
    setRefreshing: (state, action: PayloadAction<boolean>) => {
      state.refreshing = action.payload;
    },
    setLoadingModeSwitch: (state, action: PayloadAction<boolean>) => {
      state.loadingModeSwitch = action.payload;
    },
    setSummaryLoading: (state, action: PayloadAction<boolean>) => {
      state.summaryLoading = action.payload;
    },
    setFetchError: (state, action: PayloadAction<string | null>) => {
      state.fetchError = action.payload;
    },
  },
});

export const {
  addOptimisticArchive,
  removeOptimisticArchive,
  addOptimisticSnooze,
  removeOptimisticSnooze,
  addAnimatingOut,
  removeAnimatingOut,
  setLoading,
  setDecrypting,
  setRefreshing,
  setLoadingModeSwitch,
  setSummaryLoading,
  setFetchError,
} = inboxUISlice.actions;

export default inboxUISlice.reducer;
