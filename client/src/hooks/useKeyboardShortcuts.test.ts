import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_J, KEY_K, KEY_DELETE, KEY_BACKSPACE, KEY_E } from 'constants/strings';

describe('useKeyboardShortcuts', () => {
  const mockEmails = [
    { id: '1', subject: 'Email 1' } as any,
    { id: '2', subject: 'Email 2' } as any,
    { id: '3', subject: 'Email 3' } as any,
  ];

  const mockSetSelectedEmailIndex = jest.fn();
  const mockOnArchive = jest.fn();
  const mockOnSetStarCount = jest.fn();

  // Store the original addEventListener and removeEventListener
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;

  // Store captured event handlers
  let capturedKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedKeydownHandler = null;

    // Mock window.addEventListener to capture the handler
    window.addEventListener = jest.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'keydown' && typeof handler === 'function') {
        capturedKeydownHandler = handler as (event: KeyboardEvent) => void;
      }
    });
    window.removeEventListener = jest.fn();
  });

  afterEach(() => {
    // Restore original functions
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
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
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 1,
      }));

      simulateKeydown(KEY_ARROW_UP);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should navigate up with k key', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 1,
      }));

      simulateKeydown(KEY_K);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should not navigate below last email', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 2, // Last email
      }));

      simulateKeydown(KEY_ARROW_DOWN);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(2); // Stays at last
    });

    it('should not navigate above first email', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 0,
      }));

      simulateKeydown(KEY_ARROW_UP);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0); // Stays at first
    });
  });

  describe('star shortcuts', () => {
    it('should set star count to 1', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown('1');

      expect(mockOnSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 1);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('2', 1);
    });

    it('should set star count to 2', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown('2');

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 2);
    });

    it('should set star count to 3', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown('3');

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 3);
    });

    it('should clear star count with 0', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown('0');

      expect(mockOnSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 0);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('2', 0);
    });

    it('should not set star count when no emails selected', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: new Set(),
      }));

      simulateKeydown('1');

      expect(mockOnSetStarCount).not.toHaveBeenCalled();
    });
  });

  describe('archive shortcuts', () => {
    it('should archive with Delete key', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown(KEY_DELETE);

      expect(mockOnArchive).toHaveBeenCalledTimes(2);
    });

    it('should archive with Backspace key', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown(KEY_BACKSPACE);

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should archive with e key', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      simulateKeydown(KEY_E);

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should archive highlighted email when no emails checked', () => {
      // When no emails are checked (selectedEmailIds is empty), the implementation
      // archives the highlighted email (at selectedEmailIndex)
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: new Set(),
        selectedEmailIndex: 0,
      }));

      simulateKeydown(KEY_DELETE);

      // Should archive the highlighted email at index 0
      expect(mockOnArchive).toHaveBeenCalled();
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



