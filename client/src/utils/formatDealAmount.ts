import { STRING_CURRENCY, STRING_USD } from 'constants/strings';

/**
 * Formats a deal value as whole currency units, e.g. "$1,200".
 *
 * `Intl.NumberFormat` throws a RangeError for an unknown currency code, and deals
 * saved before the server validated the code (issue #324) can hold anything. So
 * an unknown code falls back to "1,200 <code>" instead of crashing the page.
 */
export function formatDealAmount(value: number, currency: string | null | undefined, locale: string): string {
  const currencyCode = currency || STRING_USD;
  try {
    return new Intl.NumberFormat(locale, {
      style: STRING_CURRENCY,
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} ${currencyCode}`;
  }
}
