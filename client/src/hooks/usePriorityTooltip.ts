import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';
import { PRIORITY_STATUS_CALCULATING } from 'constants/strings';

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
  expeditePriorityCalculation: (emailId: string) => Promise<void>;
}

export function usePriorityTooltip(): UsePriorityTooltipReturn {
  const [hoveredPriorityEmailId, setHoveredPriorityEmailId] = useState<string | null>(null);
  const [priorityExplanation, setPriorityExplanation] = useState<PriorityExplanation | null>(null);
  const [loadingPriorityExplanation, setLoadingPriorityExplanation] = useState(false);

  const fetchPriorityExplanation = useCallback(async (emailId: string) => {
    // Don't return early if loading - allow it to fetch for the current email
    if (loadingPriorityExplanation) {
      return;
    }
    
    setLoadingPriorityExplanation(true);
    try {
      // Add timeout of 10 seconds to prevent infinite loading
      const TIMEOUT_MS = 10000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Priority explanation request timed out'));
        }, TIMEOUT_MS);
      });

      const response = await Promise.race([
        axios.get(`${API_URL}/emails/${emailId}/priority-explanation`),
        timeoutPromise,
      ]);
      
      setPriorityExplanation(response.data);
    } catch (error) {
      console.error('Error fetching priority explanation:', error);
      // Don't set explanation on error - keep previous state or null
    } finally {
      // Always reset loading state, even on timeout or error
      setLoadingPriorityExplanation(false);
    }
  }, [loadingPriorityExplanation, priorityExplanation]);

  const togglePriorityTooltip = useCallback((emailId: string) => {
    if (hoveredPriorityEmailId === emailId) {
      setHoveredPriorityEmailId(null);
      setPriorityExplanation(null);
      setLoadingPriorityExplanation(false);
    } else {
      // Clear previous explanation when switching to a different email
      setPriorityExplanation(null);
      setHoveredPriorityEmailId(emailId);
      fetchPriorityExplanation(emailId);
    }
  }, [hoveredPriorityEmailId, fetchPriorityExplanation, priorityExplanation]);

  const hidePriorityTooltip = useCallback(() => {
    setHoveredPriorityEmailId(null);
    setPriorityExplanation(null);
    // Reset loading state when hiding tooltip
    setLoadingPriorityExplanation(false);
  }, []);

  const expeditePriorityCalculation = useCallback(async (emailId: string) => {
    try {
      await axios.post(`${API_URL}/emails/${emailId}/accelerate`);
      
      // Poll for completion - check every 2 seconds, max 30 seconds
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLL_TIME_MS = 30000;
      const maxAttempts = Math.floor(MAX_POLL_TIME_MS / POLL_INTERVAL_MS); // 15 attempts
      let attempts = 0;
      
      const pollForCompletion = async (): Promise<void> => {
        attempts++;
        
        try {
          const response = await axios.get(`${API_URL}/emails/${emailId}/priority-explanation`);
          const explanation = response.data;
          
          // Check if breakdown still has "Calculating..." items
          const hasCalculatingItems = explanation?.breakdown?.some(
            (item: { description?: string }) => 
              item.description === PRIORITY_STATUS_CALCULATING || 
              item.description?.includes(PRIORITY_STATUS_CALCULATING)
          );
          
          // If no calculating items, we're done
          if (!hasCalculatingItems) {
            setPriorityExplanation(explanation);
            return;
          }
          
          // If we've hit max attempts, stop polling
          if (attempts >= maxAttempts) {
            // Still update with current state even if still calculating
            setPriorityExplanation(explanation);
            console.warn('Priority calculation expedite: Max polling attempts reached');
            return;
          }
          
          // Continue polling after interval
          setTimeout(() => {
            pollForCompletion();
          }, POLL_INTERVAL_MS);
        } catch (error) {
          console.error('Error polling for priority explanation:', error);
          // Stop polling on error
        }
      };
      
      // Start polling
      pollForCompletion();
    } catch (error) {
      console.error('Error expediting priority calculation:', error);
    }
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
    expeditePriorityCalculation,
  };
}

