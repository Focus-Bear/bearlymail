import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';

export const useToneRules = () => {
  const { t } = useTranslation();
  const [toneRules, setToneRules] = useState<string[]>(['Be concise', 'Use non-violent communication']);
  const [newToneRule, setNewToneRule] = useState('');

  const fetchToneRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      if (response.data.toneSettings?.rules) {
        setToneRules(response.data.toneSettings.rules);
      }
    } catch (error) {
      console.error('Error fetching tone rules:', error);
    }
  }, []);

  const updateToneRules = useCallback(
    async (newRules: string[]) => {
      try {
        await axios.put(`${API_URL}/users/me`, { toneSettings: { rules: newRules } });
        setToneRules(newRules);
      } catch (error) {
        console.error('Error updating tone rules:', error);
        alert(t('settings.toneRulesError'));
      }
    },
    [t]
  );

  const addToneRule = useCallback(() => {
    if (!newToneRule.trim()) {
      return;
    }
    updateToneRules([...toneRules, newToneRule.trim()]);
    setNewToneRule('');
  }, [newToneRule, toneRules, updateToneRules]);

  const removeToneRule = useCallback(
    (index: number) => {
      const newRules = [...toneRules];
      newRules.splice(index, 1);
      updateToneRules(newRules);
    },
    [toneRules, updateToneRules]
  );

  const editToneRule = useCallback(
    (index: number, newValue: string) => {
      const newRules = [...toneRules];
      newRules[index] = newValue;
      updateToneRules(newRules);
    },
    [toneRules, updateToneRules]
  );

  return {
    toneRules,
    newToneRule,
    setToneRules,
    setNewToneRule,
    fetchToneRules,
    addToneRule,
    removeToneRule,
    editToneRule,
    updateToneRules,
  };
};
