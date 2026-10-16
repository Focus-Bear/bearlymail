/**
 * Threads the AI is still categorising render in their own "AI deciding category"
 * accordion instead of being lumped into "Other" (founder feedback: a new user saw
 * "Other 50" before categorisation had run).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryAccordion, groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { buildDisplayCategories, hasPendingCategorisation } from 'components/inbox/inboxCategoryHelpers';
import {
  CATEGORY_DANGEROUS_PHISHING,
  CATEGORY_KEY_PENDING,
  CATEGORY_OTHER,
  CATEGORY_PENDING,
  MODE_TRIAGE,
  PHISHING_CONFIDENCE_HIGH,
} from 'constants/strings';
import { NotificationProvider } from 'contexts/NotificationContext';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

const WORK_ID = 'work-uuid';

function makeEmail(overrides: Partial<Email>): Email {
  return {
    id: 'email',
    threadId: 'thread',
    from: 'sender@example.com',
    subject: 'Subject',
    isRead: false,
    isSnoozed: false,
    receivedAt: '2026-10-01T00:00:00Z',
    category: CATEGORY_OTHER,
    category_id: null,
    ...overrides,
  } as Email;
}

function groupKeysById(emails: Email[]): Record<string, string> {
  const keys: Record<string, string> = {};
  groupEmailsByCategory(emails, MODE_TRIAGE).forEach(group => {
    group.emails.forEach(email => {
      keys[email.id] = group.category;
    });
  });
  return keys;
}

describe('grouping threads that are still being categorised', () => {
  it('puts pending threads in the AI-deciding group, not Other', () => {
    const keys = groupKeysById([
      makeEmail({ id: 'pending', isCategoryPending: true }),
      makeEmail({ id: 'stamped-pending', isCategoryPending: true, category_id: CATEGORY_KEY_PENDING }),
      makeEmail({ id: 'other', isCategoryPending: false }),
      makeEmail({ id: 'work', category: 'Work', category_id: WORK_ID }),
    ]);

    expect(keys).toEqual({
      pending: CATEGORY_KEY_PENDING,
      'stamped-pending': CATEGORY_KEY_PENDING,
      other: CATEGORY_KEY_UNCATEGORIZED,
      work: WORK_ID,
    });
  });

  it('moves a thread to its real category once categorisation finishes', () => {
    const before = groupKeysById([makeEmail({ id: 'thread', isCategoryPending: true })]);
    const after = groupKeysById([
      makeEmail({ id: 'thread', isCategoryPending: false, category: 'Work', category_id: WORK_ID }),
    ]);

    expect(before.thread).toBe(CATEGORY_KEY_PENDING);
    expect(after.thread).toBe(WORK_ID);
  });

  it('still flags likely phishing among pending threads', () => {
    const keys = groupKeysById([
      makeEmail({
        id: 'phish',
        isCategoryPending: true,
        category_id: CATEGORY_KEY_PENDING,
        phishingConfidence: PHISHING_CONFIDENCE_HIGH,
      }),
    ]);

    expect(keys.phish).toBe(CATEGORY_DANGEROUS_PHISHING);
  });
});

describe('pending accordion ordering', () => {
  const summary = [
    { id: WORK_ID, name: 'Work', count: 3 },
    { id: null, name: CATEGORY_OTHER, count: 2 },
    { id: CATEGORY_KEY_PENDING, name: CATEGORY_PENDING, count: 5 },
  ];

  it('pins the pending bucket first even when the stable order lists it last', () => {
    const ordered = buildDisplayCategories(summary, [], [WORK_ID, CATEGORY_KEY_UNCATEGORIZED, CATEGORY_KEY_PENDING], MODE_TRIAGE);

    expect(ordered.map(category => category.id)).toEqual([CATEGORY_KEY_PENDING, WORK_ID, null]);
  });

  it('reports pending work only while the bucket has threads', () => {
    expect(hasPendingCategorisation(summary)).toBe(true);
    expect(hasPendingCategorisation([{ id: CATEGORY_KEY_PENDING, count: 0 }])).toBe(false);
    expect(hasPendingCategorisation(null)).toBe(false);
  });
});

describe('AI deciding category accordion header', () => {
  it('shows the explainer and offers no category settings or auto-archive', () => {
    render(
      <NotificationProvider>
        <CategoryAccordion
          category={CATEGORY_PENDING}
          categoryId={CATEGORY_KEY_PENDING}
          categoryKey={CATEGORY_KEY_PENDING}
          emails={[makeEmail({ id: 'pending', isCategoryPending: true })]}
          count={1}
          isExpanded={false}
          onToggle={vi.fn()}
        >
          <div />
        </CategoryAccordion>
      </NotificationProvider>
    );

    expect(screen.getByText('inbox.category.pendingCategorisation')).toBeInTheDocument();
    expect(screen.getByText('inbox.category.pendingCategorisationHint')).toBeInTheDocument();
    expect(screen.queryByLabelText('inbox.category.editCategories')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('inbox.category.moreActions')).not.toBeInTheDocument();
  });
});
