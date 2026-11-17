import {
  extractEmailAddress,
  parseRecipientsFromString,
} from "../utils/email-address.utils";

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at > 0 ? address.slice(at + 1) : "";
}

/**
 * Chooses the address an auto-response goes to. Both headers are set by the
 * sender, so Reply-To is only honoured when it is a single address on the same
 * domain as From; otherwise the reply goes to From.
 */
export function selectAutoResponseRecipient(
  from: string,
  replyTo: string | null | undefined,
): string {
  const fromAddress = extractEmailAddress(from);
  if (!replyTo) return fromAddress;

  const replyToAddresses = parseRecipientsFromString(replyTo);
  if (replyToAddresses.length !== 1) return fromAddress;

  const replyToAddress = extractEmailAddress(replyToAddresses[0].email);
  const fromDomain = domainOf(fromAddress);
  if (fromDomain && domainOf(replyToAddress) === fromDomain) {
    return replyToAddress;
  }
  return fromAddress;
}
