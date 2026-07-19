/**
 * A granular, ordered record of how a thread's category was decided — every
 * step that produced (or could have produced) a category, and which one won.
 *
 * Motivation: the category debug UI used to show the model's prediction next to
 * the stored category with no record of the steps in between, so an override
 * silently re-routing a confident category (e.g. the GitHub "bot-updates"
 * reserved category clobbering a local-model "CI/CD & QA Pipeline Failures"
 * pick) was invisible. This trace makes each step explicit so "what actually
 * set the category?" is answerable from the stored data alone.
 *
 * Persisted on `EmailThread.categoryDecisionTrace` by whichever pipeline wrote
 * the final category (deterministic rule / local model / LLM priority).
 */

/** The processing steps that can produce a category candidate, in pipeline order. */
export type CategoryDecisionStepName =
  | "deterministic-rule"
  | "local-model"
  | "llm"
  | "proto-match"
  | "priority-over-other-guard"
  | "github-override"
  /**
   * A proto-category promotion/fold bulk-reassigned this thread's category (it did
   * NOT go through per-thread priority analysis). Recorded so the debug UI stops
   * showing a stale "set by priority" for threads a promotion actually moved.
   */
  | "proto-promotion";

export type CategoryDecisionOutcome =
  /** This step produced the value that became (part of) the final category. */
  | "applied"
  /** Ran and produced a candidate, but another step's value won. */
  | "considered"
  /** Would have applied, but was deliberately gated out (records why). */
  | "suppressed"
  /** Did not run / not applicable to this thread. */
  | "skipped";

export interface CategoryDecisionStep {
  step: CategoryDecisionStepName;
  outcome: CategoryDecisionOutcome;
  /** Category name this step produced or would have produced. */
  category: string | null;
  /** Resolved UserContext (EMAIL_CATEGORY) id, when this step knew one. */
  categoryId: string | null;
  /** Human-readable explanation of what this step did and why. */
  detail: string;
}

/**
 * The concrete process that wrote this trace — distinct from `source`, which is
 * only a coarse precedence bucket. Answers "what process categorised it?".
 */
export type CategoryDecisionWriter =
  | "llm-refine"
  | "deterministic-rule"
  | "local-model"
  | "incremental"
  | "proto-promotion"
  | "retro-apply";

/** What kicked off the run that produced this trace. */
export type CategoryDecisionTrigger =
  | "new-email"
  | "forced-recalc"
  | "scheduled-bulk"
  | "rule-retro"
  | "proto-promotion";

/** What content the deciding step actually received as its input. */
export type CategoryDecisionContentSource =
  /** The email's pre-computed AI summary. */
  | "ai-summary"
  /** The email's cleaned plain-text body (summary absent or bypassed, e.g. QA emails). */
  | "cleaned-body"
  /** The thread-level summary (incremental re-categorisation). */
  | "thread-summary"
  /** Sender/subject/body metadata only (deterministic rule matching). */
  | "email-metadata";

/**
 * Which email the decision was computed from — the single biggest source of
 * "why is this category stale?" confusion. The pipeline analyses ONE email's
 * content (the one that queued the job), so when that isn't the thread's
 * latest message the category can lag reality (e.g. a QA-fail category
 * surviving a later "QA PASS" reply). Recording it makes that visible.
 */
export interface CategoryDecisionAnalyzedEmail {
  emailId: string;
  receivedAt: string | null;
  /** True when this email was the newest in the thread at decision time. */
  wasLatestInThread?: boolean;
  /** How many emails the thread had at decision time. */
  threadEmailCount?: number;
  /** What content the deciding model/step actually saw. */
  contentSource?: CategoryDecisionContentSource;
}

export interface CategoryDecisionTrace {
  decidedAt: string;
  /** Which pipeline wrote the final answer. Mirrors `EmailThread.categorySource`. */
  source: "user" | "rule" | "local" | "priority" | "summary" | null;
  /** The concrete process that categorised the thread (for the debug UI). */
  writtenBy?: CategoryDecisionWriter;
  /** What triggered this categorisation run. */
  trigger?: CategoryDecisionTrigger;
  /** The email this decision was computed from (absent for bulk writers like retro-apply/proto-promotion that don't analyse a single email). */
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
  finalCategory: string | null;
  finalCategoryId: string | null;
  steps: CategoryDecisionStep[];
}
