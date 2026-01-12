import { useState, useCallback, useEffect, useRef } from 'react';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { TIMEOUT_300_MS } from 'constants/numbers';

const STORAGE_KEY = 'bearlymail_split_position';
const DEFAULT_SPLIT_POSITION = 50;
const MIN_SPLIT_POSITION = 20;
const MAX_SPLIT_POSITION = 80;

interface UseSplitViewReturn {
  selectedEmailId: string | null;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  isMobile: boolean;
  setSelectedEmailId: React.Dispatch<React.SetStateAction<string | null>>;
  setPanelExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  openEmail: (emailId: string) => void;
  closeEmail: () => void;
  togglePanel: () => void;
  expandPanel: () => void;
  collapsePanel: () => void;
  setSplitPosition: (position: number) => void;
  startResize: () => void;
  endResize: () => void;
}

export function useSplitView(): UseSplitViewReturn {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [splitPosition, setSplitPositionState] = useState<number>(DEFAULT_SPLIT_POSITION);
  const [isResizing, setIsResizing] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const breakpoints = useResponsiveBreakpoints();

  // Load saved position from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const position = parseFloat(saved);
        if (!isNaN(position) && position >= MIN_SPLIT_POSITION && position <= MAX_SPLIT_POSITION) {
          setSplitPositionState(position);
        }
      }
    } catch (error) {
      console.error('Error loading split position from localStorage:', error);
    }
  }, []);

  // Save position to localStorage with debounce
  const savePosition = useCallback((position: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, position.toString());
      } catch (error) {
        console.error('Error saving split position to localStorage:', error);
      }
      }, TIMEOUT_300_MS); // Debounce by 300ms
  }, []);

  const setSplitPosition = useCallback((position: number) => {
    // Clamp position between min and max
    const clampedPosition = Math.max(MIN_SPLIT_POSITION, Math.min(MAX_SPLIT_POSITION, position));
    setSplitPositionState(clampedPosition);
    savePosition(clampedPosition);
  }, [savePosition]);

  const startResize = useCallback(() => {
    setIsResizing(true);
  }, []);

  const endResize = useCallback(() => {
    setIsResizing(false);
  }, []);

  const openEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
    setPanelExpanded(false);
  }, []);

  const closeEmail = useCallback(() => {
    setSelectedEmailId(null);
    setPanelExpanded(false);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelExpanded(prev => !prev);
  }, []);

  const expandPanel = useCallback(() => {
    setPanelExpanded(true);
  }, []);

  const collapsePanel = useCallback(() => {
    setPanelExpanded(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    selectedEmailId,
    panelExpanded,
    splitPosition,
    isResizing,
    isMobile: breakpoints.isMobile,
    setSelectedEmailId,
    setPanelExpanded,
    openEmail,
    closeEmail,
    togglePanel,
    expandPanel,
    collapsePanel,
    setSplitPosition,
    startResize,
    endResize,
  };
}

