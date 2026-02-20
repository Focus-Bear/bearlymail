import emailReducer, {
  addAnimatingOut,
  removeAnimatingOut,
  removeEmail,
  addOptimisticArchive,
} from './emailSlice';
import {
  selectAnimatingOut,
  selectVisibleEmails,
} from 'store/selectors/emailSelectors';
import { Email } from 'types/email';

const makeEmail = (id: string): Email =>
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
  } as unknown as Email);

const baseState = {
  emails: [makeEmail('1'), makeEmail('2'), makeEmail('3')],
  optimisticallyArchived: [] as string[],
  optimisticallySnoozed: [] as string[],
  animatingOut: [] as { id: string; type: 'archive' | 'priority' }[],
  loading: false,
  decrypting: false,
  refreshing: false,
  loadingModeSwitch: false,
  fetchError: null,
};

describe('emailSlice – animation reducers', () => {
  describe('addAnimatingOut', () => {
    it('adds an item to animatingOut', () => {
      const state = emailReducer(baseState, addAnimatingOut({ id: '1', type: 'archive' }));
      expect(state.animatingOut).toEqual([{ id: '1', type: 'archive' }]);
    });

    it('does not add duplicate entries for the same email id', () => {
      let state = emailReducer(baseState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = emailReducer(state, addAnimatingOut({ id: '1', type: 'archive' }));
      expect(state.animatingOut).toHaveLength(1);
    });

    it('supports both archive and priority types', () => {
      let state = emailReducer(baseState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = emailReducer(state, addAnimatingOut({ id: '2', type: 'priority' }));
      expect(state.animatingOut).toHaveLength(2);
      expect(state.animatingOut.find(i => i.id === '1')?.type).toBe('archive');
      expect(state.animatingOut.find(i => i.id === '2')?.type).toBe('priority');
    });
  });

  describe('removeAnimatingOut', () => {
    it('removes an item from animatingOut by id', () => {
      const withAnim = emailReducer(baseState, addAnimatingOut({ id: '1', type: 'archive' }));
      const state = emailReducer(withAnim, removeAnimatingOut('1'));
      expect(state.animatingOut).toEqual([]);
    });

    it('is a no-op when the id is not present', () => {
      const state = emailReducer(baseState, removeAnimatingOut('nonexistent'));
      expect(state.animatingOut).toEqual([]);
    });

    it('only removes the matching id', () => {
      let state = emailReducer(baseState, addAnimatingOut({ id: '1', type: 'archive' }));
      state = emailReducer(state, addAnimatingOut({ id: '2', type: 'priority' }));
      state = emailReducer(state, removeAnimatingOut('1'));
      expect(state.animatingOut).toEqual([{ id: '2', type: 'priority' }]);
    });
  });
});

describe('selectVisibleEmails – animatingOut integration', () => {
  it('hides emails that are optimistically archived when not animating', () => {
    const state = {
      email: {
        ...baseState,
        optimisticallyArchived: ['1'],
      },
    };
    const visible = selectVisibleEmails(state as any);
    expect(visible.map(e => e.id)).not.toContain('1');
    expect(visible.map(e => e.id)).toEqual(expect.arrayContaining(['2', '3']));
  });

  it('keeps animating-out emails visible even when they are optimistically archived', () => {
    // This is the key invariant for the archive animation:
    // the email must remain in the DOM while flying out, even though it's already
    // in the optimisticallyArchived set (to prevent it from re-appearing on fetch).
    const state = {
      email: {
        ...baseState,
        optimisticallyArchived: ['1'],
        animatingOut: [{ id: '1', type: 'archive' as const }],
      },
    };
    const visible = selectVisibleEmails(state as any);
    expect(visible.map(e => e.id)).toContain('1');
  });

  it('removes animating-out email from visible list once removeEmail is dispatched', () => {
    let emailState = baseState;
    // Simulate: addOptimisticArchive + addAnimatingOut
    emailState = emailReducer(emailState, addOptimisticArchive('1'));
    emailState = emailReducer(emailState, addAnimatingOut({ id: '1', type: 'archive' }));

    const duringAnimation = selectVisibleEmails({ email: emailState } as any);
    expect(duringAnimation.map(e => e.id)).toContain('1');

    // Simulate: animation completes → removeEmail + removeAnimatingOut
    emailState = emailReducer(emailState, removeEmail('1'));
    emailState = emailReducer(emailState, removeAnimatingOut('1'));

    const afterAnimation = selectVisibleEmails({ email: emailState } as any);
    expect(afterAnimation.map(e => e.id)).not.toContain('1');
  });
});

describe('selectAnimatingOut', () => {
  it('returns empty array when nothing is animating', () => {
    const state = { email: baseState };
    expect(selectAnimatingOut(state as any)).toEqual([]);
  });

  it('returns the current animating items', () => {
    const emailState = emailReducer(baseState, addAnimatingOut({ id: '2', type: 'priority' }));
    const state = { email: emailState };
    expect(selectAnimatingOut(state as any)).toEqual([{ id: '2', type: 'priority' }]);
  });
});
