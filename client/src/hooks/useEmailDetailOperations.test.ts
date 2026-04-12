import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { mockPartial } from 'test/mockUtils';
import { Email } from 'types/email';

import { API_URL } from 'config/api';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useEmailDetailOperations } from './useEmailDetailOperations';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockLocationState: { fromMode?: string } = {};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

jest.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
  }),
}));

jest.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('utils/posthog', () => ({ captureEvent: jest.fn() }));

jest.mock('utils/emailBodyUtils', () => ({
  extractCleanBody: jest.fn(),
  removeSignature: jest.fn(),
  extractCleanHtmlBody: jest.fn(),
  sanitizeAndProcessHtml: jest.fn(),
}));

jest.mock('utils/githubUtils', () => ({
  emailMentionsGitHub: jest.fn().mockReturnValue(false),
}));

// Zero out animation delay to avoid test timeouts
jest.mock('constants/numbers', () => ({
  ...jest.requireActual('constants/numbers'),
  TIMEOUT_800_MS: 0,
}));

const mockNavigate = jest.fn();

const TEST_EMAIL_ID = 'email-test-1';

const createTestStore = (emails: Email[] = []) =>
  configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
    preloadedState: {
      inboxData: {
        emails,
        hasMore: false,
        totalCount: 0,
        currentOffset: 0,
        categorySummary: null,
        loadedCategoryNames: [] as string[],
        loadingCategoryNames: [] as string[],
        exhaustedCategoryNames: [] as string[],
        lastFetchedAt: null as number | null,
      },
      inboxUI: {
        optimisticallyArchived: [] as string[],
        optimisticallySnoozed: [] as string[],
        animatingOut: [] as { id: string; type: 'archive' | 'priority' }[],
        loading: false,
        decrypting: false,
        refreshing: false,
        loadingModeSwitch: false,
        fetchError: null as string | null,
        summaryLoading: false,
      },
    },
  });

const createMockState = () => ({
  email: mockPartial<Email>({
    id: TEST_EMAIL_ID,
    threadId: 'thread-1',
    subject: 'Test',
    from: 'test@test.com',
    body: 'Test body',
  }),
  setEmail: jest.fn(),
  threadEmails: [],
  setThreadEmails: jest.fn(),
  expandedThreadItems: new Set<string>(),
  setExpandedThreadItems: jest.fn(),
  noteContent: '',
  setNoteContent: jest.fn(),
  notesCollapsed: true,
  setNotesCollapsed: jest.fn(),
  summary: null,
  setSummary: jest.fn(),
  summaryType: 'tldr',
  setSummaryType: jest.fn(),
  isGeneratingSummary: false,
  setIsGeneratingSummary: jest.fn(),
  summaryCollapsed: false,
  setSummaryCollapsed: jest.fn(),
  showRuleModal: false,
  setShowRuleModal: jest.fn(),
  customRule: { whenToUse: '', howToSummarize: '' },
  setCustomRule: jest.fn(),
  customRules: [],
  setCustomRules: jest.fn(),
  actionItems: [],
  setActionItems: jest.fn(),
  newActionItem: '',
  setNewActionItem: jest.fn(),
  draft: 'Test reply',
  setDraft: jest.fn(),
  replyOptions: null,
  setReplyOptions: jest.fn(),
  selectedReplyOption: 0,
  setSelectedReplyOption: jest.fn(),
  showReplyComposer: true,
  setShowReplyComposer: jest.fn(),
  replyMode: 'reply' as const,
  setReplyMode: jest.fn(),
  replyRecipients: 'recipient@example.com',
  setReplyRecipients: jest.fn(),
  replyCc: '',
  setReplyCc: jest.fn(),
  replyBcc: '',
  setReplyBcc: jest.fn(),
  showCc: false,
  setShowCc: jest.fn(),
  showBcc: false,
  setShowBcc: jest.fn(),
  loadingReplies: false,
  setLoadingReplies: jest.fn(),
  sending: false,
  setSending: jest.fn(),
  toneCheckResult: null,
  setToneCheckResult: jest.fn(),
  checkingTone: false,
  setCheckingTone: jest.fn(),
  disputing: false,
  setDisputing: jest.fn(),
  // Set accepted=true to bypass tone check in tests
  disputeResult: { accepted: true, rulesToRemove: [], explanation: '', rulesUpdated: false, remainingRules: [] },
  setDisputeResult: jest.fn(),
  snoozeInput: '',
  setSnoozeInput: jest.fn(),
  showSnoozeInput: false,
  setShowSnoozeInput: jest.fn(),
  priorityExplanation: null,
  setPriorityExplanation: jest.fn(),
  showPriorityExplanation: false,
  setShowPriorityExplanation: jest.fn(),
  githubLinks: [],
  setGithubLinks: jest.fn(),
  loadingGithub: false,
  setLoadingGithub: jest.fn(),
  hasGithubToken: false,
  setHasGithubToken: jest.fn(),
  suggestedActions: [],
  setSuggestedActions: jest.fn(),
  loadingSuggestedActions: false,
  setLoadingSuggestedActions: jest.fn(),
  showQuickActionsMenu: false,
  setShowQuickActionsMenu: jest.fn(),
  selectedAction: null,
  setSelectedAction: jest.fn(),
  animationClass: null,
  setAnimationClass: jest.fn(),
  loading: false,
  setLoading: jest.fn(),
  autoSendCountdown: null,
  setAutoSendCountdown: jest.fn(),
});

const createWrapper =
  (store: ReturnType<typeof createTestStore>) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });

describe('useEmailDetailOperations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    // Reset location state so tests start without fromMode
    delete mockLocationState.fromMode;
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.put.mockResolvedValue({ data: {} });
    mockedAxios.delete.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ data: {} });
  });

  describe('handleSendReply – optimistic snooze', () => {
    it('dispatches addOptimisticSnooze when email IS in Redux store', async () => {
      const testEmail = { id: TEST_EMAIL_ID, threadId: 'thread-1', subject: 'Test', from: 'test@test.com' } as Email;
      const store = createTestStore([testEmail]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(store.getState().inboxUI.optimisticallySnoozed).toContain(TEST_EMAIL_ID);
    });

    it('dispatches addOptimisticSnooze even when email is NOT in Redux store', async () => {
      // Empty store – simulates opening email directly via URL or after mode switch
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(store.getState().inboxUI.optimisticallySnoozed).toContain(TEST_EMAIL_ID);
    });

    it('navigates to /inbox after snooze when no onSnoozeComplete callback and no fromMode', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });

    it('navigates to /inbox/action after snooze when fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });

    it('navigates to /inbox/follow-up after snooze when fromMode is follow-up', async () => {
      mockLocationState.fromMode = 'follow-up';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/follow-up');
    });

    it('calls onSnoozeComplete callback instead of navigating in split view', async () => {
      const onSnoozeComplete = jest.fn();
      const store = createTestStore([]);

      const { result } = renderHook(
        () => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), { onSnoozeComplete }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(onSnoozeComplete).toHaveBeenCalledWith(TEST_EMAIL_ID);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('reverts optimistic snooze on API failure', async () => {
      const store = createTestStore([]);
      mockedAxios.post.mockImplementation((url: string) => {
        if (url.includes('/replies/send/')) {
          return Promise.resolve({ data: {} });
        }
        if (url.includes('/snooze/')) {
          return Promise.reject(new Error('Snooze failed'));
        }
        return Promise.resolve({ data: {} });
      });

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      // Wait for the background snooze to fail and revert
      await waitFor(() => {
        expect(store.getState().inboxUI.optimisticallySnoozed).not.toContain(TEST_EMAIL_ID);
      });
    });
  });

  describe('handleSendReply – optimistic archive (expectedReplyHours=0)', () => {
    it('dispatches addOptimisticArchive when email IS in Redux store', async () => {
      const testEmail = { id: TEST_EMAIL_ID, threadId: 'thread-1', subject: 'Test', from: 'test@test.com' } as Email;
      const store = createTestStore([testEmail]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 0, draftOverride: 'Test reply' });
      });

      expect(store.getState().inboxUI.optimisticallyArchived).toContain(TEST_EMAIL_ID);
    });

    it('dispatches addOptimisticArchive even when email is NOT in Redux store', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 0, draftOverride: 'Test reply' });
      });

      expect(store.getState().inboxUI.optimisticallyArchived).toContain(TEST_EMAIL_ID);
    });

    it('navigates to /inbox/action after archive when fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 0, draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });
  });

  describe('handleSendReply – API request includes expectedReplyHours', () => {
    it('sends expectedReplyHours in JSON request body', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 48, draftOverride: 'Test reply' });
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/replies/send/${TEST_EMAIL_ID}`,
        expect.objectContaining({ expectedReplyHours: 48 })
      );
    });

    it('sends expectedReplyHours=0 in JSON request body when None selected', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], expectedReplyHours: 0, draftOverride: 'Test reply' });
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/replies/send/${TEST_EMAIL_ID}`,
        expect.objectContaining({ expectedReplyHours: 0 })
      );
    });

    it('sends undefined expectedReplyHours when not provided', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], draftOverride: 'Test reply' });
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/replies/send/${TEST_EMAIL_ID}`,
        expect.objectContaining({ expectedReplyHours: undefined })
      );
    });
  });

  describe('handleSendReply – navigate back to correct inbox tab', () => {
    it('navigates to /inbox when no expectedReplyHours and no fromMode', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });

    it('navigates to /inbox/action when no expectedReplyHours and fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });

    it('navigates to /inbox/triage when no expectedReplyHours and fromMode is triage', async () => {
      mockLocationState.fromMode = 'triage';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSendReply({ files: [], draftOverride: 'Test reply' });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/triage');
    });
  });

  describe('handleArchive – navigate back to correct inbox tab', () => {
    it('navigates to /inbox when no fromMode', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleArchive();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });

    it('navigates to /inbox/action when fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleArchive();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });

    it('navigates to /inbox/follow-up when fromMode is follow-up', async () => {
      mockLocationState.fromMode = 'follow-up';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleArchive();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/follow-up');
    });

    it('calls onArchiveComplete callback instead of navigating in split view', async () => {
      const onArchiveComplete = jest.fn();
      const store = createTestStore([]);

      const { result } = renderHook(
        () => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), { onArchiveComplete }),
        { wrapper: createWrapper(store) }
      );

      await act(async () => {
        await result.current.handleArchive();
      });

      expect(onArchiveComplete).toHaveBeenCalledWith(TEST_EMAIL_ID);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('handleSnooze – navigate back to correct inbox tab', () => {
    it('navigates to /inbox when no fromMode', async () => {
      const mockState = createMockState();
      mockState.snoozeInput = '2h';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, mockState, {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSnooze('2h');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });

    it('navigates to /inbox/action when fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const mockState = createMockState();
      mockState.snoozeInput = '2h';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, mockState, {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSnooze('2h');
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });

    it('calls onSnoozeComplete callback instead of navigating in split view', async () => {
      const onSnoozeComplete = jest.fn();
      const mockState = createMockState();
      mockState.snoozeInput = '2h';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, mockState, { onSnoozeComplete }), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleSnooze('2h');
      });

      expect(onSnoozeComplete).toHaveBeenCalledWith(TEST_EMAIL_ID);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('handleDelete – navigate back to correct inbox tab', () => {
    it('navigates to /inbox when no fromMode', async () => {
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });

    it('navigates to /inbox/action when fromMode is action', async () => {
      mockLocationState.fromMode = 'action';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/action');
    });

    it('navigates to /inbox/follow-up when fromMode is follow-up', async () => {
      mockLocationState.fromMode = 'follow-up';
      const store = createTestStore([]);

      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, createMockState(), {}), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/inbox/follow-up');
    });
  });

  describe('disputeToneCheck – auto-send countdown', () => {
    it('starts countdown at 5 when dispute is accepted', async () => {
      const store = createTestStore();
      const state = createMockState();
      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, state, {}), {
        wrapper: createWrapper(store),
      });

      mockedAxios.post.mockResolvedValueOnce({
        data: { accepted: true, rulesToRemove: [], explanation: 'ok', rulesUpdated: false, remainingRules: [] },
      });

      await act(async () => {
        await result.current.disputeToneCheck('email text', 'my argument');
      });

      expect(state.setAutoSendCountdown).toHaveBeenCalledWith(5);
    });

    it('does not start countdown when dispute is rejected', async () => {
      const store = createTestStore();
      const state = createMockState();
      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, state, {}), {
        wrapper: createWrapper(store),
      });

      mockedAxios.post.mockResolvedValueOnce({
        data: { accepted: false, rulesToRemove: [], explanation: 'no', rulesUpdated: false, remainingRules: [] },
      });

      await act(async () => {
        await result.current.disputeToneCheck('email text', 'my argument');
      });

      expect(state.setAutoSendCountdown).not.toHaveBeenCalled();
    });

    it('cancelAutoSend resets countdown to null', () => {
      const store = createTestStore();
      const state = createMockState();
      const { result } = renderHook(() => useEmailDetailOperations(TEST_EMAIL_ID, state, {}), {
        wrapper: createWrapper(store),
      });

      act(() => {
        result.current.cancelAutoSend();
      });

      expect(state.setAutoSendCountdown).toHaveBeenCalledWith(null);
    });
  });
});
