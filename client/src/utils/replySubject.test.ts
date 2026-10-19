import { buildReplySubject } from './replySubject';

describe('buildReplySubject', () => {
  it('prefixes a reply with "Re:"', () => {
    expect(buildReplySubject('reply', 'Interview Update - Focus Bear')).toBe('Re: Interview Update - Focus Bear');
  });

  it('prefixes reply-all with "Re:" too', () => {
    expect(buildReplySubject('replyAll', 'Intro')).toBe('Re: Intro');
  });

  it('prefixes a forward with "Fwd:"', () => {
    expect(buildReplySubject('forward', 'Intro')).toBe('Fwd: Intro');
  });

  it('does not double an existing prefix, whatever its case', () => {
    expect(buildReplySubject('reply', 'RE: Intro')).toBe('RE: Intro');
    expect(buildReplySubject('forward', 'fwd: Intro')).toBe('fwd: Intro');
  });

  it('keeps the prefix for an original with no subject', () => {
    expect(buildReplySubject('reply', undefined)).toBe('Re: ');
  });
});
