import { act, renderHook } from '@testing-library/react';

import { AUTOSAVE_STATUS, AUTOSAVE_TYPING_DELAY_MS, useAutosave } from './useAutosave';

/** A save whose result the test decides, one request at a time. */
function controllableSave() {
  const calls: { value: string; resolve: () => void; reject: () => void }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject: () => reject(new Error('offline')) });
      })
  );
  return { save, calls };
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves typed text once, after the user pauses', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<string>(save));

    act(() => {
      result.current.saveSoon('H');
      result.current.saveSoon('Hi');
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_TYPING_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Hi');
    expect(result.current.status).toBe(AUTOSAVE_STATUS.SAVED);
  });

  it('sends only the newest change after the one in flight, never an older one last', async () => {
    const { save, calls } = controllableSave();
    const { result } = renderHook(() => useAutosave<string>(save));

    act(() => {
      result.current.saveNow('first');
      result.current.saveNow('second');
      result.current.saveNow('third');
    });
    expect(calls.map(call => call.value)).toEqual(['first']);

    await act(async () => calls[0].resolve());
    expect(calls.map(call => call.value)).toEqual(['first', 'third']);

    await act(async () => calls[1].resolve());
    expect(result.current.status).toBe(AUTOSAVE_STATUS.SAVED);
  });

  it('shows the failure and can send the same value again', async () => {
    const { save, calls } = controllableSave();
    const { result } = renderHook(() => useAutosave<string>(save));

    act(() => result.current.saveNow('sig'));
    await act(async () => calls[0].reject());
    expect(result.current.status).toBe(AUTOSAVE_STATUS.ERROR);

    act(() => result.current.retry());
    expect(calls[1].value).toBe('sig');
    await act(async () => calls[1].resolve());
    expect(result.current.status).toBe(AUTOSAVE_STATUS.SAVED);
  });

  it('goes back to idle a moment after saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave<string>(save));

    await act(async () => result.current.saveNow('x'));
    expect(result.current.status).toBe(AUTOSAVE_STATUS.SAVED);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(result.current.status).toBe(AUTOSAVE_STATUS.IDLE);
  });

  it('still saves text that was waiting when the section closes', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutosave<string>(save));

    act(() => result.current.saveSoon('typed then left'));
    unmount();

    expect(save).toHaveBeenCalledWith('typed then left');
  });
});
