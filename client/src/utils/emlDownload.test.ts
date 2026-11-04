import axios from 'axios';

import { buildEmlDownloadUrl, fetchEmlFile, parseContentDispositionFilename } from './emlDownload';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = vi.mocked(axios.get);

describe('parseContentDispositionFilename', () => {
  it('prefers the RFC 5987 filename* so non-ASCII names survive', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"Caf_ _.eml\"; filename*=UTF-8''Caf%C3%A9%20%E2%98%95.eml"
      )
    ).toBe('Café ☕.eml');
  });

  it('falls back to the quoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename="Invoice 42.eml"')).toBe('Invoice 42.eml');
  });

  it('ignores a malformed filename* and uses the quoted one', () => {
    expect(parseContentDispositionFilename("attachment; filename=\"a.eml\"; filename*=UTF-8''%E0%A4%A")).toBe('a.eml');
  });

  it('returns null when there is no usable name', () => {
    expect(parseContentDispositionFilename(undefined)).toBeNull();
    expect(parseContentDispositionFilename('attachment')).toBeNull();
  });
});

describe('fetchEmlFile', () => {
  it('requests the raw message as a blob and names it from the response header', async () => {
    const blob = new Blob(['Message-ID: <a@b>'], { type: 'message/rfc822' });
    mockedGet.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': "attachment; filename=\"Hi.eml\"; filename*=UTF-8''Hi.eml" },
    });

    const file = await fetchEmlFile('email-1');

    expect(mockedGet).toHaveBeenCalledWith(buildEmlDownloadUrl('email-1'), { responseType: 'blob' });
    expect(buildEmlDownloadUrl('email-1')).toBe('http://localhost:3001/emails/email-1/eml');
    expect(file).toEqual({ blob, filename: 'Hi.eml' });
  });

  it('uses a generic name when the header is not exposed', async () => {
    mockedGet.mockResolvedValue({ data: new Blob(['x']), headers: {} });

    await expect(fetchEmlFile('email-1')).resolves.toEqual(expect.objectContaining({ filename: 'email.eml' }));
  });
});
