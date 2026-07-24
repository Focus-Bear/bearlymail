import { shouldRevealLowerPriorityTriage } from 'components/inbox/revealLowerPriorityTriage';
import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

const CLEARED_HIGH_LOWER_REMAINS = { veryHigh: 0, high: 0, medium: 4, low: 1, veryLow: 0 };

const BASE = {
  isTriage: true,
  isGateResolved: true,
  hasExistingWork: false,
  minPriority: HIGH_PRIORITY_THRESHOLD as number | null,
  maxPriority: null as number | null,
  priorityCounts: CLEARED_HIGH_LOWER_REMAINS,
  alreadyRevealed: false,
};

describe('shouldRevealLowerPriorityTriage', () => {
  it('reveals when the guided High view is cleared, lower emails remain, and there is NO existing work', () => {
    expect(shouldRevealLowerPriorityTriage(BASE)).toBe(true);
  });

  it('does NOT reveal when there is pre-existing Action/Follow-Up work (the gating prompt is meaningful)', () => {
    expect(shouldRevealLowerPriorityTriage({ ...BASE, hasExistingWork: true })).toBe(false);
  });

  it('does NOT reveal until the existing-work snapshot has resolved', () => {
    expect(shouldRevealLowerPriorityTriage({ ...BASE, isGateResolved: false })).toBe(false);
  });

  it('does NOT reveal outside Triage', () => {
    expect(shouldRevealLowerPriorityTriage({ ...BASE, isTriage: false })).toBe(false);
  });

  it('does NOT reveal again once it has already fired this session (latch)', () => {
    expect(shouldRevealLowerPriorityTriage({ ...BASE, alreadyRevealed: true })).toBe(false);
  });

  it('does NOT reveal for a manually chosen bounded bucket (not the guided High floor)', () => {
    expect(
      shouldRevealLowerPriorityTriage({
        ...BASE,
        minPriority: MEDIUM_PRIORITY_THRESHOLD,
        maxPriority: HIGH_PRIORITY_THRESHOLD,
      })
    ).toBe(false);
  });

  it('does NOT reveal while High-and-above still has emails to triage', () => {
    expect(
      shouldRevealLowerPriorityTriage({
        ...BASE,
        priorityCounts: { veryHigh: 1, high: 2, medium: 4, low: 0, veryLow: 0 },
      })
    ).toBe(false);
  });

  it('does NOT reveal when there are no lower-priority threads to show', () => {
    expect(
      shouldRevealLowerPriorityTriage({
        ...BASE,
        priorityCounts: { veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 },
      })
    ).toBe(false);
  });

  it('does NOT reveal while priority counts are still loading', () => {
    expect(shouldRevealLowerPriorityTriage({ ...BASE, priorityCounts: null })).toBe(false);
  });
});
