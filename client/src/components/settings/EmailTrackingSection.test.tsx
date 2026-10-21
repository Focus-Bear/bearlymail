import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { EmailTrackingSection } from './EmailTrackingSection';

vi.mock('axios', () => ({ default: { put: vi.fn() } }));
vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockRefreshUser = vi.fn();
const mockShowError = vi.fn();
let mockUser: { trackEmailOpens?: boolean } = {};
vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }),
}));
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError: mockShowError }),
}));
let mockIsIncludedInPlan = true;
vi.mock('hooks/useIsEmailTrackingIncluded', () => ({
  useIsEmailTrackingIncluded: () => mockIsIncludedInPlan,
}));

const renderSection = () =>
  render(
    <MemoryRouter>
      <EmailTrackingSection />
    </MemoryRouter>,
  );

describe('EmailTrackingSection', () => {
  beforeEach(() => {
    vi.mocked(axios.put).mockReset().mockResolvedValue({ data: {} });
    mockRefreshUser.mockReset().mockResolvedValue(undefined);
    mockShowError.mockReset();
    mockIsIncludedInPlan = true;
  });

  it('is on by default when the user has no explicit setting', () => {
    mockUser = {};
    renderSection();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the new value and refreshes the user', async () => {
    mockUser = { trackEmailOpens: true };
    renderSection();
    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(axios.put).toHaveBeenCalledWith('http://api.test/users/me', { trackEmailOpens: false });
  });

  it('tells the user when saving fails', async () => {
    mockUser = { trackEmailOpens: false };
    vi.mocked(axios.put).mockRejectedValue(new Error('nope'));
    renderSection();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('settings.emailTracking.saveError'));
  });

  it('locks the toggle off and offers an upgrade when the plan excludes tracking', () => {
    mockUser = { trackEmailOpens: true };
    mockIsIncludedInPlan = false;
    renderSection();

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId('email-tracking-upgrade-note')).toHaveTextContent('settings.emailTracking.notIncluded');
    expect(screen.getByRole('link', { name: 'settings.emailTracking.viewPlans' })).toHaveAttribute(
      'href',
      '/settings?plans=open#team-usage',
    );
  });
});
