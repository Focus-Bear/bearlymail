export type CategoryRuleKind = 'legacy' | 'composite';

export interface CompositeSpecV1 {
  v: 1;
  sender: string;
  subjectContains: string;
  bodyContainsAny: string[];
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  ruleKind: CategoryRuleKind;
  ruleType: string | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeSpecV1 | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}
