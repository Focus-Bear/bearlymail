import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Email } from 'types/email';

interface EmailState {
  emails: Email[];
  optimisticallyArchived: string[];
  loading: boolean;
  decrypting: boolean;
  refreshing: boolean;
  loadingModeSwitch: boolean;
  fetchError: string | null;
}

const initialState: EmailState = {
  emails: [],
  optimisticallyArchived: [],
  loading: true,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  fetchError: null,
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
      // Insert email back in sorted order (by receivedAt DESC)
      const newEmails = [...state.emails, action.payload].sort((a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
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
  },
});

export const {
  setEmails,
  addOptimisticArchive,
  removeOptimisticArchive,
  removeEmail,
  updateEmail,
  restoreEmail,
  setLoading,
  setDecrypting,
  setRefreshing,
  setLoadingModeSwitch,
  setFetchError,
} = emailSlice.actions;

export default emailSlice.reducer;

