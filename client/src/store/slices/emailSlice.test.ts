/**
 * Tests for the split inbox slices (inboxDataSlice + inboxUISlice).
 * This file was previously testing a single emailSlice; it now tests both slices
 * and the cross-slice selectVisibleEmails selector.
 */
import { Email } from 'types/email';

import { selectAnimatingOut, selectVisibleEmails } from 'store/selectors/emailSelectors';
import { RootState } from 'store/store';

import inboxDataReducer, { InboxDataState, removeEmail, updateCategoryEmails } from './inboxDataSlice';
import inboxUIReducer, {
  addAnimatingOut,
  addOptimisticArchive,
  InboxUIState,
  removeAnimatingOut,
} from './inboxUISlice';

const makeEmail = (id: string, category?: string | null): Email =>
  ({
    id,
    threadId: `thread-${id}`,
    subject: `Subject ${id}`,
    from: 'sender@example.com',
    to: 'me@example.com',
    body: '',
    isRead: false,
    isArchived: false,
    starCount: 0,
    receivedAt: new Date().toISOString(),
    category: category !== undefined ? category : null,
    category_id: category !== undefined ? category : null,
  }) as unknown as Email;

const baseDataState: InboxDataState = {
  emails: [makeEmail('1'), makeEmail('2'), makeEmail('3')],
  hasMore: false,
  totalCount: 0,
  currentOffset: 0,
  categorySummary: null,
  loadedCategoryNames: [],
  loadingCategoryNames: [],
  exhaustedCategoryNames: [],
  lastFetchedAt: null,
};

const baseUIState: InboxUIState = {
  optimisticallyArchived: [],
  optimisticallySnoozed: [],
  animatingOut: [],
  loading: false,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  summaryLoading: false,
  fetchError: null,
};

/** Build a RootState-like object for use with selectors */
const makeState = (dataOverrides: Partial<InboxDataState> = {}, uiOverrides: Partial<InboxUIState> = {}) => ({
  inboxData: { ...baseDataState, ...dataOverrides },
  inboxUI: { ...baseUIState, ...uiOverrides },
});

describe('inboxUISlice – animation reducers', () => {
  describe('addAnimatingOut', () => {
    it('adds an item to animatingOut', () => {
      const state = inboxUIReducer(baseUIState, addAnimatingOut({ id: '1', type: 'archive' }));
      expect(state.animatingOut).toEqual([{ id: '1', type: 'archive' }]);
    });

    it('does not add duplicate entries for the same email id', () => {
      let state = inboxUIReducer(baseUIState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = inboxUIReducer(state, addAnimatingOut({ id: '1', type: 'archive' }));
      expect(state.animatingOut).toHaveLength(1);
    });

    it('supports both archive and priority types', () => {
      let state = inboxUIReducer(baseUIState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = inboxUIReducer(state, addAnimatingOut({ id: '2', type: 'priority' }));
      expect(state.animatingOut).toHaveLength(2);
      expect(state.animatingOut.find(i => i.id === '1')?.type).toBe('archive');
      expect(state.animatingOut.find(i => i.id === '2')?.type).toBe('priority');
    });
  });

  describe('removeAnimatingOut', () => {
    it('removes an item from animatingOut by id', () => {
      const withAnim = inboxUIReducer(baseUIState, addAnimatingOut({ id: '1', type: 'archive' }));
      const state = inboxUIReducer(withAnim, removeAnimatingOut('1'));
      expect(state.animatingOut).toEqual([]);
    });

    it('is a no-op when the id is not present', () => {
      const state = inboxUIReducer(baseUIState, removeAnimatingOut('nonexistent'));
      expect(state.animatingOut).toEqual([]);
    });

    it('only removes the matching id', () => {
      let state = inboxUIReducer(baseUIState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = inboxUIReducer(state, addAnimatingOut({ id: '2', type: 'priority' }));
      state = inboxUIReducer(state, removeAnimatingOut('1'));
      expect(state.animatingOut).toEqual([{ id: '2', type: 'priority' }]);
    });
  });
});

describe('selectVisibleEmails – animatingOut integration', () => {
  it('hides emails that are optimistically archived when not animating', () => {
    const state = makeState({}, { optimisticallyArchived: ['1'] });
    const visible = selectVisibleEmails(state as unknown as RootState);
    expect(visible.map(event => event.id)).not.toContain('1');
    expect(visible.map(event => event.id)).toEqual(expect.arrayContaining(['2', '3']));
  });

  it('keeps animating-out emails visible even when they are optimistically archived', () => {
    // This is the key invariant for the archive animation:
    // the email must remain in the DOM while flying out, even though it's already
    // in the optimisticallyArchived set (to prevent it from re-appearing on fetch).
    const state = makeState(
      {},
      {
        optimisticallyArchived: ['1'],
        animatingOut: [{ id: '1', type: 'archive' as const }],
      }
    );
    const visible = selectVisibleEmails(state as unknown as RootState);
    expect(visible.map(event => event.id)).toContain('1');
  });

  it('removes animating-out email from visible list once removeEmail is dispatched', () => {
    let dataState: InboxDataState = baseDataState;
    let uiState: InboxUIState = baseUIState;

    // Simulate: addOptimisticArchive + addAnimatingOut
    uiState = inboxUIReducer(uiState, addOptimisticArchive('1'));
    uiState = inboxUIReducer(uiState, addAnimatingOut({ id: '1', type: 'archive' }));

    const duringAnimation = selectVisibleEmails(makeState(dataState, uiState) as unknown as RootState);
    expect(duringAnimation.map(event => event.id)).toContain('1');

    // Simulate: animation completes → removeEmail + removeAnimatingOut
    dataState = inboxDataReducer(dataState, removeEmail('1'));
    uiState = inboxUIReducer(uiState, removeAnimatingOut('1'));

    const afterAnimation = selectVisibleEmails(makeState(dataState, uiState) as unknown as RootState);
    expect(afterAnimation.map(event => event.id)).not.toContain('1');
  });
});

describe('selectAnimatingOut', () => {
  it('returns empty array when nothing is animating', () => {
    const state = makeState();
    expect(selectAnimatingOut(state as unknown as RootState)).toEqual([]);
  });

  it('returns the current animating items', () => {
    const uiState = inboxUIReducer(baseUIState, addAnimatingOut({ id: '2', type: 'priority' }));
    const state = makeState({}, uiState);
    expect(selectAnimatingOut(state as unknown as RootState)).toEqual([{ id: '2', type: 'priority' }]);
  });
});

describe('updateCategoryEmails', () => {
  const stateWithCategories: InboxDataState = {
    ...baseDataState,
    emails: [
      makeEmail('1', 'Work'),
      makeEmail('2', 'Personal'),
      makeEmail('3', 'Work'),
      makeEmail('4', null), // null category → shown as "Other"
      makeEmail('5', 'Other'), // explicitly "Other"
      makeEmail('6', ''), // empty string → shown as "Other"
    ],
  };

  it('replaces emails for a named category without affecting other categories', () => {
    const freshWorkEmails = [makeEmail('7', 'Work'), makeEmail('8', 'Work')];
    const state = inboxDataReducer(
      stateWithCategories,
      updateCategoryEmails({ categoryKey: 'Work', emails: freshWorkEmails })
    );
    const ids = state.emails.map(event => event.id);
    // Old Work emails (1, 3) should be gone
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('3');
    // New Work emails should be present
    expect(ids).toContain('7');
    expect(ids).toContain('8');
    // Other categories untouched
    expect(ids).toContain('2'); // Personal
    expect(ids).toContain('4'); // null → Other
    expect(ids).toContain('5'); // "Other"
    expect(ids).toContain('6'); // "" → Other
  });

  it('replaces uncategorized bucket (null/empty category_id) using "uncategorized" key', () => {
    // UUID-only: the "uncategorized" bucket is keyed by CATEGORY_KEY_UNCATEGORIZED,
    // never by the name string "Other". Only emails with null/empty category_id match.
    const freshUncategorizedEmails = [makeEmail('9', null), makeEmail('10', null)];
    const state = inboxDataReducer(
      stateWithCategories,
      updateCategoryEmails({ categoryKey: 'uncategorized', emails: freshUncategorizedEmails })
    );
    const ids = state.emails.map(event => event.id);
    // Old null/empty-category_id emails (4, 6) should be gone
    expect(ids).not.toContain('4'); // category_id: null
    expect(ids).not.toContain('6'); // category_id: '' (empty string → falsy)
    // Email 5 has category_id: 'Other' (a string UUID) — NOT uncategorized under UUID-only rules
    expect(ids).toContain('5');
    // New uncategorized emails should be present
    expect(ids).toContain('9');
    expect(ids).toContain('10');
    // Named categories untouched
    expect(ids).toContain('1'); // Work
    expect(ids).toContain('2'); // Personal
    expect(ids).toContain('3'); // Work
  });

  it('deduplicates emails that already exist in other categories', () => {
    // Simulate a race where an email already in the flat list comes back in an update
    const emailAlreadyPresent = makeEmail('2', 'Work'); // id '2' exists as 'Personal'
    const state = inboxDataReducer(
      stateWithCategories,
      updateCategoryEmails({ categoryKey: 'Work', emails: [emailAlreadyPresent] })
    );
    const ids = state.emails.map(event => event.id);
    // Should only appear once
    expect(ids.filter(id => id === '2')).toHaveLength(1);
  });

  it('handles an empty replacement (all emails in category removed)', () => {
    const state = inboxDataReducer(stateWithCategories, updateCategoryEmails({ categoryKey: 'Work', emails: [] }));
    const ids = state.emails.map(event => event.id);
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('3');
    // Other categories intact
    expect(ids).toContain('2');
    expect(ids).toContain('4');
    expect(ids).toContain('5');
    expect(ids).toContain('6');
  });

  it('uses email.category_id when present, not categoryKey', () => {
    // Fix #1114: the server stamps a UUID on each email as category_id.
    // updateCategoryEmails must preserve that server-supplied UUID rather than
    // overwriting it with the categoryKey string.
    const serverUUID = 'uuid-server-1234';
    const emailWithCategoryId = {
      ...makeEmail('20', 'Work'),
      category_id: serverUUID,
    } as unknown as Email;

    const state = inboxDataReducer(
      { ...baseDataState, emails: [] },
      updateCategoryEmails({ categoryKey: 'Work', emails: [emailWithCategoryId] })
    );

    const stored = state.emails.find(email => email.id === '20');
    expect(stored).toBeDefined();
    // Server-supplied category_id must be preserved
    expect(stored!.category_id).toBe(serverUUID);
    // Must NOT be overwritten with the categoryKey
    expect(stored!.category_id).not.toBe('Work');
  });

  it('falls back to categoryKey when email.category_id is null', () => {
    // When the server does not supply a category_id (null), the reducer must
    // fall back to stamping the categoryKey so downstream selectors can group correctly.
    const emailWithNullCategoryId = {
      ...makeEmail('21', 'Work'),
      category_id: null,
    } as unknown as Email;

    const state = inboxDataReducer(
      { ...baseDataState, emails: [] },
      updateCategoryEmails({ categoryKey: 'Work', emails: [emailWithNullCategoryId] })
    );

    const stored = state.emails.find(email => email.id === '21');
    expect(stored).toBeDefined();
    // Falls back to categoryKey when category_id is null
    expect(stored!.category_id).toBe('Work');
  });

  it('falls back to categoryKey when email.category_id is undefined', () => {
    // Same as null — undefined should also trigger the fallback.
    const emailWithUndefinedCategoryId = {
      ...makeEmail('22', 'Work'),
      category_id: undefined,
    } as unknown as Email;

    const state = inboxDataReducer(
      { ...baseDataState, emails: [] },
      updateCategoryEmails({ categoryKey: 'Work', emails: [emailWithUndefinedCategoryId] })
    );

    const stored = state.emails.find(email => email.id === '22');
    expect(stored).toBeDefined();
    expect(stored!.category_id).toBe('Work');
  });
});
