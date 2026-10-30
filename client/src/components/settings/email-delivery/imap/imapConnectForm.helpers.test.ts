import { IMAP_CONNECTION_ERROR_CODES } from 'types/imap-account.types';

import {
  failureFromError,
  failureMessageKey,
  fallbackServersFor,
  oauthProviderFor,
  portForSecurity,
  shouldOfferManualSettings,
  toConnectionSettings,
} from './imapConnectForm.helpers';

describe('imapConnectForm helpers', () => {
  it('defaults hosted-domain mail to mail.<domain> over SSL', () => {
    expect(fallbackServersFor('Friend@MyBusiness.com.au')).toEqual({
      imapHost: 'mail.mybusiness.com.au',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'mail.mybusiness.com.au',
      smtpPort: 465,
      smtpSecure: true,
    });
  });

  it('moves a default port with the security mode but keeps custom ports', () => {
    const ports = { SSL: 993, STARTTLS: 143 };
    expect(portForSecurity(993, false, ports)).toBe(143);
    expect(portForSecurity(143, true, ports)).toBe(993);
    expect(portForSecurity(1143, true, ports)).toBe(1143);
  });

  it('sends only the address and password unless servers were entered by hand', () => {
    const values = {
      email: ' friend@crazy.test ',
      password: ' secret ',
      name: '  ',
      username: '',
      servers: fallbackServersFor('friend@crazy.test'),
    };
    expect(toConnectionSettings(values, false)).toEqual({
      email: 'friend@crazy.test',
      password: ' secret ',
      name: undefined,
      username: undefined,
    });
    expect(toConnectionSettings(values, true)).toMatchObject({ imapHost: 'mail.crazy.test', smtpPort: 465 });
  });

  it('maps "hosted by Google/Microsoft/Zoho" to the right sign-in', () => {
    expect(oauthProviderFor({ protocol: 'imap', code: IMAP_CONNECTION_ERROR_CODES.USE_OFFICE365, detail: '' })).toBe(
      'office365'
    );
    expect(
      oauthProviderFor({ protocol: 'imap', code: IMAP_CONNECTION_ERROR_CODES.AUTH_FAILED, detail: '' })
    ).toBeNull();
  });

  it('suggests typing the servers only when they could not be found', () => {
    expect(
      shouldOfferManualSettings({ protocol: 'imap', code: IMAP_CONNECTION_ERROR_CODES.SERVER_NOT_FOUND, detail: '' })
    ).toBe(true);
    expect(
      shouldOfferManualSettings({ protocol: 'imap', code: IMAP_CONNECTION_ERROR_CODES.AUTH_FAILED, detail: '' })
    ).toBe(false);
  });

  it('says which login was rejected', () => {
    expect(failureMessageKey({ protocol: 'smtp', code: IMAP_CONNECTION_ERROR_CODES.AUTH_FAILED, detail: '' })).toBe(
      'settings.imap.errors.auth_failed_smtp'
    );
    expect(
      failureMessageKey({ protocol: 'imap', code: IMAP_CONNECTION_ERROR_CODES.CERTIFICATE_MISMATCH, detail: '' })
    ).toBe('settings.imap.errors.certificate_mismatch');
  });

  it('treats errors without a server explanation as unknown', () => {
    expect(failureFromError(new Error('Network Error'))).toEqual({
      protocol: 'imap',
      code: IMAP_CONNECTION_ERROR_CODES.UNKNOWN,
      detail: 'Network Error',
    });
  });
});
