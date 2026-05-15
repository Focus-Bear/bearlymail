import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { LINK_TYPE_PR } from 'constants/strings';
import inboxDataReducer from 'store/slices/inboxDataSlice';
import inboxUIReducer from 'store/slices/inboxUISlice';

import { useEmailDetailGithub } from './useEmailDetailGithub';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('queries/useUserProfileQuery', () => ({
  useUserProfileQuery: () => ({ data: { githubToken: 'encrypted-token' } }),
}));

const mockLink = {
  type: LINK_TYPE_PR,
  owner: 'owner',
  repo: 'repo',
  number: 42,
  url: 'https://github.com/owner/repo/pull/42',
  status: { state: 'open', title: 'My PR', fetchedAt: '2026-01-01T00:00:00Z' },
};

const createTestStore = (emails = [] as { id: string; githubMetadata?: unknown }[]) =>
  configureStore({
    reducer: { inboxData: inboxDataReducer, inboxUI: inboxUIReducer },
    preloadedState: {
      inboxData: {
        emails: emails as never[],
        hasMore: false,
        totalCount: 0,
        currentOffset: 0,
        categorySummary: null,
        loadedCategoryNames: [],
        loadingCategoryNames: [],
        exhaustedCategoryNames: [],
        lastFetchedAt: null,
      },
      inboxUI: {
        optimisticallyArchived: [],
        optimisticallySnoozed: [],
        animatingOut: [],
        loading: false,
        decrypting: false,
        refreshing: false,
        loadingModeSwitch: false,
        fetchError: null,
        summaryLoading: false,
      },
    },
  });

function wrapper(store: ReturnType<typeof createTestStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store, children });
  };
}

describe('useEmailDetailGithub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedAxios.isCancel as unknown as jest.Mock).mockReturnValue(false);
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });

  describe('fetchGithubInfo', () => {
    it('updates Redux store with discovered links so inbox badge stays current', async () => {
      const emailId = 'email-1';
      const store = createTestStore([{ id: emailId, githubMetadata: undefined }]);

      mockedAxios.get.mockResolvedValue({
        data: { links: [mockLink], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId), {
        wrapper: wrapper(store),
      });

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });

      const state = store.getState();
      const emailInStore = state.inboxData.emails.find((email: { id: string }) => email.id === emailId);
      expect(emailInStore).toBeDefined();
      expect((emailInStore as { githubMetadata?: { links: unknown[] } })?.githubMetadata?.links).toHaveLength(1);
      expect((emailInStore as { githubMetadata?: { links: Array<{ url: string }> } })?.githubMetadata?.links[0].url).toBe(
        'https://github.com/owner/repo/pull/42'
      );
    });

    it('does not dispatch Redux update when no links are returned', async () => {
      const emailId = 'email-1';
      const store = createTestStore([{ id: emailId, githubMetadata: undefined }]);

      mockedAxios.get.mockResolvedValue({
        data: { links: [], hasToken: true },
      });

      const dispatchSpy = jest.spyOn(store, 'dispatch');

      const { result } = renderHook(() => useEmailDetailGithub(emailId), {
        wrapper: wrapper(store),
      });

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      const updateEmailCalls = dispatchSpy.mock.calls.filter(call => {
        const action = call[0] as { type?: string };
        return action?.type?.includes('updateEmail');
      });
      expect(updateEmailCalls).toHaveLength(0);
    });

    it('deduplicates links before dispatching to Redux', async () => {
      const emailId = 'email-1';
      const store = createTestStore([{ id: emailId }]);

      mockedAxios.get.mockResolvedValue({
        data: { links: [mockLink, mockLink], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId), {
        wrapper: wrapper(store),
      });

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });

      const state = store.getState();
      const emailInStore = state.inboxData.emails.find((email: { id: string }) => email.id === emailId);
      expect((emailInStore as { githubMetadata?: { links: unknown[] } })?.githubMetadata?.links).toHaveLength(1);
    });
  });

  describe('refreshGithubInfo', () => {
    it('updates Redux store with refreshed links', async () => {
      const emailId = 'email-1';
      const store = createTestStore([{ id: emailId, githubMetadata: { links: [] } }]);

      const refreshedLink = { ...mockLink, status: { state: 'merged', title: 'My PR', fetchedAt: '2026-01-02T00:00:00Z' } };
      mockedAxios.post.mockResolvedValue({
        data: { links: [refreshedLink], message: 'Refreshed' },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId), {
        wrapper: wrapper(store),
      });

      await act(async () => {
        await result.current.refreshGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });

      const state = store.getState();
      const emailInStore = state.inboxData.emails.find((email: { id: string }) => email.id === emailId);
      const links = (emailInStore as { githubMetadata?: { links: Array<{ status: { state: string } }> } })
        ?.githubMetadata?.links;
      expect(links?.[0].status.state).toBe('merged');
    });
  });
});
