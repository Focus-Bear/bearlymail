import { formatDealAmount } from './formatDealAmount';

describe('formatDealAmount', () => {
  it('formats a known currency', () => {
    expect(formatDealAmount(1200, 'USD', 'en-US')).toBe('$1,200');
  });

  it('defaults to USD when the deal has no currency', () => {
    expect(formatDealAmount(50, null, 'en-US')).toBe('$50');
  });

  // Issue #324: a deal stored with markup as its currency made Intl.NumberFormat
  // throw and blanked the Deals page.
  it('falls back to the raw code instead of throwing on an invalid currency', () => {
    const payload = '<img src=x onerror=alert(1)>';

    expect(() => formatDealAmount(1200, payload, 'en-US')).not.toThrow();
    expect(formatDealAmount(1200, payload, 'en-US')).toBe(`1,200 ${payload}`);
  });
});
