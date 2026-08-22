import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { REFRESH_INTERVAL_30_SEC_MS } from 'constants/numbers';

import { useAdminMfa } from './AdminMfaGate';

export interface CategoryAccuracy {
  category: string;
  sampleRatePercent: number;
  lifetimeSamples: number;
  lifetimeAgreements: number;
  agreementPct: number;
  windowSamples: number;
  windowAgreements: number;
}

export interface CategoryAccuracyReport {
  overall: { samples: number; agreements: number; agreementPct: number };
  categories: CategoryAccuracy[];
}

export interface LocalModelAccuracyData {
  report: CategoryAccuracyReport | null;
  loading: boolean;
  lastUpdated: Date | null;
}

export const useLocalModelAccuracyData = (): LocalModelAccuracyData => {
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [report, setReport] = useState<CategoryAccuracyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAccuracy = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await axios.get<CategoryAccuracyReport>(
          `${API_URL}/admin/local-model-usage/accuracy`,
          { signal },
        );
        setReport({ overall: response.data.overall, categories: response.data.categories });
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
        console.error('Error fetching local model accuracy:', error);
        setLoading(false);
      }
    },
    [onMfaRequired],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchAccuracy(controller.signal);
    const interval = setInterval(() => fetchAccuracy(controller.signal), REFRESH_INTERVAL_30_SEC_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchAccuracy, mfaVerifiedAt]);

  return { report, loading, lastUpdated };
};
