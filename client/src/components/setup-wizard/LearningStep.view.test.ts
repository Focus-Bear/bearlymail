import { type AnalyzeProgress } from 'hooks/settings/useAnalysisProgress';

import { computeLearningView, PHASE_CATEGORISE, PHASE_LABEL_KEYS } from './learning-view';
import { type CategorisationState } from './useCategorisationProgress';

const analyze = (current: number, total: number, isComplete: boolean): AnalyzeProgress => ({
  show: true,
  progress: { current, total },
  error: null,
  isComplete,
});

const sorting = (categorised: number, total: number, timedOut = false): CategorisationState => ({
  progress: { categorised, total },
  timedOut,
});

const NOT_STARTED: CategorisationState = { progress: null, timedOut: false };
const READY_IMPORT = { prioritizedCount: 100, isReady: true };

describe('computeLearningView — overall progress', () => {
  it('reaches 100% once learning is done and every inbox thread is categorised', () => {
    const view = computeLearningView(analyze(100, 100, true), READY_IMPORT, false, sorting(67, 67));
    expect(view.displayProgress).toBe(1);
    expect(view.canFinish).toBe(true);
    expect(view.isStillSorting).toBe(false);
  });

  it('does not stay stuck below 100% when learning finishes via timeout (#294)', () => {
    // Analysis completed but the import poll never reported ready; the learning
    // timeout makes the step finishable once the inbox is sorted, and every row
    // must then read as done with the bar at 100%.
    const view = computeLearningView(
      analyze(100, 100, true),
      { prioritizedCount: 0, isReady: false },
      true,
      sorting(0, 0)
    );

    expect(view.canFinish).toBe(true);
    expect(view.displayProgress).toBe(1);
    expect(view.currentPhase).toBeGreaterThanOrEqual(PHASE_LABEL_KEYS.length);
  });

  it('shows the blended, capped value while still in progress', () => {
    // Analysis at 50% (→0.35 of learning) scaled to the 70% learning share, nothing sorted yet.
    const view = computeLearningView(analyze(50, 100, false), { prioritizedCount: 0, isReady: false }, false, NOT_STARTED);

    expect(view.canFinish).toBe(false);
    expect(view.displayProgress).toBeCloseTo(0.245, 5);
  });
});

describe('computeLearningView — categorisation gate', () => {
  it('keeps the inbox locked after learning finishes while threads are still being categorised', () => {
    const view = computeLearningView(analyze(100, 100, true), READY_IMPORT, false, sorting(42, 67));

    expect(view.isLearningDone).toBe(true);
    expect(view.canFinish).toBe(false);
    expect(view.currentPhase).toBe(PHASE_CATEGORISE);
    expect(view.realProgress).toMatchObject({ categorisedCount: 42, categoriseTotal: 67 });
    expect(view.displayProgress).toBeLessThan(1);
  });

  it('stays locked before the first categorisation poll returns', () => {
    const view = computeLearningView(analyze(100, 100, true), READY_IMPORT, false, NOT_STARTED);

    expect(view.canFinish).toBe(false);
  });

  it('does not unlock on a complete categorisation count before learning is done', () => {
    const view = computeLearningView(analyze(40, 100, false), { prioritizedCount: 5, isReady: false }, false, sorting(5, 5));

    expect(view.canFinish).toBe(false);
    expect(view.currentPhase).toBeLessThan(PHASE_CATEGORISE);
  });

  it('lets the user in after the max wait with a still-sorting note', () => {
    const view = computeLearningView(analyze(100, 100, true), READY_IMPORT, false, sorting(42, 67, true));

    expect(view.canFinish).toBe(true);
    expect(view.isStillSorting).toBe(true);
    expect(view.displayProgress).toBe(1);
  });

  it('treats an empty inbox as already sorted', () => {
    const view = computeLearningView(analyze(100, 100, true), READY_IMPORT, false, sorting(0, 0));

    expect(view.canFinish).toBe(true);
  });
});
