import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { ActionItemList } from './ActionItemList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

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
    <ActionItemList
      actionItems={ITEMS}
      onToggleActionItem={vi.fn()}
      onDeleteActionItem={vi.fn()}
      focusBearTaskSource={focusBearTaskSource}
    />
  );
}

describe('ActionItemList — Save to Focus Bear', () => {
  it('offers a focusbear://create-task link on each open item', () => {
    renderList(SOURCE);

    const links = screen.getAllByRole('link', { name: 'emailDetail.saveToFocusBear' });
    expect(links).toHaveLength(1);
    const url = new URL(links[0].getAttribute('href') ?? '');
    expect(`${url.protocol}//${url.host}`).toBe('focusbear://create-task');
    expect(url.searchParams.get('title')).toBe('Send the signed contract');
    expect(url.searchParams.get('link')).toBe(SOURCE.emailUrl);
    expect(url.searchParams.get('notes')).toContain('Contract & next steps');
  });

  it('records the save in analytics', () => {
    renderList(SOURCE);

    fireEvent.click(screen.getByRole('link', { name: 'emailDetail.saveToFocusBear' }));

    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR);
  });

  it('shows no link without an email to describe', () => {
    renderList();

    expect(screen.queryByRole('link')).toBeNull();
  });
});
