import { act, renderHook } from '@testing-library/react';
import { Email, InboxMode } from 'types/email';

import { useEmailSelection } from './useEmailSelection';

describe('useEmailSelection', () => {
  const mockEmails: Email[] = [
    { id: '1', subject: 'Email 1' } as Email,
    { id: '2', subject: 'Email 2' } as Email,
    { id: '3', subject: 'Email 3' } as Email,
    { id: '4', subject: 'Email 4' } as Email,
  ];

  describe('initialization', () => {
    it('should initialize with no selection', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      expect(result.current.selectedEmailIndex).toBe(-1);
      expect(result.current.selectedEmailIds.size).toBe(0);
      expect(result.current.lastSelectedIndex).toBe(-1);
    });
  });

  describe('handleEmailClick', () => {
    it('should select single email on regular click', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(1);
      expect(result.current.selectedEmailIndex).toBe(0);
      expect(result.current.lastSelectedIndex).toBe(0);
    });

    it('should replace selection on new regular click', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
        result.current.handleEmailClick('2', 1, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(false);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(1);
    });

    it('should toggle selection with Ctrl key', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: true, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
        result.current.handleEmailClick('2', 1, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(2);
    });

    it('should toggle selection with Cmd key (Mac)', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: true } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
        result.current.handleEmailClick('2', 1, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(2);
    });

    it('should deselect with Ctrl/Cmd click on selected email', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: true, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
        result.current.handleEmailClick('2', 1, mockEvent, mockEmails);
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(false);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(1);
    });

    it('should select range with Shift key', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const regularEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;
      const shiftEvent = { shiftKey: true, ctrlKey: false, metaKey: false } as React.MouseEvent;

      // First click to set lastSelectedIndex
      act(() => {
        result.current.handleEmailClick('1', 0, regularEvent, mockEmails);
      });

      // Second click with shift to select range
      act(() => {
        result.current.handleEmailClick('3', 2, shiftEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.has('3')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(3);
    });

    it('should select range backwards with Shift key', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const regularEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;
      const shiftEvent = { shiftKey: true, ctrlKey: false, metaKey: false } as React.MouseEvent;

      // First click to set lastSelectedIndex
      act(() => {
        result.current.handleEmailClick('3', 2, regularEvent, mockEmails);
      });

      // Second click with shift to select range backwards
      act(() => {
        result.current.handleEmailClick('1', 0, shiftEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
      expect(result.current.selectedEmailIds.has('3')).toBe(true);
      expect(result.current.selectedEmailIds.size).toBe(3);
    });

    it('should not select range if no lastSelectedIndex', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const shiftEvent = { shiftKey: true, ctrlKey: false, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('2', 1, shiftEvent, mockEmails);
      });

      // Should just select the single email since no previous selection
      expect(result.current.selectedEmailIds.size).toBe(1);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      const mockEvent = { shiftKey: false, ctrlKey: true, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
        result.current.handleEmailClick('2', 1, mockEvent, mockEmails);
        result.current.clearSelection();
      });

      expect(result.current.selectedEmailIds.size).toBe(0);
      expect(result.current.selectedEmailIndex).toBe(-1);
      expect(result.current.lastSelectedIndex).toBe(-1);
    });
  });

  describe('mode/emailsLength changes', () => {
    it('should reset selection when mode changes', () => {
      const { result, rerender } = renderHook(
        ({ mode, length }: { mode: InboxMode; length: number }) => useEmailSelection(mode, length),
        { initialProps: { mode: 'triage', length: 4 } }
      );

      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.size).toBe(1);

      rerender({ mode: 'action', length: 4 });

      expect(result.current.selectedEmailIds.size).toBe(0);
      expect(result.current.selectedEmailIndex).toBe(-1);
    });

    it('should reset selection when emailsLength changes', () => {
      const { result, rerender } = renderHook(({ mode, length }) => useEmailSelection(mode, length), {
        initialProps: { mode: 'triage' as const, length: 4 },
      });

      const mockEvent = { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent;

      act(() => {
        result.current.handleEmailClick('1', 0, mockEvent, mockEmails);
      });

      expect(result.current.selectedEmailIds.size).toBe(1);

      rerender({ mode: 'triage' as const, length: 5 });

      expect(result.current.selectedEmailIds.size).toBe(0);
      expect(result.current.selectedEmailIndex).toBe(-1);
    });
  });

  describe('direct setters', () => {
    it('should allow direct setSelectedEmailIndex', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      act(() => {
        result.current.setSelectedEmailIndex(2);
      });

      expect(result.current.selectedEmailIndex).toBe(2);
    });

    it('should allow direct setSelectedEmailIds', () => {
      const { result } = renderHook(() => useEmailSelection('triage', 4));

      act(() => {
        result.current.setSelectedEmailIds(new Set(['1', '2']));
      });

      expect(result.current.selectedEmailIds.size).toBe(2);
      expect(result.current.selectedEmailIds.has('1')).toBe(true);
      expect(result.current.selectedEmailIds.has('2')).toBe(true);
    });
  });
});
