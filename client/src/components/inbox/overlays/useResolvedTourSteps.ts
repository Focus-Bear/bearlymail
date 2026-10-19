import { useEffect, useLayoutEffect, useState } from 'react';
import type { Step } from 'react-joyride';

import { findTourTarget, toJoyrideSteps, TourStep } from 'components/inbox/overlays/tourSteps';

/** How long to keep looking for a step's element (e.g. emails still loading) before settling on the centred card. */
const TARGET_SEARCH_TIMEOUT_MS = 2000;
const TARGET_SEARCH_INTERVAL_MS = 100;

/**
 * Joyride steps for the tour, resolved against the DOM after commit — resolving
 * during render misses elements mounting in the same pass (the tour starts as the
 * inbox first renders). Keeps polling briefly for a missing target and
 * re-resolves on resize, where the layout (and so which anchors exist) changes.
 */
export function useResolvedTourSteps(tourSteps: TourStep[], tourStep: number): Step[] {
  const [steps, setSteps] = useState<Step[]>(() => toJoyrideSteps(tourSteps, tourStep));

  useLayoutEffect(() => {
    setSteps(toJoyrideSteps(tourSteps, tourStep));
  }, [tourSteps, tourStep]);

  useEffect(() => {
    const activeTargets = tourSteps[tourStep]?.targets ?? [];
    if (activeTargets.length === 0 || findTourTarget(activeTargets)) {
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const found = findTourTarget(activeTargets) !== null;
      if (found) {
        setSteps(toJoyrideSteps(tourSteps, tourStep));
      }
      if (found || Date.now() - startedAt > TARGET_SEARCH_TIMEOUT_MS) {
        window.clearInterval(interval);
      }
    }, TARGET_SEARCH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [tourSteps, tourStep]);

  useEffect(() => {
    const handleResize = () => setSteps(toJoyrideSteps(tourSteps, tourStep));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [tourSteps, tourStep]);

  return steps;
}
