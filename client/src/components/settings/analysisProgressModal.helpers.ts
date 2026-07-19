/**
 * Pure helper functions extracted from AnalysisProgressModal.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const STAGES_WITH_INSIGHTS = ['analyzing', 'summarizing', 'complete'];

export function shouldShowInsights(messageKey: string | undefined): boolean {
  if (!messageKey) {
    return false;
  }
  return STAGES_WITH_INSIGHTS.some(stage => messageKey.includes(stage));
}
