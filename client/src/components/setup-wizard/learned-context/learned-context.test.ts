import {
  groupLearnedContext,
  isLearnedContextItemList,
  joinContextValue,
  LEARNED_GROUP_CATEGORIES,
  LEARNED_GROUP_IMPORTANT,
  LEARNED_GROUP_PROJECTS,
  splitContextValue,
} from './learned-context';

describe('splitContextValue / joinContextValue', () => {
  it('splits a category into an editable name and a preserved description', () => {
    const parts = splitContextValue({
      contextKey: 'EMAIL_CATEGORY',
      contextValue: '📰 Newsletters - Marketing digests - and news',
    });
    expect(parts).toEqual({ label: '📰 Newsletters', detail: 'Marketing digests - and news' });
    expect(joinContextValue('📰 Reading', parts.detail)).toBe('📰 Reading - Marketing digests - and news');
  });

  it('keeps non-category values whole, even if they contain the delimiter', () => {
    expect(splitContextValue({ contextKey: 'WORKING_ON', contextValue: 'Q3 - launch' })).toEqual({
      label: 'Q3 - launch',
      detail: null,
    });
    expect(joinContextValue('  Website relaunch ', null)).toBe('Website relaunch');
  });
});

describe('groupLearnedContext', () => {
  it('buckets keys into the three onboarding groups, ignoring unrelated keys', () => {
    const grouped = groupLearnedContext([
      { contextId: '1', contextKey: 'VIP_CONTACT', contextValue: 'Sarah' },
      { contextId: '2', contextKey: 'MY_GOALS', contextValue: 'Ship v2' },
      { contextId: '3', contextKey: 'URGENT', contextValue: 'Sentry alerts' },
      { contextId: '4', contextKey: 'WORKING_ON', contextValue: 'Relaunch' },
      { contextId: '5', contextKey: 'EMAIL_CATEGORY', contextValue: 'Invoices' },
      { contextId: '6', contextKey: 'Q_AND_A', contextValue: 'Pricing?' },
    ]);

    // Goals first, then VIPs, then urgent topics.
    expect(grouped[LEARNED_GROUP_IMPORTANT].map(item => item.contextId)).toEqual(['2', '1', '3']);
    expect(grouped[LEARNED_GROUP_PROJECTS].map(item => item.contextId)).toEqual(['4']);
    expect(grouped[LEARNED_GROUP_CATEGORIES].map(item => item.contextId)).toEqual(['5']);
  });
});

describe('isLearnedContextItemList', () => {
  it('rejects payloads that are not a list of context rows', () => {
    expect(isLearnedContextItemList([{ contextId: 'a', contextKey: 'MY_GOALS', contextValue: 'x' }])).toBe(true);
    expect(isLearnedContextItemList({ prioritizedCount: 1 })).toBe(false);
    expect(isLearnedContextItemList([{ contextId: 1 }])).toBe(false);
  });
});
