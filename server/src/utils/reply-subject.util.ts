export const SUBJECT_PREFIXES = {
  RE: "Re:",
  FWD: "Fwd:",
} as const;

export type SubjectPrefix =
  (typeof SUBJECT_PREFIXES)[keyof typeof SUBJECT_PREFIXES];

export function buildReplySubject(subject: string, isForward: boolean): string {
  const prefix: SubjectPrefix = isForward
    ? SUBJECT_PREFIXES.FWD
    : SUBJECT_PREFIXES.RE;
  if (!subject) return prefix;
  return subject.toLowerCase().startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject}`;
}
