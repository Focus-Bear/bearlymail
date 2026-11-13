import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CheckInboxPanel } from 'components/auth/CheckInboxPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.email ? `${key}:${params.email}` : key),
  }),
}));

describe('CheckInboxPanel', () => {
  it('names the address the link went to', () => {
    render(<CheckInboxPanel email="ana@example.com" onResend={vi.fn()} />);
    expect(screen.getByTestId('check-inbox-message')).toHaveTextContent('ana@example.com');
  });

  it('confirms a resend', async () => {
    const onResend = vi.fn().mockResolvedValue(undefined);
    render(<CheckInboxPanel email="ana@example.com" onResend={onResend} />);

    await userEvent.click(screen.getByRole('button', { name: 'auth.verifyEmail.resend' }));

    expect(onResend).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('auth.verifyEmail.resendSent');
  });

  it('shows an error when the resend fails', async () => {
    render(<CheckInboxPanel email="ana@example.com" onResend={vi.fn().mockRejectedValue(new Error('x'))} />);

    await userEvent.click(screen.getByRole('button', { name: 'auth.verifyEmail.resend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('auth.verifyEmail.resendError');
  });

  it('goes back to sign-in', async () => {
    const onBack = vi.fn();
    render(<CheckInboxPanel email="ana@example.com" onResend={vi.fn()} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: 'auth.backToLogin' }));

    expect(onBack).toHaveBeenCalled();
  });
});
