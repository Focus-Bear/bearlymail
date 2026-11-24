/**
 * Unit tests for unsubscribeUtils.ts
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { Email } from 'types/email';

import { UNSUBSCRIBE_METHODS } from 'constants/unsubscribe';

import { extractUnsubscribeLink, isSafeHttpsUrl, resolveUnsubscribeAction } from './unsubscribeUtils';

function htmlWithLink(href: string, text: string): string {
  return `<html><body><p>Some email content.</p><a href="${href}">${text}</a></body></html>`;
}

describe('extractUnsubscribeLink', () => {
  it('returns null when both inputs are null/undefined', () => {
    expect(extractUnsubscribeLink(null, null)).toBeNull();
    expect(extractUnsubscribeLink(undefined, undefined)).toBeNull();
    expect(extractUnsubscribeLink()).toBeNull();
  });

  it('finds unsubscribe link in HTML anchor text', () => {
    const html = htmlWithLink('https://example.com/unsub?id=1', 'Click here to unsubscribe');
    expect(extractUnsubscribeLink(html)).toBe('https://example.com/unsub?id=1');
  });

  it('finds unsubscribe link when keyword is in the href', () => {
    const html = htmlWithLink('https://example.com/unsubscribe/me', 'Manage preferences');
    expect(extractUnsubscribeLink(html)).toBe('https://example.com/unsubscribe/me');
  });

  it('finds opt-out link in HTML', () => {
    const html = htmlWithLink('https://example.com/opt-out', 'Opt-out of emails');
    expect(extractUnsubscribeLink(html)).toBe('https://example.com/opt-out');
  });

  it('returns null for HTML with no unsubscribe link', () => {
    const html = '<html><body><a href="https://example.com">Visit us</a></body></html>';
    expect(extractUnsubscribeLink(html)).toBeNull();
  });

  it('falls back to plain text when HTML has no match', () => {
    const html = '<html><body><p>Nothing here</p></body></html>';
    const body = 'To unsubscribe, visit https://example.com/unsubscribe';
    expect(extractUnsubscribeLink(html, body)).toBe('https://example.com/unsubscribe');
  });

  it('finds URL in plain text on the same line as keyword', () => {
    const body = 'To unsubscribe visit https://lists.example.com/unsub?u=123';
    expect(extractUnsubscribeLink(undefined, body)).toBe('https://lists.example.com/unsub?u=123');
  });

  it('finds URL on the next line after keyword', () => {
    const body = 'Click here to unsubscribe:\nhttps://example.com/remove-me';
    expect(extractUnsubscribeLink(undefined, body)).toBe('https://example.com/remove-me');
  });

  it('returns null for plain text with no unsubscribe URL', () => {
    const body = 'Hello, thanks for signing up!';
    expect(extractUnsubscribeLink(undefined, body)).toBeNull();
  });

  it('skips mailto: hrefs in HTML', () => {
    const html = htmlWithLink('mailto:unsub@example.com', 'unsubscribe');
    // Should not return a mailto: link — and there is no other URL, so null expected
    expect(extractUnsubscribeLink(html)).toBeNull();
  });

  it('handles email preference link', () => {
    const html = htmlWithLink('https://example.com/email-preferences', 'Update your preferences');
    expect(extractUnsubscribeLink(html)).toBe('https://example.com/email-preferences');
  });

  it('strips img and style tags before scanning', () => {
    const html = `<html><body>
      <img src="https://tracker.example.com/track?unsubscribe=1">
      <style>a { color: red; }</style>
      <a href="https://example.com/real-unsub">Unsubscribe</a>
    </body></html>`;
    const result = extractUnsubscribeLink(html);
    expect(result).toBe('https://example.com/real-unsub');
  });

  it('prefers HTML match over plain text when both provided', () => {
    const html = htmlWithLink('https://html-unsub.example.com/unsub', 'Unsubscribe');
    const body = 'Or unsubscribe at https://text-unsub.example.com/unsub';
    const result = extractUnsubscribeLink(html, body);
    expect(result).toBe('https://html-unsub.example.com/unsub');
  });
});

describe('extractUnsubscribeLink — only https links are offered', () => {
  it.each([
    ['plain http', 'http://example.com/unsubscribe'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,unsubscribe'],
    ['relative', '/unsubscribe?u=1'],
  ])('ignores a %s unsubscribe href', (_label, href) => {
    expect(extractUnsubscribeLink(htmlWithLink(href, 'Unsubscribe'))).toBeNull();
  });

  it('ignores http URLs in plain text', () => {
    expect(extractUnsubscribeLink(undefined, 'Unsubscribe: http://example.com/unsubscribe')).toBeNull();
  });
});

describe('isSafeHttpsUrl', () => {
  it('rejects userinfo, which can disguise the real host', () => {
    expect(isSafeHttpsUrl('https://bank.example.com@evil.example/u')).toBe(false);
    expect(isSafeHttpsUrl('https://example.com/u')).toBe(true);
  });
});

describe('resolveUnsubscribeAction', () => {
  const asEmail = (fields: Partial<Email>) => fields as Pick<Email, 'unsubscribeMethod' | 'htmlBody' | 'body'>;

  it("uses the server's List-Unsubscribe method when there is one", () => {
    expect(resolveUnsubscribeAction(asEmail({ unsubscribeMethod: UNSUBSCRIBE_METHODS.MAILTO, body: '' }))).toEqual({
      method: UNSUBSCRIBE_METHODS.MAILTO,
      bodyUrl: null,
    });
  });

  it('falls back to an https link in the loaded body', () => {
    const htmlBody = htmlWithLink('https://example.com/unsub', 'Unsubscribe');
    expect(resolveUnsubscribeAction(asEmail({ unsubscribeMethod: null, htmlBody, body: '' }))).toEqual({
      method: UNSUBSCRIBE_METHODS.LINK,
      bodyUrl: 'https://example.com/unsub',
    });
  });

  it('returns null when neither offers a way to unsubscribe (e.g. an inbox card with no body)', () => {
    expect(resolveUnsubscribeAction(asEmail({ body: '' }))).toBeNull();
  });
});
