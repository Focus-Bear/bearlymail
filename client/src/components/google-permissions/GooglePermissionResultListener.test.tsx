import React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';

import { useAuth } from 'contexts/AuthContext';

import { GooglePermissionResultListener } from './GooglePermissionResultListener';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('contexts/AuthContext', () => ({ useAuth: vi.fn() }));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({ useNotifications: () => ({ showSuccess, showError }) }));

const refreshUser = vi.fn().mockResolvedValue(undefined);

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
    vi.mocked(useAuth).mockReturnValue({ refreshUser } as never);
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

  it('replaces the OAuth return entry, so Back goes to the page before Google rather than the result URL', async () => {
    let navigate: ReturnType<typeof useNavigate> = () => undefined;
    const NavigateCapture: React.FC = () => {
      navigate = useNavigate();
      return null;
    };
    render(
      <MemoryRouter initialEntries={['/before-google', '/settings?googlePermission=granted']} initialIndex={1}>
        <GooglePermissionResultListener />
        <NavigateCapture />
        <Routes>
          <Route path="*" element={<CurrentUrl />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent(/^\/settings$/));

    act(() => {
      void navigate(-1);
    });

    expect(screen.getByTestId('url')).toHaveTextContent('/before-google');
  });
});
