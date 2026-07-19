import { devLog, devWarn } from './dev-logger';
import { measurePerformance } from './performanceBudget';

vi.mock('./dev-logger', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
}));

describe('measurePerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the result of the operation transparently', async () => {
    const { result } = await measurePerformance({ label: 'test-op', budgetMs: 1000 }, async () => 42);
    expect(result).toBe(42);
  });

  it('returns a resolved value from an async operation', async () => {
    const expected = { foo: 'bar' };
    const { result } = await measurePerformance({ label: 'test-op', budgetMs: 1000 }, async () => expected);
    expect(result).toBe(expected);
  });

  it('calls devWarn when the operation exceeds the budget', async () => {
    // Simulate a slow operation by manipulating performance.now
    let callCount = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      callCount++;
      // First call (start): 0ms, second call (end): 3000ms → 3000ms elapsed
      return callCount === 1 ? 0 : 3000;
    });

    await measurePerformance({ label: 'slow-op', budgetMs: 2000 }, async () => 'result');

    expect(devWarn).toHaveBeenCalledTimes(1);
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('slow-op'));
    expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('exceeded budget'));

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('does NOT call devWarn when the operation is within budget', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(500); // 500ms elapsed < 2000ms budget

    await measurePerformance({ label: 'fast-op', budgetMs: 2000 }, async () => 'result');

    expect(devWarn).not.toHaveBeenCalled();
    expect(devLog).toHaveBeenCalledWith(expect.stringContaining('within budget'));

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('returns correct durationMs and overageMs when over budget', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(2500); // 2500ms elapsed, 2000ms budget → 500ms overage

    const { durationMs, overBudget, overageMs } = await measurePerformance(
      { label: 'over-budget-op', budgetMs: 2000 },
      async () => 'result'
    );

    expect(durationMs).toBe(2500);
    expect(overBudget).toBe(true);
    expect(overageMs).toBe(500);

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('returns overBudget=false and overageMs=0 when within budget', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1000); // 1000ms elapsed, 2000ms budget

    const { overBudget, overageMs } = await measurePerformance(
      { label: 'within-budget-op', budgetMs: 2000 },
      async () => 'result'
    );

    expect(overBudget).toBe(false);
    expect(overageMs).toBe(0);

    vi.spyOn(performance, 'now').mockRestore();
  });

  it('re-throws errors from the operation', async () => {
    const error = new Error('fetch failed');
    await expect(
      measurePerformance({ label: 'error-op', budgetMs: 1000 }, async () => {
        throw error;
      })
    ).rejects.toThrow('fetch failed');
  });
});
