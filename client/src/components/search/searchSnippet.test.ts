import { buildSearchSnippet } from './searchSnippet';

describe('buildSearchSnippet', () => {
  it('strips markup from an HTML-only body', () => {
    expect(buildSearchSnippet('<p>Hi again,</p><p>Wanted to check if you got my last email.</p>')).toBe(
      'Hi again, Wanted to check if you got my last email.'
    );
  });

  it('decodes entities so they never reach the list as escapes', () => {
    expect(buildSearchSnippet('<p>Tom &amp; Jerry &lt;3 &nbsp;caf&eacute;</p>')).toBe('Tom & Jerry <3 café');
  });

  it('leaves a plain-text body alone apart from collapsing whitespace', () => {
    expect(buildSearchSnippet('Hi VU Disability team,\n\n  I wanted to share a resource.')).toBe(
      'Hi VU Disability team, I wanted to share a resource.'
    );
  });

  it('truncates visible characters rather than markup, so it cannot cut mid-tag', () => {
    expect(buildSearchSnippet('<p>abcdefghij</p>', 4)).toBe('abcd');
  });

  it('drops script and style content instead of showing it as text', () => {
    expect(buildSearchSnippet('<style>.a{color:red}</style><p>Real text</p>')).toBe('Real text');
  });

  it('returns an empty string for a missing body', () => {
    expect(buildSearchSnippet(undefined)).toBe('');
  });
});

describe('buildSearchSnippet — CSS leakage', () => {
  it('previews the message, not the style block, for a tag-free HTML conversion', () => {
    // Reported case: results read "body{ width: 100% !important; … url(data:"
    // because the stored body is a tag-free conversion that kept its <style>
    // text, so there was no <style> element left for the DOM path to remove.
    const body =
      'body{ width: 100% !important; height: 100%; margin: 0; line-height: 1.4; ' +
      'background-color: #F0F2FA; color: #333; } url(data:image/png;base64,AAAA) ' +
      'Invoice from Fullstack Advisory for Focus Bear Pty Ltd is attached.';

    expect(buildSearchSnippet(body)).toBe(
      'Invoice from Fullstack Advisory for Focus Bear Pty Ltd is attached.'
    );
  });
});
