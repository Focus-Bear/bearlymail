/**
 * Pure helper functions extracted from ReplyComposerHeader.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const REPLY_MODE_FORWARD = 'forward' as const;
const REPLY_MODE_REPLY_ALL = 'replyAll' as const;

export function getHeaderTitle(replyMode: 'reply' | 'replyAll' | 'forward', tFunc: (key: string) => string): string {
  if (replyMode === REPLY_MODE_FORWARD) {
    return tFunc('emailDetail.forward');
  }
  if (replyMode === REPLY_MODE_REPLY_ALL) {
    return tFunc('emailDetail.replyAll');
  }
  return tFunc('emailDetail.reply');
}
