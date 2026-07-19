import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { FILTER_ALL } from 'constants/strings';

import { useAdminMfa } from './AdminMfaGate';
import { ContextAnalysisItem, ContextAnalysisResponse, StatusFilter } from './ContextAnalysisSection.types';

const COPY_FEEDBACK_DURATION_MS = 2000;
const REFRESH_INTERVAL_MS = 15000;

export function useContextAnalysisData(statusFilter: StatusFilter) {
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [analyses, setAnalyses] = useState<ContextAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (statusFilter !== FILTER_ALL) {
        params.status = statusFilter;
      }
      const response = await axios.get<ContextAnalysisResponse>(`${API_URL}/context/admin/analyses`, { params });
      setAnalyses(response.data.analyses);
      setLastUpdated(new Date(response.data.timestamp));
      setLoading(false);
    } catch (error) {
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return; 
}
      console.error('Error fetching context analyses:', error);
      setLoading(false);
    }
  }, [statusFilter, onMfaRequired]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const poll = async () => {
      await fetchAnalyses();
      if (isMounted) {
        timeoutId = setTimeout(poll, REFRESH_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchAnalyses, mfaVerifiedAt]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return { analyses, loading, lastUpdated, copiedId, copyToClipboard };
}
