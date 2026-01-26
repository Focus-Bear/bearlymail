/* eslint-disable id-denylist -- 'data' is a standard property name for axios responses */
import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useContactSearch } from './useContactSearch';
import { DEBOUNCE_DELAY_200_MS } from 'constants/numbers';
import { API_URL } from 'config/api';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('useContactSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useContactSearch());

      expect(result.current.toSearch).toBe('');
      expect(result.current.ccSearch).toBe('');
      expect(result.current.bccSearch).toBe('');
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.activeField).toBeNull();
      expect(result.current.selectedSuggestionIndex).toBe(-1);
    });
  });

  describe('handleSearchInput', () => {
    it('should update to search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.handleSearchInput('test', 'to');
      });

      expect(result.current.toSearch).toBe('test');
      expect(result.current.activeField).toBe('to');
    });

    it('should update cc search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.handleSearchInput('test', 'cc');
      });

      expect(result.current.ccSearch).toBe('test');
      expect(result.current.activeField).toBe('cc');
    });

    it('should update bcc search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.handleSearchInput('test', 'bcc');
      });

      expect(result.current.bccSearch).toBe('test');
      expect(result.current.activeField).toBe('bcc');
    });

    it('should debounce search requests', async () => {
      const { result } = renderHook(() => useContactSearch());
      const mockResults = [{ id: '1', email: 'test@example.com' }];

      mockedAxios.get.mockResolvedValue({ data: mockResults });

      act(() => {
        result.current.handleSearchInput('test', 'to');
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(DEBOUNCE_DELAY_200_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });
    });

    it('should cancel previous search when new input comes', async () => {
      const { result } = renderHook(() => useContactSearch());
      const mockResults = [{ id: '1', email: 'test@example.com' }];

      mockedAxios.get.mockResolvedValue({ data: mockResults });

      act(() => {
        result.current.handleSearchInput('te', 'to');
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.handleSearchInput('test', 'to');
      });

      act(() => {
        jest.advanceTimersByTime(DEBOUNCE_DELAY_200_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('test')
      );
    });

    it('should not search for queries shorter than 2 characters', async () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.handleSearchInput('t', 'to');
      });

      act(() => {
        jest.advanceTimersByTime(DEBOUNCE_DELAY_200_MS);
      });

      await waitFor(() => {
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });
      expect(result.current.searchResults).toEqual([]);
    });
  });

  describe('searchContacts', () => {
    it('should fetch and set search results', async () => {
      const { result } = renderHook(() => useContactSearch());
      const mockResults = [
        { id: '1', email: 'test1@example.com', name: 'Test 1' },
        { id: '2', email: 'test2@example.com', name: 'Test 2' },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockResults });

      await act(async () => {
        await result.current.searchContacts('test');
      });

      expect(result.current.searchResults).toEqual(mockResults);
      expect(result.current.selectedSuggestionIndex).toBe(-1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${API_URL}/contacts/search?q=test&limit=8`
      );
    });

    it('should clear results for short queries', async () => {
      const { result } = renderHook(() => useContactSearch());

      await act(async () => {
        await result.current.searchContacts('t');
      });

      expect(result.current.searchResults).toEqual([]);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should handle search errors', async () => {
      const { result } = renderHook(() => useContactSearch());
      const error = new Error('Search failed');

      mockedAxios.get.mockRejectedValue(error);

      await act(async () => {
        await result.current.searchContacts('test');
      });

      expect(console.error).toHaveBeenCalledWith('Contact search failed:', error);
      expect(result.current.searchResults).toEqual([]);
    });
  });

  describe('getSearchValue', () => {
    it('should return to search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setToSearch('test to');
      });

      expect(result.current.getSearchValue('to')).toBe('test to');
    });

    it('should return cc search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setCcSearch('test cc');
      });

      expect(result.current.getSearchValue('cc')).toBe('test cc');
    });

    it('should return bcc search value', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setBccSearch('test bcc');
      });

      expect(result.current.getSearchValue('bcc')).toBe('test bcc');
    });
  });

  describe('clearSearch', () => {
    it('should clear all search fields and results', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setToSearch('test');
        result.current.setCcSearch('test');
        result.current.setBccSearch('test');
        result.current.setActiveField('to');
        result.current.searchResults.push({ id: '1', email: 'test@example.com' } as any);
      });

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.toSearch).toBe('');
      expect(result.current.ccSearch).toBe('');
      expect(result.current.bccSearch).toBe('');
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.activeField).toBeNull();
    });
  });

  describe('direct setters', () => {
    it('should allow direct setToSearch', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setToSearch('direct value');
      });

      expect(result.current.toSearch).toBe('direct value');
    });

    it('should allow direct setCcSearch', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setCcSearch('cc value');
      });

      expect(result.current.ccSearch).toBe('cc value');
    });

    it('should allow direct setBccSearch', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setBccSearch('bcc value');
      });

      expect(result.current.bccSearch).toBe('bcc value');
    });

    it('should allow direct setActiveField', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setActiveField('cc');
      });

      expect(result.current.activeField).toBe('cc');
    });

    it('should allow direct setSelectedSuggestionIndex', () => {
      const { result } = renderHook(() => useContactSearch());

      act(() => {
        result.current.setSelectedSuggestionIndex(2);
      });

      expect(result.current.selectedSuggestionIndex).toBe(2);
    });
  });
});

