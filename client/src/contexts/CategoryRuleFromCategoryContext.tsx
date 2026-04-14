import { createContext, useContext } from 'react';
import type { CategoryRuleDto } from 'types/category-rules.types';

export type CategoryRuleFromCategoryContextValue = {
  openAddRuleForCategoryDisplayName: (displayName: string) => void;
  rules: CategoryRuleDto[];
  onToggleEnabled: (id: string, nextEnabled: boolean) => void;
  onDeleteRule: (id: string) => Promise<void>;
  onEditRule: (rule: CategoryRuleDto) => void;
};

export const CategoryRuleFromCategoryContext = createContext<CategoryRuleFromCategoryContextValue | null>(null);

export function useCategoryRuleFromCategory(): CategoryRuleFromCategoryContextValue | null {
  return useContext(CategoryRuleFromCategoryContext);
}
