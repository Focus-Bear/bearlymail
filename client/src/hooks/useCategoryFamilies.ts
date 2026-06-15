import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

/** Synthetic family for categories with no family assigned. Matches the server
 * taxonomy's OTHER_FAMILY string. */
export const OTHER_FAMILY = 'Other / Uncategorised';

export interface FamilyCategory {
  contextId: string;
  name: string;
}

export interface CategoryFamily {
  /** null for the synthetic "Other / Uncategorised" group (categories with no family) */
  id: string | null;
  name: string;
  displayOrder: number;
  source: string;
  categories: FamilyCategory[];
}

const FAMILIES_URL = `${API_URL}/category-families`;

/**
 * Loads and mutates the user's category families (the coarse level of the
 * category hierarchy). The first GET seeds families from the taxonomy server
 * side, so the list is populated on first open.
 */
export function useCategoryFamilies() {
  const [families, setFamilies] = useState<CategoryFamily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get<CategoryFamily[]>(FAMILIES_URL);
      setFamilies(response.data);
    } catch {
      setError('load_failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createFamily = useCallback(
    async (name: string) => {
      await axios.post(FAMILIES_URL, { name });
      await refresh();
    },
    [refresh],
  );

  const renameFamily = useCallback(
    async (familyId: string, name: string) => {
      await axios.patch(`${FAMILIES_URL}/${familyId}`, { name });
      await refresh();
    },
    [refresh],
  );

  const reassignCategory = useCallback(
    async (contextId: string, familyId: string | null) => {
      await axios.patch(`${FAMILIES_URL}/categories/${contextId}`, { familyId });
      await refresh();
    },
    [refresh],
  );

  return {
    families,
    isLoading,
    error,
    refresh,
    createFamily,
    renameFamily,
    reassignCategory,
  };
}

/**
 * Derives the lookup the inbox needs to group categories by family:
 * `familyByCategoryId` maps a category's context id to its family name. It is
 * empty until families load, so the inbox can render its flat list meanwhile.
 * Family *display order* is derived from thread priority at grouping time (see
 * `orderCategoriesByFamily`), not from the configured family order.
 */
export function useCategoryFamilyMap() {
  const { families, isLoading } = useCategoryFamilies();

  return useMemo(() => {
    const familyByCategoryId = new Map<string, string>();
    for (const family of families) {
      for (const category of family.categories) {
        familyByCategoryId.set(category.contextId, family.name);
      }
    }
    return { familyByCategoryId, isLoading };
  }, [families, isLoading]);
}
