import axios, { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

import { API_URL } from 'config/api';
import { PENDING_GOOGLE_PERMISSION_ACTION_MAX_AGE_MS } from 'constants/numbers';
import {
  GMAIL_WRITE_ACTION_ARCHIVE,
  GOOGLE_PERMISSION_GMAIL_MANAGE,
  GOOGLE_PERMISSION_GMAIL_SEND,
  GOOGLE_PERMISSION_REQUIRED_CODE,
  PENDING_GOOGLE_PERMISSION_ACTION_KEY,
} from 'constants/strings';

import {
  promptForGooglePermission,
  readGooglePermissionRequirement,
  registerGooglePermissionPromptHandler,
  replayPendingAction,
  savePendingAction,
  takePendingAction,
  toPendingAction,
} from './googlePermissionRequired';

const ARCHIVE_URL = `${API_URL}/emails/email-1/archive`;
const JSON_CONTENT_TYPE = 'application/json';

function requestConfig(overrides: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig {
  return {
    method: 'put',
    url: ARCHIVE_URL,
    headers: new AxiosHeaders({ 'Content-Type': JSON_CONTENT_TYPE }),
    ...overrides,
  } as InternalAxiosRequestConfig;
}

function permissionError(body: Record<string, unknown>, status = 403) {
  return { isAxiosError: true, response: { status, data: body }, config: requestConfig() };
}

const ARCHIVE_REFUSAL = {
  code: GOOGLE_PERMISSION_REQUIRED_CODE,
  permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
  action: GMAIL_WRITE_ACTION_ARCHIVE,
};

describe('readGooglePermissionRequirement', () => {
  it('reads the permission and action from the server 403', () => {
    expect(readGooglePermissionRequirement(permissionError(ARCHIVE_REFUSAL))).toEqual({
      permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
      action: GMAIL_WRITE_ACTION_ARCHIVE,
    });
  });

  it.each([
    ['a different 403', permissionError({ message: 'Forbidden' })],
    ['another status', permissionError(ARCHIVE_REFUSAL, 401)],
    ['an unknown permission', permissionError({ ...ARCHIVE_REFUSAL, permission: 'drive' })],
    ['a non-axios error', new Error('boom')],
  ])('ignores %s', (_label, error) => {
    expect(readGooglePermissionRequirement(error)).toBeNull();
  });
});

describe('toPendingAction', () => {
  it('keeps a JSON request so it can be sent again after the redirect', () => {
    const pending = toPendingAction(
      GOOGLE_PERMISSION_GMAIL_SEND,
      requestConfig({ method: 'post', url: `${API_URL}/emails/send`, data: '{"subject":"Hi"}' })
    );

    expect(pending).toEqual(
      expect.objectContaining({
        permission: GOOGLE_PERMISSION_GMAIL_SEND,
        method: 'post',
        url: `${API_URL}/emails/send`,
        body: '{"subject":"Hi"}',
        contentType: JSON_CONTENT_TYPE,
      })
    );
  });

  it('keeps the text fields of a multipart body', () => {
    const formData = new FormData();
    formData.append('reply', 'Thanks!');

    const pending = toPendingAction(GOOGLE_PERMISSION_GMAIL_SEND, requestConfig({ method: 'post', data: formData }));

    expect(pending?.formFields).toEqual([['reply', 'Thanks!']]);
  });

  it('gives up on a body with files: attachments cannot survive the redirect', () => {
    const formData = new FormData();
    formData.append('files', new Blob(['x']), 'a.txt');

    expect(toPendingAction(GOOGLE_PERMISSION_GMAIL_SEND, requestConfig({ method: 'post', data: formData }))).toBeNull();
  });

  it.each([
    ['a read', requestConfig({ method: 'get' })],
    ['another origin', requestConfig({ url: 'https://evil.test/emails/1/archive' })],
  ])('never keeps %s', (_label, config) => {
    expect(toPendingAction(GOOGLE_PERMISSION_GMAIL_MANAGE, config)).toBeNull();
  });
});

describe('pending action storage', () => {
  beforeEach(() => sessionStorage.clear());

  const archive = () => toPendingAction(GOOGLE_PERMISSION_GMAIL_MANAGE, requestConfig());

  it('hands the saved action back once', () => {
    const pending = archive();
    savePendingAction(pending!);

    expect(takePendingAction()).toEqual(pending);
    expect(takePendingAction()).toBeNull();
  });

  it('drops an action left waiting too long', () => {
    const pending = archive()!;
    savePendingAction(pending);

    expect(takePendingAction(pending.savedAt + PENDING_GOOGLE_PERMISSION_ACTION_MAX_AGE_MS + 1)).toBeNull();
  });

  it('refuses a tampered action pointing outside the API', () => {
    sessionStorage.setItem(
      PENDING_GOOGLE_PERMISSION_ACTION_KEY,
      JSON.stringify({ ...archive(), url: 'https://evil.test/steal' })
    );

    expect(takePendingAction()).toBeNull();
  });
});

describe('replayPendingAction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the original request again without reopening the explainer', async () => {
    const request = vi.spyOn(axios, 'request').mockResolvedValue({ data: {} });
    const pending = toPendingAction(GOOGLE_PERMISSION_GMAIL_MANAGE, requestConfig({ data: '{"a":1}' }))!;

    await replayPendingAction(pending);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'put',
        url: ARCHIVE_URL,
        data: '{"a":1}',
        headers: { 'Content-Type': JSON_CONTENT_TYPE },
        _skipGooglePermissionPrompt: true,
      })
    );
  });

  it('rebuilds a multipart body', async () => {
    const request = vi.spyOn(axios, 'request').mockResolvedValue({ data: {} });
    const formData = new FormData();
    formData.append('reply', 'Thanks!');
    const pending = toPendingAction(GOOGLE_PERMISSION_GMAIL_SEND, requestConfig({ method: 'post', data: formData }))!;

    await replayPendingAction(pending);

    const sent = request.mock.calls[0][0].data as FormData;
    expect(sent.get('reply')).toBe('Thanks!');
  });
});

describe('promptForGooglePermission', () => {
  afterEach(() => registerGooglePermissionPromptHandler(null));

  it('hands the explainer the permission, action and the request to retry', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerGooglePermissionPromptHandler(handler);

    await expect(promptForGooglePermission(permissionError(ARCHIVE_REFUSAL), requestConfig())).resolves.toBe(true);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: GOOGLE_PERMISSION_GMAIL_MANAGE,
        action: GMAIL_WRITE_ACTION_ARCHIVE,
        pendingAction: expect.objectContaining({ url: ARCHIVE_URL }),
      })
    );
  });

  it('lets a retried request fail normally', async () => {
    const handler = vi.fn();
    registerGooglePermissionPromptHandler(handler);

    await expect(
      promptForGooglePermission(
        permissionError(ARCHIVE_REFUSAL),
        requestConfig({ _skipGooglePermissionPrompt: true })
      )
    ).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
