/**
 * The priority badge opens the priority popover, which also carries the
 * email's phishing decision. It must work from the keyboard: Jeremy and other
 * users navigate the inbox without a mouse.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Email } from 'types/email';

import { PriorityBadge } from './PriorityBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin: false } }),
}));

const phishingEmail = {
  id: 'email-1',
  emailThreadId: 'thread-1',
  priorityScore: 42,
  isProcessingPriority: false,
  phishingConfidence: 'high',
  phishingReason: 'The sender name claims to be Twilio SendGrid but the email comes from botmd.io',
  senderAuthResults: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
  summarySource: 'llm',
} as unknown as Email;

function makeTooltipState(openEmailId: string | null) {
  return {
    hoveredPriorityEmailId: openEmailId,
    priorityExplanation: { score: 42, breakdown: [] },
    loadingPriorityExplanation: false,
    priorityExplanationError: false,
    togglePriorityTooltip: vi.fn(),
    hidePriorityTooltip: vi.fn(),
    expeditePriorityCalculation: vi.fn(),
    retryPriorityExplanation: vi.fn(),
  } as unknown as React.ComponentProps<typeof PriorityBadge>['priorityTooltip'];
}

function renderBadge(email: Email, priorityTooltip = makeTooltipState(null)) {
  render(
    <MemoryRouter>
      <PriorityBadge email={email} priorityTooltip={priorityTooltip} />
    </MemoryRouter>
  );
  return priorityTooltip;
}

describe('header PriorityBadge', () => {
  it('is a focusable button that says it opens a dialog', () => {
    renderBadge(phishingEmail);
    const badge = screen.getByRole('button', { name: /42/ });
    expect(badge).toHaveAttribute('tabindex', '0');
    expect(badge).toHaveAttribute('aria-haspopup', 'dialog');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
  });

  it.each(['Enter', ' '])('opens the popover with %p', key => {
    const tooltip = renderBadge(phishingEmail);
    fireEvent.keyDown(screen.getByRole('button', { name: /42/ }), { key });
    expect(tooltip.togglePriorityTooltip).toHaveBeenCalledWith('email-1');
  });

  it('ignores other keys', () => {
    const tooltip = renderBadge(phishingEmail);
    fireEvent.keyDown(screen.getByRole('button', { name: /42/ }), { key: 'a' });
    expect(tooltip.togglePriorityTooltip).not.toHaveBeenCalled();
  });

  it('shows the phishing decision in the open popover, which takes focus and closes on Escape', () => {
    const tooltip = renderBadge(phishingEmail, makeTooltipState('email-1'));

    const dialog = screen.getByRole('dialog', { name: 'priority.tooltip.dialogLabel' });
    expect(dialog).toHaveFocus();
    expect(screen.getByRole('button', { name: /42/ })).toHaveAttribute('aria-expanded', 'true');
    const phishing = screen.getByTestId('priority-tooltip-phishing');
    expect(phishing).toHaveAttribute('data-verdict', 'phishing');
    expect(phishing).toHaveTextContent('claims to be Twilio SendGrid');
    expect(phishing).toHaveTextContent('SPF pass · DKIM pass · DMARC pass');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(tooltip.hidePriorityTooltip).toHaveBeenCalled();
    expect(tooltip.togglePriorityTooltip).not.toHaveBeenCalled();
  });

  it('does not re-toggle when Enter is pressed inside the popover', () => {
    const tooltip = renderBadge(phishingEmail, makeTooltipState('email-1'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(tooltip.togglePriorityTooltip).not.toHaveBeenCalled();
  });

  it('cannot be focused or opened while the priority is calculating', () => {
    const tooltip = renderBadge({ ...phishingEmail, isProcessingPriority: true } as Email);
    const badge = screen.getByRole('button');
    expect(badge).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(badge, { key: 'Enter' });
    expect(tooltip.togglePriorityTooltip).not.toHaveBeenCalled();
  });
});
