import { CATEGORY_PAGE_SIZE, INBOX_FETCH_LIMIT } from 'constants/numbers';

import { chunkKeys, planCategoryRefresh, refreshLimitFor } from './categoryRefresh';

describe('planCategoryRefresh', () => {
  it('refetches only open categories and marks collapsed ones stale', () => {
    const plan = planCategoryRefresh({
      loadedKeys: ['a', 'b', 'c', 'd'],
      loadingKeys: [],
      expandedKeys: ['b', 'd', 'not-loaded'],
    });
    expect(plan).toEqual({ refreshKeys: ['b', 'd'], staleKeys: ['a', 'c'] });
  });

  it('leaves categories with a fetch already in flight alone (expand vs poll race)', () => {
    const plan = planCategoryRefresh({ loadedKeys: ['a', 'b'], loadingKeys: ['a', 'b'], expandedKeys: ['a'] });
    expect(plan).toEqual({ refreshKeys: [], staleKeys: [] });
  });
});

describe('chunkKeys', () => {
  it('splits keys into groups no larger than the batch cap', () => {
    expect(chunkKeys(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(chunkKeys([], 2)).toEqual([]);
  });
});

describe('refreshLimitFor', () => {
  it('asks for one page when nothing beyond the first page is loaded', () => {
    expect(refreshLimitFor(['a'], new Map([['a', 3]]))).toBe(CATEGORY_PAGE_SIZE);
    expect(refreshLimitFor(['a'], new Map())).toBe(CATEGORY_PAGE_SIZE);
  });

  it('covers the longest paged-in category in whole pages so a refresh never truncates it', () => {
    const rowCounts = new Map([
      ['a', CATEGORY_PAGE_SIZE + 1],
      ['b', 2],
    ]);
    expect(refreshLimitFor(['a', 'b'], rowCounts)).toBe(CATEGORY_PAGE_SIZE * 2);
  });

  it('never exceeds the inbox-wide fetch cap', () => {
    expect(refreshLimitFor(['a'], new Map([['a', INBOX_FETCH_LIMIT * 2]]))).toBe(INBOX_FETCH_LIMIT);
  });
});
