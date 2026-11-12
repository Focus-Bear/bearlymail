import { isValidEmail, parseRecipientString, splitRecipientList } from 'utils/recipientParser';

const parseEditedRecipients = (editedValue: string): string[] =>
  splitRecipientList(editedValue)
    .map(token => token.trim())
    .filter(token => token.length > 0);

const addressOf = (token: string): string => (parseRecipientString(token)[0]?.email ?? token).trim().toLowerCase();

/** Keeps the first recipient for each address, so an edit never lists the same person twice. */
const withoutRepeatedAddresses = (tokens: string[]): string[] => {
  const seenAddresses = new Set<string>();
  return tokens.filter(token => {
    const address = addressOf(token);
    if (seenAddresses.has(address)) {
      return false;
    }
    seenAddresses.add(address);
    return true;
  });
};

/**
 * Replaces the recipient at `index` with what the user typed into its chip.
 * Clearing the text removes the recipient, and a comma-separated edit splits
 * into several. An address already in the list is not added again. Returns
 * null when any typed token is not an address, so the caller keeps the chip's
 * original value rather than committing a bad one.
 */
export const replaceEditedRecipient = (tags: string[], index: number, editedValue: string): string[] | null => {
  const replacements = parseEditedRecipients(editedValue);
  if (replacements.some(token => !isValidEmail(token))) {
    return null;
  }
  return withoutRepeatedAddresses([...tags.slice(0, index), ...replacements, ...tags.slice(index + 1)]);
};
