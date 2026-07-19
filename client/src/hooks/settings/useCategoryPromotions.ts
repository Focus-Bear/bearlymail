import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import type { PromotedCategoryInfo } from 'contexts/CategoryPromotionContext';

/**
 * Fetches the promotion metadata for auto-generated categories and exposes a
 * `getPromotion(contextId)` lookup. Used to surface, on each live category, when
 * it was promoted from a proto category and why (including the duplicate
 * candidates the stronger model considered).
 */
export const useCategoryPromotions = () => {
  const [promotions, setPromotions] = useState<PromotedCategoryInfo[]>([]);

  const fetchPromotions = useCallback(async () => {
    try {
      const response = await axios.get<PromotedCategoryInfo[]>(`${API_URL}/proto-categories/promoted`);
      setPromotions(response.data);
    } catch (error) {
      console.error('Failed to fetch category promotions:', error);
    }
  }, []);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const byContextId = useMemo(() => {
    const map = new Map<string, PromotedCategoryInfo>();
    promotions.forEach(promotion => map.set(promotion.promotedCategoryId, promotion));
    return map;
  }, [promotions]);

  const getPromotion = useCallback(
    (contextId: string): PromotedCategoryInfo | null => byContextId.get(contextId) ?? null,
    [byContextId]
  );

  return { getPromotion, refreshPromotions: fetchPromotions };
};
