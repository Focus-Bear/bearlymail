import {
  FOCUS_BEAR_CREATE_TASK_URL,
  FOCUS_BEAR_TASK_ELLIPSIS,
  FOCUS_BEAR_TASK_MAX_NOTES_LENGTH,
  FOCUS_BEAR_TASK_MAX_TITLE_LENGTH,
  FOCUS_BEAR_TASK_MAX_URL_LENGTH,
  FOCUS_BEAR_TASK_PARAM,
  FOCUS_BEAR_TASK_SOURCE_BEARLYMAIL,
} from 'constants/focusBearTaskLink';

const MAX_ENCODED_CHARACTER_LENGTH = 12;

/** The email an action item came from, as "Save to Focus Bear" describes it. */
export interface FocusBearTaskSource {
  emailSubject: string;
  sender: string;
  emailUrl: string;
}

/** Describes `email` for its action items' Focus Bear tasks, linking back to it under `appOrigin`. */
export function focusBearTaskSourceFor(
  email: { id: string; subject: string; from: string; fromName?: string },
  appOrigin: string
): FocusBearTaskSource {
  return {
    emailSubject: email.subject,
    sender: email.fromName || email.from,
    emailUrl: `${appOrigin}/email/${encodeURIComponent(email.id)}`,
  };
}

export interface FocusBearTaskDraft {
  title: string;
  notes?: string;
  /** Opens the email the task came from, back in BearlyMail. */
  link?: string;
  /** The Focus Bear project to file the task in. */
  projectId?: string;
  /** `YYYY-MM-DD`. */
  dueDate?: string;
}

/** What the link carries besides the text, all sent whole: a cut id or date means nothing. */
type FocusBearTaskTarget = Pick<FocusBearTaskDraft, 'link' | 'projectId' | 'dueDate'>;

/** Shortens `text` to at most `maxLength` characters, ending in an ellipsis when cut. */
export function truncateForFocusBear(text: string, maxLength: number): string {
  const characters = Array.from(text.trim());
  if (characters.length <= maxLength) {
    return characters.join('');
  }
  if (maxLength <= 0) {
    return '';
  }
  return (
    characters
      .slice(0, maxLength - 1)
      .join('')
      .trimEnd() + FOCUS_BEAR_TASK_ELLIPSIS
  );
}

function encodeTaskLink(title: string, notes: string, { link, projectId, dueDate }: FocusBearTaskTarget): string {
  const params = new URLSearchParams();
  params.set(FOCUS_BEAR_TASK_PARAM.TITLE, title);
  if (notes) {
    params.set(FOCUS_BEAR_TASK_PARAM.NOTES, notes);
  }
  if (link) {
    params.set(FOCUS_BEAR_TASK_PARAM.LINK, link);
  }
  if (projectId) {
    params.set(FOCUS_BEAR_TASK_PARAM.PROJECT_ID, projectId);
  }
  if (dueDate) {
    params.set(FOCUS_BEAR_TASK_PARAM.DUE_DATE, dueDate);
  }
  params.set(FOCUS_BEAR_TASK_PARAM.SOURCE, FOCUS_BEAR_TASK_SOURCE_BEARLYMAIL);
  // URLSearchParams writes spaces as "+"; %20 is what every URL parser decodes the same way.
  return `${FOCUS_BEAR_CREATE_TASK_URL}?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * The `focusbear://create-task?…` link for a task. Notes are shortened first,
 * then the title, until the encoded link fits FOCUS_BEAR_TASK_MAX_URL_LENGTH;
 * the link back to the email, the project and the due date are never cut, because
 * a cut one means nothing.
 */
export function buildFocusBearTaskLink(draft: FocusBearTaskDraft): string {
  let title = truncateForFocusBear(draft.title, FOCUS_BEAR_TASK_MAX_TITLE_LENGTH);
  let notes = truncateForFocusBear(draft.notes ?? '', FOCUS_BEAR_TASK_MAX_NOTES_LENGTH);
  let url = encodeTaskLink(title, notes, draft);

  while (url.length > FOCUS_BEAR_TASK_MAX_URL_LENGTH && notes) {
    notes = truncateForFocusBear(notes, Array.from(notes).length - excessCharacters(url));
    url = encodeTaskLink(title, notes, draft);
  }
  while (url.length > FOCUS_BEAR_TASK_MAX_URL_LENGTH && title) {
    title = truncateForFocusBear(title, Array.from(title).length - excessCharacters(url));
    url = encodeTaskLink(title, notes, draft);
  }
  return url;
}

/**
 * Characters to cut so the link shrinks by at least its overflow without
 * cutting more than needed: one character encodes to at most four UTF-8 bytes,
 * each written as "%XX". At least one, so every pass makes progress.
 */
function excessCharacters(url: string): number {
  return Math.max(1, Math.floor((url.length - FOCUS_BEAR_TASK_MAX_URL_LENGTH) / MAX_ENCODED_CHARACTER_LENGTH));
}
