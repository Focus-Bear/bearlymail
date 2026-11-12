import { render, screen } from '@testing-library/react';

import { GMAIL_ACCESS_ISSUE_REVOKED } from 'constants/strings';

import { InboxOverlays } from './InboxOverlays';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  tourStep: null,
  tourSteps: [],
  onSkipTour: vi.fn(),
  onNextTourStep: vi.fn(),
  onPrevTourStep: vi.fn(),
  showScanModal: false,
  isScanning: false,
  onStartScan: vi.fn(),
  onDismissScan: vi.fn(),
  scanNotification: { show: false, progress: null },
  urgentNotification: { show: false, count: 0, emails: [] },
  onDismissUrgent: vi.fn(),
  onLogout: vi.fn(),
};

describe('InboxOverlays', () => {
  it('shows the Gmail access banner instead of the generic re-login banner', () => {
    render(<InboxOverlays {...baseProps} needsRelogin gmailAccessIssue={GMAIL_ACCESS_ISSUE_REVOKED} />);

    expect(screen.getByTestId('gmail-access-alert-banner')).toBeTruthy();
    expect(screen.queryByText('auth.reloginRequired')).toBeNull();
  });

  it('falls back to the re-login banner when there is no Gmail access issue', () => {
    render(<InboxOverlays {...baseProps} needsRelogin gmailAccessIssue={null} />);

    expect(screen.queryByTestId('gmail-access-alert-banner')).toBeNull();
    expect(screen.getByText('auth.reloginRequired')).toBeTruthy();
  });
});
