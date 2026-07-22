/**
 * Single source of truth for which full-region screen the Triage content area
 * shows. Several interstitials compete for the same region and must never fight:
 *
 *  - the onboarding prioritisation interstitial (initial analysis progress),
 *  - the distraction-gate friction/unlock exercise (reached via the peek CTA),
 *  - the normal Triage content (list + the post-clear "well done" peek prompt).
 *
 * Entering Triage to see High-and-above emails is free. The friction exercise only
 * appears once the user actively asks to peek at lower-priority emails, so it takes
 * precedence over the normal content while it is open. Because the gate's
 * existing-work snapshot is captured from asynchronously-loaded tab counts, we
 * treat "snapshot not captured yet" as a distinct holding state — otherwise the
 * post-clear prompt could flash with stale/zero counts for a frame (the flip-flop).
 */
export enum TriageContentRegion {
  /** Onboarding gate: initial prioritisation still running. */
  OnboardingInterstitial = 'onboarding-interstitial',
  /** Distraction-gate friction/unlock exercise (reached via the peek CTA). */
  FrictionModal = 'friction-modal',
  /** Existing-work snapshot not captured yet (tab counts loading) — hold, don't flash content. */
  GatePending = 'gate-pending',
  /** Normal Triage content (list + the post-clear "well done" peek prompt). */
  Content = 'content',
}

export interface TriageContentRegionInput {
  /** usePrioritisationGate.isGated — onboarding analysis gate. */
  isOnboardingGated: boolean;
  /** Distraction-gate friction/unlock exercise is showing. */
  isFrictionModalOpen: boolean;
  /**
   * The gate cannot be decided yet because the existing-work snapshot (Action +
   * Follow-Up counts) has not been captured. Only meaningful in Triage.
   */
  isGatePending: boolean;
}

/**
 * Resolve the single screen the Triage content region should render. The order of
 * checks IS the precedence: the friction modal (and the pending/holding state) win
 * over the normal content so the two never overlap or flip-flop.
 */
export function selectTriageContentRegion({
  isOnboardingGated,
  isFrictionModalOpen,
  isGatePending,
}: TriageContentRegionInput): TriageContentRegion {
  if (isOnboardingGated) {
    return TriageContentRegion.OnboardingInterstitial;
  }
  if (isFrictionModalOpen) {
    return TriageContentRegion.FrictionModal;
  }
  if (isGatePending) {
    return TriageContentRegion.GatePending;
  }
  return TriageContentRegion.Content;
}
