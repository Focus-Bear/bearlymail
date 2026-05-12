import { resolveInboxCI } from './githubChecks';

describe('resolveInboxCI', () => {
  it('returns null when checks is undefined', () => {
    expect(resolveInboxCI(undefined)).toBeNull();
  });

  it('returns null when state is none', () => {
    expect(resolveInboxCI({ state: 'none', total: 0, failingChecks: [] })).toBeNull();
  });

  it('returns the passing label for state=passing', () => {
    const result = resolveInboxCI({ state: 'passing', total: 3, failingChecks: [] });
    expect(result).toEqual({
      state: 'passing',
      labelKey: 'github.ci.passing',
      labelValues: {},
      titleText: '',
    });
  });

  it('returns the pending label for state=pending', () => {
    const result = resolveInboxCI({ state: 'pending', total: 2, failingChecks: [] });
    expect(result?.labelKey).toBe('github.ci.pending');
  });

  it('uses failingWithNames key when failing checks are present', () => {
    const result = resolveInboxCI({
      state: 'failing',
      total: 4,
      failingChecks: ['tests', 'lint'],
    });
    expect(result?.labelKey).toBe('github.ci.failingWithNames');
    expect(result?.labelValues).toEqual({ names: 'tests, lint' });
  });

  it('falls back to the generic failing key when no failing-check names are present', () => {
    const result = resolveInboxCI({ state: 'failing', total: 1, failingChecks: [] });
    expect(result?.labelKey).toBe('github.ci.failing');
    expect(result?.labelValues).toEqual({});
  });

  it('caps the inline preview at 2 names but keeps the full list in titleText', () => {
    const result = resolveInboxCI({
      state: 'failing',
      total: 5,
      failingChecks: ['tests', 'lint', 'typecheck', 'build'],
    });
    expect(result?.labelValues).toEqual({ names: 'tests, lint' });
    expect(result?.titleText).toBe('tests, lint, typecheck, build');
  });
});
