/**
 * EmailDetailOverlays is rendered by every EmailDetail layout. Regression cover for
 * the split-view bug where "Pick date & time…" set showTimePicker but no layout
 * other than the full page rendered the picker, so nothing appeared.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { EmailDetailOverlays, EmailDetailOverlaysProps } from './EmailDetailOverlays';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const baseProps: EmailDetailOverlaysProps = {
  showRuleModal: false,
  customRule: { whenToUse: '', howToSummarize: '' },
  onCustomRuleChange: vi.fn(),
  onCloseRuleModal: vi.fn(),
  onCreateCustomRule: vi.fn(),
  showTimePicker: false,
  scheduledSendAt: null,
  timeSuggestions: [],
  timeWarning: undefined,
  suggestedTime: undefined,
  onTimeSelect: vi.fn(),
  onCancelTimePicker: vi.fn(),
};

describe('EmailDetailOverlays', () => {
  it('renders the schedule time picker when showTimePicker is set', () => {
    render(<EmailDetailOverlays {...baseProps} showTimePicker />);
    expect(screen.getByText('compose.customTime')).toBeInTheDocument();
  });

  it('renders no time picker when showTimePicker is false', () => {
    render(<EmailDetailOverlays {...baseProps} />);
    expect(screen.queryByText('compose.customTime')).not.toBeInTheDocument();
  });
});
