import { act, renderHook } from '@testing-library/react';
import { InboxMode } from 'types/email';

import { useDistractionFriction } from 'hooks/useDistractionFriction';
import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

const WORK = { triage: 5, action: 2, followUp: 1 };
const NO_WORK = { triage: 5, action: 0, followUp: 0 };

describe('useDistractionFriction', () => {
  it('snapshots existing work (action + follow-up) at session start', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    expect(result.current.existingActionCount).toBe(2);
    expect(result.current.existingFollowUpCount).toBe(1);
    expect(result.current.hasExistingWork).toBe(true);
    expect(result.current.isGateActive).toBe(true);
  });

  it('has no existing work when action and follow-up were zero at session start', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: NO_WORK }));
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);
  });

  // Scenario B (#23): a genuine mid-session move must NOT inflate existing work.
  it('does NOT re-trigger the gate when the user moves an email to Action mid-session', () => {
    // Session starts with no pre-existing work…
    const { result, rerender } = renderHook(
      ({ tabCounts, workAdditionCount }) => useDistractionFriction({ mode: 'triage', tabCounts, workAdditionCount }),
      { initialProps: { tabCounts: NO_WORK, workAdditionCount: 0 } }
    );
    expect(result.current.isGateActive).toBe(false);

    // …the user stars an email into Action. The optimistic count bump and the
    // workAdditionCount increment land together (same batch in the real app).
    rerender({ tabCounts: { triage: 4, action: 1, followUp: 0 }, workAdditionCount: 1 });

    // The snapshot froze at the pre-move counts — the gate must NOT activate, and a
    // peek stays frictionless so they can keep triaging.
    expect(result.current.existingActionCount).toBe(0);
    expect(result.current.existingFollowUpCount).toBe(0);
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(false);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('freezes the snapshot once the user moves work in, even as live counts keep climbing', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts, workAdditionCount }) => useDistractionFriction({ mode: 'triage', tabCounts, workAdditionCount }),
      { initialProps: { tabCounts: WORK, workAdditionCount: 0 } }
    );
    expect(result.current.existingActionCount).toBe(2);

    // User moves an email in (workAdditionCount bumps) → freeze at the pre-move counts.
    rerender({ tabCounts: { triage: 5, action: 3, followUp: 1 }, workAdditionCount: 1 });
    // A further optimistic move climbs the live counts again — snapshot stays frozen.
    rerender({ tabCounts: { triage: 5, action: 9, followUp: 4 }, workAdditionCount: 2 });
    expect(result.current.existingActionCount).toBe(2);
    expect(result.current.existingFollowUpCount).toBe(1);
  });

  // Scenario A (the bug): a stale/loading zero that resolves to real work — with NO user
  // action — must surface as existing work so the nudge/gate appears.
  it('re-snapshots when a stale-zero tab count corrects to real work before any user action', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts, workAdditionCount }) => useDistractionFriction({ mode: 'triage', tabCounts, workAdditionCount }),
      // First non-null counts are a stale/loading zero (served from cache).
      { initialProps: { tabCounts: NO_WORK, workAdditionCount: 0 } }
    );
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);

    // The real server counts arrive: 15 Action threads. workAdditionCount is unchanged
    // because the user did nothing — this is a load correction, not a mid-session move.
    rerender({ tabCounts: { triage: 5, action: 15, followUp: 0 }, workAdditionCount: 0 });

    expect(result.current.existingActionCount).toBe(15);
    expect(result.current.hasExistingWork).toBe(true);
    expect(result.current.isGateActive).toBe(true);
  });

  it('stays empty for a genuinely-empty user whose real server counts are zero', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts, workAdditionCount }) => useDistractionFriction({ mode: 'triage', tabCounts, workAdditionCount }),
      { initialProps: { tabCounts: null as typeof WORK | null, workAdditionCount: 0 } }
    );
    // Real fetch resolves to genuine zeros — no work, no gate.
    rerender({ tabCounts: NO_WORK, workAdditionCount: 0 });
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);
  });

  it('is inactive outside Triage even with existing work', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'action', tabCounts: WORK }));
    expect(result.current.isGateActive).toBe(false);
  });

  it('is unresolved in Triage until the snapshot is captured, then resolves', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts }) => useDistractionFriction({ mode: 'triage', tabCounts }),
      { initialProps: { tabCounts: null as typeof WORK | null } }
    );
    // Existing-work unknown while counts load — callers must hold, not show content.
    expect(result.current.isGateResolved).toBe(false);

    rerender({ tabCounts: WORK });
    expect(result.current.isGateResolved).toBe(true);
    expect(result.current.isGateActive).toBe(true);
  });

  it('is always resolved outside Triage (gate does not apply there)', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'action', tabCounts: null }));
    expect(result.current.isGateResolved).toBe(true);
  });

  it('does NOT intercept peeks to High-and-above', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(HIGH_PRIORITY_THRESHOLD, null);
    });
    expect(intercepted).toBe(false);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('intercepts a peek below High and opens the modal', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    let intercepted = false;
    act(() => {
      intercepted = result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(true);
    expect(result.current.isModalOpen).toBe(true);
  });

  it('does NOT intercept when there was no existing work at session start (frictionless peek)', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: NO_WORK }));
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(false);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('completeUnlock returns the deferred peek target and unlocks the session', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    act(() => {
      result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });

    let target: { minPriority: number | null; maxPriority: number | null } | null = null;
    act(() => {
      target = result.current.completeUnlock();
    });

    expect(target).toEqual({ minPriority: null, maxPriority: HIGH_PRIORITY_THRESHOLD });
    expect(result.current.isUnlocked).toBe(true);
    expect(result.current.isGateActive).toBe(false);
    expect(result.current.isModalOpen).toBe(false);

    // After unlocking, further peeks are frictionless for the session.
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(false);
  });

  it('re-locks and re-snapshots when leaving Triage and returning', () => {
    const { result, rerender } = renderHook(
      ({ mode, tabCounts, workAdditionCount }) => useDistractionFriction({ mode, tabCounts, workAdditionCount }),
      { initialProps: { mode: 'triage' as InboxMode, tabCounts: WORK, workAdditionCount: 0 } }
    );
    act(() => {
      result.current.completeUnlock();
    });
    expect(result.current.isUnlocked).toBe(true);

    // Switch away to Action…
    rerender({ mode: 'action' as const, tabCounts: WORK, workAdditionCount: 0 });
    // …and back to Triage — the gate should be active again with a fresh snapshot.
    rerender({ mode: 'triage' as const, tabCounts: WORK, workAdditionCount: 0 });

    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isGateActive).toBe(true);
    expect(result.current.existingActionCount).toBe(2);
  });

  // The move counter is monotonic across sessions, so the per-session freeze baseline
  // must reset on leaving Triage — otherwise a returning session would think the user
  // had already acted and freeze on a stale-zero again.
  it('re-baselines the freeze signal per session so post-return corrections still apply', () => {
    const { result, rerender } = renderHook(
      ({ mode, tabCounts, workAdditionCount }) => useDistractionFriction({ mode, tabCounts, workAdditionCount }),
      { initialProps: { mode: 'triage' as InboxMode, tabCounts: NO_WORK, workAdditionCount: 0 } }
    );
    // User moves a Triage email into Action (counter → 1) and then leaves Triage.
    rerender({ mode: 'triage' as const, tabCounts: { triage: 4, action: 1, followUp: 0 }, workAdditionCount: 1 });
    expect(result.current.hasExistingWork).toBe(false);
    rerender({ mode: 'action' as const, tabCounts: { triage: 4, action: 1, followUp: 0 }, workAdditionCount: 1 });

    // Returns to Triage; counts are a stale zero, counter still 1 (no NEW move this session).
    rerender({ mode: 'triage' as const, tabCounts: NO_WORK, workAdditionCount: 1 });
    expect(result.current.hasExistingWork).toBe(false);
    // A correction to real work (still no new move) must surface as existing work.
    rerender({ mode: 'triage' as const, tabCounts: { triage: 5, action: 15, followUp: 0 }, workAdditionCount: 1 });
    expect(result.current.existingActionCount).toBe(15);
    expect(result.current.hasExistingWork).toBe(true);
    expect(result.current.isGateActive).toBe(true);
  });

  it('dismissModal closes the modal without unlocking', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    act(() => {
      result.current.requestUnlock(null, HIGH_PRIORITY_THRESHOLD);
    });
    act(() => {
      result.current.dismissModal();
    });
    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isGateActive).toBe(true);
  });
});
