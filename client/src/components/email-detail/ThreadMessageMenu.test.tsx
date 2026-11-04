import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { ThreadMessageMenu } from './ThreadMessageMenu';

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return { default: { ...actual.default, get: vi.fn(), isAxiosError: actual.default.isAxiosError } };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError }),
}));

const mockedGet = vi.mocked(axios.get);
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
// jsdom has no object URLs; give the download path something to call.
Object.assign(window.URL, { createObjectURL, revokeObjectURL });

const RAW_EML = new Blob(['Message-ID: <a@b>\r\nSubject: Hi\r\n\r\nBody'], { type: 'message/rfc822' });

function renderInsideClickableHeader(onHeaderClick: () => void) {
  return render(
    <div onClick={onHeaderClick}>
      <ThreadMessageMenu emailId="email-42" />
    </div>
  );
}

async function chooseDownloadEml() {
  await userEvent.click(screen.getByRole('button', { name: 'emailDetail.messageOptions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /emailDetail.downloadEml/ }));
}

describe('ThreadMessageMenu', () => {
  let clickedDownloads: string[];

  beforeEach(() => {
    createObjectURL.mockReturnValue('blob:eml');
    clickedDownloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('downloads the message as .eml when "Download .eml" is chosen', async () => {
    mockedGet.mockResolvedValue({
      data: RAW_EML,
      headers: { 'content-disposition': "attachment; filename=\"Hi.eml\"; filename*=UTF-8''Hi.eml" },
    });
    renderInsideClickableHeader(vi.fn());

    await chooseDownloadEml();

    expect(mockedGet).toHaveBeenCalledWith('http://localhost:3001/emails/email-42/eml', { responseType: 'blob' });
    expect(createObjectURL).toHaveBeenCalledWith(RAW_EML);
    expect(clickedDownloads).toEqual(['Hi.eml']);
    expect(showError).not.toHaveBeenCalled();
  });

  it('does not expand/collapse the message it sits in', async () => {
    mockedGet.mockResolvedValue({ data: RAW_EML, headers: {} });
    const onHeaderClick = vi.fn();
    renderInsideClickableHeader(onHeaderClick);

    await chooseDownloadEml();

    expect(onHeaderClick).not.toHaveBeenCalled();
  });

  it('explains when the email provider cannot supply the original message', async () => {
    mockedGet.mockRejectedValue(
      Object.assign(new Error('Not Implemented'), { isAxiosError: true, response: { status: 501 } })
    );
    renderInsideClickableHeader(vi.fn());

    await chooseDownloadEml();

    expect(showError).toHaveBeenCalledWith('emailDetail.downloadEmlUnsupported');
    expect(clickedDownloads).toEqual([]);
  });

  it('shows a generic error for other failures', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));
    renderInsideClickableHeader(vi.fn());

    await chooseDownloadEml();

    expect(showError).toHaveBeenCalledWith('emailDetail.downloadEmlFailed');
  });
});
