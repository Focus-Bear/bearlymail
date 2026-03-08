import { act, renderHook } from '@testing-library/react';

import { useSnoozeInput } from './useSnoozeInput';

describe('useSnoozeInput', () => {
  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useSnoozeInput());

      expect(result.current.snoozeInput).toEqual({});
      expect(result.current.showSnoozeInput).toBeNull();
    });
  });

  describe('getSnoozeValue', () => {
    it('should return empty string for non-existent email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      expect(result.current.getSnoozeValue('email-1')).toBe('');
    });

    it('should return value for existing email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '1h');
      });

      expect(result.current.getSnoozeValue('email-1')).toBe('1h');
    });
  });

  describe('setSnoozeValue', () => {
    it('should set snooze value for email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '2h');
      });

      expect(result.current.snoozeInput['email-1']).toBe('2h');
    });

    it('should update existing snooze value', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '1h');
        result.current.setSnoozeValue('email-1', '2h');
      });

      expect(result.current.snoozeInput['email-1']).toBe('2h');
    });

    it('should handle multiple emails', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '1h');
        result.current.setSnoozeValue('email-2', '2h');
        result.current.setSnoozeValue('email-3', '3h');
      });

      expect(result.current.snoozeInput['email-1']).toBe('1h');
      expect(result.current.snoozeInput['email-2']).toBe('2h');
      expect(result.current.snoozeInput['email-3']).toBe('3h');
    });
  });

  describe('showSnooze', () => {
    it('should show snooze input for email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.showSnooze('email-1');
      });

      expect(result.current.showSnoozeInput).toBe('email-1');
    });

    it('should update shown email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.showSnooze('email-1');
        result.current.showSnooze('email-2');
      });

      expect(result.current.showSnoozeInput).toBe('email-2');
    });
  });

  describe('hideSnooze', () => {
    it('should hide snooze input', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.showSnooze('email-1');
        result.current.hideSnooze();
      });

      expect(result.current.showSnoozeInput).toBeNull();
    });
  });

  describe('clearSnooze', () => {
    it('should clear snooze value and hide input', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '1h');
        result.current.showSnooze('email-1');
        result.current.clearSnooze('email-1');
      });

      expect(result.current.snoozeInput['email-1']).toBeUndefined();
      expect(result.current.showSnoozeInput).toBeNull();
    });

    it('should only clear specified email', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeValue('email-1', '1h');
        result.current.setSnoozeValue('email-2', '2h');
        result.current.clearSnooze('email-1');
      });

      expect(result.current.snoozeInput['email-1']).toBeUndefined();
      expect(result.current.snoozeInput['email-2']).toBe('2h');
    });
  });

  describe('direct state setters', () => {
    it('should allow direct setSnoozeInput', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setSnoozeInput({ 'email-1': '1h', 'email-2': '2h' });
      });

      expect(result.current.snoozeInput).toEqual({
        'email-1': '1h',
        'email-2': '2h',
      });
    });

    it('should allow direct setShowSnoozeInput', () => {
      const { result } = renderHook(() => useSnoozeInput());

      act(() => {
        result.current.setShowSnoozeInput('email-1');
      });

      expect(result.current.showSnoozeInput).toBe('email-1');
    });
  });
});
