import { type AnalyzeProgress } from 'hooks/settings/useAnalysisProgress';

import {
  buildRowCount,
  computeLearningView,
  hasLearningFinished,
  isAnalysisStalled,
  PHASE_CATEGORISE,
  PHASE_LABEL_KEYS,
  PHASE_SYNC,
  type TFn,
} from './learning-view';
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

const failed = (message: string): AnalyzeProgress => ({ show: true, progress: null, error: message, isComplete: false });
const NOT_READY_IMPORT = { prioritizedCount: 0, isReady: false };

describe('computeLearningView — stalled analysis', () => {
  it('reports a stall the moment the analysis errors, instead of a silent frozen first row', () => {
    // The report's state: 258 emails synced (import ready) but the analysis poll
    // died on a superseded run, so nothing would ever advance the screen.
    const view = computeLearningView(failed('Superseded by new analysis'), { prioritizedCount: 258, isReady: true }, false, sorting(204, 250));

    expect(view.isStalled).toBe(true);
    expect(view.isLearningDone).toBe(false);
    expect(view.canFinish).toBe(false);
  });

  it('reports a stall when the max wait elapses with the analysis still unfinished', () => {
    const view = computeLearningView(analyze(10, 100, false), READY_IMPORT, true, NOT_STARTED);

    expect(view.isStalled).toBe(true);
    expect(view.canFinish).toBe(false);
  });

  it('is not stalled while the analysis is still progressing inside the max wait', () => {
    const view = computeLearningView(analyze(10, 100, false), READY_IMPORT, false, NOT_STARTED);

    expect(view.isStalled).toBe(false);
  });

  it('is not stalled once the analysis completed, even if the import poll timed out (#294)', () => {
    expect(isAnalysisStalled(analyze(100, 100, true), true)).toBe(false);
    expect(hasLearningFinished(analyze(100, 100, true), NOT_READY_IMPORT, true)).toBe(true);
  });

  it('no longer counts an unfinished analysis as learned just because the clock ran out', () => {
    expect(hasLearningFinished(analyze(10, 100, false), READY_IMPORT, true)).toBe(false);
  });
});

describe('buildRowCount', () => {
  const translate: TFn = (key, values) => `${key}:${JSON.stringify(values)}`;
  const progress = { syncedCount: 258, categorisedCount: 204, categoriseTotal: 250 };

  it('hides the count on a phase that has not started yet', () => {
    expect(buildRowCount(translate, PHASE_CATEGORISE, false, progress)).toBe('');
  });

  it('shows the real count on an active or finished phase', () => {
    expect(buildRowCount(translate, PHASE_CATEGORISE, true, progress)).toBe('204 / 250');
    expect(buildRowCount(translate, PHASE_SYNC, true, progress)).toContain('"count":258');
  });
});
