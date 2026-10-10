import type { LLMProvider } from "./llm.types";

/** A single addressee of the draft being tone-checked. */
export interface ToneCheckRecipient {
  email: string;
  name?: string | null;
}

export interface ToneCheckOptions {
  text: string;
  rules?: string[];
  provider?: LLMProvider;
  userId?: string;
  scheduledSendAt?: string | null;
  currentTime?: string | null;
  /**
   * Filenames already attached to the draft. The LLM cannot see the composer,
   * so without this it guesses that every "see attached" is a missing file.
   */
  attachmentFilenames?: string[];
  /** To/Cc addressees, used to catch copy-paste errors (wrong name or org). */
  recipients?: ToneCheckRecipient[];
}

export interface ToneCheckResult {
  isOk: boolean;
  significance?: "low" | "medium" | "high";
  suggestions: string[];
  revisedText?: string;
  attachmentReminder?: string | null;
  inappropriateTiming?: string | null;
  /** Set when the draft looks addressed to someone other than its recipients. */
  recipientMismatch?: string | null;
}
