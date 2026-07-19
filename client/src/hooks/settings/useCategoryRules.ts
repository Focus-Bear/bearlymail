import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { CategoryRuleDto, CategoryRuleSuggestion } from 'types/category-rules.types';

import { API_URL } from 'config/api';

export interface CreateCompositePayload {
  categoryName: string;
  /** Authoritative category FK; resolved from the chosen category option. */
  categoryId?: string;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  /** Issue #1789: optional subject exclusion phrases. */
  subjectNotContainsAny?: string[];
  /** Issue #1789: optional body exclusion phrases. */
  bodyNotContainsAny?: string[];
}

/** PATCH body: composite criteria without version (server assigns v). */
export interface PatchCompositeSpecPayload {
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  /** Issue #1789: optional subject exclusion phrases. */
  subjectNotContainsAny?: string[];
  /** Issue #1789: optional body exclusion phrases. */
  bodyNotContainsAny?: string[];
}

export interface PatchCategoryRulePayload {
  isEnabled?: boolean;
  categoryName?: string;
  /** Authoritative category FK; resolved from the chosen category option. */
  categoryId?: string;
  compositeSpec?: PatchCompositeSpecPayload;
}

export function useCategoryRules() {
  const [rules, setRules] = useState<CategoryRuleDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<CategoryRuleDto[]>(`${API_URL}/category-rules`);
      const rulesPayload = response.data;
      setRules(Array.isArray(rulesPayload) ? rulesPayload : []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const createCompositeRule = useCallback(
    async (payload: CreateCompositePayload) => {
      await axios.post(`${API_URL}/category-rules`, payload);
      await fetchRules();
    },
    [fetchRules]
  );

  const patchRule = useCallback(
    async (id: string, payload: PatchCategoryRulePayload) => {
      await axios.patch(`${API_URL}/category-rules/${id}`, payload);
      await fetchRules();
    },
    [fetchRules]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await axios.delete(`${API_URL}/category-rules/${id}`);
      await fetchRules();
    },
    [fetchRules]
  );

  const suggestRules = useCallback(
    async (categoryName?: string): Promise<CategoryRuleSuggestion[]> => {
      const response = await axios.post<CategoryRuleSuggestion[]>(
        `${API_URL}/category-rules/suggest`,
        categoryName ? { categoryName } : {},
      );
      return response.data;
    },
    []
  );

  return {
    rules,
    loading,
    fetchRules,
    createCompositeRule,
    patchRule,
    deleteRule,
    suggestRules,
  };
}
