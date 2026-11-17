import { renderHook } from '@testing-library/react';

import { FIRST_IMPORT_REFRESH_INTERVAL_MS } from 'constants/numbers';
import { useFirstImportRefresh } from 'hooks/useFirstImportRefresh';

describe('useFirstImportRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes on an interval while the import is still being scored', () => {
    const onRefresh = vi.fn();
    renderHook(() => useFirstImportRefresh({ isImportRunning: true, onRefresh }));
    vi.advanceTimersByTime(FIRST_IMPORT_REFRESH_INTERVAL_MS * 2);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('stops once every thread is scored', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(({ isImportRunning }) => useFirstImportRefresh({ isImportRunning, onRefresh }), {
      initialProps: { isImportRunning: true },
    });
    rerender({ isImportRunning: false });
    vi.advanceTimersByTime(FIRST_IMPORT_REFRESH_INTERVAL_MS * 2);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
