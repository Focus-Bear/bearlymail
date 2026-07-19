import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { DAYS_IN_MONTH_30, MS_PER_DAY, REFRESH_INTERVAL_30_SEC_MS } from 'constants/numbers';

import { useAdminMfa } from './AdminMfaGate';
import { DateRange } from './TokenUsageSection.types';

const DATE_RANGE_24H: DateRange = '24h';
const DATE_RANGE_7D: DateRange = '7d';
const DATE_RANGE_30D: DateRange = '30d';
const DATE_RANGE_ALL: DateRange = 'all';
const DAYS_7 = 7;

export interface PriorityUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  total: number;
  localPct: number;
  llmPct: number;
}

export interface CategoryUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  total: number;
  localPct: number;
}

export interface LocalModelUsage {
  priority: PriorityUsage;
  category: CategoryUsage;
}

export interface LocalModelUsageData {
  usage: LocalModelUsage | null;
  loading: boolean;
  lastUpdated: Date | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

export const useLocalModelUsageData = (): LocalModelUsageData => {
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [usage, setUsage] = useState<LocalModelUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_RANGE_7D);

  const getDateRangeParams = useCallback((): { startDate?: string } => {
    const now = new Date();
    switch (dateRange) {
      case DATE_RANGE_24H:
        return { startDate: new Date(now.getTime() - MS_PER_DAY).toISOString() };
      case DATE_RANGE_7D:
        return { startDate: new Date(now.getTime() - DAYS_7 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_30D:
        return { startDate: new Date(now.getTime() - DAYS_IN_MONTH_30 * MS_PER_DAY).toISOString() };
      case DATE_RANGE_ALL:
      default:
        return {};
    }
  }, [dateRange]);

  const fetchUsage = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const params = getDateRangeParams();
        const response = await axios.get(`${API_URL}/admin/local-model-usage`, { params, signal });
        setUsage({ priority: response.data.priority, category: response.data.category });
        setLastUpdated(new Date());
        setLoading(false);
      } catch (error) {
        // A cancelled in-flight request (unmount / dependency change) is not an error.
        if (axios.isCancel(error)) {
          return;
        }
        const mfaType = getMfaErrorType(error);
        if (mfaType) {
          onMfaRequired(mfaType);
          return;
        }
        console.error('Error fetching local model usage:', error);
        setLoading(false);
      }
    },
    [getDateRangeParams, onMfaRequired],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchUsage(controller.signal);
    const interval = setInterval(() => fetchUsage(controller.signal), REFRESH_INTERVAL_30_SEC_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchUsage, mfaVerifiedAt]);

  return { usage, loading, lastUpdated, dateRange, setDateRange };
};
