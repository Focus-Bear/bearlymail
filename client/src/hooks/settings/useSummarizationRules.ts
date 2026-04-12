import { useCallback, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  fromPatterns: string[];
  subjectPatterns: string[];
  priority: number;
  createdAt?: string;
}

export const useSummarizationRules = () => {
  const [summarizationRules, setSummarizationRules] = useState<SummarizationRule[]>([]);
  const [newSummarizationWhen, setNewSummarizationWhen] = useState('');
  const [newSummarizationHow, setNewSummarizationHow] = useState('');
  const [newFromPatterns, setNewFromPatterns] = useState('');
  const [newSubjectPatterns, setNewSubjectPatterns] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [editingSummarizationRule, setEditingSummarizationRule] = useState<string | null>(null);
  const [editSummarizationWhen, setEditSummarizationWhen] = useState('');
  const [editSummarizationHow, setEditSummarizationHow] = useState('');
  const [editFromPatterns, setEditFromPatterns] = useState('');
  const [editSubjectPatterns, setEditSubjectPatterns] = useState('');
  const [editPriority, setEditPriority] = useState(0);

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
        fromPatterns: newFromPatterns
          .split(',')
          .map(pattern => pattern.trim())
          .filter(Boolean),
        subjectPatterns: newSubjectPatterns
          .split(',')
          .map(pattern => pattern.trim())
          .filter(Boolean),
        priority: newPriority,
      });
      setNewSummarizationWhen('');
      setNewSummarizationHow('');
      setNewFromPatterns('');
      setNewSubjectPatterns('');
      setNewPriority(0);
      await fetchSummarizationRules();
    } catch (error) {
      console.error('Error adding summarization rule:', error);
    }
  }, [
    newSummarizationWhen,
    newSummarizationHow,
    newFromPatterns,
    newSubjectPatterns,
    newPriority,
    fetchSummarizationRules,
  ]);

  const updateSummarizationRule = useCallback(
    async (ruleId: string) => {
      try {
        await axios.put(`${API_URL}/summarize/rules/${ruleId}`, {
          whenToUse: editSummarizationWhen,
          howToSummarize: editSummarizationHow,
          fromPatterns: editFromPatterns
            .split(',')
            .map(pattern => pattern.trim())
            .filter(Boolean),
          subjectPatterns: editSubjectPatterns
            .split(',')
            .map(pattern => pattern.trim())
            .filter(Boolean),
          priority: editPriority,
        });
        setEditingSummarizationRule(null);
        await fetchSummarizationRules();
      } catch (error) {
        console.error('Error updating summarization rule:', error);
      }
    },
    [
      editSummarizationWhen,
      editSummarizationHow,
      editFromPatterns,
      editSubjectPatterns,
      editPriority,
      fetchSummarizationRules,
    ]
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
    setEditFromPatterns(rule.fromPatterns.join(', '));
    setEditSubjectPatterns(rule.subjectPatterns.join(', '));
    setEditPriority(rule.priority);
  }, []);

  return {
    summarizationRules,
    newSummarizationWhen,
    newSummarizationHow,
    newFromPatterns,
    newSubjectPatterns,
    newPriority,
    editingSummarizationRule,
    editSummarizationWhen,
    editSummarizationHow,
    editFromPatterns,
    editSubjectPatterns,
    editPriority,
    setSummarizationRules,
    setNewSummarizationWhen,
    setNewSummarizationHow,
    setNewFromPatterns,
    setNewSubjectPatterns,
    setNewPriority,
    setEditingSummarizationRule,
    setEditSummarizationWhen,
    setEditSummarizationHow,
    setEditFromPatterns,
    setEditSubjectPatterns,
    setEditPriority,
    fetchSummarizationRules,
    createSummarizationRule,
    updateSummarizationRule,
    deleteSummarizationRule,
    editSummarizationRule,
  };
};
