import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { LINK_TYPE_PR } from 'constants/strings';

import { useEmailDetailGithub } from './useEmailDetailGithub';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('queries/useUserProfileQuery', () => ({
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

describe('useEmailDetailGithub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedAxios.isCancel as unknown as jest.Mock).mockReturnValue(false);
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });

  describe('fetchGithubInfo', () => {
    it('sets local githubLinks state with links from the API', async () => {
      const emailId = 'email-1';

      mockedAxios.get.mockResolvedValue({
        data: { links: [mockLink], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId));

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });
      expect(result.current.githubLinks[0].url).toBe('https://github.com/owner/repo/pull/42');
      expect(result.current.hasGithubToken).toBe(true);
    });

    it('sets loading to false after fetching', async () => {
      const emailId = 'email-1';

      mockedAxios.get.mockResolvedValue({
        data: { links: [], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId));

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.loadingGithub).toBe(false);
      });
    });

    it('deduplicates links before setting local state', async () => {
      const emailId = 'email-1';

      mockedAxios.get.mockResolvedValue({
        data: { links: [mockLink, mockLink], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId));

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });
    });

    it('calls the correct API endpoint', async () => {
      const emailId = 'email-42';

      mockedAxios.get.mockResolvedValue({
        data: { links: [], hasToken: true },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId));

      await act(async () => {
        await result.current.fetchGithubInfo();
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${API_URL}/github/emails/${emailId}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('refreshGithubInfo', () => {
    it('updates local state with refreshed links', async () => {
      const emailId = 'email-1';

      const refreshedLink = { ...mockLink, status: { state: 'merged', title: 'My PR', fetchedAt: '2026-01-02T00:00:00Z' } };
      mockedAxios.post.mockResolvedValue({
        data: { links: [refreshedLink], message: 'Refreshed' },
      });

      const { result } = renderHook(() => useEmailDetailGithub(emailId));

      await act(async () => {
        await result.current.refreshGithubInfo();
      });

      await waitFor(() => {
        expect(result.current.githubLinks).toHaveLength(1);
      });
      expect(result.current.githubLinks[0].status?.state).toBe('merged');
    });
  });
});
