import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';
import { useContextManagement } from 'hooks/settings/useContextManagement';
import { useToneRules } from 'hooks/settings/useToneRules';
import { useSummarizationRules } from 'hooks/settings/useSummarizationRules';
import { useApiKeys } from 'hooks/settings/useApiKeys';
import { useAnalysisProgress, AnalyzeProgress } from 'hooks/settings/useAnalysisProgress';
import { useBlockedSenders } from 'hooks/settings/useBlockedSenders';
import { useBatchSchedule, BatchSchedule } from 'hooks/settings/useBatchSchedule';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type { SummarizationRule } from 'hooks/settings/useSummarizationRules';
export type { BlockedSender } from 'hooks/settings/useBlockedSenders';
export type { UserContext } from 'hooks/settings/useContextManagement';
export type { BatchSchedule };
export type { AnalyzeProgress };

export function useSettingsData() {
  const [loading, setLoading] = useState(true);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [office365Accounts, setOffice365Accounts] = useState<any[]>([]);
  const [zohoAccounts, setZohoAccounts] = useState<any[]>([]);

  const contextManagement = useContextManagement();
  const toneRules = useToneRules();
  const summarizationRules = useSummarizationRules();
  const apiKeys = useApiKeys();
  const blockedSenders = useBlockedSenders();
  const batchSchedule = useBatchSchedule();

  // Destructure fetch functions to get stable references
  const {
    fetchSummarizationRules,
  } = summarizationRules;
  const {
    fetchContexts,
  } = contextManagement;
  const {
    fetchBlockedSenders,
  } = blockedSenders;
  const {
    fetchBatchSchedule,
  } = batchSchedule;
  const {
    fetchToneRules,
  } = toneRules;
  const {
    fetchApiKeys,
  } = apiKeys;

  const fetchData = useCallback(async () => {
    try {
      const [userRes, googleAccountsRes, office365AccountsRes, zohoAccountsRes] = await Promise.all([
        axios.get(`${API_URL}/users/me`),
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
        axios.get(`${API_URL}/google-accounts`).catch(() => ({ data: [] })),
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
        axios.get(`${API_URL}/office365-accounts`).catch(() => ({ data: [] })),
        // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
        axios.get(`${API_URL}/zoho-accounts`).catch(() => ({ data: [] })),
      ]);

      await Promise.all([
        fetchSummarizationRules(),
        fetchContexts(),
        fetchBlockedSenders(),
        fetchBatchSchedule(),
        fetchToneRules(),
        fetchApiKeys(),
      ]);

      const user = userRes.data;
      // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
      const googleAccountsData = googleAccountsRes.data;
      // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
      const office365AccountsData = office365AccountsRes.data;
      // eslint-disable-next-line id-denylist -- 'data' is a standard property in Axios responses
      const zohoAccountsData = zohoAccountsRes.data;
      const hasTokens = !!(user.googleCalendarAccessToken || user.googleCalendarRefreshToken);
      
      if (hasTokens && googleAccountsData.length === 0) {
        setGoogleAccounts([{
          id: 'sso-account',
          email: user.email,
          name: user.name || '',
          isPrimary: true,
          isSSO: true,
        }]);
      } else {
        setGoogleAccounts(googleAccountsData);
      }
      setOffice365Accounts(office365AccountsData);
      setZohoAccounts(zohoAccountsData);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [
    fetchSummarizationRules,
    fetchContexts,
    fetchBlockedSenders,
    fetchBatchSchedule,
    fetchToneRules,
    fetchApiKeys,
  ]);

  const analysisProgress = useAnalysisProgress(fetchData);

  useEffect(() => {
    const hash = window.location.hash;
    captureEvent('settings_viewed', {
      section: hash ? hash.substring(1) : undefined,
    });
    fetchData();
  }, [fetchData]);

  return {
    // State from extracted hooks
    ...summarizationRules,
    ...blockedSenders,
    ...contextManagement,
    ...batchSchedule,
    ...toneRules,
    ...apiKeys,
    ...analysisProgress,
    // Local state
    loading,
    googleAccounts,
    setGoogleAccounts,
    office365Accounts,
    setOffice365Accounts,
    zohoAccounts,
    setZohoAccounts,
    // Handlers
    fetchData,
    handleAnalyzeContext: analysisProgress.startAnalysis,
    handleAddContext: contextManagement.addContext,
    handleUpdateContext: contextManagement.updateContext,
    handleDeleteContext: contextManagement.deleteContext,
    handleAddToneRule: toneRules.addToneRule,
    handleRemoveToneRule: toneRules.removeToneRule,
    handleSaveApiKey: apiKeys.saveOpenAiApiKey,
    handleRemoveApiKey: apiKeys.removeOpenAiApiKey,
    handleSaveGithubToken: apiKeys.saveGithubToken,
    handleRemoveGithubToken: apiKeys.removeGithubToken,
    handleAddSummarizationRule: summarizationRules.createSummarizationRule,
    handleEditSummarizationRule: summarizationRules.editSummarizationRule,
    handleSaveSummarizationRule: summarizationRules.updateSummarizationRule,
    handleDeleteSummarizationRule: summarizationRules.deleteSummarizationRule,
    handleUnblockSender: blockedSenders.removeBlockedSender,
    dismissAnalyzeProgress: analysisProgress.dismissProgress,
  };
}
