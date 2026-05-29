import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';

import { useScheduledEmails } from './useScheduledEmails';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Stable timezone for all tests
const TEST_TIMEZONE = 'Australia/Melbourne';

beforeEach(() => {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: TEST_TIMEZONE }) as Intl.ResolvedDateTimeFormatOptions,
    format: vi.fn(),
    formatToParts: vi.fn(),
    formatRange: vi.fn(),
    formatRangeToParts: vi.fn(),
  } as unknown as Intl.DateTimeFormat);

  mockedAxios.get.mockResolvedValue({ data: [] });
  mockedAxios.post.mockResolvedValue({ data: { isAppropriate: true } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScheduledEmails', () => {
  describe('checkSendTime', () => {
    it('includes userTimezone in the request body using browser locale', async () => {
      const { result } = renderHook(() => useScheduledEmails());

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      const scheduledSendAt = new Date('2026-03-13T21:00:00.000Z'); // 9pm UTC = 8am Melbourne
      await act(async () => {
        await result.current.checkSendTime(scheduledSendAt);
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/scheduled-emails/check-time`,
        expect.objectContaining({
          scheduledSendAt: scheduledSendAt.toISOString(),
          userTimezone: TEST_TIMEZONE,
        })
      );
    });

    it('uses an explicitly provided timezone over the browser default', async () => {
      const { result } = renderHook(() => useScheduledEmails());

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      const scheduledSendAt = new Date('2026-03-13T09:00:00.000Z');
      const explicitTimezone = 'America/New_York';
      await act(async () => {
        await result.current.checkSendTime(scheduledSendAt, explicitTimezone);
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_URL}/scheduled-emails/check-time`,
        expect.objectContaining({
          userTimezone: explicitTimezone,
        })
      );
    });

    it('returns isAppropriate: true on network error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useScheduledEmails());

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      let checkResult;
      await act(async () => {
        checkResult = await result.current.checkSendTime(new Date());
      });

      expect(checkResult).toEqual({ isAppropriate: true });
    });
  });

  describe('fetchTimeSuggestions on mount', () => {
    it('passes the browser timezone when fetching initial suggestions', async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });
      renderHook(() => useScheduledEmails());

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `${API_URL}/scheduled-emails/suggestions`,
          expect.objectContaining({
            params: expect.objectContaining({ timezone: TEST_TIMEZONE }),
          })
        );
      });
    });
  });
});
