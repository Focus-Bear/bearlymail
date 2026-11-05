import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { ClaudeAccessSection } from './ClaudeAccessSection';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), isAxiosError: vi.fn() } }));
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
  kind: 'personal',
  name: 'Laptop',
  tokenPrefix: 'bm_pat_abcde',
  scopes: ['mail:read', 'mail:send'],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
};

const CLAUDE_CONNECTION = {
  id: 'token-9',
  kind: 'oauth',
  name: 'Claude (claude.ai)',
  tokenPrefix: 'bm_oat_zzzzz',
  scopes: ['mail:read'],
  expiresAt: '2026-12-04T00:00:00Z',
  lastUsedAt: '2026-11-04T00:00:00Z',
  createdAt: '2026-11-04T00:00:00Z',
};

const TOKENS_URL = 'http://api.test/personal-access-tokens';
const STEP_UP_URL = 'http://api.test/auth/step-up';
const STEP_UP_HEADERS = { headers: { 'X-Step-Up-Token': 'step-up-1' } };

function mockPosts(createResponse: unknown) {
  vi.mocked(axios.post).mockImplementation(async (url: string) =>
    url === STEP_UP_URL ? { data: { step_up_token: 'step-up-1' } } : createResponse
  );
}

function passwordChallenge() {
  return Object.assign(new Error('step up'), { response: { status: 401, data: { requiresPassword: true } } });
}

describe('ClaudeAccessSection', () => {
  beforeEach(() => {
    vi.mocked(axios.isAxiosError).mockReset().mockReturnValue(true);
    vi.mocked(axios.get)
      .mockReset()
      .mockResolvedValue({ data: [EXISTING_TOKEN] });
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

  it('offers the connector URL for claude.ai and a token-free Claude Code command', async () => {
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');
    expect(screen.getByTestId('claude-connector-url')).toHaveTextContent('http://api.test/mcp');
    expect(screen.getByTestId('claude-code-oauth-command')).toHaveTextContent(
      'claude mcp add --transport http bearlymail http://api.test/mcp'
    );
    expect(screen.getByTestId('claude-code-oauth-command')).not.toHaveTextContent('Authorization');
  });

  it('lists a claude.ai connection without its token prefix and disconnects it', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [CLAUDE_CONNECTION, EXISTING_TOKEN] });
    render(<ClaudeAccessSection />);
    expect(await screen.findByText('Claude (claude.ai)')).toBeInTheDocument();
    expect(screen.getByText('settings.claudeAccess.connectedApp')).toBeInTheDocument();
    expect(screen.queryByText(/bm_oat_zzzzz/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('settings.claudeAccess.disconnectAria:Claude (claude.ai)'));

    expect(window.confirm).toHaveBeenCalledWith('settings.claudeAccess.disconnectConfirm:Claude (claude.ai)');
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://api.test/personal-access-tokens/token-9'));
    await waitFor(() => expect(screen.queryByText('Claude (claude.ai)')).not.toBeInTheDocument());
  });

  it('recommends the Claude connector and keeps tokens out of the way until asked for', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [CLAUDE_CONNECTION] });
    render(<ClaudeAccessSection />);
    await screen.findByText('Claude (claude.ai)');

    expect(screen.getByTestId('claude-connector-setup')).toBeInTheDocument();
    expect(screen.queryByTestId('access-token-create-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('settings.claudeAccess.tokenSectionToggle'));
    expect(screen.getByTestId('access-token-create-form')).toBeInTheDocument();
  });

  it('shows the token section straight away for someone who already uses tokens', async () => {
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');
    expect(screen.getByTestId('access-token-create-form')).toBeInTheDocument();
    expect(screen.queryByText('settings.claudeAccess.tokenSectionToggle')).not.toBeInTheDocument();
  });

  it('creates a read-only 90-day token by default and shows the setup snippets once', async () => {
    mockPosts({
      data: {
        token: 'bm_pat_SECRET',
        summary: { ...EXISTING_TOKEN, id: 'token-2', name: 'Claude', scopes: ['mail:read'] },
      },
    });
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        TOKENS_URL,
        { name: 'AI app', scopes: ['mail:read'], expiresInDays: 90 },
        STEP_UP_HEADERS
      )
    );
    expect(await screen.findByTestId('new-access-token-value')).toHaveTextContent('bm_pat_SECRET');
    expect(screen.getByTestId('mcp-server-url')).toHaveTextContent('http://api.test/mcp');
    expect(screen.getByTestId('mcp-auth-header')).toHaveTextContent('Bearer bm_pat_SECRET');
    expect(screen.getByTestId('mcp-client-config')).toHaveTextContent('mcp-remote');

    fireEvent.click(screen.getByText('settings.claudeAccess.dismiss'));
    expect(screen.queryByTestId('new-access-token-panel')).not.toBeInTheDocument();
  });

  it('adds the send scope when sending is allowed', async () => {
    mockPosts({ data: { token: 'bm_pat_X', summary: EXISTING_TOKEN } });
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.click(screen.getByTestId('access-token-can-send'));
    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        TOKENS_URL,
        expect.objectContaining({ scopes: ['mail:read', 'mail:send'] }),
        STEP_UP_HEADERS
      )
    );
  });

  it('asks password users to confirm before creating a token', async () => {
    vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown) => {
      if (url === STEP_UP_URL && !(body as { password?: string }).password) {
        throw passwordChallenge();
      }
      if (url === STEP_UP_URL) {
        return { data: { step_up_token: 'step-up-1' } };
      }
      return { data: { token: 'bm_pat_SECRET', summary: EXISTING_TOKEN } };
    });
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));
    const dialog = await screen.findByRole('dialog');
    const passwordInput = dialog.querySelector('input') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'hunter2' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    expect(await screen.findByTestId('new-access-token-value')).toHaveTextContent('bm_pat_SECRET');
    expect(axios.post).toHaveBeenCalledWith(STEP_UP_URL, { password: 'hunter2' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates nothing when the password check is cancelled', async () => {
    vi.mocked(axios.post).mockRejectedValue(passwordChallenge());
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('dialog'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(axios.post).not.toHaveBeenCalledWith(TOKENS_URL, expect.anything(), expect.anything());
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
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    vi.mocked(axios.post).mockRejectedValue(new Error('nope'));
    render(<ClaudeAccessSection />);
    await screen.findByText('Laptop');

    fireEvent.submit(screen.getByTestId('access-token-create-form'));

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('settings.claudeAccess.createError'));
    expect(screen.queryByTestId('new-access-token-panel')).not.toBeInTheDocument();
  });
});
