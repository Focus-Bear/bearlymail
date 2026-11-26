/**
 * The onboarding tour's prioritise / archive / block steps spotlight these
 * controls by their data-tour anchors; losing one silently degrades its step
 * to pointing at the whole card.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { Email } from 'types/email';

import { ACTIONS_ROW_COLLAPSIBLE_CLASS, EmailActionsRow } from 'components/inbox/EmailActionsRow';
import { MODE_TRIAGE } from 'constants/strings';
import { TOUR_TARGETS, tourTargetSelector } from 'constants/tour';
import { UNSUBSCRIBE_METHODS, UNSUBSCRIBE_OUTCOMES, UnsubscribeMethod } from 'constants/unsubscribe';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const breakpoints = vi.hoisted(() => ({ isMobile: false }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: breakpoints.isMobile, isTablet: false, isDesktop: !breakpoints.isMobile }),
}));

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const mockedPost = vi.mocked(axios.post);

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const email = { id: 'email-1', body: 'Hello', htmlBody: '', starCount: 0 } as unknown as Email;

function renderRow(rowEmail: Email = email, handlers: { onArchive?: () => Promise<void> } = {}) {
  return render(
    <EmailActionsRow
      email={rowEmail}
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
      onArchive={handlers.onArchive ?? vi.fn()}
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

describe('EmailActionsRow Unsubscribe', () => {
  const newsletter = (method: UnsubscribeMethod | null) =>
    ({ ...email, from: 'b@useparagon.com', fromName: 'Brandon from Paragon', unsubscribeMethod: method }) as Email;

  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'emailDetail.moreOptions' }));
  const menuItemCount = () => screen.getAllByRole('menuitem').length;

  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('offers Unsubscribe next to Block sender when the email has a List-Unsubscribe method', () => {
    renderRow(newsletter(UNSUBSCRIBE_METHODS.ONE_CLICK));
    openMenu();

    expect(menuItemCount()).toBe(2);
    expect(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'inbox.blockSender' })).toBeInTheDocument();
  });

  it('shows only Block sender when there is no way to unsubscribe', () => {
    renderRow(newsletter(null));
    openMenu();

    expect(menuItemCount()).toBe(1);
    expect(screen.getByRole('menuitem', { name: 'inbox.blockSender' })).toBeInTheDocument();
  });

  it('asks before doing anything, and Cancel leaves the sender alone', () => {
    renderRow(newsletter(UNSUBSCRIBE_METHODS.MAILTO));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));

    expect(screen.getByRole('dialog', { name: 'inbox.unsubscribeFlow.confirmTitle' })).toBeInTheDocument();
    expect(screen.getByText('inbox.unsubscribeFlow.confirmMailto')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('unsubscribes with the confirmed method, then archives the email and its siblings on request', async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    mockedPost
      .mockResolvedValueOnce({
        data: { outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED, method: UNSUBSCRIBE_METHODS.ONE_CLICK, siblingCount: 3 },
      })
      .mockResolvedValueOnce({ data: { archivedCount: 3 } });
    renderRow(newsletter(UNSUBSCRIBE_METHODS.ONE_CLICK), { onArchive });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.unsubscribe' }));

    const offer = await screen.findByRole('dialog', { name: 'inbox.unsubscribeFlow.doneTitle' });
    expect(within(offer).getByText('inbox.unsubscribeFlow.archiveOfferWithOthers')).toBeInTheDocument();
    expect(within(offer).getByRole('note')).toHaveTextContent('inbox.unsubscribeFlow.blockWarningTitle');
    expect(mockedPost).toHaveBeenCalledWith(expect.stringMatching(/\/emails\/email-1\/unsubscribe$/), {
      method: UNSUBSCRIBE_METHODS.ONE_CLICK,
    });

    fireEvent.click(within(offer).getByRole('button', { name: 'inbox.unsubscribeFlow.archiveAndBlock' }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenLastCalledWith(expect.stringMatching(/\/emails\/email-1\/unsubscribe\/archive-sender$/))
    );
    expect(onArchive).toHaveBeenCalledWith('email-1', expect.anything());
  });

  it("opens the sender's page in a tab opened during the click, so popup blockers allow it", async () => {
    const placeholderTab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(placeholderTab as unknown as Window);
    mockedPost.mockResolvedValueOnce({
      data: {
        outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
        method: UNSUBSCRIBE_METHODS.LINK,
        url: 'https://lists.example.test/unsub',
        siblingCount: 0,
      },
    });
    renderRow(newsletter(UNSUBSCRIBE_METHODS.LINK));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.unsubscribe' }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog', { name: 'inbox.unsubscribeFlow.finishInTabTitle' })).toBeInTheDocument();
    expect(placeholderTab.opener).toBeNull();
    expect(placeholderTab.location.href).toBe('https://lists.example.test/unsub');
    openSpy.mockRestore();
  });

  it('never navigates to a non-https URL the server returns', async () => {
    const placeholderTab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(placeholderTab as unknown as Window);
    mockedPost.mockResolvedValueOnce({
      data: {
        outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
        method: UNSUBSCRIBE_METHODS.LINK,
        url: 'javascript:alert(1)',
        siblingCount: 0,
      },
    });
    renderRow(newsletter(UNSUBSCRIBE_METHODS.LINK));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.unsubscribe' }));

    expect(await screen.findByRole('dialog', { name: 'inbox.unsubscribeFlow.errorTitle' })).toBeInTheDocument();
    expect(placeholderTab.close).toHaveBeenCalled();
    expect(placeholderTab.location.href).toBe('');
    openSpy.mockRestore();
  });

  it("asks for a fresh click to open the sender's page when one-click falls back to it", async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockedPost.mockResolvedValueOnce({
      data: {
        outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
        method: UNSUBSCRIBE_METHODS.LINK,
        url: 'https://lists.example.test/unsub',
        siblingCount: 1,
      },
    });
    renderRow(newsletter(UNSUBSCRIBE_METHODS.ONE_CLICK));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.unsubscribe' }));

    const openLink = await screen.findByRole('dialog', { name: 'inbox.unsubscribeFlow.openLinkTitle' });
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(within(openLink).getByRole('button', { name: 'inbox.unsubscribeFlow.openLinkConfirm' }));

    expect(openSpy).toHaveBeenCalledWith('https://lists.example.test/unsub', '_blank', 'noopener,noreferrer');
    expect(screen.getByRole('dialog', { name: 'inbox.unsubscribeFlow.finishInTabTitle' })).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('shows an error instead of the archive offer when the request fails', async () => {
    mockedPost.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderRow(newsletter(UNSUBSCRIBE_METHODS.ONE_CLICK));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'inbox.unsubscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.unsubscribe' }));

    expect(await screen.findByRole('dialog', { name: 'inbox.unsubscribeFlow.errorTitle' })).toBeInTheDocument();
  });
});
