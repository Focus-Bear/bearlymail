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
