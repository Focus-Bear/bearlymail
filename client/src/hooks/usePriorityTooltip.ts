import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

interface PriorityExplanation {
  score: number;
  dimensions: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface UsePriorityTooltipReturn {
  hoveredPriorityEmailId: string | null;
  priorityExplanation: PriorityExplanation | null;
  loadingPriorityExplanation: boolean;
  togglePriorityTooltip: (emailId: string) => void;
  hidePriorityTooltip: () => void;
  fetchPriorityExplanation: (emailId: string) => Promise<void>;
}

export function usePriorityTooltip(): UsePriorityTooltipReturn {
  const [hoveredPriorityEmailId, setHoveredPriorityEmailId] = useState<string | null>(null);
  const [priorityExplanation, setPriorityExplanation] = useState<PriorityExplanation | null>(null);
  const [loadingPriorityExplanation, setLoadingPriorityExplanation] = useState(false);

  const fetchPriorityExplanation = useCallback(async (emailId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:29',message:'fetchPriorityExplanation called',data:{emailId,loadingPriorityExplanation,hasPriorityExplanation:!!priorityExplanation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Don't return early if loading - allow it to fetch for the current email
    if (loadingPriorityExplanation) {
      return;
    }
    
    setLoadingPriorityExplanation(true);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:35',message:'Starting API fetch',data:{emailId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const response = await axios.get(`${API_URL}/emails/${emailId}/priority-explanation`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:38',message:'API response received',data:{emailId,hasData:!!response.data,score:response.data?.score},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setPriorityExplanation(response.data);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:42',message:'API fetch error',data:{emailId,error:error instanceof Error ? error.message : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error('Error fetching priority explanation:', error);
    } finally {
      setLoadingPriorityExplanation(false);
    }
  }, [loadingPriorityExplanation, priorityExplanation]);

  const togglePriorityTooltip = useCallback((emailId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:43',message:'togglePriorityTooltip called',data:{emailId,currentHoveredId:hoveredPriorityEmailId,hasPriorityExplanation:!!priorityExplanation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (hoveredPriorityEmailId === emailId) {
      setHoveredPriorityEmailId(null);
      setPriorityExplanation(null);
      setLoadingPriorityExplanation(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:46',message:'Closing tooltip',data:{emailId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } else {
      // Clear previous explanation when switching to a different email
      setPriorityExplanation(null);
      setHoveredPriorityEmailId(emailId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePriorityTooltip.ts:50',message:'Opening tooltip for new email',data:{emailId,previousEmailId:hoveredPriorityEmailId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      fetchPriorityExplanation(emailId);
    }
  }, [hoveredPriorityEmailId, fetchPriorityExplanation]);

  const hidePriorityTooltip = useCallback(() => {
    setHoveredPriorityEmailId(null);
    setPriorityExplanation(null);
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isClickOnPriorityBadge = target.closest('[data-priority-badge]');
      const isClickOnTooltip = target.closest('[data-priority-tooltip]');
      
      if (!isClickOnPriorityBadge && !isClickOnTooltip && hoveredPriorityEmailId) {
        hidePriorityTooltip();
      }
    };

    if (hoveredPriorityEmailId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [hoveredPriorityEmailId, hidePriorityTooltip]);

  return {
    hoveredPriorityEmailId,
    priorityExplanation,
    loadingPriorityExplanation,
    togglePriorityTooltip,
    hidePriorityTooltip,
    fetchPriorityExplanation,
  };
}

