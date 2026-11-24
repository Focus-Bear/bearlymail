import { SavedDraftAttachment } from 'types/draft';

/** Turns a draft's stored attachments back into Files the composers can send. */
export function savedDraftAttachmentsToFiles(attachments: SavedDraftAttachment[] | null | undefined): File[] {
  return (attachments ?? []).map(attachment => {
    const binary = atob(attachment.content);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new File([bytes], attachment.filename, { type: attachment.mimeType });
  });
}

/** Splits a stored comma-separated recipient list into trimmed addresses. */
export function splitDraftRecipients(recipients: string | null | undefined): string[] {
  return (recipients ?? '')
    .split(',')
    .map(address => address.trim())
    .filter(Boolean);
}
