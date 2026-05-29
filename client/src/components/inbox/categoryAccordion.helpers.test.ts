/**
 * Unit tests for CategoryAccordion helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { Email, InboxMode } from 'types/email';

import { groupEmailsByCategory } from 'components/inbox/CategoryAccordion';

import {
  getCategoryIcon,
  getCategoryTranslationKey,
  isDefaultCategory,
  makeArchiveKeyDownHandler,
} from './categoryAccordion.helpers';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    subject: 'Test Subject',
    from: 'sender@example.com',
    to: [],
    cc: [],
    bcc: [],
    body: '',
    snippet: '',
    date: new Date().toISOString(),
    category: 'Newsletters',
    category_id: null,
    protoCategoryName: null,
    isRead: false,
    isStarred: false,
    phishingConfidence: null,
    ...overrides,
  } as Email;
}

describe('isDefaultCategory', () => {
  it.each(['Newsletters', 'Sales', 'Partnerships', 'Customer Support', 'HR Admin', 'Other', 'Dangerous / Phishing'])(
    'returns true for known default category: %s',
    category => {
      expect(isDefaultCategory(category)).toBe(true);
    }
  );

  it('returns false for an unknown/custom category UUID', () => {
    expect(isDefaultCategory('abc-123-uuid')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isDefaultCategory('')).toBe(false);
  });
});

describe('getCategoryTranslationKey', () => {
  it('maps Newsletters to i18n key', () => {
    expect(getCategoryTranslationKey('Newsletters')).toBe('inbox.category.newsletters');
  });

  it('maps Sales to i18n key', () => {
    expect(getCategoryTranslationKey('Sales')).toBe('inbox.category.sales');
  });

  it('maps Dangerous / Phishing to i18n key', () => {
    expect(getCategoryTranslationKey('Dangerous / Phishing')).toBe('inbox.category.dangerousPhishing');
  });

  it('returns null for unknown category', () => {
    expect(getCategoryTranslationKey('My Custom Category')).toBeNull();
  });
});

describe('getCategoryIcon', () => {
  it('returns 📰 for Newsletters', () => {
    expect(getCategoryIcon('Newsletters')).toBe('📰');
  });

  it('returns 🛑 for Dangerous / Phishing', () => {
    expect(getCategoryIcon('Dangerous / Phishing')).toBe('🛑');
  });

  it('returns 📧 as default for unknown category', () => {
    expect(getCategoryIcon('unknown-uuid-category')).toBe('📧');
  });
});

describe('makeArchiveKeyDownHandler', () => {
  function makeKeyEvent(key: string): KeyboardEvent {
    return { key, stopPropagation: vi.fn() } as unknown as KeyboardEvent;
  }

  it('calls onConfirm and stopPropagation when "y" is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = makeArchiveKeyDownHandler(onConfirm, onCancel);
    const event = makeKeyEvent('y');
    handler(event);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('calls onConfirm when uppercase "Y" is pressed (case-insensitive)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = makeArchiveKeyDownHandler(onConfirm, onCancel);
    const event = makeKeyEvent('Y');
    handler(event);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel and stopPropagation when Escape is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = makeArchiveKeyDownHandler(onConfirm, onCancel);
    const event = makeKeyEvent('Escape');
    handler(event);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('does nothing for other keys (e.g. Enter)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = makeArchiveKeyDownHandler(onConfirm, onCancel);
    const event = makeKeyEvent('Enter');
    handler(event);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('groupEmailsByCategory', () => {
  it('returns empty array for empty input', () => {
    expect(groupEmailsByCategory([])).toEqual([]);
  });

  it('groups emails into a single category', () => {
    // After fix #1294: emails with category_id === null are all bucketed as "uncategorized"
    // regardless of their category name string, so they share a single group.
    const emails = [
      makeEmail({ id: '1', category: 'Newsletters', category_id: null }),
      makeEmail({ id: '2', category: 'Newsletters', category_id: null }),
    ];
    const groups = groupEmailsByCategory(emails);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('uncategorized');
    expect(groups[0].emails).toHaveLength(2);
  });

  it('groups emails into multiple categories', () => {
    // After fix #1294: category_id is the grouping key. Use distinct UUIDs for distinct groups.
    const emails = [
      makeEmail({ id: '1', category: 'Newsletters', category_id: 'uuid-newsletters' }),
      makeEmail({ id: '2', category: 'Sales', category_id: 'uuid-sales' }),
    ];
    const groups = groupEmailsByCategory(emails);
    expect(groups).toHaveLength(2);
    const cats = groups.map(grp => grp.category).sort();
    expect(cats).toEqual(['uuid-newsletters', 'uuid-sales']);
  });

  it('routes medium-confidence phishing email (no server category) to phishing bucket', () => {
    const emails = [makeEmail({ id: '1', phishingConfidence: 'medium', category: 'Other', category_id: null })];
    const groups = groupEmailsByCategory(emails);
    expect(groups[0].category).toBe('Dangerous / Phishing');
  });

  it('routes high-confidence phishing email (no server category) to phishing bucket', () => {
    const emails = [makeEmail({ id: '1', phishingConfidence: 'high', category: 'Other', category_id: null })];
    const groups = groupEmailsByCategory(emails);
    expect(groups[0].category).toBe('Dangerous / Phishing');
  });

  it('preserves server category when phishing fires but category_id is set and not Other', () => {
    const emails = [
      makeEmail({
        id: '1',
        phishingConfidence: 'high',
        category: 'Newsletters',
        category_id: 'some-uuid-not-other',
      }),
    ];
    const groups = groupEmailsByCategory(emails);
    // Should keep server-assigned UUID key, not route to phishing bucket
    expect(groups[0].category).toBe('some-uuid-not-other');
  });

  it('sorts emails by priority desc in normal mode', () => {
    // getEmailPriorityScore uses priorityExplanation.breakdown, not priorityScore
    const highPriority = makeEmail({
      id: '1',
      category: 'Sales',
      category_id: null,
      priorityExplanation: { breakdown: [{ label: 'urgency', value: 90, description: '' }] },
    } as unknown as Partial<Email>);
    const lowPriority = makeEmail({
      id: '2',
      category: 'Sales',
      category_id: null,
      priorityExplanation: { breakdown: [{ label: 'urgency', value: 10, description: '' }] },
    } as unknown as Partial<Email>);
    const groups = groupEmailsByCategory([lowPriority, highPriority]);
    expect(groups[0].emails[0].id).toBe('1');
  });

  it('sorts emails by autoRespondedAt desc in autoresponded mode', () => {
    const older = makeEmail({
      id: '1',
      category: 'Newsletters',
      category_id: null,
      autoRespondedAt: '2024-01-01T10:00:00Z',
    });
    const newer = makeEmail({
      id: '2',
      category: 'Newsletters',
      category_id: null,
      autoRespondedAt: '2024-01-02T10:00:00Z',
    });
    const mode: InboxMode = 'autoresponded';
    const groups = groupEmailsByCategory([older, newer], mode);
    expect(groups[0].emails[0].id).toBe('2');
  });
});
