import { PROVIDER_GMAIL, PROVIDER_IMAP, PROVIDER_OFFICE365 } from 'constants/strings';

import {
  getProviderReassurance,
  getStillSnoozedThreads,
  REASSURANCE_GENERIC_KEY,
  REASSURANCE_NAMED_KEY,
} from './accountDeletion.helpers';

describe('getStillSnoozedThreads', () => {
  it('reads the count from the deletion response', () => {
    expect(getStillSnoozedThreads({ success: true, stillSnoozedThreads: 3 })).toBe(3);
  });

  it.each([undefined, null, {}, { stillSnoozedThreads: 0 }, { stillSnoozedThreads: '2' }])(
    'treats %p as nothing left snoozed',
    responseData => {
      expect(getStillSnoozedThreads(responseData)).toBe(0);
    }
  );
});

describe('getProviderReassurance', () => {
  it('names Gmail for a Gmail-only account', () => {
    expect(getProviderReassurance([PROVIDER_GMAIL])).toEqual({
      key: REASSURANCE_NAMED_KEY,
      params: { providers: ['Gmail'], count: 1 },
    });
  });

  it('calls an Office 365 mailbox Outlook, the name people know it by', () => {
    expect(getProviderReassurance([PROVIDER_OFFICE365]).params?.providers).toEqual(['Outlook']);
  });

  it('names each provider once when several accounts are connected', () => {
    expect(getProviderReassurance([PROVIDER_GMAIL, PROVIDER_GMAIL, PROVIDER_OFFICE365])).toEqual({
      key: REASSURANCE_NAMED_KEY,
      params: { providers: ['Gmail', 'Outlook'], count: 2 },
    });
  });

  it('uses the provider-neutral wording when an unbranded IMAP mailbox is connected', () => {
    expect(getProviderReassurance([PROVIDER_GMAIL, PROVIDER_IMAP])).toEqual({ key: REASSURANCE_GENERIC_KEY });
  });

  it('uses the provider-neutral wording before the accounts have loaded', () => {
    expect(getProviderReassurance([])).toEqual({ key: REASSURANCE_GENERIC_KEY });
  });
});
