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

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockLocationState: { fromMode?: string } = {};

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com' } }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

vi.mock('utils/emailBodyUtils', () => ({
  extractCleanBody: vi.fn(),
  extractCleanBodyWithMeta: vi.fn(),
  extractCleanHtmlBody: vi.fn(),
  extractCleanHtmlBodyWithMeta: vi.fn(),
  removeSignature: vi.fn(),
  sanitizeAndProcessHtml: vi.fn(),
}));

vi.mock('utils/githubUtils', () => ({
  emailMentionsGitHub: vi.fn().mockReturnValue(false),
}));

// Zero out animation delay to avoid test timeouts
vi.mock('constants/numbers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('constants/numbers')>()),
  TIMEOUT_800_MS: 0,
}));

const mockNavigate = vi.fn();

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
  setEmail: vi.fn(),
  threadEmails: [],
  setThreadEmails: vi.fn(),
  expandedThreadItems: new Set<string>(),
  setExpandedThreadItems: vi.fn(),
  noteContent: '',
  setNoteContent: vi.fn(),
  notesCollapsed: true,
  setNotesCollapsed: vi.fn(),
  summary: null,
  setSummary: vi.fn(),
  summaryType: 'tldr',
  setSummaryType: vi.fn(),
  isGeneratingSummary: false,
  setIsGeneratingSummary: vi.fn(),
  summaryCollapsed: false,
  setSummaryCollapsed: vi.fn(),
  summaryDebug: null,
  setSummaryDebug: vi.fn(),
  showRuleModal: false,
  setShowRuleModal: vi.fn(),
  customRule: { whenToUse: '', howToSummarize: '' },
  setCustomRule: vi.fn(),
  customRules: [],
  setCustomRules: vi.fn(),
  actionItems: [],
  setActionItems: vi.fn(),
  newActionItem: '',
  setNewActionItem: vi.fn(),
  draft: 'Test reply',
  setDraft: vi.fn(),
  replyOptions: null,
  setReplyOptions: vi.fn(),
  selectedReplyOption: 0,
  setSelectedReplyOption: vi.fn(),
  showReplyComposer: true,
  setShowReplyComposer: vi.fn(),
  replyMode: 'reply' as const,
  setReplyMode: vi.fn(),
  replyTargetEmailId: null,
  setReplyTargetEmailId: vi.fn(),
  replyRecipients: 'recipient@example.com',
  setReplyRecipients: vi.fn(),
  replyCc: '',
  setReplyCc: vi.fn(),
  replyBcc: '',
  setReplyBcc: vi.fn(),
  replySubject: 'Re: Test Subject',
  setReplySubject: vi.fn(),
  showCc: false,
  setShowCc: vi.fn(),
  showBcc: false,
  setShowBcc: vi.fn(),
  loadingReplies: false,
  setLoadingReplies: vi.fn(),
  sending: false,
  setSending: vi.fn(),
  toneCheckResult: null,
  setToneCheckResult: vi.fn(),
  checkingTone: false,
  setCheckingTone: vi.fn(),
  disputing: false,
  setDisputing: vi.fn(),
  // Set accepted=true to bypass tone check in tests
  disputeResult: { accepted: true, rulesToRemove: [], explanation: '', rulesUpdated: false, remainingRules: [] },
  setDisputeResult: vi.fn(),
  snoozeInput: '',
  setSnoozeInput: vi.fn(),
  showSnoozeInput: false,
  setShowSnoozeInput: vi.fn(),
  priorityExplanation: null,
  setPriorityExplanation: vi.fn(),
  showPriorityExplanation: false,
  setShowPriorityExplanation: vi.fn(),
  githubLinks: [],
  setGithubLinks: vi.fn(),
  loadingGithub: false,
  setLoadingGithub: vi.fn(),
  hasGithubToken: false,
  setHasGithubToken: vi.fn(),
  suggestedActions: [],
  setSuggestedActions: vi.fn(),
  loadingSuggestedActions: false,
  setLoadingSuggestedActions: vi.fn(),
  showQuickActionsMenu: false,
  setShowQuickActionsMenu: vi.fn(),
  selectedAction: null,
  setSelectedAction: vi.fn(),
  animationClass: null,
  setAnimationClass: vi.fn(),
  loading: false,
  setLoading: vi.fn(),
  autoSendCountdown: null,
  setAutoSendCountdown: vi.fn(),
});

const createWrapper =
  (store: ReturnType<typeof createTestStore>) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });

describe('useEmailDetailOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const onSnoozeComplete = vi.fn();
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
      const onArchiveComplete = vi.fn();
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
      const onSnoozeComplete = vi.fn();
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
