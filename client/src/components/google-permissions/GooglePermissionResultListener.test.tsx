import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { replayPendingAction, takePendingAction } from 'utils/googlePermissionRequired';

import { API_URL } from 'config/api';
import { GOOGLE_PERMISSION_GMAIL_MANAGE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

import { GooglePermissionResultListener } from './GooglePermissionResultListener';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('contexts/AuthContext', () => ({ useAuth: vi.fn() }));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({ useNotifications: () => ({ showSuccess, showError }) }));

vi.mock('utils/googlePermissionRequired', async importOriginal => ({
  ...(await importOriginal<typeof import('utils/googlePermissionRequired')>()),
  takePendingAction: vi.fn(),
  replayPendingAction: vi.fn(),
}));

const refreshUser = vi.fn().mockResolvedValue(undefined);
const pendingArchive = {
  permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
  method: 'put',
  url: `${API_URL}/emails/email-1/archive`,
  params: {},
  savedAt: Date.now(),
};

const CurrentUrl: React.FC = () => {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <GooglePermissionResultListener />
      <Routes>
        <Route path="*" element={<CurrentUrl />} />
      </Routes>
    </MemoryRouter>
  );

describe('GooglePermissionResultListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ refreshUser } as never);
    vi.mocked(takePendingAction).mockReturnValue(null);
    vi.mocked(replayPendingAction).mockResolvedValue(undefined);
  });

  it('retries the action that needed the permission, then refreshes open views', async () => {
    vi.mocked(takePendingAction).mockReturnValue(pendingArchive);
    const onRetried = vi.fn();
    window.addEventListener('bearlymail:google-permission-action-retried', onRetried);

    renderAt('/inbox?googlePermission=granted');

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('googlePermissions.result.grantedAndRetried'));
    expect(replayPendingAction).toHaveBeenCalledWith(pendingArchive);
    expect(onRetried).toHaveBeenCalledTimes(1);
    expect(refreshUser).toHaveBeenCalled();
    window.removeEventListener('bearlymail:google-permission-action-retried', onRetried);
  });

  it('says so when the retried action fails', async () => {
    vi.mocked(takePendingAction).mockReturnValue(pendingArchive);
    vi.mocked(replayPendingAction).mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAt('/inbox?googlePermission=granted');

    await waitFor(() => expect(showError).toHaveBeenCalledWith('googlePermissions.result.retryFailed'));
  });

  it('drops the waiting action when Google comes back without the permission', async () => {
    vi.mocked(takePendingAction).mockReturnValue(pendingArchive);

    renderAt('/inbox?googlePermission=declined');

    await waitFor(() => expect(showError).toHaveBeenCalledWith('googlePermissions.result.declined'));
    expect(takePendingAction).toHaveBeenCalled();
    expect(replayPendingAction).not.toHaveBeenCalled();
  });

  it('confirms a grant, reloads the user and cleans the URL', async () => {
    renderAt('/crm/contacts?q=x&googlePermission=granted');

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/crm/contacts?q=x'));
    expect(screen.getByTestId('url')).not.toHaveTextContent('googlePermission');
    expect(showSuccess).toHaveBeenCalledWith('googlePermissions.result.granted');
    expect(refreshUser).toHaveBeenCalled();
  });

  it.each([
    ['declined', 'googlePermissions.result.declined'],
    ['wrong_account', 'googlePermissions.result.wrongAccount'],
  ])('explains a %s grant', async (result, messageKey) => {
    renderAt(`/inbox?googlePermission=${result}`);

    await waitFor(() => expect(showError).toHaveBeenCalledWith(messageKey));
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('does nothing on an ordinary page load', () => {
    renderAt('/inbox');

    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });
});
