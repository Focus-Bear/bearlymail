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

export interface CategoryDebugData {
  email: {
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
  };
  thread: {
    category: string | null;
    categoryExplanation: string | null;
    categorySource: 'summary' | 'priority' | null;
    /** Category names that were shortlisted and passed to the smart model during the last priority analysis. Null means shortlisting was not applicable or not yet run. */
    shortlistedCategoryNames: string[] | null;
    /** What the deterministic-rule step saw when this thread's category was last set by priority analysis. Null for older threads or categories set by summarization. */
    categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
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
