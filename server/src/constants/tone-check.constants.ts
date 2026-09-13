/** Shared labels and keyword lists for the pre-send tone check. */
export const TONE_CHECK = {
  /**
   * Placeholder for an empty attachment/recipient list. The prompt's rules key
   * off these exact strings, and they are rendered by the service rather than
   * by a `{% if %}` in the template: an empty array is falsy in our renderer but
   * TRUTHY in the real Nunjucks promptfoo runs the same file through, so a
   * conditional would silently diverge between prod and the prompt tests.
   */
  NO_ATTACHMENTS_LABEL: "(none)",
  UNKNOWN_RECIPIENTS_LABEL: "(unknown)",
  /**
   * Lowercased markers that identify a tone-check suggestion as an
   * "you forgot the attachment" complaint. Such a suggestion is dropped when
   * the draft actually carries attachments — the model cannot see the composer
   * and otherwise blocks the send over a file that is already attached.
   */
  ATTACHMENT_SUGGESTION_KEYWORDS: [
    "attachment",
    "attached",
    "attach the",
    "attach a",
  ],
} as const;
