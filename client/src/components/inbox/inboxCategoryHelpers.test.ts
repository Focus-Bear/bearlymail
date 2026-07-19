import { Email, InboxMode } from 'types/email';

import { groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { CategoryGroup } from 'components/inbox/CategoryAccordion';
import { CategorySummaryItem } from 'store/slices/emailSlice';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

import {
  buildDisplayCategories,
  buildEmailCategoryMap,
  buildOtherProtoGroups,
  getDisplayOrderedEmails,
  navigateAfterSplitViewAction,
  pickNextEmailAfterRemoval,
} from './inboxCategoryHelpers';

vi.mock('components/inbox/CategoryAccordion', () => ({
  groupEmailsByCategory: vi.fn(),
}));

vi.mock('hooks/useEmailFetching', () => ({
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

describe('getDisplayOrderedEmails', () => {
  beforeEach(() => {
    mockGroupEmailsByCategory.mockReset();
  });

  it('returns an empty array when there are no emails', () => {
    mockGroupEmailsByCategory.mockReturnValue([]);
    expect(getDisplayOrderedEmails([], MODE)).toEqual([]);
  });

  it('returns emails in group order (groups then within-group)', () => {
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });
    // Simulate two groups: first group has [A, B], second group has [C]
    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('cat-1', [emailA, emailB]),
      makeGroup('cat-2', [emailC]),
    ]);

    const result = getDisplayOrderedEmails([emailA, emailB, emailC], MODE);
    expect(result.map(email => email.id)).toEqual(['a', 'b', 'c']);
  });

  it('flattens multiple groups into a single ordered array', () => {
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });
    // Groups in reverse order compared to flat list
    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('cat-x', [emailC]),
      makeGroup('cat-y', [emailA, emailB]),
    ]);

    const result = getDisplayOrderedEmails([emailA, emailB, emailC], MODE);
    expect(result.map(email => email.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('navigateAfterSplitViewAction', () => {
  beforeEach(() => {
    mockGroupEmailsByCategory.mockReset();
  });

  function makeSplitView() {
    return {
      openEmail: vi.fn(),
      closeEmail: vi.fn(),
    };
  }

  it('closes the split view when no remaining emails', () => {
    const email = makeEmail({ id: 'only' });
    // groupEmailsByCategory is called once with [email]; remaining = [] after filtering
    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [email])]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('only', [email], MODE, splitView, setIndex);

    expect(splitView.closeEmail).toHaveBeenCalled();
    expect(splitView.openEmail).not.toHaveBeenCalled();
    expect(setIndex).not.toHaveBeenCalled();
  });

  it('navigates to the email at the same display position as the removed email', () => {
    // Display order: A(0), B(1), C(2) — user archives B
    // After removal: remaining = [A, C]; nextDisplayIndex = min(1, 1) = 1 → C
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });

    // One call with all three emails (including the removed one, to find its position)
    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [emailA, emailB, emailC])]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('b', [emailA, emailB, emailC], MODE, splitView, setIndex);

    // B was at display index 1; remaining = [A, C]; index 1 = C
    expect(splitView.openEmail).toHaveBeenCalledWith('c');
    expect(setIndex).toHaveBeenCalledWith(1);
  });

  it('navigates to the last email when the removed email was at the end', () => {
    // Display order: A(0), B(1), C(2) — user archives C
    // After removal: remaining = [A, B]; nextDisplayIndex = min(2, 1) = 1 → B
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });

    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [emailA, emailB, emailC])]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('c', [emailA, emailB, emailC], MODE, splitView, setIndex);

    // C was at display index 2; remaining = [A, B]; clamped to index 1 → B
    expect(splitView.openEmail).toHaveBeenCalledWith('b');
    expect(setIndex).toHaveBeenCalledWith(1);
  });

  it('navigates to index 0 when the first email is removed', () => {
    // Display order: A(0), B(1) — user archives A
    // After removal: remaining = [B]; nextDisplayIndex = min(0, 0) = 0 → B
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });

    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [emailA, emailB])]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('a', [emailA, emailB], MODE, splitView, setIndex);

    expect(splitView.openEmail).toHaveBeenCalledWith('b');
    expect(setIndex).toHaveBeenCalledWith(0);
  });

  it('includes an already-archived removed email to correctly determine its position', () => {
    // Simulate the removed email already having isArchived=true (optimistic update)
    // navigateAfterSplitViewAction re-includes it via `|| email.id === removedEmailId`
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b', isArchived: true }); // already archived
    const emailC = makeEmail({ id: 'c' });

    // groupEmailsByCategory is called with [A, B, C] (B re-included despite isArchived)
    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [emailA, emailB, emailC])]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('b', [emailA, emailB, emailC], MODE, splitView, setIndex);

    // B is at index 1; remaining = [A, C]; index 1 = C
    expect(splitView.openEmail).toHaveBeenCalledWith('c');
    expect(setIndex).toHaveBeenCalledWith(1);
  });

  it('stays within the same drawer when other emails remain in the removed email\'s category', () => {
    // Two categories: cat-1=[A, B], cat-2=[C, D] — display order: A(0), B(1), C(2), D(3)
    // User archives B. cat-1 still has A, so navigation stays in cat-1 → A.
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });
    const emailD = makeEmail({ id: 'd' });

    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('cat-1', [emailA, emailB]),
      makeGroup('cat-2', [emailC, emailD]),
    ]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('b', [emailA, emailB, emailC, emailD], MODE, splitView, setIndex);

    // B's drawer (cat-1) still has A; stay in drawer. remaining=[A, C, D]; A's index = 0
    expect(splitView.openEmail).toHaveBeenCalledWith('a');
    expect(setIndex).toHaveBeenCalledWith(0);
  });

  it('falls back across category boundaries when the removed email is the only one in its drawer', () => {
    // Three categories: cat-1=[A], cat-2=[B], cat-3=[C, D] — display order: A(0), B(1), C(2), D(3)
    // User archives B; cat-2 becomes empty, fall back to flat order. removedDisplayIndex(B)=1.
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });
    const emailD = makeEmail({ id: 'd' });

    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('cat-1', [emailA]),
      makeGroup('cat-2', [emailB]),
      makeGroup('cat-3', [emailC, emailD]),
    ]);

    const splitView = makeSplitView();
    const setIndex = vi.fn();
    navigateAfterSplitViewAction('b', [emailA, emailB, emailC, emailD], MODE, splitView, setIndex);

    // cat-2 is empty; fall back: remaining=[A, C, D], index min(1, 2) = 1 → C
    expect(splitView.openEmail).toHaveBeenCalledWith('c');
    expect(setIndex).toHaveBeenCalledWith(1);
  });
});


describe('pickNextEmailAfterRemoval', () => {
  beforeEach(() => {
    mockGroupEmailsByCategory.mockReset();
  });

  it('returns null when nothing remains', () => {
    const email = makeEmail({ id: 'only' });
    mockGroupEmailsByCategory.mockReturnValue([makeGroup('cat', [email])]);

    expect(pickNextEmailAfterRemoval('only', [email], MODE)).toBeNull();
  });

  it('prefers the next email within the same drawer', () => {
    const emailA = makeEmail({ id: 'a' });
    const emailB = makeEmail({ id: 'b' });
    const emailC = makeEmail({ id: 'c' });
    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('work', [emailA, emailB]),
      makeGroup('news', [emailC]),
    ]);

    const picked = pickNextEmailAfterRemoval('a', [emailA, emailB, emailC], MODE);

    expect(picked?.nextEmailId).toBe('b');
  });

  it('never picks an email hidden in a collapsed drawer', () => {
    const emailA = makeEmail({ id: 'a' });
    const emailHidden = makeEmail({ id: 'hidden' });
    const emailVisible = makeEmail({ id: 'visible' });
    mockGroupEmailsByCategory.mockReturnValue([
      makeGroup('open-drawer', [emailA, emailVisible]),
      makeGroup('collapsed-drawer', [emailHidden]),
    ]);

    const picked = pickNextEmailAfterRemoval(
      'a',
      [emailA, emailHidden, emailVisible],
      MODE,
      new Set(['open-drawer'])
    );

    expect(picked?.nextEmailId).toBe('visible');
  });
});
