/**
 * Unit tests for MetadataIndicators — phishing badge and other metadata badges.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { MetadataIndicators } from './MetadataIndicators';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    colors: {
      accent: { info: '#E9902C' },
      primary: { main: '#E9902C', subtle: '#FCF8F0' },
      text: { secondary: '#888' },
      background: { subtle: '#f5f5f5' },
      error: { main: '#EF4444', light: '#FEE2E2' },
    },
    spacing: { xs: '4px', sm: '8px' },
    typography: { fontSize: { xs: '12px' } },
    borderRadius: { sm: '4px' },
  },
}));

vi.mock('constants/emojis', () => ({
  EMOJI_CHECK: '✅',
  EMOJI_NOTE: '📝',
}));

vi.mock('components/email-detail/emailPhishingWarning.helpers', () => ({
  shouldShowPhishingAlert: (confidence: string | null | undefined) =>
    confidence === 'medium' || confidence === 'high',
}));

const makeEmail = (overrides: Partial<Email> = {}): Email =>
  ({
    id: 'email-1',
    threadId: 'thread-1',
    from: 'test@example.com',
    subject: 'Test',
    isRead: false,
    isSnoozed: false,
    receivedAt: new Date().toISOString(),
    ...overrides,
  } as Email);

describe('MetadataIndicators – phishing badge', () => {
  it('renders phishing badge for high confidence', () => {
    render(<MetadataIndicators email={makeEmail({ phishingConfidence: 'high' })} />);
    expect(screen.getByTestId('phishing-badge')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-badge')).toHaveTextContent('inbox.phishingFlag');
  });

  it('renders phishing badge for medium confidence', () => {
    render(<MetadataIndicators email={makeEmail({ phishingConfidence: 'medium' })} />);
    expect(screen.getByTestId('phishing-badge')).toBeInTheDocument();
  });

  it('does NOT render phishing badge for low confidence', () => {
    render(<MetadataIndicators email={makeEmail({ phishingConfidence: 'low' })} />);
    expect(screen.queryByTestId('phishing-badge')).not.toBeInTheDocument();
  });

  it('does NOT render phishing badge when phishingConfidence is null', () => {
    render(<MetadataIndicators email={makeEmail({ phishingConfidence: null })} />);
    expect(screen.queryByTestId('phishing-badge')).not.toBeInTheDocument();
  });

  it('does NOT render phishing badge when phishingConfidence is undefined', () => {
    render(<MetadataIndicators email={makeEmail()} />);
    expect(screen.queryByTestId('phishing-badge')).not.toBeInTheDocument();
  });
});

describe('MetadataIndicators – renders nothing when no indicators', () => {
  it('returns null when no indicators are present', () => {
    const { container } = render(<MetadataIndicators email={makeEmail()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('MetadataIndicators – shows other indicators alongside phishing badge', () => {
  it('shows phishing badge together with action items badge', () => {
    render(
      <MetadataIndicators email={makeEmail({ phishingConfidence: 'high', actionItemsCount: 2 })} />
    );
    expect(screen.getByTestId('phishing-badge')).toBeInTheDocument();
    expect(screen.getByText(/inbox\.actionItems/)).toBeInTheDocument();
  });

  it('shows phishing badge together with note badge', () => {
    render(
      <MetadataIndicators email={makeEmail({ phishingConfidence: 'medium', hasPrivateNote: true })} />
    );
    expect(screen.getByTestId('phishing-badge')).toBeInTheDocument();
    expect(screen.getByText(/inbox\.note/)).toBeInTheDocument();
  });
});
