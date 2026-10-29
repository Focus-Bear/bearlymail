import { IMAP_CONNECTION_ERROR_CODES } from 'types/imap-account.types';

import {
  failureFromError,
  failureMessageKey,
  fallbackServersFor,
  portForSecurity,
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

  it('trims fields and drops empty optional ones', () => {
    expect(
      toConnectionSettings({
        email: ' friend@crazy.test ',
        password: ' secret ',
        name: '  ',
        username: '',
        servers: fallbackServersFor('friend@crazy.test'),
      })
    ).toMatchObject({
      email: 'friend@crazy.test',
      password: ' secret ',
      name: undefined,
      username: undefined,
      imapHost: 'mail.crazy.test',
    });
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
