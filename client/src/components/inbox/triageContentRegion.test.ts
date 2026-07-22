import { selectTriageContentRegion, TriageContentRegion } from 'components/inbox/triageContentRegion';

const BASE = {
  isOnboardingGated: false,
  isPreScreenOpen: false,
  isFrictionModalOpen: false,
  isGatePending: false,
};

describe('selectTriageContentRegion', () => {
  it('shows the normal content when no gate is active or pending', () => {
    expect(selectTriageContentRegion(BASE)).toBe(TriageContentRegion.Content);
  });

  it('shows the onboarding interstitial above everything else', () => {
    expect(
      selectTriageContentRegion({
        ...BASE,
        isOnboardingGated: true,
        isPreScreenOpen: true,
        isFrictionModalOpen: true,
        isGatePending: true,
      })
    ).toBe(TriageContentRegion.OnboardingInterstitial);
  });

  it('the distraction pre-screen takes precedence over the (medium-priority) content', () => {
    const region = selectTriageContentRegion({ ...BASE, isPreScreenOpen: true });
    expect(region).toBe(TriageContentRegion.EntryGate);
    // The key anti-flip-flop guarantee: while the gate is active, the content
    // region (which hosts the medium-priority interstitial) is NOT selected.
    expect(region).not.toBe(TriageContentRegion.Content);
  });

  it('the friction/unlock exercise takes precedence over the content', () => {
    const region = selectTriageContentRegion({ ...BASE, isFrictionModalOpen: true });
    expect(region).toBe(TriageContentRegion.FrictionModal);
    expect(region).not.toBe(TriageContentRegion.Content);
  });

  it('holds on a pending state (not content) while existing-work counts are unknown', () => {
    const region = selectTriageContentRegion({ ...BASE, isGatePending: true });
    expect(region).toBe(TriageContentRegion.GatePending);
    // Must not flash the content/medium interstitial before the gate settles.
    expect(region).not.toBe(TriageContentRegion.Content);
  });

  it('renders the content (incl. the medium-priority interstitial) once the gate is gone', () => {
    // Simulates the post-unlock state: gate resolved, nothing gating.
    expect(selectTriageContentRegion(BASE)).toBe(TriageContentRegion.Content);
  });
});
