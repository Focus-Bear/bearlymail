import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import VerifyEmail from 'pages/VerifyEmail';

vi.mock('axios');
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockedAxios = axios as unknown as { post: ReturnType<typeof vi.fn> };

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyEmail page', () => {
  it('redeems the token once and confirms', async () => {
    mockedAxios.post.mockResolvedValue({ data: { verified: true } });

    renderAt('/verify-email?token=abc');

    expect(await screen.findByText('auth.verifyEmail.verifiedTitle')).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/verify-email'), { token: 'abc' });
    expect(screen.getByRole('link', { name: 'auth.signIn' })).toHaveAttribute('href', '/login');
  });

  it('offers a new link when the token is rejected', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('400')).mockResolvedValue({ data: { success: true } });

    renderAt('/verify-email?token=old');

    expect(await screen.findByText('auth.verifyEmail.failedTitle')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('auth.email'), 'ana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'auth.verifyEmail.sendNewLink' }));

    expect(mockedAxios.post).toHaveBeenLastCalledWith(expect.stringContaining('/auth/resend-verification'), {
      email: 'ana@example.com',
    });
    expect(await screen.findByText('auth.verifyEmail.checkInboxTitle')).toBeInTheDocument();
  });

  it('treats a missing token as an expired link without calling the API', () => {
    renderAt('/verify-email');

    expect(screen.getByText('auth.verifyEmail.failedTitle')).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
