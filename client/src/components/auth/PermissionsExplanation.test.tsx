import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';

import { OAUTH_PERMISSIONS } from './oauth-permissions';
import { PermissionsExplanation } from './PermissionsExplanation';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const HOLD_MS = 5000;

describe('PermissionsExplanation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists every Google permission and the consent-screen tips', () => {
    render(<PermissionsExplanation provider={PROVIDER_GOOGLE} onContinue={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(OAUTH_PERMISSIONS[PROVIDER_GOOGLE].length);
    expect(screen.getByText('auth.permissions.items.otherContacts.title')).toBeInTheDocument();
    expect(screen.getByText('auth.permissions.tips.ongoingAccess')).toBeInTheDocument();
  });

  it.each([PROVIDER_MICROSOFT, PROVIDER_ZOHO])('omits the Google-only tips for %s', provider => {
    render(<PermissionsExplanation provider={provider} onContinue={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByTestId('consent-screen-tips')).not.toBeInTheDocument();
  });

  it('only continues after the hold completes', () => {
    const onContinue = vi.fn();
    render(<PermissionsExplanation provider={PROVIDER_GOOGLE} onContinue={onContinue} onCancel={vi.fn()} />);
    const holdButton = screen.getByRole('button', { name: /auth\.permissions\.hold\.ariaLabel/ });

    fireEvent.click(holdButton);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.pointerDown(holdButton);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 200);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('cancels via the Cancel button and the Escape key', () => {
    const onCancel = vi.fn();
    render(<PermissionsExplanation provider={PROVIDER_GOOGLE} onContinue={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
