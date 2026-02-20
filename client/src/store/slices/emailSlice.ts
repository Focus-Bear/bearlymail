import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email, getEmailPriorityScore } from 'types/email';

// Threshold for considering priority scores "equal" (matches backend RATIOS.TINY)
const PRIORITY_SCORE_TINY_THRESHOLD = 0.01;

export interface AnimatingOutItem {
  id: string;
  type: 'archive' | 'priority';
}

interface EmailState {
  emails: Email[];
  optimisticallyArchived: string[];
  optimisticallySnoozed: string[];
  animatingOut: AnimatingOutItem[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  fetchError: string | null;
  hasMore: boolean;
  totalCount: number;
  currentOffset: number;
}

const initialState: EmailState = {
  emails: [],
  optimisticallyArchived: [],
  optimisticallySnoozed: [],
  animatingOut: [],
  loading: true,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  fetchError: null,
  hasMore: false,
  totalCount: 0,
  currentOffset: 0,
};

const emailSlice = createSlice({
  name: 'email',
  initialState,
  reducers: {
    setEmails: (state, action: PayloadAction<Email[]>) => {
      console.log('[Redux] setEmails called:', {
        before: state.emails.length,
        after: action.payload.length,
        optimisticArchivedCount: state.optimisticallyArchived.length,
        optimisticArchivedIds: state.optimisticallyArchived,
      });
      state.emails = action.payload;
      state.currentOffset = 0;
    },
    appendEmails: (state, action: PayloadAction<Email[]>) => {
      const existingIds = new Set(state.emails.map(e => e.id));
      const newEmails = action.payload.filter(e => !existingIds.has(e.id));
      state.emails = [...state.emails, ...newEmails];
    },
    setHasMore: (state, action: PayloadAction<boolean>) => {
      state.hasMore = action.payload;
    },
    setTotalCount: (state, action: PayloadAction<number>) => {
      state.totalCount = action.payload;
    },
    setCurrentOffset: (state, action: PayloadAction<number>) => {
      state.currentOffset = action.payload;
    },
    addOptimisticArchive: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallyArchived.includes(action.payload)) {
        state.optimisticallyArchived.push(action.payload);
        console.log('[Redux] Added to optimistic archive:', action.payload, 'Total:', state.optimisticallyArchived.length);
      } else {
        console.log('[Redux] Email already in optimistic archive:', action.payload);
      }
    },
    removeOptimisticArchive: (state, action: PayloadAction<string>) => {
      const before = state.optimisticallyArchived.length;
      state.optimisticallyArchived = state.optimisticallyArchived.filter(
        id => id !== action.payload
      );
      console.log('[Redux] Removed from optimistic archive:', action.payload, 'Before:', before, 'After:', state.optimisticallyArchived.length);
    },
    addOptimisticSnooze: (state, action: PayloadAction<string>) => {
      if (!state.optimisticallySnoozed.includes(action.payload)) {
        state.optimisticallySnoozed.push(action.payload);
        console.log('[Redux] Added to optimistic snooze:', action.payload, 'Total:', state.optimisticallySnoozed.length);
      } else {
        console.log('[Redux] Email already in optimistic snooze:', action.payload);
      }
    },
    removeOptimisticSnooze: (state, action: PayloadAction<string>) => {
      const before = state.optimisticallySnoozed.length;
      state.optimisticallySnoozed = state.optimisticallySnoozed.filter(
        id => id !== action.payload
      );
      console.log('[Redux] Removed from optimistic snooze:', action.payload, 'Before:', before, 'After:', state.optimisticallySnoozed.length);
    },
    removeEmail: (state, action: PayloadAction<string>) => {
      const before = state.emails.length;
      state.emails = state.emails.filter(email => email.id !== action.payload);
      console.log('[Redux] Removed email from list:', action.payload, 'Before:', before, 'After:', state.emails.length);
    },
    updateEmail: (state, action: PayloadAction<{ id: string; updates: Partial<Email> }>) => {
      const index = state.emails.findIndex(email => email.id === action.payload.id);
      if (index !== -1) {
        state.emails[index] = { ...state.emails[index], ...action.payload.updates };
      }
    },
    restoreEmail: (state, action: PayloadAction<Email>) => {
      // Insert email back in sorted order: priority DESC, threadUpdatedAt DESC, threadId (stable)
      const newEmails = [...state.emails, action.payload].sort((a, b) => {
        // Primary: priority score DESC
        const aScore = getEmailPriorityScore(a);
        const bScore = getEmailPriorityScore(b);
        if (Math.abs(bScore - aScore) > PRIORITY_SCORE_TINY_THRESHOLD) {
          return bScore - aScore;
        }
        // Secondary: threadUpdatedAt DESC
        const aUpdatedAt = a.threadUpdatedAt ? new Date(a.threadUpdatedAt).getTime() : 0;
        const bUpdatedAt = b.threadUpdatedAt ? new Date(b.threadUpdatedAt).getTime() : 0;
        if (bUpdatedAt !== aUpdatedAt) {
          return bUpdatedAt - aUpdatedAt;
        }
        // Final stable tiebreaker: threadId
        return a.threadId.localeCompare(b.threadId);
      });
      state.emails = newEmails;
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
    setFetchError: (state, action: PayloadAction<string | null>) => {
      state.fetchError = action.payload;
    },
    addAnimatingOut: (state, action: PayloadAction<AnimatingOutItem>) => {
      if (!state.animatingOut.find(item => item.id === action.payload.id)) {
        state.animatingOut.push(action.payload);
      }
    },
    removeAnimatingOut: (state, action: PayloadAction<string>) => {
      state.animatingOut = state.animatingOut.filter(item => item.id !== action.payload);
    },
  },
});

export const {
  setEmails,
  appendEmails,
  setHasMore,
  setTotalCount,
  setCurrentOffset,
  addOptimisticArchive,
  removeOptimisticArchive,
  addOptimisticSnooze,
  removeOptimisticSnooze,
  removeEmail,
  updateEmail,
  restoreEmail,
  setLoading,
  setDecrypting,
  setRefreshing,
  setLoadingModeSwitch,
  setFetchError,
  addAnimatingOut,
  removeAnimatingOut,
} = emailSlice.actions;

export default emailSlice.reducer;

