import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { redirectToGooglePermissionGrant } from 'utils/googlePermissionGrant';
import { GooglePermissionPrompt, takePendingAction } from 'utils/googlePermissionRequired';

import { API_URL } from 'config/api';
import {
  GMAIL_WRITE_ACTION_ARCHIVE,
  GMAIL_WRITE_ACTION_SEND,
  GOOGLE_PERMISSION_GMAIL_MANAGE,
  GOOGLE_PERMISSION_GMAIL_SEND,
} from 'constants/strings';

import { GooglePermissionExplainer } from './GooglePermissionExplainer';

type PromptHandler = (prompt: GooglePermissionPrompt) => Promise<void>;
const registered = vi.hoisted(() => ({ handler: null as null | ((prompt: never) => Promise<void>) }));

vi.mock('utils/googlePermissionRequired', async importOriginal => {
  const actual = await importOriginal<typeof import('utils/googlePermissionRequired')>();
  return {
    ...actual,
    registerGooglePermissionPromptHandler: (handler: PromptHandler | null) => {
      registered.handler = handler as never;
    },
  };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({ useNotifications: () => ({ showError }) }));
vi.mock('utils/googlePermissionGrant', () => ({ redirectToGooglePermissionGrant: vi.fn() }));

const archivePrompt: GooglePermissionPrompt = {
  permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
  action: GMAIL_WRITE_ACTION_ARCHIVE,
  pendingAction: {
    permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
    method: 'put',
    url: `${API_URL}/emails/email-1/archive`,
    params: {},
    savedAt: Date.now(),
  },
};

/** Raises a prompt the way the axios interceptor does; resolves when the user cancels. */
function raise(prompt: GooglePermissionPrompt): Promise<void> {
  let settled!: Promise<void>;
  act(() => {
    settled = (registered.handler as unknown as PromptHandler)(prompt);
  });
  return settled;
}

describe('GooglePermissionExplainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    render(<GooglePermissionExplainer />);
  });

  it('renders nothing until an action needs a permission', () => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains why archiving needs Gmail manage permission before going to Google', () => {
    void raise(archivePrompt);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/googlePermissions.explainer.gmail_manage.title/)).toBeInTheDocument();
    expect(screen.getByText('googlePermissions.explainer.actions.archive')).toBeInTheDocument();
    expect(screen.getByText('googlePermissions.explainer.gmail_manage.reassurance')).toBeInTheDocument();
    expect(screen.getByText('googlePermissions.explainer.afterwardsRetry')).toBeInTheDocument();
    expect(redirectToGooglePermissionGrant).not.toHaveBeenCalled();
  });

  it('asks for send permission for a send, and says to try again when it can’t be retried', () => {
    void raise({ permission: GOOGLE_PERMISSION_GMAIL_SEND, action: GMAIL_WRITE_ACTION_SEND, pendingAction: null });

    expect(screen.getByText(/googlePermissions.explainer.gmail_send.title/)).toBeInTheDocument();
    expect(screen.getByText('googlePermissions.explainer.actions.send')).toBeInTheDocument();
    expect(screen.getByText('googlePermissions.explainer.afterwardsTryAgain')).toBeInTheDocument();
  });

  it('Continue keeps the action for the return trip and goes to Google for just that permission', async () => {
    void raise(archivePrompt);

    fireEvent.click(screen.getByText('googlePermissions.explainer.continue'));

    await waitFor(() => expect(redirectToGooglePermissionGrant).toHaveBeenCalledWith(GOOGLE_PERMISSION_GMAIL_MANAGE));
    expect(takePendingAction()).toEqual(archivePrompt.pendingAction);
  });

  it('Cancel closes the explainer and lets the original request fail', async () => {
    const settled = raise(archivePrompt);

    fireEvent.click(screen.getByText('common.cancel'));

    await expect(settled).resolves.toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(redirectToGooglePermissionGrant).not.toHaveBeenCalled();
    expect(takePendingAction()).toBeNull();
  });

  it('forgets the action and says so if Google can’t be opened', async () => {
    vi.mocked(redirectToGooglePermissionGrant).mockRejectedValueOnce(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const settled = raise(archivePrompt);

    fireEvent.click(screen.getByText('googlePermissions.explainer.continue'));

    await expect(settled).resolves.toBeUndefined();
    expect(showError).toHaveBeenCalledWith('googlePermissions.startError');
    expect(takePendingAction()).toBeNull();
  });
});
