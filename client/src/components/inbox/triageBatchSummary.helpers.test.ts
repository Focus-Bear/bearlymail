import { PriorityCounts } from 'hooks/usePriorityCounts';

import { getTriageBandParts, getTriageBatchTotal } from './triageBatchSummary.helpers';

const makeCounts = (overrides: Partial<PriorityCounts> = {}): PriorityCounts => ({
  veryHigh: 0,
  high: 0,
  medium: 0,
  low: 0,
  veryLow: 0,
  unprioritised: 0,
  ...overrides,
});

describe('getTriageBatchTotal', () => {
  it('sums all priority bands including unprioritised threads', () => {
    const counts = makeCounts({ veryHigh: 3, high: 12, medium: 20, low: 15, veryLow: 2, unprioritised: 5 });
    expect(getTriageBatchTotal(counts)).toBe(57);
  });

  it('returns 0 for an empty inbox', () => {
    expect(getTriageBatchTotal(makeCounts())).toBe(0);
  });

  it('treats missing fields in a partial API response as 0', () => {
    expect(getTriageBatchTotal({ high: 4, low: 2 })).toBe(6);
    expect(getTriageBatchTotal({})).toBe(0);
  });
});

describe('getTriageBandParts', () => {
  it('returns non-empty bands in priority order with the badge label keys', () => {
    const counts = makeCounts({ veryHigh: 3, high: 12, medium: 20, low: 15, veryLow: 2 });
    expect(getTriageBandParts(counts)).toEqual([
      { labelKey: 'priority.veryHigh', count: 3 },
      { labelKey: 'priority.high', count: 12 },
      { labelKey: 'priority.medium', count: 20 },
      { labelKey: 'priority.low', count: 15 },
      { labelKey: 'priority.veryLow', count: 2 },
    ]);
  });

  it('omits empty bands', () => {
    const counts = makeCounts({ high: 12, low: 15 });
    expect(getTriageBandParts(counts)).toEqual([
      { labelKey: 'priority.high', count: 12 },
      { labelKey: 'priority.low', count: 15 },
    ]);
  });

  it('excludes unprioritised threads (surfaced separately as Analysing priority)', () => {
    const counts = makeCounts({ unprioritised: 9 });
    expect(getTriageBandParts(counts)).toEqual([]);
  });

  it('treats missing fields in a partial API response as empty bands', () => {
    expect(getTriageBandParts({ medium: 7 })).toEqual([{ labelKey: 'priority.medium', count: 7 }]);
    expect(getTriageBandParts({})).toEqual([]);
  });
});
