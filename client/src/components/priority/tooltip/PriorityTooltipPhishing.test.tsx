import React from 'react';
import { render, screen } from '@testing-library/react';

import { PriorityTooltipPhishing } from './PriorityTooltipPhishing';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SENDGRID_REASON =
  'The sender name claims to be Twilio SendGrid but the email comes from botmd.io, which is not a Twilio SendGrid domain; it pressures you to act to restore your account.';

describe('PriorityTooltipPhishing', () => {
  it('shows a phishing verdict with its confidence, reasons and sender checks', () => {
    render(
      <PriorityTooltipPhishing
        email={{
          phishingConfidence: 'high',
          phishingReason: SENDGRID_REASON,
          senderAuthResults: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
          summarySource: 'llm',
        }}
      />
    );

    const section = screen.getByRole('region', { name: /priority\.tooltip\.phishing\.heading/ });
    expect(section).toHaveAttribute('data-verdict', 'phishing');
    expect(section).toHaveTextContent('priority.tooltip.phishing.verdict.phishing');
    expect(section).toHaveTextContent('phishing.confidenceLevel.high');
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'The sender name claims to be Twilio SendGrid but the email comes from botmd.io, which is not a Twilio SendGrid domain',
      'It pressures you to act to restore your account',
    ]);
    expect(section).toHaveTextContent('SPF pass · DKIM pass · DMARC pass');
  });

  it('says the email was checked and found clean', () => {
    render(<PriorityTooltipPhishing email={{ phishingConfidence: null, summarySource: 'llm' }} />);

    const section = screen.getByTestId('priority-tooltip-phishing');
    expect(section).toHaveAttribute('data-verdict', 'safe');
    expect(section).toHaveTextContent('priority.tooltip.phishing.explanation.safe');
    expect(section).not.toHaveTextContent('phishing.confidence');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says when the check has not run yet instead of calling the email safe', () => {
    render(<PriorityTooltipPhishing email={{ phishingConfidence: null, summarySource: 'deterministic' }} />);

    const section = screen.getByTestId('priority-tooltip-phishing');
    expect(section).toHaveAttribute('data-verdict', 'notChecked');
    expect(section).toHaveTextContent('priority.tooltip.phishing.explanation.notChecked');
  });
});
