import { Email } from "../database/entities/email.entity";

/** Escape the HTML-significant characters so text renders literally. */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Build the plain-text body for a forwarded email, prepending the conventional
 * "---------- Forwarded message ---------" header block with the original
 * email's metadata and content.
 */
export function buildForwardBody(
  userText: string,
  originalEmail: Email,
): string {
  const fromDisplay = originalEmail.fromName
    ? `${originalEmail.fromName} <${originalEmail.from}>`
    : originalEmail.from;

  const header = [
    "---------- Forwarded message ---------",
    `From: ${fromDisplay}`,
    `Date: ${originalEmail.receivedAt.toUTCString()}`,
    `Subject: ${originalEmail.subject}`,
    `To: ${originalEmail.to ?? ""}`,
  ].join("\n");

  // Prefer HTML body if available so rich content survives forwarding
  const originalBody = originalEmail.htmlBody || originalEmail.body || "";

  return `${userText}\n\n${header}\n\n${originalBody}`;
}

/**
 * Build the HTML body for a forwarded email. Mirrors {@link buildForwardBody}
 * but joins the "Forwarded message" header with <br> instead of \n, so the
 * header (and the user's signature appended after it) keep their line breaks
 * when the message is rendered as HTML — plain \n collapses in HTML clients.
 */
export function buildForwardHtmlBody(
  userHtml: string,
  originalEmail: Email,
): string {
  const fromDisplay = originalEmail.fromName
    ? `${escapeHtml(originalEmail.fromName)} &lt;${escapeHtml(originalEmail.from)}&gt;`
    : escapeHtml(originalEmail.from);

  const header = [
    "---------- Forwarded message ---------",
    `From: ${fromDisplay}`,
    `Date: ${escapeHtml(originalEmail.receivedAt.toUTCString())}`,
    `Subject: ${escapeHtml(originalEmail.subject ?? "")}`,
    `To: ${escapeHtml(originalEmail.to ?? "")}`,
  ].join("<br>");

  // Prefer the original HTML so rich content survives; the plain-text fallback
  // is escaped so it renders literally rather than as stray markup.
  const originalBody =
    originalEmail.htmlBody || escapeHtml(originalEmail.body || "");

  return `${userHtml}<br><br>${header}<br><br>${originalBody}`;
}
