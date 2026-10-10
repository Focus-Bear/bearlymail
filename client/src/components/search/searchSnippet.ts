import { decodeHtmlEntities, stripHtmlTags } from 'utils/emailBodyUtils';

import { MAX_SEARCH_RESULT_LENGTH } from 'constants/numbers';

/**
 * Turns a raw email body into a one-line search preview.
 *
 * Bodies are not reliably plain text — when a message has no `text/plain` part
 * the provider stores markup in `body`, which previously rendered as literal
 * `<p>` tags in the results list. Tags are stripped and entities decoded before
 * truncating, so the limit counts visible characters rather than markup and the
 * snippet can never be cut mid-tag.
 */
export function buildSearchSnippet(
  body: string | undefined,
  maxLength: number = MAX_SEARCH_RESULT_LENGTH
): string {
  if (!body) {
    return '';
  }
  const plainText = decodeHtmlEntities(stripHtmlTags(body))
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.slice(0, maxLength);
}
