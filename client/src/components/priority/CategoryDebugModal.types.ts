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
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  compositeDetail?: CompositeRuleEvaluationDetailClient;
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
