/** What the local category/priority model predicted vs the LLM, and which
 * decided. Mirrors the server's LocalModelDebugSnapshot. */
export interface LocalModelDebugSnapshot {
  evaluatedAt: string;
  decidedBy: 'llm' | 'local';
  category: string;
  family: string;
  categoryConfidence: number;
  categoryMargin: number;
  categoryFallback: boolean;
  familyConfidence: number;
  familyFallback: boolean;
  priorityBand: string;
  priorityConfidence: number;
  priorityFallback: boolean;
  llmCategory: string | null;
  llmPriorityBand: string | null;
  categoryAgree: boolean;
  priorityAgree: boolean;
}

/** Mirrors the server's CategoryDecisionStep. */
export type CategoryDecisionStepName =
  | 'deterministic-rule'
  | 'local-model'
  | 'llm'
  | 'proto-match'
  | 'priority-over-other-guard'
  | 'github-override'
  | 'proto-promotion';

export type CategoryDecisionOutcome =
  | 'applied'
  | 'considered'
  | 'suppressed'
  | 'skipped';

export interface CategoryDecisionStep {
  step: CategoryDecisionStepName;
  outcome: CategoryDecisionOutcome;
  category: string | null;
  categoryId: string | null;
  detail: string;
}

/** Mirrors the server's CategoryDecisionTrace: the ordered steps that decided
 * this thread's category and which one won. */
export type CategoryDecisionWriter =
  | 'llm-refine'
  | 'deterministic-rule'
  | 'local-model'
  | 'incremental'
  | 'proto-promotion'
  | 'retro-apply';

export type CategoryDecisionTrigger =
  | 'new-email'
  | 'forced-recalc'
  | 'scheduled-bulk'
  | 'rule-retro'
  | 'proto-promotion';

/** Mirrors the server's CategoryDecisionContentSource. */
export type CategoryDecisionContentSource = 'ai-summary' | 'cleaned-body' | 'thread-summary' | 'email-metadata';

/** Mirrors the server's CategoryDecisionAnalyzedEmail: which email the decision was computed from. */
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
  source: 'user' | 'rule' | 'local' | 'priority' | 'summary' | null;
  /** The concrete process that categorised the thread. */
  writtenBy?: CategoryDecisionWriter;
  /** What triggered the categorisation run. */
  trigger?: CategoryDecisionTrigger;
  /** The email this decision was computed from (absent for bulk writers). */
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
  finalCategory: string | null;
  finalCategoryId: string | null;
  steps: CategoryDecisionStep[];
}

export interface CompositeRuleEvaluationDetailClient {
  senderMatch: boolean;
  subjectMatch: boolean;
  bodyMatch: boolean;
  bodyMatchedPhrase: string | null;
  /** Which sender value matched (v2 rules with multiple senders). */
  senderMatchedValue?: string | null;
  /** Which subject phrase matched (v2 rules with multiple subject phrases). */
  subjectMatchedValue?: string | null;
}

export interface CategoryRuleEvaluationDebug {
  id: string;
  ruleKind: 'legacy' | 'composite';
  ruleType: string | null;
  categoryName: string;
  /** The rule's category FK (UUID), or null when the rule was never linked. */
  categoryId?: string | null;
  /** Whether the rule's category link is still valid; false = matcher skips it even if the pattern matches. */
  categoryExists?: boolean;
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  /** ISO creation timestamp; optional for backward compatibility with cached responses. */
  createdAt?: string;
  compositeDetail?: CompositeRuleEvaluationDetailClient;
}

/**
 * Stored record of what the deterministic-rule step did when this thread's
 * category was last set during priority processing. Lets the debug view show
 * the ORIGINAL outcome next to a live re-run.
 */
export interface CategoryRuleTraceSnapshot {
  evaluatedAt: string;
  ruleStepRan: boolean;
  rulesConsideredCount: number;
  winningRuleId: string | null;
  winningRuleCategoryName: string | null;
  matchedButNotWinningRuleIds: string[];
}

export interface CategorizationTrace {
  deterministicRules: {
    winningRule: {
      categoryName: string;
      ruleId: string;
      ruleType: string | null;
      ruleKind: 'legacy' | 'composite';
    } | null;
    evaluations: CategoryRuleEvaluationDebug[];
  };
  shortlist: {
    skipped: boolean;
    skipReason?: string;
    categoryNames: string[];
    error?: string;
  };
  smartModel: {
    category: string;
    categoryExplanation: string;
    categoryConfidence?: string;
    error?: string;
    llmCategoryBeforeRuleOverride?: string;
    llmExplanationBeforeRuleOverride?: string;
  };
  /**
   * Which email in the thread the rules were evaluated against. When this is
   * not the latest reply, the trace and the stored thread category can diverge
   * (a later reply may flip a NOT-contains exclusion).
   */
  evaluatedEmail: {
    emailId: string;
    isLatestInThread: boolean;
    evaluatedReceivedAt: string | null;
    latestReceivedAt: string | null;
    latestEmailId: string | null;
    threadEmailCount: number;
  };
}

/** One entry in the thread timeline shown in the debug modal. */
export interface CategoryDebugThreadEmail {
  emailId: string;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string | null;
  /** True for the email this debug view was opened from. */
  isDebugTarget: boolean;
  /** True for the newest email in the thread. */
  isLatest: boolean;
}

export interface CategoryDebugData {
  email: {
    emailId: string;
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
    receivedAt: string | null;
  };
  /** Every email in the thread (oldest first, capped), so the UI can show which message each pipeline step saw. */
  threadEmails: CategoryDebugThreadEmail[];
  thread: {
    category: string | null;
    categoryExplanation: string | null;
    categorySource: 'user' | 'rule' | 'local' | 'priority' | 'summary' | null;
    /** Category names that were shortlisted and passed to the smart model during the last priority analysis. Null means shortlisting was not applicable or not yet run. */
    shortlistedCategoryNames: string[] | null;
    /** What the deterministic-rule step saw when this thread's category was last set by priority analysis. Null for older threads or categories set by summarization. */
    categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
    /** What the local model predicted vs the LLM and which decided. Null until the local model has scored this thread. */
    localModelDebug?: LocalModelDebugSnapshot | null;
    /** Ordered record of every step that produced a category candidate and whether it was applied or suppressed (e.g. a GitHub override re-routing a confident category). Null for threads categorised before this existed. */
    categoryDecisionTrace?: CategoryDecisionTrace | null;
  };
  emailCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string | null;
  }>;
  protoCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
  categorizationTrace?: CategorizationTrace;
}

export interface CategoryDebugModalProps {
  emailId: string;
  onClose: () => void;
}
