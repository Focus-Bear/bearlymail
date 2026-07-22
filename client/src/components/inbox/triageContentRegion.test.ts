import { selectTriageContentRegion, TriageContentRegion } from 'components/inbox/triageContentRegion';

const BASE = {
  isOnboardingGated: false,
  isFrictionModalOpen: false,
  isGatePending: false,
};

describe('selectTriageContentRegion', () => {
  it('shows the normal content when nothing is gating or pending', () => {
    expect(selectTriageContentRegion(BASE)).toBe(TriageContentRegion.Content);
  });

  it('shows the onboarding interstitial above everything else', () => {
    expect(
      selectTriageContentRegion({
        isOnboardingGated: true,
        isFrictionModalOpen: true,
        isGatePending: true,
      })
    ).toBe(TriageContentRegion.OnboardingInterstitial);
  });

  it('the friction/unlock exercise takes precedence over the content', () => {
    const region = selectTriageContentRegion({ ...BASE, isFrictionModalOpen: true });
    expect(region).toBe(TriageContentRegion.FrictionModal);
    // The key anti-flip-flop guarantee: while the modal is open, the content
    // region (which hosts the post-clear peek prompt) is NOT selected.
    expect(region).not.toBe(TriageContentRegion.Content);
  });

  it('holds on a pending state (not content) while the existing-work snapshot is unknown', () => {
    const region = selectTriageContentRegion({ ...BASE, isGatePending: true });
    expect(region).toBe(TriageContentRegion.GatePending);
    // Must not flash the content/peek prompt before the snapshot settles.
    expect(region).not.toBe(TriageContentRegion.Content);
  });

  it('the friction modal wins over the pending state', () => {
    expect(
      selectTriageContentRegion({ ...BASE, isFrictionModalOpen: true, isGatePending: true })
    ).toBe(TriageContentRegion.FrictionModal);
  });

  it('renders the content once nothing is gating (post-unlock)', () => {
    expect(selectTriageContentRegion(BASE)).toBe(TriageContentRegion.Content);
  });
});
