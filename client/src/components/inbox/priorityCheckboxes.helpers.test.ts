import {
  getCheckedBucketIndexes,
  PRIORITY_BUCKETS_HIGH_FIRST,
  togglePriorityBucket,
} from 'components/inbox/priorityCheckboxes.helpers';
import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

const VERY_HIGH = 0;
const HIGH = 1;
const MEDIUM = 2;
const LOW = 3;
const VERY_LOW = 4;
const ALL = { minPriority: null, maxPriority: null };
const GUIDED_HIGH_AND_ABOVE = { minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null };

describe('PRIORITY_BUCKETS_HIGH_FIRST', () => {
  it('puts top priority on the left and low priority on the right', () => {
    expect(PRIORITY_BUCKETS_HIGH_FIRST.map(bucket => bucket.label)).toEqual([
      'Very High',
      'High',
      'Medium',
      'Low',
      'Very Low',
    ]);
  });
});

describe('getCheckedBucketIndexes', () => {
  it('ticks every box when there is no priority filter', () => {
    expect(getCheckedBucketIndexes(ALL)).toEqual([VERY_HIGH, HIGH, MEDIUM, LOW, VERY_LOW]);
  });

  it('ticks High and Very High for the guided default', () => {
    expect(getCheckedBucketIndexes(GUIDED_HIGH_AND_ABOVE)).toEqual([VERY_HIGH, HIGH]);
  });
});

describe('togglePriorityBucket', () => {
  it('ticking Medium from the guided default extends the range down to Medium', () => {
    expect(togglePriorityBucket(GUIDED_HIGH_AND_ABOVE, MEDIUM)).toEqual({
      minPriority: MEDIUM_PRIORITY_THRESHOLD,
      maxPriority: null,
    });
  });

  it('ticking Very Low from the guided default reveals everything', () => {
    expect(togglePriorityBucket(GUIDED_HIGH_AND_ABOVE, VERY_LOW)).toEqual(ALL);
  });

  it('unticking Very High keeps the rest of the range', () => {
    expect(togglePriorityBucket(ALL, VERY_HIGH)).toEqual({ minPriority: null, maxPriority: 50 });
  });

  it('unticking a box in the middle keeps the higher-priority side', () => {
    expect(togglePriorityBucket(ALL, MEDIUM)).toEqual(GUIDED_HIGH_AND_ABOVE);
  });

  it('never unticks the last ticked box', () => {
    const highOnly = { minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: 50 };
    expect(togglePriorityBucket(highOnly, HIGH)).toEqual(highOnly);
  });
});
