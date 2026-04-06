export type CategoryRuleKind = 'legacy' | 'composite';

/** v1 spec — single sender/subject (backward compat for existing rules). */
export interface CompositeSpecV1 {
  v: 1;
  sender: string;
  subjectContains: string;
  bodyContainsAny: string[];
}

/** v2 spec — multiple senders/subjects with OR logic within each condition. */
export interface CompositeSpecV2 {
  v: 2;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
}

/** Union of all supported composite rule spec versions. */
export type CompositeSpec = CompositeSpecV1 | CompositeSpecV2;

/** Helper to get sender list regardless of spec version. */
export function specSenders(spec: CompositeSpec): string[] {
  return spec.v === 2 ? spec.senderMatchesAny : [spec.sender];
}

/** Helper to get subject phrases regardless of spec version. */
export function specSubjects(spec: CompositeSpec): string[] {
  return spec.v === 2 ? spec.subjectContainsAny : [spec.subjectContains];
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  ruleKind: CategoryRuleKind;
  ruleType: string | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeSpec | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}
