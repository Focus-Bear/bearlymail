import { countThreadsInPriorityRange, shouldRefetchEmptyTriageList } from 'components/inbox/priorityRangeCounts';
import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

const COUNTS = { veryHigh: 3, high: 7, medium: 22, low: 40, veryLow: 423, unprioritised: 0 };

describe('countThreadsInPriorityRange', () => {
  it('counts High-and-above for the guided default', () => {
    expect(countThreadsInPriorityRange(COUNTS, HIGH_PRIORITY_THRESHOLD, null)).toBe(10);
  });

  it('counts every bucket with no filter', () => {
    expect(countThreadsInPriorityRange(COUNTS, null, null)).toBe(495);
  });
});

describe('shouldRefetchEmptyTriageList', () => {
  // Report 2026-11-10: the list loaded before the first import scored anything High stayed empty
  // ("No High priority emails") after the counts showed High mail.
  it('refetches an empty Triage list once the counts say the filtered range has mail', () => {
    expect(shouldRefetchEmptyTriageList({ isTriage: true, isListEmpty: true, threadsInRange: 41 })).toBe(true);
  });

  it('leaves a list that already shows mail alone', () => {
    expect(shouldRefetchEmptyTriageList({ isTriage: true, isListEmpty: false, threadsInRange: 41 })).toBe(false);
  });

  it('leaves a genuinely empty range alone', () => {
    expect(shouldRefetchEmptyTriageList({ isTriage: true, isListEmpty: true, threadsInRange: 0 })).toBe(false);
  });

  it('only applies to Triage', () => {
    expect(shouldRefetchEmptyTriageList({ isTriage: false, isListEmpty: true, threadsInRange: 41 })).toBe(false);
  });
});
