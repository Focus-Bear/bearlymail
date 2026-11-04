import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { ClaudeAccessSection } from './ClaudeAccessSection';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.name ? `${key}:${options.name}` : key),
  }),
}));

const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));

const EXISTING_TOKEN = {
  id: 'token-1',
  name: 'Laptop',
  tokenPrefix: 'bm_pat_abcde',
  scopes: ['mail:read', 'mail:send'],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
};

describe('ClaudeAccessSection', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset().mockResolvedValue({ data: [EXISTING_TOKEN] });
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.delete).mockReset().mockResolvedValue({ data: undefined });
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists active tokens with their permission', async () => {
    render(<ClaudeAccessSection />);
    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText(/settings.claudeAccess.scopeReadSend/)).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith('http://api.test/personal-access-tokens');
  });

  it('creates a read-only 90-day token by default and shows the setup snippets once', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { token: 'bm_pat_SECRET', summary: { ...EXISTING_TOKEN, id: 'token-2', name: 'Claude', scopes: ['mail:read'] } },
    });
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('http://api.test/personal-access-tokens', {
        name: 'Claude',
        scopes: ['mail:read'],
        expiresInDays: 90,
      })
    );
    expect(await screen.findByTestId('new-access-token-value')).toHaveTextContent('bm_pat_SECRET');
    expect(screen.getByTestId('claude-code-command')).toHaveTextContent(
      'claude mcp add --transport http bearlymail http://api.test/mcp --header "Authorization: Bearer bm_pat_SECRET"'
    );

    fireEvent.click(screen.getByText('settings.claudeAccess.dismiss'));
    expect(screen.queryByTestId('new-access-token-panel')).not.toBeInTheDocument();
  });

  it('adds the send scope when sending is allowed', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { token: 'bm_pat_X', summary: EXISTING_TOKEN } });
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.click(screen.getByTestId('access-token-can-send'));
    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        'http://api.test/personal-access-tokens',
        expect.objectContaining({ scopes: ['mail:read', 'mail:send'] })
      )
    );
  });

  it('revokes a token after confirmation', async () => {
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.click(screen.getByLabelText('settings.claudeAccess.revokeAria:Laptop'));

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://api.test/personal-access-tokens/token-1'));
    await waitFor(() => expect(screen.queryByText('Laptop')).not.toBeInTheDocument());
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('keeps the token when the user cancels the revoke', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.click(screen.getByLabelText('settings.claudeAccess.revokeAria:Laptop'));

    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('shows an error when creating fails', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('nope'));
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('settings.claudeAccess.createError'));
    expect(screen.queryByTestId('new-access-token-panel')).not.toBeInTheDocument();
  });
});
