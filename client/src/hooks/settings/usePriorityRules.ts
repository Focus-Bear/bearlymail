import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { PriorityRuleDto, UpsertPriorityRulePayload } from 'types/priority-rules.types';

import { API_URL } from 'config/api';

/**
 * Loads the user's deterministic priority rules and supports full management:
 * create, edit, enable/disable, and delete. Auto-mined rules appear here too;
 * editing one converts it to user-managed so the miner stops overwriting it.
 */
export function usePriorityRules() {
  const [rules, setRules] = useState<PriorityRuleDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<PriorityRuleDto[]>(`${API_URL}/priority-rules`);
      setRules(Array.isArray(response.data) ? response.data : []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(
    async (payload: UpsertPriorityRulePayload) => {
      await axios.post(`${API_URL}/priority-rules`, payload);
      await fetchRules();
    },
    [fetchRules]
  );

  const updateRule = useCallback(
    async (id: string, payload: UpsertPriorityRulePayload) => {
      await axios.patch(`${API_URL}/priority-rules/${id}`, payload);
      await fetchRules();
    },
    [fetchRules]
  );

  const setEnabled = useCallback(
    async (id: string, isEnabled: boolean) => {
      await axios.patch(`${API_URL}/priority-rules/${id}`, { isEnabled });
      await fetchRules();
    },
    [fetchRules]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await axios.delete(`${API_URL}/priority-rules/${id}`);
      await fetchRules();
    },
    [fetchRules]
  );

  return { rules, loading, fetchRules, createRule, updateRule, setEnabled, deleteRule };
}
