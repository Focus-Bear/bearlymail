import { act, renderHook } from '@testing-library/react';
import { devWarn } from 'utils/dev-logger';
import { measurePerformance } from 'utils/performanceBudget';

import { usePerformanceBudget } from './usePerformanceBudget';

vi.mock('utils/dev-logger', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
}));

vi.mock('utils/performanceBudget', () => ({
  measurePerformance: vi.fn(),
  ACCORDION_BUDGETS: { CATEGORY_FETCH: 2000, CATEGORY_PAINT: 500, CATEGORY_TOTAL: 3000 },
}));

describe('usePerformanceBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up measurePerformance mock implementation in beforeEach (not in the factory)
    // because async functions in vi.mock factory closures do not resolve correctly.
    (measurePerformance as jest.Mock).mockImplementation(async (_options, operation) => {
      const result = await operation();
      return { result, durationMs: 100, overBudget: false, overageMs: 0 };
    });
  });

  it('returns a measure function', () => {
    const { result } = renderHook(() => usePerformanceBudget());
    expect(typeof result.current.measure).toBe('function');
  });

  it('returns markStart and markEnd functions', () => {
    const { result } = renderHook(() => usePerformanceBudget());
    expect(typeof result.current.markStart).toBe('function');
    expect(typeof result.current.markEnd).toBe('function');
  });

  it('measure() delegates to measurePerformance and returns result', async () => {
    const { result } = renderHook(() => usePerformanceBudget());
    let measurement: Awaited<ReturnType<typeof result.current.measure>> | undefined;
    await act(async () => {
      measurement = await result.current.measure({ label: 'test', budgetMs: 1000 }, async () => 'hello');
    });
    expect(measurement!.result).toBe('hello');
  });

  it('markEnd returns null for unknown span labels', () => {
    const { result } = renderHook(() => usePerformanceBudget());
    const duration = result.current.markEnd('unknown-span', 1000);
    expect(duration).toBeNull();
  });

  it('markStart then markEnd returns a duration', () => {
    // Spy is installed after renderHook to avoid React 19 scheduler consuming mock values
    const { result } = renderHook(() => usePerformanceBudget());

    vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0) // markStart
      .mockReturnValueOnce(1500); // markEnd

    act(() => {
      result.current.markStart('test-span');
    });

    let duration: number | null = null;
    act(() => {
      duration = result.current.markEnd('test-span', 2000);
    });

    expect(duration).toBe(1500);

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('markEnd calls devWarn when span exceeds budget', () => {

    // Spy is installed after renderHook to avoid React 19 scheduler consuming mock values
    const { result } = renderHook(() => usePerformanceBudget());

    vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0) // markStart
      .mockReturnValueOnce(5000); // markEnd — 5000ms > 2000ms budget

    act(() => {
      result.current.markStart('slow-span');
    });
    act(() => {
      result.current.markEnd('slow-span', 2000);
    });

    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('exceeded budget'));

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('markEnd does not call devWarn when span is within budget', () => {

    // Spy is installed after renderHook to avoid React 19 scheduler consuming mock values
    const { result } = renderHook(() => usePerformanceBudget());

    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(500); // 500ms < 2000ms budget

    act(() => {
      result.current.markStart('fast-span');
    });
    act(() => {
      result.current.markEnd('fast-span', 2000);
    });

    expect(devWarn).not.toHaveBeenCalled();

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('markStart calls devWarn when overwriting an existing span', () => {

    const { result } = renderHook(() => usePerformanceBudget());

    act(() => {
      result.current.markStart('dup-span');
    });
    act(() => {
      result.current.markStart('dup-span'); // second call — should warn
    });

    expect(devWarn).toHaveBeenCalledTimes(1);
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('dup-span'));
  });
});
