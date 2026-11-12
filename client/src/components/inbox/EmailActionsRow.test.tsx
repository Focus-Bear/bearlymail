/**
 * The onboarding tour's prioritise / archive / block steps spotlight these
 * controls by their data-tour anchors; losing one silently degrades its step
 * to pointing at the whole card.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { ACTIONS_ROW_COLLAPSIBLE_CLASS, EmailActionsRow } from 'components/inbox/EmailActionsRow';
import { MODE_TRIAGE } from 'constants/strings';
import { TOUR_TARGETS, tourTargetSelector } from 'constants/tour';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const breakpoints = vi.hoisted(() => ({ isMobile: false }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: breakpoints.isMobile, isTablet: false, isDesktop: !breakpoints.isMobile }),
}));

const email = { id: 'email-1', body: 'Hello', htmlBody: '', starCount: 0 } as unknown as Email;

function renderRow() {
  return render(
    <EmailActionsRow
      email={email}
      mode={MODE_TRIAGE}
      keyboardHint={{ showHint: vi.fn(), hideHint: vi.fn() }}
      snoozeInput={{
        showSnoozeInput: null,
        getSnoozeValue: () => '',
        setSnoozeValue: vi.fn(),
        showSnooze: vi.fn(),
        clearSnooze: vi.fn(),
      }}
      onSetStarCount={vi.fn()}
      onArchive={vi.fn()}
      onBlockSender={vi.fn()}
      onSnooze={vi.fn()}
    />
  );
}

describe('EmailActionsRow tour anchors', () => {
  it.each([TOUR_TARGETS.EMAIL_PRIORITY, TOUR_TARGETS.EMAIL_ARCHIVE, TOUR_TARGETS.EMAIL_MORE_ACTIONS])(
    'marks the %s control for the tour',
    target => {
      const { container } = renderRow();

      expect(container.querySelector(tourTargetSelector(target))).not.toBeNull();
    }
  );

  it('puts the archive anchor on the Archive button itself', () => {
    const { container } = renderRow();

    expect(container.querySelector(tourTargetSelector(TOUR_TARGETS.EMAIL_ARCHIVE))).toHaveAttribute(
      'title',
      'inbox.archive'
    );
  });
});

describe('EmailActionsRow Snooze / Archive buttons', () => {
  afterEach(() => {
    breakpoints.isMobile = false;
  });

  it('keeps the labels on desktop so the split view shows full buttons, not bare icons', () => {
    renderRow();

    expect(screen.getByTestId('email-actions-row')).not.toHaveClass(ACTIONS_ROW_COLLAPSIBLE_CLASS);
    expect(screen.getByRole('button', { name: 'emailDetail.snooze' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'inbox.archive' })).toBeInTheDocument();
  });

  it('lets the labels collapse to icons on mobile', () => {
    breakpoints.isMobile = true;
    renderRow();

    expect(screen.getByTestId('email-actions-row')).toHaveClass(ACTIONS_ROW_COLLAPSIBLE_CLASS);
  });
});
