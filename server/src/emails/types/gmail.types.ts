/**
 * Interfaces mirroring the Gmail API response shape.
 * Property names (e.g. `data`) are defined by the external API contract.
 */
export interface GmailPayloadPart {
  body?: { data?: string };
  mimeType?: string;
  parts?: GmailPayloadPart[];
}

export interface GmailPayload {
  body?: { data?: string };
  mimeType?: string;
  parts?: GmailPayloadPart[];
  snippet?: string;
}
