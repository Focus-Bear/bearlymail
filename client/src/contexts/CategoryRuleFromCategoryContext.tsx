import { createContext, useContext } from 'react';

export type CategoryRuleFromCategoryContextValue = {
  openAddRuleForCategoryDisplayName: (displayName: string) => void;
};

export const CategoryRuleFromCategoryContext = createContext<CategoryRuleFromCategoryContextValue | null>(null);

export function useCategoryRuleFromCategory(): CategoryRuleFromCategoryContextValue | null {
  return useContext(CategoryRuleFromCategoryContext);
}
