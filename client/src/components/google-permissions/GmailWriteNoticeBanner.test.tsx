import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { GMAIL_WRITE_NOTICE_DISMISS_PATH, GOOGLE_PERMISSION_GMAIL_MANAGE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useGooglePermission } from 'hooks/useGooglePermission';

import { GmailWriteNoticeBanner } from './GmailWriteNoticeBanner';

vi.mock('axios');
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('hooks/useGooglePermission', () => ({ useGooglePermission: vi.fn() }));

const refreshUser = vi.fn().mockResolvedValue(undefined);
const requestPermission = vi.fn();

function renderFor(showGmailWriteNotice: boolean) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u', email: 'a@b.c', showGmailWriteNotice }, refreshUser } as never);
  return render(<GmailWriteNoticeBanner />);
}

describe('GmailWriteNoticeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGooglePermission).mockReturnValue({ isMissing: true, isRedirecting: false, requestPermission });
    vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });
  });

  it('stays hidden until a background job skipped a Gmail write', () => {
    renderFor(false);

    expect(screen.queryByTestId('gmail-write-notice')).not.toBeInTheDocument();
  });

  it('asks for Gmail manage permission from the notice', () => {
    renderFor(true);

    expect(screen.getByText('googlePermissions.writeNotice.message')).toBeInTheDocument();
    fireEvent.click(screen.getByText('googlePermissions.writeNotice.allow'));

    expect(useGooglePermission).toHaveBeenCalledWith(GOOGLE_PERMISSION_GMAIL_MANAGE);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('is dismissed for good', async () => {
    renderFor(true);

    fireEvent.click(screen.getByLabelText('common.dismiss'));

    expect(screen.queryByTestId('gmail-write-notice')).not.toBeInTheDocument();
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(`${API_URL}${GMAIL_WRITE_NOTICE_DISMISS_PATH}`));
    expect(refreshUser).toHaveBeenCalled();
  });
});
