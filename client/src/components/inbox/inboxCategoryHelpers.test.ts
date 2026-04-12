import { Email, InboxMode } from 'types/email';

import { groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { CategoryGroup } from 'components/inbox/CategoryAccordion';
import { CategorySummaryItem } from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

import { buildDisplayCategories, buildEmailCategoryMap, buildOtherProtoGroups } from './inboxCategoryHelpers';

jest.mock('components/inbox/CategoryAccordion', () => ({
  groupEmailsByCategory: jest.fn(),
}));

jest.mock('hooks/useEmailFetching', () => ({
  getCategoryKey: (id: string | null | undefined) => id ?? 'uncategorized',
}));

const mockGroupEmailsByCategory = groupEmailsByCategory as jest.MockedFunction<typeof groupEmailsByCategory>;

const MODE: InboxMode = 'action';
const CATEGORY_OTHER = 'Other';
const PROTO_NEWSLETTERS = 'Newsletters';
const PROTO_RECEIPTS = 'Receipts';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    subject: 'Test',
    from: 'sender@example.com',
    to: [],
    cc: [],
    bcc: [],
    body: '',
    snippet: '',
    date: new Date().toISOString(),
    category: 'Action Required',
    category_id: null,
    protoCategoryName: null,
    isRead: false,
    isStarred: false,
    phishingConfidence: null,
    priorityScore: 50,
    ...overrides,
  } as Email;
}

function makeGroup(category: string, emails: Email[]): CategoryGroup {
  return { category, emails } as CategoryGroup;
}

describe('buildEmailCategoryMap', () => {
  beforeEach(() => {
    mockGroupEmailsByCategory.mockReset();
  });

  it('returns an empty map when groupEmailsByCategory returns no groups', () => {
    mockGroupEmailsByCategory.mockReturnValue([]);
    const result = buildEmailCategoryMap([], MODE, null);
    expect(result.size).toBe(0);
  });

  it('keys each group by its category string', () => {
    const emails = [makeEmail()];
    const group = makeGroup('action-uuid', emails);
    mockGroupEmailsByCategory.mockReturnValue([group]);

    const result = buildEmailCategoryMap(emails, MODE, null);
    expect(result.has('action-uuid')).toBe(true);
    expect(result.get('action-uuid')).toBe(group);
  });

  it('handles multiple groups correctly', () => {
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const groupA = makeGroup('uuid-a', [emailA]);
    const groupB = makeGroup('uuid-b', [emailB]);
    mockGroupEmailsByCategory.mockReturnValue([groupA, groupB]);

    const result = buildEmailCategoryMap([emailA, emailB], MODE, null);
    expect(result.size).toBe(2);
    expect(result.get('uuid-a')).toBe(groupA);
    expect(result.get('uuid-b')).toBe(groupB);
  });

  it('ignores the _categorySummary argument (it is unused)', () => {
    const summary: CategorySummaryItem[] = [{ id: 'x', name: 'X', count: 1 }];
    mockGroupEmailsByCategory.mockReturnValue([]);
    const result = buildEmailCategoryMap([], MODE, summary);
    expect(result.size).toBe(0);
  });
});

// After fix #1294: groupEmailsByCategory() now uses getCategoryKey(), so
// "Other" emails (category_id === null) are stored under key "uncategorized"
// not "Other". buildOtherProtoGroups() reads from that same key.
// CATEGORY_KEY_UNCATEGORIZED is imported from inboxDataSlice above.

describe('buildOtherProtoGroups', () => {
  it('returns an empty array when there are no Other emails', () => {
    const map = new Map<string, CategoryGroup>();
    expect(buildOtherProtoGroups(map)).toEqual([]);
  });

  it('returns an empty array when uncategorized bucket exists but has no protoCategory emails', () => {
    const emailWithoutProto = makeEmail({ protoCategoryName: null });
    const map = new Map<string, CategoryGroup>([
      [CATEGORY_KEY_UNCATEGORIZED, makeGroup(CATEGORY_OTHER, [emailWithoutProto])],
    ]);
    expect(buildOtherProtoGroups(map)).toEqual([]);
  });

  it('groups uncategorized emails by protoCategoryName', () => {
    const emailA = makeEmail({ id: 'a', protoCategoryName: PROTO_NEWSLETTERS });
    const emailB = makeEmail({ id: 'b', protoCategoryName: PROTO_RECEIPTS });
    const map = new Map<string, CategoryGroup>([
      [CATEGORY_KEY_UNCATEGORIZED, makeGroup(CATEGORY_OTHER, [emailA, emailB])],
    ]);

    const result = buildOtherProtoGroups(map);
    expect(result).toHaveLength(2);

    const newsletters = result.find(group => group.name === PROTO_NEWSLETTERS);
    expect(newsletters?.emails).toEqual([emailA]);

    const receipts = result.find(group => group.name === PROTO_RECEIPTS);
    expect(receipts?.emails).toEqual([emailB]);
  });

  it('accumulates multiple emails under the same protoCategoryName', () => {
    const emailA = makeEmail({ id: 'a', protoCategoryName: PROTO_NEWSLETTERS });
    const emailB = makeEmail({ id: 'b', protoCategoryName: PROTO_NEWSLETTERS });
    const map = new Map<string, CategoryGroup>([
      [CATEGORY_KEY_UNCATEGORIZED, makeGroup(CATEGORY_OTHER, [emailA, emailB])],
    ]);

    const result = buildOtherProtoGroups(map);
    expect(result).toHaveLength(1);
    expect(result[0].emails).toHaveLength(2);
  });

  it('skips emails with a null protoCategoryName', () => {
    const emailWithProto = makeEmail({ id: 'a', protoCategoryName: PROTO_NEWSLETTERS });
    const emailWithoutProto = makeEmail({ id: 'b', protoCategoryName: null });
    const map = new Map<string, CategoryGroup>([
      [CATEGORY_KEY_UNCATEGORIZED, makeGroup(CATEGORY_OTHER, [emailWithProto, emailWithoutProto])],
    ]);

    const result = buildOtherProtoGroups(map);
    expect(result).toHaveLength(1);
    expect(result[0].emails).toHaveLength(1);
  });
});

describe('buildDisplayCategories', () => {
  beforeEach(() => {
    mockGroupEmailsByCategory.mockReset();
  });

  it('returns an empty array when summaryCategories is an empty array', () => {
    const result = buildDisplayCategories([], [], [], MODE);
    expect(result).toEqual([]);
  });

  it('falls back to groupEmailsByCategory when summaryCategories is null', () => {
    const emails = [makeEmail()];
    mockGroupEmailsByCategory.mockReturnValue([makeGroup('action-uuid', emails)]);

    const result = buildDisplayCategories(null, emails, [], MODE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('action-uuid');
    expect(result[0].count).toBe(1);
  });

  it('filters out categories with a count of 0 from summaryCategories', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'a', name: 'Alpha', count: 5 },
      { id: 'b', name: 'Beta', count: 0 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alpha');
  });

  it('returns categories in their original order when stableCategoryOrder is empty', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'b', name: 'Beta', count: 1 },
      { id: 'a', name: 'Alpha', count: 2 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result.map(cat => cat.name)).toEqual(['Beta', 'Alpha']);
  });

  it('sorts categories by the stable order when provided', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'b', name: 'Beta', count: 1 },
      { id: 'a', name: 'Alpha', count: 2 },
    ];
    // stableCategoryOrder uses getCategoryKey which returns id ?? "uncategorized"
    const result = buildDisplayCategories(summary, [], ['a', 'b'], MODE);
    expect(result.map(cat => cat.name)).toEqual(['Alpha', 'Beta']);
  });

  it('places categories not in stableCategoryOrder at the end', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'b', name: 'Beta', count: 1 },
      { id: 'a', name: 'Alpha', count: 2 },
      { id: 'z', name: 'Zeta', count: 3 },
    ];
    const result = buildDisplayCategories(summary, [], ['a', 'b'], MODE);
    expect(result[result.length - 1].name).toBe('Zeta');
  });

  it('uses "uncategorized" as the key for categories with null id', () => {
    const summary: CategorySummaryItem[] = [
      { id: null, name: 'Other', count: 2 },
      { id: 'uuid-action', name: 'Action', count: 1 },
    ];
    // getCategoryKey(null, 'Other') → 'uncategorized'; getCategoryKey('uuid-action', 'Action') → 'uuid-action'
    const result = buildDisplayCategories(summary, [], ['uuid-action', 'uncategorized'], MODE);
    expect(result[0].name).toBe('Action');
    expect(result[1].name).toBe('Other');
  });

  // Fix #1258 — duplicate category name merging
  it('merges duplicate category names, combining counts and keeping first UUID', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'uuid-a', name: 'Build errors', count: 1 },
      { id: 'uuid-b', name: 'Build errors', count: 2 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Build errors');
    expect(result[0].count).toBe(3);
    // First-seen UUID is kept as canonical
    expect(result[0].id).toBe('uuid-a');
  });

  it('merges three entries with the same name into one', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'uuid-1', name: 'Newsletters', count: 1 },
      { id: 'uuid-2', name: 'Newsletters', count: 3 },
      { id: 'uuid-3', name: 'Newsletters', count: 2 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(6);
    expect(result[0].id).toBe('uuid-1');
  });

  it('does not merge entries with different names', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'uuid-a', name: 'Alpha', count: 2 },
      { id: 'uuid-b', name: 'Beta', count: 3 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(2);
  });

  it('filters zero-count merged entries (both had count 0)', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'uuid-a', name: 'Ghost', count: 0 },
      { id: 'uuid-b', name: 'Ghost', count: 0 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(0);
  });

  it('keeps merged entry when at least one duplicate has a non-zero count', () => {
    const summary: CategorySummaryItem[] = [
      { id: 'uuid-a', name: 'Partially empty', count: 0 },
      { id: 'uuid-b', name: 'Partially empty', count: 5 },
    ];
    const result = buildDisplayCategories(summary, [], [], MODE);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(5);
  });
});
