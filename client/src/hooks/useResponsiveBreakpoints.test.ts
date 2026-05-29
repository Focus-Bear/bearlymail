import { act, renderHook } from '@testing-library/react';

import { BREAKPOINT_DESKTOP, BREAKPOINT_TABLET } from 'constants/numbers';

import { useResponsiveBreakpoints } from './useResponsiveBreakpoints';

describe('useResponsiveBreakpoints', () => {
  const originalInnerWidth = window.innerWidth;
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;

  beforeEach(() => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    // Mock addEventListener and removeEventListener
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
  });

  describe('initialization', () => {
    it('should detect mobile when width < BREAKPOINT_TABLET', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_TABLET - 1,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isMobile).toBe(true);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });

    it('should detect tablet when width >= BREAKPOINT_TABLET and < BREAKPOINT_DESKTOP', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_TABLET + 100,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it('should detect desktop when width >= BREAKPOINT_DESKTOP', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_DESKTOP,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });
  });

  describe('resize handling', () => {
    it('should add resize event listener on mount', () => {
      renderHook(() => useResponsiveBreakpoints());

      expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should remove resize event listener on unmount', () => {
      const { unmount } = renderHook(() => useResponsiveBreakpoints());
      const resizeHandler = (window.addEventListener as jest.Mock).mock.calls[0][1];

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('resize', resizeHandler);
    });

    it('should update breakpoints on window resize', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_TABLET - 1,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());
      const resizeHandler = (window.addEventListener as jest.Mock).mock.calls[0][1];

      expect(result.current.isMobile).toBe(true);

      // Simulate resize to desktop
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_DESKTOP,
      });

      act(() => {
        resizeHandler();
      });

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });
  });

  describe('boundary conditions', () => {
    it('should handle exact BREAKPOINT_TABLET width', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_TABLET,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(true);
    });

    it('should handle exact BREAKPOINT_DESKTOP width', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_DESKTOP,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });

    it('should handle width just below BREAKPOINT_DESKTOP', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: BREAKPOINT_DESKTOP - 1,
      });

      const { result } = renderHook(() => useResponsiveBreakpoints());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });
  });
});
