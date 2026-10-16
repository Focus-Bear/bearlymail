import { act, renderHook } from '@testing-library/react';

import { useHoldToConfirm } from './useHoldToConfirm';

const HOLD_MS = 5000;

describe('useHoldToConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports rising progress while held and resets on release', () => {
    const { result } = renderHook(() => useHoldToConfirm({ onConfirm: vi.fn(), durationMs: HOLD_MS }));

    act(() => result.current.holdHandlers.onPointerDown());
    act(() => {
      vi.advanceTimersByTime(HOLD_MS / 2);
    });
    expect(result.current.isHolding).toBe(true);
    expect(result.current.progress).toBeCloseTo(0.5, 1);

    act(() => result.current.holdHandlers.onPointerUp());
    expect(result.current.isHolding).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it('fires onConfirm once the duration elapses', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useHoldToConfirm({ onConfirm, durationMs: HOLD_MS }));

    act(() => result.current.holdHandlers.onPointerDown());
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 100);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.isHolding).toBe(false);
  });

  it('cancels when the target loses focus', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useHoldToConfirm({ onConfirm, durationMs: HOLD_MS }));

    act(() => result.current.holdHandlers.onPointerDown());
    act(() => result.current.holdHandlers.onBlur());
    act(() => {
      vi.advanceTimersByTime(HOLD_MS * 2);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores holds while disabled', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useHoldToConfirm({ onConfirm, durationMs: HOLD_MS, disabled: true }));

    act(() => result.current.holdHandlers.onPointerDown());
    act(() => {
      vi.advanceTimersByTime(HOLD_MS * 2);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
