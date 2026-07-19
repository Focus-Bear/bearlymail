/**
 * Unit tests for EmailAccountsSection helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { buildAllAccounts, getDisconnectConfirmKey, getProviderName } from './emailAccounts.helpers';

describe('buildAllAccounts', () => {
  it('stamps each Google account with PROVIDER_GMAIL', () => {
    const result = buildAllAccounts([{ id: 'g1', email: 'alice@gmail.com' }], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('gmail');
    expect(result[0].email).toBe('alice@gmail.com');
  });

  it('stamps each Office 365 account with PROVIDER_OFFICE365', () => {
    const result = buildAllAccounts([], [{ id: 'o1', email: 'bob@company.com' }], []);
    expect(result[0].provider).toBe('office365');
  });

  it('stamps each Zoho account with PROVIDER_ZOHO', () => {
    const result = buildAllAccounts([], [], [{ id: 'z1', email: 'carol@zoho.com' }]);
    expect(result[0].provider).toBe('zoho');
  });

  it('stamps each Apple Mail account with PROVIDER_APPLE_MAIL', () => {
    const result = buildAllAccounts([], [], [], [{ id: 'a1', email: 'dave@icloud.com' }]);
    expect(result[0].provider).toBe('apple-mail');
  });

  it('handles empty arrays', () => {
    expect(buildAllAccounts([], [], [])).toEqual([]);
  });

  it('merges all providers into one flat array in correct order', () => {
    const result = buildAllAccounts(
      [{ id: 'g1', email: 'a@gmail.com' }],
      [{ id: 'o1', email: 'b@office.com' }],
      [{ id: 'z1', email: 'c@zoho.com' }]
    );
    expect(result).toHaveLength(3);
    expect(result.map(acc => acc.provider)).toEqual(['gmail', 'office365', 'zoho']);
  });

  it('preserves additional fields like name and isPrimary', () => {
    const result = buildAllAccounts([{ id: 'g1', email: 'a@gmail.com', name: 'Alice', isPrimary: true }], [], []);
    expect(result[0].name).toBe('Alice');
    expect(result[0].isPrimary).toBe(true);
  });
});

describe('getDisconnectConfirmKey', () => {
  it('returns gmail key for PROVIDER_GMAIL', () => {
    expect(getDisconnectConfirmKey('gmail')).toBe('settings.gmail.confirmDisconnect');
  });

  it('returns office365 key for PROVIDER_OFFICE365', () => {
    expect(getDisconnectConfirmKey('office365')).toBe('settings.office365.confirmDisconnect');
  });

  it('returns zoho key for PROVIDER_ZOHO', () => {
    expect(getDisconnectConfirmKey('zoho')).toBe('settings.zoho.confirmDisconnect');
  });

  it('returns apple mail key for PROVIDER_APPLE_MAIL', () => {
    expect(getDisconnectConfirmKey('apple-mail')).toBe('settings.appleMail.confirmDisconnect');
  });

  it('defaults to zoho key for unknown provider', () => {
    expect(getDisconnectConfirmKey('unknown')).toBe('settings.zoho.confirmDisconnect');
  });
});

describe('getProviderName', () => {
  it('returns "Gmail" for gmail', () => {
    expect(getProviderName('gmail')).toBe('Gmail');
  });

  it('returns "Office 365" for office365', () => {
    expect(getProviderName('office365')).toBe('Office 365');
  });

  it('returns "Zoho Mail" for zoho', () => {
    expect(getProviderName('zoho')).toBe('Zoho Mail');
  });

  it('returns "Apple Mail" for apple-mail', () => {
    expect(getProviderName('apple-mail')).toBe('Apple Mail');
  });

  it('returns the raw provider string for unknown providers', () => {
    expect(getProviderName('custom-provider')).toBe('custom-provider');
  });
});
