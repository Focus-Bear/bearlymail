import { type AnalyzeProgress } from 'hooks/settings/useAnalysisProgress';

import { type CategorisationState, isCategorisationComplete } from './useCategorisationProgress';

export interface ImportProgress {
  prioritizedCount: number;
  isReady: boolean;
}

export type TFn = (key: string, values?: Record<string, unknown>) => string;

const IMPORT_TARGET = 100;
const ANALYSIS_WEIGHT = 0.7;
const IMPORT_WEIGHT = 0.3;
// Learning (sync + analysis) fills most of the bar; sorting the inbox into
// categories is the last stretch before the inbox opens.
const LEARNING_SHARE = 0.7;
const SORTING_SHARE = 0.3;
const PROGRESS_CAP_BEFORE_READY = 0.99;
const PROGRESS_MAX = 1;

export const PHASE_SYNC = 0;
export const PHASE_ANALYZE = 1;
export const PHASE_CALIBRATE = 2;
export const PHASE_CATEGORISE = 3;

/**
 * Collapses the analysis backend's real, monotonic status messageKey onto one
 * of the analysis phases the UI shows. The backend reports
 * starting → fetching → analyzing → finalizing → complete; we group the email
 * fetch with the inbox sync, analysing on its own, and finalising with
 * calibration. Anything unrecognised (or no analysis yet) falls back to the
 * first phase.
 */
const ANALYSIS_STAGE_PHASE: Record<string, number> = {
  'settings.analysis.progress.starting': PHASE_SYNC,
  'settings.analysis.progress.searching': PHASE_SYNC,
  'settings.analysis.progress.fetching': PHASE_SYNC,
  'settings.analysis.progress.preparing': PHASE_ANALYZE,
  'settings.analysis.progress.identifyingVip': PHASE_ANALYZE,
  'settings.analysis.progress.analyzing': PHASE_ANALYZE,
  'settings.analysis.progress.analyzingGeneric': PHASE_ANALYZE,
  'settings.analysis.progress.processingResults': PHASE_CALIBRATE,
  'settings.analysis.progress.savingInsights': PHASE_CALIBRATE,
  'settings.analysis.progress.finalizing': PHASE_CALIBRATE,
  'settings.analysis.progress.complete': PHASE_CALIBRATE,
  'settings.analysis.progress.completeSimple': PHASE_CALIBRATE,
};

export const PHASE_LABEL_KEYS = [
  'setupWizard.learning.phaseSync',
  'setupWizard.learning.phaseAnalyze',
  'setupWizard.learning.phaseCalibrate',
  'setupWizard.learning.phaseCategorise',
];

export interface RealProgress {
  syncedCount: number;
  threadCount?: number;
  analyzedCount?: number;
  vipCount?: number;
  categorisedCount?: number;
  categoriseTotal?: number;
}

export interface LearningView {
  displayProgress: number;
  /** Sync + context analysis have finished (or timed out). */
  isLearningDone: boolean;
  /** The user may open the inbox: learning is done and the inbox is sorted, or we stopped waiting. */
  canFinish: boolean;
  /** Let in by the max-wait timeout while some threads are still being sorted. */
  isStillSorting: boolean;
  currentPhase: number;
  realProgress: RealProgress;
}

/** Sync + context analysis have finished, or we stopped waiting for them. */
export function hasLearningFinished(
  analyzeProgress: AnalyzeProgress,
  importProgress: ImportProgress,
  timedOut: boolean
): boolean {
  return (importProgress.isReady && analyzeProgress.isComplete) || timedOut;
}

function getAnalysisPhase(messageKey: string | undefined): number {
  if (!messageKey) {
    return PHASE_SYNC;
  }
  return ANALYSIS_STAGE_PHASE[messageKey] ?? PHASE_SYNC;
}

function computeLearningFraction(analyzeProgress: AnalyzeProgress, importProgress: ImportProgress): number {
  const progress = analyzeProgress.progress;
  const analysisFraction = progress ? Math.min(PROGRESS_MAX, progress.current / Math.max(1, progress.total)) : 0;
  const importFraction = Math.min(PROGRESS_MAX, importProgress.prioritizedCount / IMPORT_TARGET);
  return Math.min(PROGRESS_MAX, ANALYSIS_WEIGHT * analysisFraction + IMPORT_WEIGHT * importFraction);
}

function computeSortingFraction(categorisation: CategorisationState): number {
  const progress = categorisation.progress;
  if (!progress) {
    return 0;
  }
  return progress.total > 0 ? Math.min(PROGRESS_MAX, progress.categorised / progress.total) : PROGRESS_MAX;
}

function pickCurrentPhase(canFinish: boolean, isLearningDone: boolean, messageKey: string | undefined): number {
  if (canFinish) {
    // Past the last row so every row reads as done.
    return PHASE_LABEL_KEYS.length;
  }
  return isLearningDone ? PHASE_CATEGORISE : getAnalysisPhase(messageKey);
}

/**
 * Derives the real, observable progress shown on the learning screen from the
 * backend signals: the context-analysis poll (a real 0-100 percentage plus
 * per-stage counts), the email-import poll (real synced-thread count) and the
 * categorisation poll (threads with a settled category). Nothing is
 * synthesised. The inbox only unlocks once the inbox is sorted, so the user
 * doesn't land on a wall of "Other" — or once the max wait elapses.
 */
export function computeLearningView(
  analyzeProgress: AnalyzeProgress,
  importProgress: ImportProgress,
  timedOut: boolean,
  categorisation: CategorisationState
): LearningView {
  const isLearningDone = hasLearningFinished(analyzeProgress, importProgress, timedOut);
  const isSorted = isCategorisationComplete(categorisation.progress);
  const canFinish = isLearningDone && (isSorted || categorisation.timedOut);
  const learningFraction = isLearningDone ? PROGRESS_MAX : computeLearningFraction(analyzeProgress, importProgress);
  const blended = LEARNING_SHARE * learningFraction + SORTING_SHARE * computeSortingFraction(categorisation);
  const progress = analyzeProgress.progress;
  return {
    // Once finished every indicator reads "done", so the bar must show 100% too (#294).
    displayProgress: canFinish ? PROGRESS_MAX : Math.min(PROGRESS_CAP_BEFORE_READY, blended),
    isLearningDone,
    canFinish,
    isStillSorting: canFinish && !isSorted,
    currentPhase: pickCurrentPhase(canFinish, isLearningDone, progress?.messageKey),
    realProgress: {
      syncedCount: importProgress.prioritizedCount,
      threadCount: progress?.threadCount,
      analyzedCount: progress?.analyzedCount,
      vipCount: progress?.stats?.vipContactsEvaluated,
      categorisedCount: categorisation.progress?.categorised,
      categoriseTotal: categorisation.progress?.total,
    },
  };
}

/** Live status line for the active phase, interpolating real counts from the backend. */
export function buildStatusDetail(translate: TFn, phase: number, rp: RealProgress): string {
  if (phase === PHASE_ANALYZE) {
    return rp.threadCount
      ? translate('setupWizard.learning.statusAnalyze', { analyzed: rp.analyzedCount ?? 0, total: rp.threadCount })
      : translate('setupWizard.learning.statusAnalyzeGeneric');
  }
  if (phase === PHASE_CALIBRATE) {
    return translate('setupWizard.learning.statusCalibrate');
  }
  if (phase === PHASE_CATEGORISE) {
    return rp.categoriseTotal
      ? translate('setupWizard.learning.statusCategorise', {
          categorised: rp.categorisedCount ?? 0,
          total: rp.categoriseTotal,
        })
      : translate('setupWizard.learning.statusCategoriseGeneric');
  }
  return translate('setupWizard.learning.statusSync', { count: rp.syncedCount });
}

function buildFraction(done: number | undefined, total: number | undefined): string {
  if (total) {
    return `${done ?? 0} / ${total}`;
  }
  return done ? String(done) : '';
}

/** Real count shown on the right of each phase row (empty until the number exists). */
export function buildPhaseCount(translate: TFn, phaseIdx: number, rp: RealProgress): string {
  if (phaseIdx === PHASE_SYNC) {
    return translate('setupWizard.learning.countMessages', { count: rp.syncedCount });
  }
  if (phaseIdx === PHASE_ANALYZE) {
    return buildFraction(rp.analyzedCount, rp.threadCount);
  }
  if (phaseIdx === PHASE_CATEGORISE) {
    return buildFraction(rp.categorisedCount, rp.categoriseTotal);
  }
  return rp.vipCount !== undefined ? translate('setupWizard.learning.countVip', { count: rp.vipCount }) : '';
}
