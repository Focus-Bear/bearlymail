import { act, renderHook, waitFor } from '@testing-library/react';

import { TIMEOUT_300_MS } from 'constants/numbers';

import { useResponsiveBreakpoints } from './useResponsiveBreakpoints';
import { useSplitView } from './useSplitView';

vi.mock('./useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: vi.fn(),
}));

const mockedUseResponsiveBreakpoints = useResponsiveBreakpoints as jest.MockedFunction<typeof useResponsiveBreakpoints>;

const STORAGE_KEY = 'bearlymail_split_position';
const DEFAULT_SPLIT_POSITION = 38;
const MIN_SPLIT_POSITION = 20;
const MAX_SPLIT_POSITION = 80;

describe('useSplitView', () => {
  const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockedUseResponsiveBreakpoints.mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    } as ReturnType<typeof mockedUseResponsiveBreakpoints>);
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useSplitView());

      expect(result.current.selectedEmailId).toBeNull();
      expect(result.current.panelExpanded).toBe(false);
      expect(result.current.splitPosition).toBe(DEFAULT_SPLIT_POSITION);
      expect(result.current.isResizing).toBe(false);
    });

    it('should load saved position from localStorage', async () => {
      // Set up the mock to return the saved value
      mockLocalStorage.getItem.mockReturnValue('65');

      const { result } = renderHook(() => useSplitView());

      await waitFor(() => {
        expect(result.current.splitPosition).toBe(65);
      });
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('should ignore invalid saved position', () => {
      mockLocalStorage.setItem(STORAGE_KEY, 'invalid');

      const { result } = renderHook(() => useSplitView());

      expect(result.current.splitPosition).toBe(DEFAULT_SPLIT_POSITION);
    });

    it('should ignore position below minimum', () => {
      mockLocalStorage.setItem(STORAGE_KEY, '10');

      const { result } = renderHook(() => useSplitView());

      expect(result.current.splitPosition).toBe(DEFAULT_SPLIT_POSITION);
    });

    it('should ignore position above maximum', () => {
      mockLocalStorage.setItem(STORAGE_KEY, '90');

      const { result } = renderHook(() => useSplitView());

      expect(result.current.splitPosition).toBe(DEFAULT_SPLIT_POSITION);
    });
  });

  describe('openEmail', () => {
    it('should set selected email and collapse panel', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setPanelExpanded(true);
        result.current.openEmail('email-1');
      });

      expect(result.current.selectedEmailId).toBe('email-1');
      expect(result.current.panelExpanded).toBe(false);
    });
  });

  describe('closeEmail', () => {
    it('should clear selected email and collapse panel', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSelectedEmailId('email-1');
        result.current.setPanelExpanded(true);
        result.current.closeEmail();
      });

      expect(result.current.selectedEmailId).toBeNull();
      expect(result.current.panelExpanded).toBe(false);
    });
  });

  describe('togglePanel', () => {
    it('should toggle panel expanded state', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.panelExpanded).toBe(true);

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.panelExpanded).toBe(false);
    });
  });

  describe('expandPanel and collapsePanel', () => {
    it('should expand panel', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.expandPanel();
      });

      expect(result.current.panelExpanded).toBe(true);
    });

    it('should collapse panel', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setPanelExpanded(true);
        result.current.collapsePanel();
      });

      expect(result.current.panelExpanded).toBe(false);
    });
  });

  describe('setSplitPosition', () => {
    it('should update split position', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(60);
      });

      expect(result.current.splitPosition).toBe(60);
    });

    it('should clamp position to minimum', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(10);
      });

      expect(result.current.splitPosition).toBe(MIN_SPLIT_POSITION);
    });

    it('should clamp position to maximum', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(90);
      });

      expect(result.current.splitPosition).toBe(MAX_SPLIT_POSITION);
    });

    it('should save position to localStorage with debounce', async () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(65);
      });

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(TIMEOUT_300_MS);
      });

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, '65');
      });
    });

    it('should debounce multiple position changes', async () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(60);
        result.current.setSplitPosition(65);
        result.current.setSplitPosition(70);
      });

      act(() => {
        vi.advanceTimersByTime(TIMEOUT_300_MS);
      });

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
      });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, '70');
    });

    it('should handle localStorage errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(65);
      });

      act(() => {
        vi.advanceTimersByTime(TIMEOUT_300_MS);
      });

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('Error saving split position to localStorage:', expect.any(Error));
      });
    });
  });

  describe('startResize and endResize', () => {
    it('should set isResizing to true', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.startResize();
      });

      expect(result.current.isResizing).toBe(true);
    });

    it('should set isResizing to false', () => {
      const { result } = renderHook(() => useSplitView());

      act(() => {
        result.current.startResize();
        result.current.endResize();
      });

      expect(result.current.isResizing).toBe(false);
    });
  });

  describe('isMobile', () => {
    it('should return mobile state from breakpoints', () => {
      mockedUseResponsiveBreakpoints.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
      } as ReturnType<typeof mockedUseResponsiveBreakpoints>);

      const { result } = renderHook(() => useSplitView());

      expect(result.current.isMobile).toBe(true);
    });

    it('should return false when not mobile', () => {
      mockedUseResponsiveBreakpoints.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isDesktop: true,
      } as ReturnType<typeof mockedUseResponsiveBreakpoints>);

      const { result } = renderHook(() => useSplitView());

      expect(result.current.isMobile).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timeout on unmount', () => {
      const { result, unmount } = renderHook(() => useSplitView());

      act(() => {
        result.current.setSplitPosition(65);
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(TIMEOUT_300_MS);
      });

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });
});
