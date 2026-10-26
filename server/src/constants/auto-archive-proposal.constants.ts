/**
 * Tuning for the auto-archive proposal miner (heavy senders whose mail the user
 * ignores → a proposed "from X AND subject contains Y → archive" workflow).
 *
 * Every threshold the miner compares against lives here so it can be tuned in
 * one place; the algorithm itself never hard-codes a sender or a keyword.
 */
export const AUTO_ARCHIVE_PROPOSAL_CONFIG = {
  /** Look-back window for volume, clustering and the precision simulation. */
  WINDOW_DAYS: 60,
  /** A sender (address or domain group) is "heavy" at this many emails in the window. */
  MIN_SENDER_VOLUME: 20,
  /** Addresses below this volume are never folded into a domain group. */
  MIN_DOMAIN_MEMBER_VOLUME: 3,
  /** Domain groups with more distinct addresses than this look like people, not a notifier. */
  MAX_DOMAIN_GROUP_ADDRESSES: 8,
  /**
   * Emails analysed per sender (bounds CPU and decryption). Sampled evenly
   * across the window, not the newest N: a heavy sender like GitHub fills 600
   * in a few days, which hid weeks of engagement history and the variety of
   * its notification types.
   */
  MAX_EMAILS_PER_SENDER: 600,
  /** Body characters used for clustering and body-keyword candidates. */
  BODY_HEAD_CHARS: 400,

  /** Smallest cluster (training emails) that may produce a proposal. */
  MIN_CLUSTER_SIZE: 8,
  /** Cosine similarity (TF-IDF) needed to join / merge a cluster at the first level. */
  CLUSTER_SIMILARITY_THRESHOLD: 0.3,
  /**
   * A cluster the user does engage with is re-clustered this much tighter, so
   * a noisy template hiding inside a mixed group ("Run failed: Check
   * Translations" among CI failures the user reads) can still surface.
   */
  CLUSTER_REFINE_STEP: 0.1,
  /** Refinement stops once the threshold reaches this. */
  MAX_CLUSTER_SIMILARITY_THRESHOLD: 0.7,
  /** Weight of subject features relative to body features in the vectors. */
  SUBJECT_FEATURE_WEIGHT: 1,
  /** Body tokens (after normalisation) that feed the clustering vector. */
  BODY_FEATURE_TOKENS: 40,

  /** z for the Wilson score interval (1.96 ≈ 95%). */
  WILSON_Z: 1.96,
  /**
   * A cluster is noise only if the Wilson UPPER bound of its engagement rate is
   * at or below this. With zero engagement that needs ≥ 16 emails, so small
   * clusters can never produce a confident proposal.
   */
  MAX_ENGAGEMENT_UPPER_BOUND: 0.2,

  /** A keyword condition must match at least this share of its cluster. */
  MIN_KEYWORD_COVERAGE: 0.8,
  /** Longest keyword phrase, in words. */
  MAX_PHRASE_WORDS: 4,
  /** Shortest alphabetic run a phrase must contain to be meaningful. */
  MIN_PHRASE_WORD_CHARS: 3,
  /**
   * A phrase word is "distinctive" for a cluster when at most this share of the
   * sender's OTHER emails contain it. Phrases with more distinctive words win,
   * so "Check Translations" beats the repo name every notification carries.
   */
  DISTINCTIVE_MAX_OUTSIDE_SHARE: 0.1,
  /** Subject/body phrases kept when searching subject+body pairs. */
  MAX_PAIR_CANDIDATES: 8,

  /**
   * Precision safeguard (window AND held-out): emails the user replied to,
   * starred or raised the priority of that a rule may have archived. None.
   */
  MAX_STRONG_ENGAGEMENT_CAUGHT: 0,
  /**
   * ...and emails the user opened and kept reading, as a share of the rule's
   * matches. "About zero": 1 read in 100 CI failures is tolerated, 1 in 48 is not.
   */
  MAX_OPENED_CAUGHT_SHARE: 0.02,
  /** Share of matched emails that may be "glances" (opened then archived within seconds). */
  MAX_GLANCED_SHARE: 0.1,
  /** Opened-then-archived within this many seconds counts as a glance, not engagement. */
  GLANCE_MAX_SECONDS: 10,
  /** Most-recent share of each sender's mail held out to validate the rule. */
  HOLDOUT_FRACTION: 0.3,
  /** The rule must still match this many held-out (recent) emails — no stale proposals. */
  MIN_HOLDOUT_MATCHES: 1,
  /** A user priority override at or above this score counts as engagement. */
  HIGH_PRIORITY_OVERRIDE_SCORE: 60,

  /** A dismissed/approved/existing rule covering this share of a cluster suppresses it. */
  SUPPRESSION_OVERLAP_SHARE: 0.5,
  /** Pending proposals kept per user (largest first). */
  MAX_PENDING_PER_USER: 10,
  /** Sample subjects stored as evidence on a proposal. */
  SAMPLE_SUBJECTS: 5,

  /** Incremental runs re-analyse a sender only after this many new emails... */
  RESCAN_MIN_NEW_EMAILS: 5,
  /** ...unless the user's last full analysis is older than this. */
  FULL_RESCAN_AFTER_DAYS: 7,
  /** Daily sweep; spread off the busy top of the hour. */
  SWEEP_CRON: "17 4 * * *",
  /** Only users with mail received this recently are swept. */
  SWEEP_ACTIVE_WITHIN_DAYS: 7,
  /** Upper bound on users enqueued per sweep. */
  MAX_USERS_PER_SWEEP: 5000,
} as const;

/**
 * Local-part tokens that mark an address as an automated notifier, the only
 * kind of address folded into a domain-level group (e.g. several
 * `*-noreply@example.com` senders). People are never grouped by domain.
 */
export const AUTOMATED_LOCAL_PART_TOKENS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "mailer",
  "bounce",
  "digest",
  "updates",
  "newsletter",
  "news",
  "robot",
  "bot",
  "automated",
] as const;

/** Lifecycle of a stored proposal. */
export const AUTO_ARCHIVE_PROPOSAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  DISMISSED: "dismissed",
} as const;

export type AutoArchiveProposalStatus =
  (typeof AUTO_ARCHIVE_PROPOSAL_STATUS)[keyof typeof AUTO_ARCHIVE_PROPOSAL_STATUS];

/** How the sender side of a proposal was grouped. */
export const AUTO_ARCHIVE_SENDER_SCOPE = {
  ADDRESS: "address",
  DOMAIN: "domain",
} as const;

export type AutoArchiveSenderScope =
  (typeof AUTO_ARCHIVE_SENDER_SCOPE)[keyof typeof AUTO_ARCHIVE_SENDER_SCOPE];

/** Prefix that keeps domain-group sender keys disjoint from address HMACs. */
export const DOMAIN_SENDER_KEY_PREFIX = "@";

/** Response the user gives a proposal from the client. */
export const AUTO_ARCHIVE_PROPOSAL_RESPONSE = {
  APPROVE: "approve",
  DISMISS: "dismiss",
} as const;
