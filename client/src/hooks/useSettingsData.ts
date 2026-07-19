import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { AnalyzeProgress, useAnalysisProgress } from 'hooks/settings/useAnalysisProgress';
import { useApiKeys } from 'hooks/settings/useApiKeys';
import { BatchSchedule, useBatchSchedule } from 'hooks/settings/useBatchSchedule';
import { useBlockedKeywords } from 'hooks/settings/useBlockedKeywords';
import { useBlockedSenders } from 'hooks/settings/useBlockedSenders';
import { useContextManagement } from 'hooks/settings/useContextManagement';
import { useSummarizationRules } from 'hooks/settings/useSummarizationRules';
import { useToneRules } from 'hooks/settings/useToneRules';

export type { BlockedKeyword } from 'hooks/settings/useBlockedKeywords';
export type { BlockedSender } from 'hooks/settings/useBlockedSenders';
export type { UserContext } from 'hooks/settings/useContextManagement';
export type { SummarizationRule } from 'hooks/settings/useSummarizationRules';
export type { BatchSchedule };
export type { AnalyzeProgress };

type GoogleAccount = { id: string; email: string; name?: string; isPrimary?: boolean; isSSO?: boolean };
type Office365Account = { id: string; email: string; name?: string; isPrimary?: boolean };
type ZohoAccount = { id: string; email: string; name?: string; isPrimary?: boolean };
type AppleMailAccount = { id: string; email: string; name?: string; isPrimary?: boolean };

interface AccountSetters {
  setGoogleAccounts: (v: GoogleAccount[]) => void;
  setOffice365Accounts: (v: Office365Account[]) => void;
  setZohoAccounts: (v: ZohoAccount[]) => void;
  setAppleMailAccounts: (v: AppleMailAccount[]) => void;
  setAppleMailAvailable: (v: boolean) => void;
  setDisplayName: (v: string | undefined) => void;
  setJobTitle: (v: string | undefined) => void;
  setCalendarBookingUrl: (v: string) => void;
  setEmailSignature: (v: string) => void;
}

async function fetchUserAndAccounts(setters: AccountSetters): Promise<void> {
  const [userRes, googleResOrNull, office365ResOrNull, zohoResOrNull, appleMailResOrNull, appleMailAvailabilityRes] =
    await Promise.all([
      axios.get(`${API_URL}/users/me`),
      axios.get(`${API_URL}/google-accounts`).catch(() => null),
      axios.get(`${API_URL}/office365-accounts`).catch(() => null),
      axios.get(`${API_URL}/zoho-accounts`).catch(() => null),
      axios.get(`${API_URL}/apple-mail-accounts`).catch(() => null),
      axios.get(`${API_URL}/apple-mail-accounts/availability`).catch(() => null),
    ]);
  const user = userRes.data;
  setters.setDisplayName(user.displayName);
  setters.setJobTitle(user.jobTitle);
  setters.setCalendarBookingUrl(user.calendarBookingUrl || '');
  setters.setEmailSignature(user.emailSignature || 'Sent from BearlyMail (anti inbox overwhelm system)');
  const googleAccts = googleResOrNull?.data ?? [];
  const hasTokens = !!(user.googleCalendarAccessToken || user.googleCalendarRefreshToken);
  if (hasTokens && googleAccts.length === 0) {
    setters.setGoogleAccounts([
      { id: 'sso-account', email: user.email, name: user.name || '', isPrimary: true, isSSO: true },
    ]);
  } else {
    setters.setGoogleAccounts(googleAccts);
  }
  setters.setOffice365Accounts(office365ResOrNull?.data ?? []);
  setters.setZohoAccounts(zohoResOrNull?.data ?? []);
  setters.setAppleMailAccounts(appleMailResOrNull?.data ?? []);
  setters.setAppleMailAvailable(appleMailAvailabilityRes?.data?.available ?? false);
}

/**
 * Manages the user's email accounts lists (Google, Office 365, Zoho, Apple Mail).
 * Extracted from useSettingsData to keep that hook under the max-lines-per-function limit.
 */
function useAccountsList() {
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [office365Accounts, setOffice365Accounts] = useState<Office365Account[]>([]);
  const [zohoAccounts, setZohoAccounts] = useState<ZohoAccount[]>([]);
  const [appleMailAccounts, setAppleMailAccounts] = useState<AppleMailAccount[]>([]);
  const [appleMailAvailable, setAppleMailAvailable] = useState(false);
  return {
    googleAccounts,
    setGoogleAccounts,
    office365Accounts,
    setOffice365Accounts,
    zohoAccounts,
    setZohoAccounts,
    appleMailAccounts,
    setAppleMailAccounts,
    appleMailAvailable,
    setAppleMailAvailable,
  };
}

/**
 * Manages the user's profile fields: display name, job title, email signature.
 * Extracted from useSettingsData to keep that hook under the max-lines-per-function limit.
 */
function useUserProfile() {
  const [displayName, setDisplayName] = useState<string | undefined>(undefined);
  const [jobTitle, setJobTitle] = useState<string | undefined>(undefined);
  const [calendarBookingUrl, setCalendarBookingUrl] = useState<string>('');
  const [emailSignature, setEmailSignature] = useState<string>('');
  const [savingSignature, setSavingSignature] = useState(false);

  const updateProfile = useCallback(
    async (updates: { displayName?: string; jobTitle?: string; calendarBookingUrl?: string }) => {
      try {
        await axios.put(`${API_URL}/users/me`, updates);
        if (updates.displayName !== undefined) {
          setDisplayName(updates.displayName);
        }
        if (updates.jobTitle !== undefined) {
          setJobTitle(updates.jobTitle);
        }
        if (updates.calendarBookingUrl !== undefined) {
          setCalendarBookingUrl(updates.calendarBookingUrl);
        }
      } catch (error) {
        console.error('Error updating profile:', error);
        throw error;
      }
    },
    []
  );

  const handleSaveEmailSignature = useCallback(async (signature: string) => {
    try {
      setSavingSignature(true);
      await axios.put(`${API_URL}/users/me`, { emailSignature: signature });
    } catch (error) {
      console.error('Error saving email signature:', error);
      alert('Failed to save email signature. Please try again.');
    } finally {
      setSavingSignature(false);
    }
  }, []);

  return {
    displayName,
    setDisplayName,
    jobTitle,
    setJobTitle,
    calendarBookingUrl,
    setCalendarBookingUrl,
    emailSignature,
    setEmailSignature,
    savingSignature,
    updateProfile,
    handleSaveEmailSignature,
  };
}

/**
 * Bundles the stable account/profile state setters into a memoized AccountSetters object
 * for fetchUserAndAccounts. Extracted to keep useSettingsData under the
 * max-lines-per-function limit.
 */
function useAccountAndProfileSetters(
  accounts: ReturnType<typeof useAccountsList>,
  profile: ReturnType<typeof useUserProfile>
): AccountSetters {
  const { setGoogleAccounts, setOffice365Accounts, setZohoAccounts, setAppleMailAccounts, setAppleMailAvailable } =
    accounts;
  const { setDisplayName, setJobTitle, setCalendarBookingUrl, setEmailSignature } = profile;
  return useMemo(
    () => ({
      setGoogleAccounts,
      setOffice365Accounts,
      setZohoAccounts,
      setAppleMailAccounts,
      setAppleMailAvailable,
      setDisplayName,
      setJobTitle,
      setCalendarBookingUrl,
      setEmailSignature,
    }),
    [
      setGoogleAccounts,
      setOffice365Accounts,
      setZohoAccounts,
      setAppleMailAccounts,
      setAppleMailAvailable,
      setDisplayName,
      setJobTitle,
      setCalendarBookingUrl,
      setEmailSignature,
    ]
  );
}

interface SettingsAliasParams {
  analysisProgress: ReturnType<typeof useAnalysisProgress>;
  contextManagement: ReturnType<typeof useContextManagement>;
  toneRules: ReturnType<typeof useToneRules>;
  apiKeys: ReturnType<typeof useApiKeys>;
  summarizationRules: ReturnType<typeof useSummarizationRules>;
  blockedSenders: ReturnType<typeof useBlockedSenders>;
  blockedKeywords: ReturnType<typeof useBlockedKeywords>;
}

/**
 * Builds the `handle*` alias surface that useSettingsData re-exports for consumer convenience.
 * Extracted to a module-level function to keep useSettingsData under the
 * max-lines-per-function limit.
 */
function buildSettingsAliases({
  analysisProgress,
  contextManagement,
  toneRules,
  apiKeys,
  summarizationRules,
  blockedSenders,
  blockedKeywords,
}: SettingsAliasParams) {
  return {
    handleAnalyzeContext: analysisProgress.startAnalysis,
    dismissAnalyzeProgress: analysisProgress.dismissProgress,
    handleAddContext: contextManagement.addContext,
    handleUpdateContext: contextManagement.updateContext,
    handleDeleteContext: contextManagement.deleteContext,
    handleAddToneRule: toneRules.addToneRule,
    handleRemoveToneRule: toneRules.removeToneRule,
    handleEditToneRule: toneRules.editToneRule,
    handleSaveApiKey: apiKeys.saveOpenAiApiKey,
    handleRemoveApiKey: apiKeys.removeOpenAiApiKey,
    handleSaveAnthropicKey: apiKeys.saveAnthropicKey,
    handleRemoveAnthropicKey: apiKeys.removeAnthropicKey,
    handleConnectGitHub: apiKeys.connectGitHub,
    handleConnectGitHubWithRepoAccess: apiKeys.connectGitHubWithRepoAccess,
    handleDisconnectGitHub: apiKeys.disconnectGitHub,
    handleAddSummarizationRule: summarizationRules.createSummarizationRule,
    handleEditSummarizationRule: summarizationRules.editSummarizationRule,
    handleSaveSummarizationRule: summarizationRules.updateSummarizationRule,
    handleDeleteSummarizationRule: summarizationRules.deleteSummarizationRule,
    handleUnblockSender: blockedSenders.removeBlockedSender,
    handleUnblockKeyword: blockedKeywords.removeBlockedKeyword,
    handleAddKeyword: blockedKeywords.addBlockedKeyword,
  };
}

export function useSettingsData() {
  const [loading, setLoading] = useState(true);

  const accounts = useAccountsList();
  const profile = useUserProfile();
  const contextManagement = useContextManagement();
  const toneRules = useToneRules();
  const summarizationRules = useSummarizationRules();
  const apiKeys = useApiKeys();
  const blockedSenders = useBlockedSenders();
  const blockedKeywords = useBlockedKeywords();
  const batchSchedule = useBatchSchedule();

  // Destructure stable refs for fetchData deps (avoids referencing the whole sub-hook object)
  const { fetchSummarizationRules } = summarizationRules;
  const { fetchContexts } = contextManagement;
  const { fetchBlockedSenders } = blockedSenders;
  const { fetchBlockedKeywords } = blockedKeywords;
  const { fetchBatchSchedule } = batchSchedule;
  const { fetchToneRules } = toneRules;
  const { fetchApiKeys } = apiKeys;
  const accountSetters = useAccountAndProfileSetters(accounts, profile);

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchUserAndAccounts(accountSetters),
        fetchSummarizationRules(),
        fetchContexts(),
        fetchBlockedSenders(),
        fetchBlockedKeywords(),
        fetchBatchSchedule(),
        fetchToneRules(),
        fetchApiKeys(),
      ]);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [
    fetchSummarizationRules,
    fetchContexts,
    fetchBlockedSenders,
    fetchBlockedKeywords,
    fetchBatchSchedule,
    fetchToneRules,
    fetchApiKeys,
    accountSetters,
  ]);

  const analysisProgress = useAnalysisProgress(fetchData);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.SETTINGS_VIEWED, {
      section: window.location.hash ? window.location.hash.substring(1) : undefined,
    });
    fetchData();
  }, [fetchData]);

  const aliases = buildSettingsAliases({
    analysisProgress,
    contextManagement,
    toneRules,
    apiKeys,
    summarizationRules,
    blockedSenders,
    blockedKeywords,
  });

  return {
    ...summarizationRules,
    ...blockedSenders,
    ...blockedKeywords,
    ...contextManagement,
    ...batchSchedule,
    ...toneRules,
    ...apiKeys,
    ...analysisProgress,
    ...accounts,
    ...aliases,
    loading,
    displayName: profile.displayName,
    jobTitle: profile.jobTitle,
    calendarBookingUrl: profile.calendarBookingUrl,
    emailSignature: profile.emailSignature,
    savingSignature: profile.savingSignature,
    fetchData,
    updateProfile: profile.updateProfile,
    setEmailSignature: profile.setEmailSignature,
    handleSaveEmailSignature: () => profile.handleSaveEmailSignature(profile.emailSignature),
  };
}
