import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { OPTIMISTIC_REMOVAL_GRACE_MS } from 'constants/numbers';
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
  /** When each optimistically archived/snoozed email id was hidden (epoch ms). */
  optimisticAddedAt: Record<string, number>;
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
  optimisticAddedAt: {},
  animatingOut: [],
  loading: true,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  summaryLoading: false,
  fetchError: null,
};

type TimestampedIdAction = PayloadAction<string, string, { at: number }>;

const stampWithNow = (id: string) => ({ payload: id, meta: { at: Date.now() } });

function forgetAddedAtIfUnused(state: InboxUIState, id: string): void {
  if (!state.optimisticallyArchived.includes(id) && !state.optimisticallySnoozed.includes(id)) {
    delete state.optimisticAddedAt[id];
  }
}

const inboxUISlice = createSlice({
  name: 'inboxUI',
  initialState,
  reducers: {
    addOptimisticArchive: {
      reducer: (state, action: TimestampedIdAction) => {
        if (!state.optimisticallyArchived.includes(action.payload)) {
          state.optimisticallyArchived.push(action.payload);
        }
        state.optimisticAddedAt[action.payload] = action.meta.at;
      },
      prepare: stampWithNow,
    },
    removeOptimisticArchive: (state, action: PayloadAction<string>) => {
      state.optimisticallyArchived = state.optimisticallyArchived.filter(id => id !== action.payload);
      forgetAddedAtIfUnused(state, action.payload);
    },
    addOptimisticSnooze: {
      reducer: (state, action: TimestampedIdAction) => {
        if (!state.optimisticallySnoozed.includes(action.payload)) {
          state.optimisticallySnoozed.push(action.payload);
        }
        state.optimisticAddedAt[action.payload] = action.meta.at;
      },
      prepare: stampWithNow,
    },
    removeOptimisticSnooze: (state, action: PayloadAction<string>) => {
      state.optimisticallySnoozed = state.optimisticallySnoozed.filter(id => id !== action.payload);
      forgetAddedAtIfUnused(state, action.payload);
    },
    /**
     * Dispatched when a server fetch starts. An id hidden longer than the grace period
     * was archived/snoozed well before this fetch began, so the fetch reflects the
     * post-action server state: if the server still returns that email it has
     * genuinely come back (snooze expired, new reply, unarchived elsewhere) and must
     * be shown. Without this, ids stayed hidden for the whole page session and a
     * returning email produced a category with a count but no rows (issue #2062).
     */
    pruneStaleOptimisticRemovals: {
      reducer: (state, action: PayloadAction<undefined, string, { at: number }>) => {
        const cutoff = action.meta.at - OPTIMISTIC_REMOVAL_GRACE_MS;
        const isFresh = (id: string) => (state.optimisticAddedAt[id] ?? cutoff) > cutoff;
        state.optimisticallyArchived = state.optimisticallyArchived.filter(isFresh);
        state.optimisticallySnoozed = state.optimisticallySnoozed.filter(isFresh);
        const keptIds = new Set([...state.optimisticallyArchived, ...state.optimisticallySnoozed]);
        state.optimisticAddedAt = Object.fromEntries(
          Object.entries(state.optimisticAddedAt).filter(([id]) => keptIds.has(id))
        );
      },
      prepare: () => ({ payload: undefined, meta: { at: Date.now() } }),
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
  pruneStaleOptimisticRemovals,
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
