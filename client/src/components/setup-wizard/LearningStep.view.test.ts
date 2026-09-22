import { type AnalyzeProgress } from 'hooks/settings/useAnalysisProgress';

import { computeLearningView } from './LearningStep';

const analyze = (current: number, total: number, isComplete: boolean): AnalyzeProgress => ({
  show: true,
  progress: { current, total },
  error: null,
  isComplete,
});

describe('computeLearningView — overall progress', () => {
  it('reaches 100% once the import reports ready', () => {
    const view = computeLearningView(analyze(100, 100, true), { prioritizedCount: 100, isReady: true }, false);
    expect(view.displayProgress).toBe(1);
    expect(view.canFinish).toBe(true);
  });

  it('does not stay stuck below 100% when learning finishes via timeout (#294)', () => {
    // Analysis completed (the 70% slice) but the import poll never reported
    // ready and its count stayed at 0, so the blended value is 0.7. The timeout
    // then makes the step finishable and marks every row done — the bar must
    // follow to 100% rather than remaining at 70%.
    const view = computeLearningView(analyze(100, 100, true), { prioritizedCount: 0, isReady: false }, true);

    expect(view.canFinish).toBe(true);
    expect(view.displayProgress).toBe(1);
    // Rows are driven past the last phase so all read as done.
    expect(view.currentPhase).toBeGreaterThanOrEqual(3);
  });

  it('shows the blended, capped value while still in progress', () => {
    // Analysis at 50% (→0.35) and no imported emails yet, not finishable.
    const view = computeLearningView(analyze(50, 100, false), { prioritizedCount: 0, isReady: false }, false);

    expect(view.canFinish).toBe(false);
    expect(view.displayProgress).toBeCloseTo(0.35, 5);
  });
});
