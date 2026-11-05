import { MILLISECONDS } from "./time-constants";

/** Tuning and wire format for downloading one message as an `.eml` file. */
export const EML_DOWNLOAD = {
  /** RFC 2046 media type for a complete RFC 822 message. */
  CONTENT_TYPE: "message/rfc822",
  FILE_EXTENSION: ".eml",
  /** Used when the subject is empty or nothing printable survives sanitising. */
  FALLBACK_FILENAME_STEM: "email",
  /** Long subjects would exceed common filesystem name limits (255 bytes). */
  MAX_FILENAME_STEM_LENGTH: 100,
  /**
   * One message per request is a normal reading action, but the endpoint still
   * hands out complete raw messages, so scripted bulk pulls are capped.
   */
  RATE_LIMIT: 30,
  RATE_WINDOW_MS: MILLISECONDS.MINUTE,
  AUDIT_ACTION: "EMAIL_RAW_DOWNLOAD",
  AUDIT_TARGET_TYPE: "email",
} as const;
