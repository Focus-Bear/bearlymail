/**
 * Single source of truth for which full-region screen the Triage content area
 * shows. Several interstitials compete for the same region and must never fight:
 *
 *  - the onboarding prioritisation interstitial (initial analysis progress),
 *  - the distraction-gate pre-screen ("Are you sure you want to look at Triage?"),
 *  - the distraction-gate friction/unlock exercise,
 *  - the normal Triage content (list + progressive-unlock / medium-priority prompt).
 *
 * The distraction gate is the OUTER decision of whether the user may look at
 * Triage at all while unfinished Action/Follow-Up work remains, so it takes
 * precedence over the normal content (which includes the medium-priority
 * "you've cleared all the high priority emails" interstitial). Because the gate's
 * active state derives from asynchronously-loaded tab counts, we treat "gate not
 * yet resolved" as a distinct holding state — otherwise the medium interstitial
 * flashes for a frame and is then replaced by the gate (the flip-flop bug).
 */
export enum TriageContentRegion {
  /** Onboarding gate: initial prioritisation still running. */
  OnboardingInterstitial = 'onboarding-interstitial',
  /** Distraction-gate pre-screen ("Gimme inbox please!" / Search off-ramp). */
  EntryGate = 'entry-gate',
  /** Distraction-gate friction/unlock exercise. */
  FrictionModal = 'friction-modal',
  /** Existing-work status unknown yet (tab counts loading) — hold, don't flash content. */
  GatePending = 'gate-pending',
  /** Normal Triage content (list + progressive-unlock / medium-priority prompt). */
  Content = 'content',
}

export interface TriageContentRegionInput {
  /** usePrioritisationGate.isGated — onboarding analysis gate. */
  isOnboardingGated: boolean;
  /** Distraction-gate pre-screen is showing. */
  isPreScreenOpen: boolean;
  /** Distraction-gate friction/unlock exercise is showing. */
  isFrictionModalOpen: boolean;
  /**
   * The distraction gate cannot be decided yet because existing-work counts
   * (Action + Follow-Up) have not loaded. Only meaningful in Triage.
   */
  isGatePending: boolean;
}

/**
 * Resolve the single screen the Triage content region should render. The order
 * of checks IS the precedence: the gate (and its pending/holding state) always
 * wins over the normal content so the two never overlap or flip-flop.
 */
export function selectTriageContentRegion({
  isOnboardingGated,
  isPreScreenOpen,
  isFrictionModalOpen,
  isGatePending,
}: TriageContentRegionInput): TriageContentRegion {
  if (isOnboardingGated) {
    return TriageContentRegion.OnboardingInterstitial;
  }
  if (isPreScreenOpen) {
    return TriageContentRegion.EntryGate;
  }
  if (isFrictionModalOpen) {
    return TriageContentRegion.FrictionModal;
  }
  if (isGatePending) {
    return TriageContentRegion.GatePending;
  }
  return TriageContentRegion.Content;
}
