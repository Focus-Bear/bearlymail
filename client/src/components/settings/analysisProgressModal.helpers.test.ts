/**
 * Unit tests for AnalysisProgressModal helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { shouldShowInsights } from './analysisProgressModal.helpers';

describe('shouldShowInsights', () => {
  it('returns false for undefined messageKey', () => {
    expect(shouldShowInsights(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldShowInsights('')).toBe(false);
  });

  it('returns false for a non-matching key', () => {
    expect(shouldShowInsights('fetching')).toBe(false);
  });

  it('returns true for a key containing "analyzing"', () => {
    expect(shouldShowInsights('stage.analyzing')).toBe(true);
  });

  it('returns true for a key containing "summarizing"', () => {
    expect(shouldShowInsights('stage.summarizing')).toBe(true);
  });

  it('returns true for a key containing "complete"', () => {
    expect(shouldShowInsights('stage.complete')).toBe(true);
  });
});
