import { isValidEmail, splitRecipientList } from 'utils/recipientParser';

const parseEditedRecipients = (editedValue: string): string[] =>
  splitRecipientList(editedValue)
    .map(token => token.trim())
    .filter(token => token.length > 0);

/**
 * Replaces the recipient at `index` with what the user typed into its chip.
 * Clearing the text removes the recipient, and a comma-separated edit splits
 * into several. Returns null when any typed token is not an address, so the
 * caller keeps the chip's original value rather than committing a bad one.
 */
export const replaceEditedRecipient = (tags: string[], index: number, editedValue: string): string[] | null => {
  const replacements = parseEditedRecipients(editedValue);
  if (replacements.some(token => !isValidEmail(token))) {
    return null;
  }
  return [...tags.slice(0, index), ...replacements, ...tags.slice(index + 1)];
};
