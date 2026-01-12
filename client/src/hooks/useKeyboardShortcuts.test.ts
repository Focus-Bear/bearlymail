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

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.addEventListener and removeEventListener
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_DOWN });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(1);
    });

    it('should navigate down with j key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_J });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(1);
    });

    it('should navigate up with ArrowUp', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 1,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_UP });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should navigate up with k key', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 1,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_K });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(0);
    });

    it('should not navigate below last email', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 2, // Last email
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_DOWN });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).toHaveBeenCalledWith(2); // Stays at last
    });

    it('should not navigate above first email', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIndex: 0,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_UP });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

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

      const keyDownEvent = new KeyboardEvent('keydown', { key: '1' });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

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

      const keyDownEvent = new KeyboardEvent('keydown', { key: '2' });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 2);
    });

    it('should set star count to 3', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: '3' });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 3);
    });

    it('should clear star count with 0', () => {
      const selectedIds = new Set(['1', '2']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: '0' });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnSetStarCount).toHaveBeenCalledTimes(2);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('1', 0);
      expect(mockOnSetStarCount).toHaveBeenCalledWith('2', 0);
    });

    it('should not set star count when no emails selected', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: new Set(),
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: '1' });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

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

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_DELETE });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnArchive).toHaveBeenCalledTimes(2);
    });

    it('should archive with Backspace key', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_BACKSPACE });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should archive with e key', () => {
      const selectedIds = new Set(['1']);
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: selectedIds,
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_E });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnArchive).toHaveBeenCalled();
    });

    it('should not archive when no emails selected', () => {
      renderHook(() => useKeyboardShortcuts({
        ...defaultProps,
        selectedEmailIds: new Set(),
      }));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_DELETE });
      Object.defineProperty(keyDownEvent, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockOnArchive).not.toHaveBeenCalled();
    });
  });

  describe('input field handling', () => {
    it('should ignore keys when typing in input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      renderHook(() => useKeyboardShortcuts(defaultProps));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_DOWN });
      Object.defineProperty(keyDownEvent, 'target', {
        value: input,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

      expect(mockSetSelectedEmailIndex).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should ignore keys when typing in textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      renderHook(() => useKeyboardShortcuts(defaultProps));

      const keyDownEvent = new KeyboardEvent('keydown', { key: KEY_ARROW_DOWN });
      Object.defineProperty(keyDownEvent, 'target', {
        value: textarea,
        writable: false,
      });

      window.dispatchEvent(keyDownEvent);

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

      // Event listener should still be set up, but handler should return early
      expect(window.addEventListener).toHaveBeenCalled();
    });

    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() => useKeyboardShortcuts(defaultProps));

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });
});



