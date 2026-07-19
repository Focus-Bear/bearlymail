import { act, renderHook } from '@testing-library/react';
import { Email } from 'types/email';

import {
  EVENT_KEYDOWN,
  KEY_ARROW_DOWN,
  KEY_ARROW_UP,
  KEY_BACKSPACE,
  KEY_DELETE,
  KEY_E,
  KEY_ESCAPE,
  KEY_J,
  KEY_K,
  KEY_N,
  KEY_Y,
  TYPEOF_FUNCTION,
} from 'constants/strings';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  const mockEmails: Email[] = [
    { id: '1', subject: 'Email 1' } as unknown as Email,
    { id: '2', subject: 'Email 2' } as unknown as Email,
    { id: '3', subject: 'Email 3' } as unknown as Email,
  ];

  const mockSetSelectedEmailIndex = vi.fn();
  const mockOnArchive = vi.fn();
  const mockOnSetStarCount = vi.fn();

  // Store the original addEventListener and removeEventListener
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;

  // Store captured event handlers
  let capturedKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedKeydownHandler = null;

    // Mock window.addEventListener to capture the handler
    window.addEventListener = vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === EVENT_KEYDOWN && typeof handler === TYPEOF_FUNCTION) {
        capturedKeydownHandler = handler as (event: KeyboardEvent) => void;
      }
    });
    window.removeEventListener = vi.fn();
  });

  afterEach(() => {
    // Restore original functions
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    vi.useRealTimers();
  });

  // Helper function to simulate a keydown event
  const simulateKeydown = (key: string, target: EventTarget = document.body) => {
    if (!capturedKeydownHandler) {
      throw new Error('No keydown handler captured. Make sure renderHook was called first.');
    }
    const event = new KeyboardEvent('keydown', { key });
    Object.defineProperty(event, 'target', { value: target, writable: false });
    capturedKeydownHandler(event);
  };

  const defaultProps = {
    emails: mockEmails,
    selectedEmailIndex: 0,
    selectedEmailIds: new Set<string>(),
    setSelectedEmailIndex: mockSetSelectedEmailIndex,
    onArchive: mockOnArchive,
    onSetStarCount: mockOnSetStarCount,
  };

  describe('keyboard navigation', () => {
    it('should navigate down with ArrowDown', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));

      simulateKeydown(KEY_ARROW_DOWN);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(1);
    });

    it('should navigate down with j key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));

      simulateKeydown(KEY_J);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(1);
    });

    it('should navigate up with ArrowUp', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIndex: 1,
        })
      );

      simulateKeydown(KEY_ARROW_UP);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should navigate up with k key', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIndex: 1,
        })
      );

      simulateKeydown(KEY_K);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should not navigate below last email', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIndex: 2, // Last email
        })
      );

      simulateKeydown(KEY_ARROW_DOWN);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(2); // Stays at last
    });

    it('should not navigate above first email', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIndex: 0,
        })
      );

      simulateKeydown(KEY_ARROW_UP);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0); // Stays at first
    });
  });

  describe('star shortcuts', () => {
    it('should set star count to 1', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      simulateKeydown('1');

      expect(mockOnSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 1);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('2', 1);
    });

    it('should set star count to 2', () => {
      const selectedIds = new Set(['1']);
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      simulateKeydown('2');

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 2);
    });

    it('should set star count to 3', () => {
      const selectedIds = new Set(['1']);
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      simulateKeydown('3');

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 3);
    });

    it('should clear star count with 0', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      simulateKeydown('0');

      expect(mockOnSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 0);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('2', 0);
    });

    it('should not set star count when no emails selected', () => {
      renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: new Set(),
        })
      );

      simulateKeydown('1');

      expect(mockOnSetStarCount).not.toHaveBeenCalled();
    });
  });

  describe('archive shortcuts with confirmation', () => {
    it('should set pending archive with Delete key and archive on y confirmation', () => {
      const selectedIds = new Set(['1', '2']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      // Press Delete - should set pending archive
      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();
      expect(result.current.pendingArchive?.emailIds).toEqual(['1', '2']);
      expect(mockOnArchive).not.toHaveBeenCalled();

      // Press y to confirm
      act(() => {
        simulateKeydown(KEY_Y);
      });

      expect(mockOnArchive).toHaveBeenCalledTimes(2);
      expect(result.current.pendingArchive).toBeNull();
    });

    it('should set pending archive with Backspace key', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_BACKSPACE);
      });

      expect(result.current.pendingArchive).not.toBeNull();
      expect(result.current.pendingArchive?.emailIds).toEqual(['1']);

      // Confirm with y
      act(() => {
        simulateKeydown(KEY_Y);
      });

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should set pending archive with e key', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_E);
      });

      expect(result.current.pendingArchive).not.toBeNull();

      // Confirm with y
      act(() => {
        simulateKeydown(KEY_Y);
      });

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should cancel pending archive with Escape key', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();

      act(() => {
        simulateKeydown(KEY_ESCAPE);
      });

      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();
    });

    it('should cancel pending archive with n key', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();

      act(() => {
        simulateKeydown(KEY_N);
      });

      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();
    });

    it('should cancel pending archive after timeout', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();

      // Fast-forward past the timeout (3 seconds)
      act(() => {
        vi.advanceTimersByTime(3500);
      });

      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();
    });

    it('should set pending archive for highlighted email when no emails checked', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: new Set(),
          selectedEmailIndex: 0,
        })
      );

      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();
      expect(result.current.pendingArchive?.emailIds).toEqual(['1']);

      // Confirm with y
      act(() => {
        simulateKeydown(KEY_Y);
      });

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should cancel pending archive with cancelPendingArchive function', () => {
      const selectedIds = new Set(['1']);
      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: selectedIds,
        })
      );

      act(() => {
        simulateKeydown(KEY_DELETE);
      });

      expect(result.current.pendingArchive).not.toBeNull();

      act(() => {
        result.current.cancelPendingArchive();
      });

      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();
    });
  });

  describe('input field handling', () => {
    it('should ignore keys when typing in input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      renderHook(() => useKeyboardShortcuts(defaultProps));

      simulateKeydown(KEY_ARROW_DOWN, input);

      expect(mockSetSelectedEmailIndex).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should ignore keys when typing in textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      renderHook(() => useKeyboardShortcuts(defaultProps));

      simulateKeydown(KEY_ARROW_DOWN, textarea);

      expect(mockSetSelectedEmailIndex).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('should ignore keys when typing in contenteditable element', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);

      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: new Set(['1']),
        })
      );

      simulateKeydown(KEY_DELETE, div);

      // Should not trigger pending archive when typing in contenteditable
      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });

    it('should ignore keys when typing in child of contenteditable element', () => {
      const parent = document.createElement('div');
      parent.setAttribute('contenteditable', 'true');
      const child = document.createElement('span');
      parent.appendChild(child);
      document.body.appendChild(parent);

      const { result } = renderHook(() =>
        useKeyboardShortcuts({
          ...defaultProps,
          selectedEmailIds: new Set(['1']),
        })
      );

      simulateKeydown(KEY_BACKSPACE, child);

      // Should not trigger pending archive when typing in child of contenteditable
      expect(result.current.pendingArchive).toBeNull();
      expect(mockOnArchive).not.toHaveBeenCalled();

      document.body.removeChild(parent);
    });
  });

  describe('enabled/disabled', () => {
    it('should add event listener when enabled', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, enabled: true }));

      expect(window.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should not add event listener when disabled', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, enabled: false }));

      // When disabled, the useEffect returns early and doesn't add the event listener
      expect(window.addEventListener).not.toHaveBeenCalled();
    });

    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() => useKeyboardShortcuts(defaultProps));

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });
});
