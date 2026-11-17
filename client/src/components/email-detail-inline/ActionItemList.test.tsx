import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { ActionItemList } from './ActionItemList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

// Not connected to Focus Bear. Suggestions and the panel's fields are covered in SaveToFocusBearButton.test.
vi.mock('queries/useFocusBear', () => ({
  useFocusBearConnectionQuery: () => ({ data: { connected: false } }),
  fetchFocusBearTaskSuggestions: vi.fn(),
}));

const SOURCE = {
  emailSubject: 'Contract & next steps',
  sender: 'Sam Patel',
  emailUrl: 'https://app.bearlymail.com/email/e1',
};

const ITEMS = [
  { id: 'a1', description: 'Send the signed contract', isCompleted: false, source: 'user' },
  { id: 'a2', description: 'Book the kickoff', isCompleted: true, source: 'llm' },
];

function renderList(focusBearTaskSource?: typeof SOURCE) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ActionItemList
          actionItems={ITEMS}
          onToggleActionItem={vi.fn()}
          onDeleteActionItem={vi.fn()}
          focusBearTaskSource={focusBearTaskSource}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ActionItemList — Save to Focus Bear', () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('offers "Save task in Focus Bear" on each open item', () => {
    renderList(SOURCE);

    expect(screen.getAllByRole('button', { name: 'emailDetail.saveTaskInFocusBear' })).toHaveLength(1);
  });

  it('saves through a focusbear://create-task link and records it in analytics', () => {
    renderList(SOURCE);

    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.saveTaskInFocusBear' }));
    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.saveToFocusBear' }));

    const url = new URL(assign.mock.calls[0][0]);
    expect(`${url.protocol}//${url.host}`).toBe('focusbear://create-task');
    expect(url.searchParams.get('title')).toBe('Send the signed contract');
    expect(url.searchParams.get('link')).toBe(SOURCE.emailUrl);
    expect(url.searchParams.get('notes')).toContain('Contract & next steps');
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR,
      expect.objectContaining({ hasProject: false, hasDueDate: false, dueDateNextFree: true })
    );
  });

  it('offers nothing without an email to describe', () => {
    renderList();

    expect(screen.queryByRole('button', { name: 'emailDetail.saveTaskInFocusBear' })).toBeNull();
  });
});
