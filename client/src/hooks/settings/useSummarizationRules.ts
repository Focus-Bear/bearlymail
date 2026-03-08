import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

export const useSummarizationRules = () => {
  const [summarizationRules, setSummarizationRules] = useState<SummarizationRule[]>([]);
  const [newSummarizationWhen, setNewSummarizationWhen] = useState('');
  const [newSummarizationHow, setNewSummarizationHow] = useState('');
  const [editingSummarizationRule, setEditingSummarizationRule] = useState<string | null>(null);
  const [editSummarizationWhen, setEditSummarizationWhen] = useState('');
  const [editSummarizationHow, setEditSummarizationHow] = useState('');

  const fetchSummarizationRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/summarize/rules`);
      setSummarizationRules(response.data);
    } catch (error) {
      console.error('Error fetching summarization rules:', error);
      setSummarizationRules([]);
    }
  }, []);

  const createSummarizationRule = useCallback(async () => {
    if (!newSummarizationWhen.trim() || !newSummarizationHow.trim()) {
      return;
    }

    try {
      await axios.post(`${API_URL}/summarize/rules`, {
        whenToUse: newSummarizationWhen.trim(),
        howToSummarize: newSummarizationHow.trim(),
      });
      setNewSummarizationWhen('');
      setNewSummarizationHow('');
      await fetchSummarizationRules();
    } catch (error) {
      console.error('Error adding summarization rule:', error);
    }
  }, [newSummarizationWhen, newSummarizationHow, fetchSummarizationRules]);

  const updateSummarizationRule = useCallback(
    async (ruleId: string) => {
      try {
        await axios.put(`${API_URL}/summarize/rules/${ruleId}`, {
          whenToUse: editSummarizationWhen,
          howToSummarize: editSummarizationHow,
        });
        setEditingSummarizationRule(null);
        await fetchSummarizationRules();
      } catch (error) {
        console.error('Error updating summarization rule:', error);
      }
    },
    [editSummarizationWhen, editSummarizationHow, fetchSummarizationRules]
  );

  const deleteSummarizationRule = useCallback(
    async (ruleId: string) => {
      const deletedRule = summarizationRules.find(rule => rule.ruleId === ruleId);
      setSummarizationRules(prev => prev.filter(rule => rule.ruleId !== ruleId));

      try {
        await axios.delete(`${API_URL}/summarize/rules/${ruleId}`);
      } catch (error) {
        console.error('Error deleting summarization rule:', error);
        if (deletedRule) {
          setSummarizationRules(prev => [...prev, deletedRule]);
        }
      }
    },
    [summarizationRules]
  );

  const editSummarizationRule = useCallback((rule: SummarizationRule) => {
    setEditingSummarizationRule(rule.ruleId);
    setEditSummarizationWhen(rule.whenToUse);
    setEditSummarizationHow(rule.howToSummarize);
  }, []);

  return {
    summarizationRules,
    newSummarizationWhen,
    newSummarizationHow,
    editingSummarizationRule,
    editSummarizationWhen,
    editSummarizationHow,
    setSummarizationRules,
    setNewSummarizationWhen,
    setNewSummarizationHow,
    setEditingSummarizationRule,
    setEditSummarizationWhen,
    setEditSummarizationHow,
    fetchSummarizationRules,
    createSummarizationRule,
    updateSummarizationRule,
    deleteSummarizationRule,
    editSummarizationRule,
  };
};
