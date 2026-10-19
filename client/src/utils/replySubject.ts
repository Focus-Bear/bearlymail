import { REPLY_MODE_FORWARD } from 'constants/strings';

const REPLY_SUBJECT_PREFIX = 'Re:';
const FORWARD_SUBJECT_PREFIX = 'Fwd:';

type ReplyMode = 'reply' | 'replyAll' | 'forward';

/**
 * Subject a reply or forward starts with: the original subject prefixed with
 * "Re:" / "Fwd:" unless it already carries that prefix.
 */
export function buildReplySubject(mode: ReplyMode, originalSubject: string | null | undefined): string {
  const subject = originalSubject || '';
  const prefix = mode === REPLY_MODE_FORWARD ? FORWARD_SUBJECT_PREFIX : REPLY_SUBJECT_PREFIX;
  return subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`;
}
