import type {
  CategoryRuleKind,
  CategoryRuleType,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";

export interface EmailMetadata {
  from: string;
  subject: string;
  /** Plain cleaned body slice for composite rule matching (optional). */
  bodyTextForMatch?: string;
}

export interface CategoryRuleMatch {
  categoryName: string;
  ruleId: string;
  ruleType: CategoryRuleType | null;
  ruleKind: CategoryRuleKind;
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeCategoryRuleSpec | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompositeRuleEvaluationDetail {
  senderMatch: boolean;
  subjectMatch: boolean;
  bodyMatch: boolean;
  bodyMatchedPhrase: string | null;
  /** Which sender value matched (v2 rules with multiple senders). */
  senderMatchedValue: string | null;
  /** Which subject phrase matched (v2 rules with multiple subject phrases). */
  subjectMatchedValue: string | null;
}

export interface CategoryRuleEvaluationDebug {
  id: string;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  categoryName: string;
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  compositeDetail?: CompositeRuleEvaluationDetail;
}

export interface DeterministicRulesDebug {
  winningRule: CategoryRuleMatch | null;
  evaluations: CategoryRuleEvaluationDebug[];
}
