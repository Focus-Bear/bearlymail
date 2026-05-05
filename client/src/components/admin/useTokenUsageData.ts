import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { DAYS_IN_MONTH_30, MS_PER_DAY, REFRESH_INTERVAL_30_SEC_MS } from 'constants/numbers';

import { useAdminMfa } from './AdminMfaGate';
import { DateRange, PromptExample, UsageByOperation, UsageByUser, UsageSummary } from './TokenUsageSection.types';

const DATE_RANGE_24H: DateRange = '24h';
const DATE_RANGE_7D: DateRange = '7d';
const DATE_RANGE_30D: DateRange = '30d';
const DATE_RANGE_ALL: DateRange = 'all';

const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_30_SEC_MS;

export interface TokenUsageData {
  usage: UsageByOperation[];
  usageByUser: UsageByUser[];
  summary: UsageSummary | null;
  examples: PromptExample[];
  loading: boolean;
  examplesLoading: boolean;
  resetting: boolean;
  lastUpdated: Date | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  expandedExample: string | null;
  setExpandedExample: (op: string | null) => void;
  resetExamples: () => Promise<void>;
}

export const useTokenUsageData = (): TokenUsageData => {
  const { t } = useTranslation();
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [usage, setUsage] = useState<UsageByOperation[]>([]);
  const [usageByUser, setUsageByUser] = useState<UsageByUser[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [examples, setExamples] = useState<PromptExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGE_7D);
  const [expandedExample, setExpandedExample] = useState<string | null>(null);

  const getDateRangeParams = useCallback((): { startDate?: string } => {
    const now = new Date();
    switch (dateRange) {
      case DATE_RANGE_24H:
        return { startDate: new Date(now.getTime() - MS_PER_DAY).toISOString() };
      case DATE_RANGE_7D:
        return { startDate: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_30D:
        return { startDate: new Date(now.getTime() - DAYS_IN_MONTH_30 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_ALL:
      default:
        return {};
    }
  }, [dateRange]);

  const fetchExamples = useCallback(async () => {
    try {
      setExamplesLoading(true);
      const response = await axios.get(`${API_URL}/admin/token-usage/examples`);
      setExamples(response.data.examples || []);
    } catch (error) {
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return; 
}
      console.error('Error fetching prompt examples:', error);
    } finally {
      setExamplesLoading(false);
    }
  }, [onMfaRequired]);

  const fetchUsageData = useCallback(async () => {
    try {
      const params = getDateRangeParams();
      const [usageResponse, summaryResponse, byUserResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/token-usage`, { params }),
        axios.get(`${API_URL}/admin/token-usage/summary`, { params }),
        axios.get(`${API_URL}/admin/token-usage/by-user`, { params }),
      ]);
      setUsage(usageResponse.data.usage);
      setSummary(summaryResponse.data.summary);
      setUsageByUser(byUserResponse.data.users);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) {
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return; 
}
      console.error('Error fetching token usage:', error);
      setLoading(false);
    }
  }, [getDateRangeParams, onMfaRequired]);

  const resetExamples = async () => {
    if (!window.confirm(t('admin.tokenUsage.examples.confirmReset'))) {
      return;
    }
    try {
      setResetting(true);
      await axios.post(`${API_URL}/admin/token-usage/examples/reset`);
      setExamples([]);
      setExpandedExample(null);
    } catch (error) {
      console.error('Error resetting prompt examples:', error);
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
    fetchExamples();
    const interval = setInterval(() => {
      fetchUsageData();
      fetchExamples();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dateRange, fetchUsageData, fetchExamples, mfaVerifiedAt]);

  return {
    usage,
    usageByUser,
    summary,
    examples,
    loading,
    examplesLoading,
    resetting,
    lastUpdated,
    dateRange,
    setDateRange,
    expandedExample,
    setExpandedExample,
    resetExamples,
  };
};
