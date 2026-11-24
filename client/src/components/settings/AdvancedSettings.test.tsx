import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AdvancedSettings } from './AdvancedSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <div id="common-section">Common</div>
      <AdvancedSettings summary="Meeting length and time zone">
        <div id="scheduling-timezone">Time zone picker</div>
      </AdvancedSettings>
    </MemoryRouter>
  );

describe('AdvancedSettings', () => {
  it('starts closed and opens on click', async () => {
    renderAt('/settings');

    const toggle = screen.getByRole('button', { name: /settings.advanced.title/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Time zone picker')).not.toBeVisible();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Time zone picker')).toBeVisible();
  });

  it('opens by itself when a link points at a section inside it', async () => {
    renderAt('/settings#scheduling-timezone');

    await waitFor(() => expect(screen.getByText('Time zone picker')).toBeVisible());
  });

  it('stays closed for a link to a section outside it', async () => {
    renderAt('/settings#common-section');

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText('Time zone picker')).not.toBeVisible();
  });
});
