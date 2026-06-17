import { createContext, useContext } from 'react';

/** A category the dedup pass weighed as a possible duplicate, with the verdict. */
export interface ConsideredDuplicateCandidate {
  name: string;
  isDuplicate: boolean;
  reasoning: string;
}

/** Promotion metadata for a live (auto-generated) category, keyed by its contextId. */
export interface PromotedCategoryInfo {
  promotedCategoryId: string;
  name: string;
  promotedAt: string | null;
  promotionReasoning: string | null;
  duplicateCandidates: ConsideredDuplicateCandidate[];
}

export type CategoryPromotionContextValue = {
  /** Returns the promotion record for a category contextId, or null if it wasn't auto-promoted. */
  getPromotion: (contextId: string) => PromotedCategoryInfo | null;
};

export const CategoryPromotionContext = createContext<CategoryPromotionContextValue | null>(null);

export function useCategoryPromotion(): CategoryPromotionContextValue | null {
  return useContext(CategoryPromotionContext);
}
