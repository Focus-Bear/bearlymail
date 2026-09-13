/** Shared thresholds and keyword lists for the pre-send tone check. */
export const TONE_CHECK = {
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
