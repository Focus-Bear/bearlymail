import { Email } from 'types/email';

import categoryReducer, {
  CategoryFetchState,
  CategorySliceState,
  fetchError,
  fetchStart,
  fetchSuccess,
  markExhausted,
  markStale,
  resetAll,
  resetCategory,
  selectAllCategoryStates,
  selectCategoryEmails,
  selectCategoryState,
  selectCategoryStatus,
  selectExhaustedCategoryKeys,
  selectLoadedCategoryKeys,
  selectLoadingCategoryKeys,
} from './categorySlice';

const emptyState: CategorySliceState = { categories: {} };

const mockEmail: Email = {
  id: 'email-1',
  threadId: 'thread-1',
  subject: 'Test Subject',
  from: 'test@example.com',
  isRead: false,
  isSnoozed: false,
  receivedAt: '2024-01-01T00:00:00Z',
  category: 'work',
};

const defaultCategoryState: CategoryFetchState = {
  status: 'idle',
  emails: [],
  fetchedAt: null,
  retryCount: 0,
  nextRetryAt: null,
  error: null,
  fetchStartedAt: null,
  budgetWarningFired: false,
};

// ─── Reducer tests ────────────────────────────────────────────────────────────

describe('categorySlice reducers', () => {
  describe('fetchStart', () => {
    it('sets status to loading on a new key', () => {
      const state = categoryReducer(emptyState, fetchStart('work'));
      expect(state.categories['work'].status).toBe('loading');
      expect(state.categories['work'].error).toBeNull();
    });

    it('preserves existing emails when transitioning to loading', () => {
      const preloaded: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'loaded', emails: [mockEmail], fetchedAt: 12345 },
        },
      };
      const state = categoryReducer(preloaded, fetchStart('work'));
      expect(state.categories['work'].status).toBe('loading');
      expect(state.categories['work'].emails).toEqual([mockEmail]);
    });

    it('clears error on retry', () => {
      const errored: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'error', error: 'some error', retryCount: 1, nextRetryAt: 9999 },
        },
      };
      const state = categoryReducer(errored, fetchStart('work'));
      expect(state.categories['work'].error).toBeNull();
    });
  });

  describe('fetchSuccess', () => {
    it('sets status to loaded with emails and fetchedAt', () => {
      const state = categoryReducer(emptyState, fetchSuccess({ key: 'work', emails: [mockEmail], fetchedAt: 99999 }));
      expect(state.categories['work'].status).toBe('loaded');
      expect(state.categories['work'].emails).toEqual([mockEmail]);
      expect(state.categories['work'].fetchedAt).toBe(99999);
    });

    it('resets retryCount and error on success', () => {
      const errored: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'error', retryCount: 3, error: 'failed', nextRetryAt: 1000 },
        },
      };
      const state = categoryReducer(errored, fetchSuccess({ key: 'work', emails: [], fetchedAt: 100 }));
      expect(state.categories['work'].retryCount).toBe(0);
      expect(state.categories['work'].error).toBeNull();
      expect(state.categories['work'].nextRetryAt).toBeNull();
    });
  });

  describe('fetchError', () => {
    it('sets status to error with error details', () => {
      const state = categoryReducer(
        emptyState,
        fetchError({ key: 'work', error: 'network fail', retryCount: 1, nextRetryAt: 5000 })
      );
      expect(state.categories['work'].status).toBe('error');
      expect(state.categories['work'].error).toBe('network fail');
      expect(state.categories['work'].retryCount).toBe(1);
      expect(state.categories['work'].nextRetryAt).toBe(5000);
    });

    it('preserves existing emails on error', () => {
      const loaded: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'loaded', emails: [mockEmail] },
        },
      };
      const state = categoryReducer(
        loaded,
        fetchError({ key: 'work', error: 'fail', retryCount: 1, nextRetryAt: 5000 })
      );
      expect(state.categories['work'].emails).toEqual([mockEmail]);
    });
  });

  describe('markExhausted', () => {
    it('sets status to exhausted', () => {
      const loaded: CategorySliceState = {
        categories: { work: { ...defaultCategoryState, status: 'loaded' } },
      };
      const state = categoryReducer(loaded, markExhausted('work'));
      expect(state.categories['work'].status).toBe('exhausted');
    });

    it('works on a new key (creates entry)', () => {
      const state = categoryReducer(emptyState, markExhausted('unknown'));
      expect(state.categories['unknown'].status).toBe('exhausted');
    });
  });

  describe('markStale', () => {
    it('transitions loaded → stale', () => {
      const loaded: CategorySliceState = {
        categories: { work: { ...defaultCategoryState, status: 'loaded' } },
      };
      const state = categoryReducer(loaded, markStale('work'));
      expect(state.categories['work'].status).toBe('stale');
    });

    it('does NOT transition non-loaded status to stale', () => {
      const loading: CategorySliceState = {
        categories: { work: { ...defaultCategoryState, status: 'loading' } },
      };
      const state = categoryReducer(loading, markStale('work'));
      expect(state.categories['work'].status).toBe('loading');
    });

    it('does not change idle status', () => {
      const state = categoryReducer(emptyState, markStale('work'));
      // new key created via DEFAULT_CATEGORY_STATE, stays idle
      expect(state.categories['work'].status).toBe('idle');
    });
  });

  describe('resetCategory', () => {
    it('resets a single category back to default', () => {
      const loaded: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'loaded', emails: [mockEmail], fetchedAt: 12345 },
          personal: { ...defaultCategoryState, status: 'loaded', emails: [mockEmail] },
        },
      };
      const state = categoryReducer(loaded, resetCategory('work'));
      expect(state.categories['work']).toEqual(defaultCategoryState);
      // personal untouched
      expect(state.categories['personal'].status).toBe('loaded');
    });
  });

  describe('resetAll', () => {
    it('clears all categories', () => {
      const withData: CategorySliceState = {
        categories: {
          work: { ...defaultCategoryState, status: 'loaded' },
          personal: { ...defaultCategoryState, status: 'loading' },
        },
      };
      const state = categoryReducer(withData, resetAll());
      expect(state.categories).toEqual({});
    });
  });
});

// ─── Selector tests ──────────────────────────────────────────────────────────

const makeRootState = (categories: Record<string, CategoryFetchState>) => ({
  category: { categories },
});

describe('categorySlice selectors', () => {
  describe('selectAllCategoryStates', () => {
    it('returns the categories record', () => {
      const categories = { work: { ...defaultCategoryState, status: 'loaded' as const } };
      expect(selectAllCategoryStates(makeRootState(categories))).toBe(categories);
    });
  });

  describe('selectCategoryState', () => {
    it('returns the state for a known key', () => {
      const categories = { work: { ...defaultCategoryState, status: 'loaded' as const } };
      expect(selectCategoryState('work')(makeRootState(categories)).status).toBe('loaded');
    });

    it('returns DEFAULT_CATEGORY_STATE for unknown key', () => {
      expect(selectCategoryState('missing')(makeRootState({}))).toEqual(defaultCategoryState);
    });
  });

  describe('selectCategoryStatus', () => {
    it('returns the status for a known key', () => {
      const categories = { work: { ...defaultCategoryState, status: 'loading' as const } };
      expect(selectCategoryStatus('work')(makeRootState(categories))).toBe('loading');
    });

    it('returns idle for unknown key', () => {
      expect(selectCategoryStatus('missing')(makeRootState({}))).toBe('idle');
    });
  });

  describe('selectCategoryEmails', () => {
    it('returns emails for a known key', () => {
      const categories = { work: { ...defaultCategoryState, emails: [mockEmail] } };
      expect(selectCategoryEmails('work')(makeRootState(categories))).toEqual([mockEmail]);
    });

    it('returns empty array for unknown key', () => {
      expect(selectCategoryEmails('missing')(makeRootState({}))).toEqual([]);
    });
  });

  describe('selectLoadedCategoryKeys', () => {
    it('includes loaded and stale keys', () => {
      const categories = {
        work: { ...defaultCategoryState, status: 'loaded' as const },
        personal: { ...defaultCategoryState, status: 'stale' as const },
        other: { ...defaultCategoryState, status: 'loading' as const },
      };
      const keys = selectLoadedCategoryKeys(makeRootState(categories));
      expect(keys).toContain('work');
      expect(keys).toContain('personal');
      expect(keys).not.toContain('other');
    });
  });

  describe('selectLoadingCategoryKeys', () => {
    it('includes only loading keys', () => {
      const categories = {
        work: { ...defaultCategoryState, status: 'loading' as const },
        personal: { ...defaultCategoryState, status: 'loaded' as const },
      };
      const keys = selectLoadingCategoryKeys(makeRootState(categories));
      expect(keys).toEqual(['work']);
    });
  });

  describe('selectExhaustedCategoryKeys', () => {
    it('includes only exhausted keys', () => {
      const categories = {
        work: { ...defaultCategoryState, status: 'exhausted' as const },
        personal: { ...defaultCategoryState, status: 'loaded' as const },
      };
      const keys = selectExhaustedCategoryKeys(makeRootState(categories));
      expect(keys).toEqual(['work']);
    });
  });
});
