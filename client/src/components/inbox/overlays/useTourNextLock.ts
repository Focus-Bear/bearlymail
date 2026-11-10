import { useEffect, useState } from 'react';

/**
 * True while Next should stay greyed out: for `delayMs` the first time each
 * step shows. A step the user has already waited on stays unlocked, so going
 * Back and then Next again isn't held up a second time. A delay of 0 never locks.
 */
export function useTourNextLock(tourStep: number, delayMs: number): boolean {
  const [readSteps, setReadSteps] = useState<ReadonlySet<number>>(() => new Set());
  const isLocked = delayMs > 0 && !readSteps.has(tourStep);

  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }
    const timer = setTimeout(() => setReadSteps(previous => new Set(previous).add(tourStep)), delayMs);
    return () => clearTimeout(timer);
  }, [isLocked, tourStep, delayMs]);

  return isLocked;
}
