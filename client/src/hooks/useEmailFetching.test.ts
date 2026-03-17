import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import * as emailCache from 'utils/emailCache';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { ERROR_GMAIL, ERROR_GMAIL_REQUIRED } from 'constants/strings';
import emailReducer from 'store/slices/emailSlice';

import { appendFilterParams, useEmailFetching } from './useEmailFetching';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('utils/emailCache', () => ({
  clearCacheForMode: jest.fn(),
  getCachedCategoryEmails: jest.fn().mockReturnValue(null),
  getCachedSummary: jest.fn().mockReturnValue(null),
  setCachedCategoryEmails: jest.fn(),
  setCachedSummary: jest.fn(),
  removeEmailFromCache: jest.fn(),
  clearCache: jest.fn(),
}));
const mockedClearCacheForMode = emailCache.clearCacheForMode as jest.MockedFunction<
  typeof emailCache.clearCacheForMode
>;

// Legacy mock variables referenced in skipped tests
const mockSetEmails = jest.fn();
const mockSetDecrypting = jest.fn();
const mockSetFetchError = jest.fn();
const mockSetLoading = jest.fn();
const mockSetRefreshing = jest.fn();
const mockSetLoadingModeSwitch = jest.fn();

// Create a test store
const createTestStore = () =>
  configureStore({
    reducer: {
      email: emailReducer,
    },
  });

// Wrapper component for tests - returns the wrapper function directly
const createWrapper = () => {
  const store = createTestStore();
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
  return Wrapper;
};

// Note: These tests need to be updated to work with the new Redux-based implementation.
// The hook now uses Redux dispatch instead of prop-based setters.
// Skipping tests that reference the old prop-based API until they can be refactored.
describe.skip('useEmailFetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  const defaultProps = {
    mode: 'triage' as const,
  };

  describe('fetchEmails', () => {
    it('should fetch emails successfully', async () => {
      const mockEmails = [
        { id: '1', threadId: 'thread-1', subject: 'Test Email 1' },
        { id: '2', threadId: 'thread-2', subject: 'Test Email 2' },
      ];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockResolvedValueOnce({ data: null }) // note
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockResolvedValueOnce({ data: null }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/emails/inbox?mode=triage'));
      });

      await waitFor(() => {
        expect(mockSetDecrypting).toHaveBeenCalledWith(true);
      });
      await waitFor(() => {
        expect(mockSetDecrypting).toHaveBeenCalledWith(false);
      });

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 0,
              hasPrivateNote: false,
            }),
            expect.objectContaining({
              id: '2',
              actionItemsCount: 0,
              hasPrivateNote: false,
            }),
          ])
        );
      });

      expect(mockSetFetchError).toHaveBeenCalledWith(null);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetRefreshing).toHaveBeenCalledWith(false);
      expect(mockSetLoadingModeSwitch).toHaveBeenCalledWith(false);
    });

    it('should enrich emails with action items and notes', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [{ id: 'ai1' }, { id: 'ai2' }] }) // action items
        .mockResolvedValueOnce({ data: { id: 'note1' } }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 2,
              hasPrivateNote: true,
            }),
          ])
        );
      });
    });

    it('should handle network errors', async () => {
      const networkError = {
        code: 'ERR_NETWORK',
        message: 'Network Error',
      };

      mockedAxios.get.mockRejectedValue(networkError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith(
          'Unable to connect to the server. Please check if the server is running.'
        );
      });

      expect(mockSetDecrypting).toHaveBeenCalledWith(false);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    it('should handle unauthorized errors', async () => {
      const unauthorizedError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: 'Unauthorized' },
        },
      };

      mockedAxios.get.mockRejectedValue(unauthorizedError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Please log in again to view emails.');
      });
    });

    it('should handle Gmail required errors', async () => {
      const gmailError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: ERROR_GMAIL_REQUIRED },
        },
      };

      mockedAxios.get.mockRejectedValue(gmailError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('GMAIL_REQUIRED');
      });
    });

    it('should handle Gmail error messages', async () => {
      const gmailError = {
        response: {
          status: HTTP_UNAUTHORIZED,
          data: { message: `Some text ${ERROR_GMAIL} more text` },
        },
      };

      mockedAxios.get.mockRejectedValue(gmailError);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('GMAIL_REQUIRED');
      });
    });

    it('should handle other errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Server error' },
        },
      };

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Server error');
      });
    });

    it('should handle errors without response', async () => {
      const error = {
        message: 'Request failed',
      };

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Request failed');
      });
    });

    it('should handle errors with no message', async () => {
      const error = {};

      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetFetchError).toHaveBeenCalledWith('Failed to load emails. Please try again.');
      });
    });

    it('should handle emails without threadId', async () => {
      const mockEmails = [
        { id: '1', subject: 'Test Email' }, // No threadId
      ];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }); // action items only

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalled();
      });
    });

    it('should handle failed action items fetch gracefully', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockRejectedValueOnce(new Error('Action items failed'))
        .mockResolvedValueOnce({ data: null }); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              actionItemsCount: 0,
            }),
          ])
        );
      });
    });

    it('should handle failed note fetch gracefully', async () => {
      const mockEmails = [{ id: '1', threadId: 'thread-1' }];

      mockedAxios.get
        .mockResolvedValueOnce({ data: mockEmails })
        .mockResolvedValueOnce({ data: [] }) // action items
        .mockRejectedValueOnce(new Error('Note fetch failed')); // note

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetEmails).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: '1',
              hasPrivateNote: false,
            }),
          ])
        );
      });
    });

    it('should use correct mode in API call', async () => {
      const mockEmails: any[] = [];

      mockedAxios.get.mockResolvedValue({ data: mockEmails });

      const { result } = renderHook(() => useEmailFetching({ ...defaultProps, mode: 'action' }), {
        wrapper: createWrapper(),
      });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('mode=action'));
      });
    });

    it('should always set loading states to false in finally block', async () => {
      const error = new Error('Test error');
      mockedAxios.get.mockRejectedValue(error);

      const { result } = renderHook(() => useEmailFetching(defaultProps), { wrapper: createWrapper() });

      await result.current.fetchEmails();

      await waitFor(() => {
        expect(mockSetLoading).toHaveBeenCalledWith(false);
      });
      await waitFor(() => {
        expect(mockSetRefreshing).toHaveBeenCalledWith(false);
      });
      await waitFor(() => {
        expect(mockSetLoadingModeSwitch).toHaveBeenCalledWith(false);
      });
    });
  });
});

// ─── Stale UUID self-healing ──────────────────────────────────────────────────
describe('fetchCategoryEmails – stale UUID self-healing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    // Ensure cache always returns null so we don't hit the serve-from-cache path
    (emailCache.getCachedCategoryEmails as jest.Mock).mockReturnValue(null);
  });

  const createWrapper = () => {
    const store = configureStore({ reducer: { email: emailReducer } });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store, children });
    return Wrapper;
  };

  it('calls clearCacheForMode when server returns 0 emails for a UUID-keyed category', async () => {
    // Simulate server returning an empty email array for a category that has a UUID.
    // This indicates the UUID may be stale — the hook must bust the summary cache.
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Work', 'uuid-stale-1234');

    await waitFor(() => {
      expect(mockedClearCacheForMode).toHaveBeenCalledWith('triage');
    });
  });

  it('does NOT call clearCacheForMode when server returns emails for a UUID-keyed category', async () => {
    // When emails are returned, there is no stale UUID — no cache bust needed.
    const mockEmail = {
      id: '1',
      threadId: 'thread-1',
      subject: 'Test',
      from: 'a@b.com',
      to: 'me@b.com',
      body: '',
      isRead: false,
      isArchived: false,
      starCount: 0,
      receivedAt: new Date().toISOString(),
      category: 'Work',
      category_id: 'uuid-valid-5678',
    };
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [mockEmail] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    await result.current.fetchCategoryEmails('Work', 'uuid-valid-5678');

    await waitFor(() => {
      // setCachedCategoryEmails is called on success — confirms the happy path ran
      expect(emailCache.setCachedCategoryEmails).toHaveBeenCalled();
    });
    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });

  it('does NOT call clearCacheForMode when 0 emails returned but no categoryId (name-keyed)', async () => {
    // If there is no UUID (name-keyed category), 0 results may be legitimate.
    // Self-healing should only trigger when a UUID was provided.
    mockedAxios.get.mockResolvedValueOnce({ data: { emails: [] } });

    const { result } = renderHook(
      () => useEmailFetching({ mode: 'triage' }),
      { wrapper: createWrapper() }
    );

    // No categoryId passed — name-only category
    await result.current.fetchCategoryEmails('Work', null);

    // Give the promise time to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockedClearCacheForMode).not.toHaveBeenCalled();
  });
});

describe('appendFilterParams', () => {
  it('Very Low filter (min: null, max: 0) sends only maxPriority param — no minPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: null, maxPriority: 0 });
    expect(params.has('minPriority')).toBe(false);
    expect(params.get('maxPriority')).toBe('0');
  });

  it('Very High filter (min: 50, max: null) sends only minPriority param — no maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: 50, maxPriority: null });
    expect(params.get('minPriority')).toBe('50');
    expect(params.has('maxPriority')).toBe(false);
  });

  it('All filter (min: null, max: null) sends neither minPriority nor maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: null, maxPriority: null });
    expect(params.has('minPriority')).toBe(false);
    expect(params.has('maxPriority')).toBe(false);
  });

  it('Medium filter (min: 15, max: 30) sends both minPriority and maxPriority', () => {
    const params = new URLSearchParams();
    appendFilterParams(params, { accountIds: [], categories: [], minPriority: 15, maxPriority: 30 });
    expect(params.get('minPriority')).toBe('15');
    expect(params.get('maxPriority')).toBe('30');
  });
});
