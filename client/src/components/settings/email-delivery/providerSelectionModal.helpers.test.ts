/**
 * Unit tests for ProviderSelectionModal helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { getProviderOptions } from './providerSelectionModal.helpers';

const tFunc = (key: string): string => key;

describe('getProviderOptions', () => {
  it('returns exactly 3 options', () => {
    expect(getProviderOptions(tFunc)).toHaveLength(3);
  });

  it('first option is Gmail with correct id', () => {
    const options = getProviderOptions(tFunc);
    expect(options[0].id).toBe('gmail');
    expect(options[0].name).toBe('Gmail');
  });

  it('second option is Office 365 with correct id', () => {
    const options = getProviderOptions(tFunc);
    expect(options[1].id).toBe('office365');
    expect(options[1].name).toBe('Office 365');
  });

  it('third option is Zoho Mail with correct id', () => {
    const options = getProviderOptions(tFunc);
    expect(options[2].id).toBe('zoho');
    expect(options[2].name).toBe('Zoho Mail');
  });

  it('each option has a non-empty color', () => {
    const options = getProviderOptions(tFunc);
    options.forEach(opt => {
      expect(opt.color).toBeTruthy();
    });
  });

  it('description comes from tFunc', () => {
    const options = getProviderOptions(tFunc);
    expect(options[0].description).toBe('settings.emailAccounts.providers.gmail.description');
    expect(options[1].description).toBe('settings.emailAccounts.providers.office365.description');
    expect(options[2].description).toBe('settings.emailAccounts.providers.zoho.description');
  });

  it('omits Apple Mail when includeAppleMail is false', () => {
    const options = getProviderOptions(tFunc, false);
    expect(options.map(opt => opt.id)).not.toContain('apple-mail');
  });

  it('includes Apple Mail as the last option when includeAppleMail is true', () => {
    const options = getProviderOptions(tFunc, true);
    expect(options).toHaveLength(4);
    expect(options[3].id).toBe('apple-mail');
    expect(options[3].name).toBe('Apple Mail');
    expect(options[3].description).toBe('settings.emailAccounts.providers.appleMail.description');
  });
});
