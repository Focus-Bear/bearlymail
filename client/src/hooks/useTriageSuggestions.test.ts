import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Email, TriageSuggestion } from 'types/email';

import { API_URL } from 'config/api';
import { TRIAGE_SUGGESTIONS_LIMIT_20 } from 'constants/numbers';

import { useTriageSuggestions } from './useTriageSuggestions';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('useTriageSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useTriageSuggestions());

      expect(result.current.triageSuggestions.size).toBe(0);
      expect(result.current.loadingSuggestions).toBe(false);
    });
  });

  describe('fetchTriageSuggestions', () => {
    it('should not fetch when emails array is empty', async () => {
      const { result } = renderHook(() => useTriageSuggestions());

      await act(async () => {
        await result.current.fetchTriageSuggestions([]);
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should not fetch when already loading', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = [{ id: '1' } as Email];

      const delayedResponse = new Promise(resolve => {
        setTimeout(() => resolve({ data: [] }), 100);
      });
      mockedAxios.post.mockImplementation(() => delayedResponse);

      act(() => {
        result.current.fetchTriageSuggestions(emails);
      });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should fetch suggestions for emails', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = [{ id: '1' } as Email, { id: '2' } as Email];
      const mockSuggestions: (TriageSuggestion & { emailId: string })[] = [
        {
          emailId: '1',
          suggestedStarCount: 2,
          suggestedArchive: false,
          confidence: 0.9,
          reasoning: 'Test reasoning 1',
        },
        {
          emailId: '2',
          suggestedStarCount: 1,
          suggestedArchive: true,
          confidence: 0.8,
          reasoning: 'Test reasoning 2',
        },
      ];

      mockedAxios.post.mockResolvedValue({ data: mockSuggestions });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      await waitFor(() => {
        expect(result.current.loadingSuggestions).toBe(false);
      });

      expect(result.current.triageSuggestions.size).toBe(2);
      // The implementation stores the full suggestion object including emailId, confidence, and reasoning
      expect(result.current.triageSuggestions.get('1')).toMatchObject({
        suggestedStarCount: 2,
        suggestedArchive: false,
      });
      expect(result.current.triageSuggestions.get('2')).toMatchObject({
        suggestedStarCount: 1,
        suggestedArchive: true,
      });
      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/priority/triage-suggestions`, { emailIds: ['1', '2'] });
    });

    it('should limit to TRIAGE_SUGGESTIONS_LIMIT_20 emails', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = Array.from(
        { length: 30 },
        (_, i) =>
          ({
            id: String(i + 1),
          }) as Email
      );

      mockedAxios.post.mockResolvedValue({ data: [] });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      // The implementation sorts emailIds alphabetically (string sort), so the order is:
      // ['1', '10', '11', ..., '19', '2', '20', '3', '4', '5', '6', '7', '8', '9']
      const emailIds = Array.from({ length: TRIAGE_SUGGESTIONS_LIMIT_20 }, (_, i) => String(i + 1)).sort();
      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/priority/triage-suggestions`, { emailIds });
    });

    it('should skip fetch if same emails already fetched', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = [{ id: '1' } as Email, { id: '2' } as Email];

      mockedAxios.post.mockResolvedValue({ data: [] });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle fetch errors gracefully', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = [{ id: '1' } as Email];
      const error = new Error('Fetch failed');

      mockedAxios.post.mockRejectedValue(error);

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      await waitFor(() => {
        expect(result.current.loadingSuggestions).toBe(false);
      });

      expect(console.error).toHaveBeenCalledWith('Error fetching triage suggestions:', error);
      expect(result.current.triageSuggestions.size).toBe(0);
    });
  });

  describe('removeSuggestion', () => {
    it('should remove suggestion from map', () => {
      const { result } = renderHook(() => useTriageSuggestions());

      act(() => {
        result.current.triageSuggestions.set('1', {
          suggestedStarCount: 2,
          suggestedArchive: false,
          confidence: 0.9,
          reasoning: 'Test reasoning',
        });
        result.current.removeSuggestion('1');
      });

      expect(result.current.triageSuggestions.has('1')).toBe(false);
    });

    it('should not error when removing non-existent suggestion', () => {
      const { result } = renderHook(() => useTriageSuggestions());

      act(() => {
        result.current.removeSuggestion('nonexistent');
      });

      expect(result.current.triageSuggestions.size).toBe(0);
    });
  });

  describe('clearSuggestionsCache', () => {
    it('should allow refetch after clearing cache', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const emails: Email[] = [{ id: '1' } as Email];

      mockedAxios.post.mockResolvedValue({ data: [] });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      act(() => {
        result.current.clearSuggestionsCache();
      });

      await act(async () => {
        await result.current.fetchTriageSuggestions(emails);
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('trackOverride', () => {
    it('should track override and remove suggestion', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const suggestion: TriageSuggestion = {
        suggestedStarCount: 2,
        suggestedArchive: false,
        confidence: 0.9,
        reasoning: 'Test reasoning',
      };
      const userAction = { starCount: 3, archived: false };

      act(() => {
        result.current.triageSuggestions.set('1', suggestion);
      });

      mockedAxios.post.mockResolvedValue({ data: {} });

      await act(async () => {
        await result.current.trackOverride('1', suggestion, userAction);
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/priority/triage-suggestions/override`, {
        emailId: '1',
        suggestion,
        userAction,
      });
      expect(result.current.triageSuggestions.has('1')).toBe(false);
    });

    it('should handle track override errors', async () => {
      const { result } = renderHook(() => useTriageSuggestions());
      const suggestion: TriageSuggestion = {
        suggestedStarCount: 2,
        suggestedArchive: false,
        confidence: 0.9,
        reasoning: 'Test reasoning',
      };
      const userAction = { starCount: 3, archived: false };
      const error = new Error('Track failed');

      act(() => {
        result.current.triageSuggestions.set('1', suggestion);
      });

      mockedAxios.post.mockRejectedValue(error);

      await act(async () => {
        await result.current.trackOverride('1', suggestion, userAction);
      });

      expect(console.error).toHaveBeenCalledWith('Error tracking override:', error);
      expect(result.current.triageSuggestions.has('1')).toBe(true);
    });
  });
});
