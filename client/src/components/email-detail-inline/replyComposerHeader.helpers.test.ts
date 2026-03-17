/**
 * Unit tests for ReplyComposerHeader helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { getHeaderTitle } from './replyComposerHeader.helpers';

const tFunc = (key: string): string => key;

describe('getHeaderTitle', () => {
  it('returns "emailDetail.reply" for reply mode', () => {
    expect(getHeaderTitle('reply', tFunc)).toBe('emailDetail.reply');
  });

  it('returns "emailDetail.replyAll" for replyAll mode', () => {
    expect(getHeaderTitle('replyAll', tFunc)).toBe('emailDetail.replyAll');
  });

  it('returns "emailDetail.forward" for forward mode', () => {
    expect(getHeaderTitle('forward', tFunc)).toBe('emailDetail.forward');
  });
});
