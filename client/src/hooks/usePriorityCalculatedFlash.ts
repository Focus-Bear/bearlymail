import { useEffect, useRef, useState } from 'react';

import { PRIORITY_CALCULATED_FLASH_MS } from 'constants/numbers';

/**
 * Tracks the "priority calculating" → "calculated" transition for a priority badge.
 *
 * Returns true for a brief window (PRIORITY_CALCULATED_FLASH_MS) after `isCalculating`
 * flips from true to false while the component is mounted, so the badge can show a ✅
 * confirmation instead of jumping straight from the spinner to the resolved label.
 */
export function usePriorityCalculatedFlash(isCalculating: boolean): boolean {
  const wasCalculatingRef = useRef(isCalculating);
  const [showCalculated, setShowCalculated] = useState(false);

  useEffect(() => {
    const wasCalculating = wasCalculatingRef.current;
    wasCalculatingRef.current = isCalculating;
    if (!wasCalculating || isCalculating) {
      return;
    }
    setShowCalculated(true);
    const timer = setTimeout(() => setShowCalculated(false), PRIORITY_CALCULATED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [isCalculating]);

  return showCalculated;
}
