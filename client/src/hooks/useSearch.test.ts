/* eslint-disable id-denylist -- 'data' is a standard property name for axios responses */
import { renderHook, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { useSearch } from './useSearch';
import { useNavigate } from 'react-router-dom';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';

jest.mock('axios');
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));
jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

describe('useSearch', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    window.alert = jest.fn();
    mockedUseNavigate.mockReturnValue(mockNavigate);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useSearch());

      expect(result.current.query).toBe('');
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.hasSearched).toBe(false);
      expect(result.current.progressStep).toBe('');
    });
  });

  describe('handleSearch', () => {
    it('should not search when query is empty', async () => {
      const { result } = renderHook(() => useSearch());

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should not search when query is only whitespace', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('   ');
      });

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should perform search successfully', async () => {
      const { result } = renderHook(() => useSearch());
      const mockResults = [
        { id: '1', subject: 'Test', from: 'test@example.com' },
      ];

      act(() => {
        result.current.setQuery('test query');
      });

      mockedAxios.get.mockResolvedValue({ data: mockResults });

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toEqual(mockResults);
      expect(result.current.hasSearched).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/emails/search`, {
        params: { q: 'test query', maxResults: 50 },
      });
      expect(mockedCaptureEvent).toHaveBeenCalledWith('search_performed', {
        query_length: 10,
        has_query: true,
        result_count: 1,
      });
    });

    it('should show progress steps during search', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      const delayedResponse = new Promise((resolve) => {
        setTimeout(() => resolve({ data: [] }), 4000);
      });
      mockedAxios.get.mockImplementation(() => delayedResponse);

      const mockEvent = { preventDefault: jest.fn() } as any;
      act(() => {
        result.current.handleSearch(mockEvent);
      });

      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current.progressStep).toBe('Crafting search query for Gmail...');

      await act(async () => {
        jest.advanceTimersByTime(900);
      });
      expect(result.current.progressStep).toBe('Searching for emails in Gmail...');

      await act(async () => {
        jest.advanceTimersByTime(1300);
      });
      expect(result.current.progressStep).toBe('Filtering emails with AI...');

      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(result.current.progressStep).toBe('Generating explanations...');
    });

    it('should handle empty results', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValue({ data: [] });

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].id).toBe('no-results');
      expect((result.current.searchResults[0] as { debugInfo?: any }).debugInfo).toBeDefined();
    });

    it('should handle null response data', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValue({ data: null });

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].id).toBe('no-results');
    });

    it('should handle 401 unauthorized error', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      const error = {
        response: { status: HTTP_UNAUTHORIZED },
      };
      mockedAxios.get.mockRejectedValue(error);

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(window.alert).toHaveBeenCalledWith('Please log in again to search emails.');
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('should handle other errors', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      const error = new Error('Network error');
      mockedAxios.get.mockRejectedValue(error);

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(window.alert).toHaveBeenCalledWith('Error searching emails. Please try again.');
      expect(console.error).toHaveBeenCalledWith('Error searching emails:', error);
    });

    it('should clear progress step after search completes', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockResolvedValue({ data: [] });

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.progressStep).toBe('');
      });
    });

    it('should clear progress step on error', async () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('test');
      });

      mockedAxios.get.mockRejectedValue(new Error('Error'));

      const mockEvent = { preventDefault: jest.fn() } as any;
      await act(async () => {
        await result.current.handleSearch(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.progressStep).toBe('');
      });
    });
  });

  describe('setQuery', () => {
    it('should update query state', () => {
      const { result } = renderHook(() => useSearch());

      act(() => {
        result.current.setQuery('new query');
      });

      expect(result.current.query).toBe('new query');
    });
  });
});

