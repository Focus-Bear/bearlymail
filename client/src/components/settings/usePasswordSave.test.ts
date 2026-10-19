import { act, renderHook } from '@testing-library/react';
import axios, { AxiosError } from 'axios';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';

import { usePasswordSave } from './usePasswordSave';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, post: vi.fn(), put: vi.fn() } };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockedPost = vi.mocked(axios.post);
const mockedPut = vi.mocked(axios.put);

const unauthorized = (data: Record<string, unknown>) =>
  new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: HTTP_UNAUTHORIZED,
    data,
    statusText: 'Unauthorized',
    headers: {},
    config: {} as never,
  });

const renderSave = (onSaved = vi.fn()) =>
  renderHook(() => usePasswordSave({ password: 'new-password-123', confirmPassword: 'new-password-123', onSaved }));

describe('usePasswordSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the step-up token with the new password for a user without a password', async () => {
    mockedPost.mockResolvedValueOnce({ data: { step_up_token: 'sso-token' } });
    mockedPut.mockResolvedValueOnce({ data: { success: true } });
    const onSaved = vi.fn();
    const { result } = renderSave(onSaved);

    await act(async () => {
      await result.current.save();
    });

    expect(mockedPost).toHaveBeenCalledWith(`${API_URL}/auth/step-up`, {});
    expect(mockedPut).toHaveBeenCalledWith(
      `${API_URL}/auth/set-password`,
      { password: 'new-password-123', confirmPassword: 'new-password-123' },
      { headers: { 'X-Step-Up-Token': 'sso-token' } }
    );
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.stepUpModalProps.isOpen).toBe(false);
  });

  it('asks a user who has a password for it before changing it', async () => {
    mockedPost
      .mockRejectedValueOnce(unauthorized({ requiresPassword: true }))
      .mockResolvedValueOnce({ data: { step_up_token: 'verified-token' } });
    mockedPut.mockResolvedValueOnce({ data: { success: true } });
    const onSaved = vi.fn();
    const { result } = renderSave(onSaved);

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.stepUpModalProps.isOpen).toBe(true);
    expect(mockedPut).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.stepUpModalProps.onConfirm('current-password');
    });

    expect(mockedPost).toHaveBeenLastCalledWith(
      `${API_URL}/auth/step-up`,
      { password: 'current-password' },
      { _skipInterceptor: true }
    );
    expect(mockedPut).toHaveBeenCalledWith(`${API_URL}/auth/set-password`, expect.anything(), {
      headers: { 'X-Step-Up-Token': 'verified-token' },
    });
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.stepUpModalProps.isOpen).toBe(false);
  });

  it('keeps the modal open with an error when the current password is wrong', async () => {
    mockedPost
      .mockRejectedValueOnce(unauthorized({ requiresPassword: true }))
      .mockRejectedValueOnce(unauthorized({ message: 'Invalid password' }));
    const onSaved = vi.fn();
    const { result } = renderSave(onSaved);

    await act(async () => {
      await result.current.save();
    });
    await act(async () => {
      await result.current.stepUpModalProps.onConfirm('wrong-password');
    });

    expect(result.current.stepUpModalProps.isOpen).toBe(true);
    expect(result.current.stepUpModalProps.error).toBe('stepUp.invalidPassword');
    expect(mockedPut).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the server message when saving fails', async () => {
    mockedPost.mockResolvedValueOnce({ data: { step_up_token: 'sso-token' } });
    mockedPut.mockRejectedValueOnce(
      new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        data: { message: 'Password must be at least 8 characters long' },
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
      })
    );
    const { result } = renderSave();

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe('Password must be at least 8 characters long');
  });
});
