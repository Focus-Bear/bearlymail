import { act, renderHook } from '@testing-library/react';
import { InboxMode } from 'types/email';

import { useDistractionFriction } from 'hooks/useDistractionFriction';
import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

const WORK = { triage: 5, action: 2, followUp: 1 };
const NO_WORK = { triage: 5, action: 0, followUp: 0 };

describe('useDistractionFriction', () => {
  it('detects existing work from action or follow-up counts', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts }) => useDistractionFriction({ mode: 'triage', tabCounts }),
      { initialProps: { tabCounts: NO_WORK } }
    );
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);

    rerender({ tabCounts: { triage: 5, action: 0, followUp: 3 } });
    expect(result.current.hasExistingWork).toBe(true);
    expect(result.current.isGateActive).toBe(true);
  });

  it('is inactive outside Triage even with existing work', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'action', tabCounts: WORK }));
    expect(result.current.isGateActive).toBe(false);
  });

  it('is inactive when tabCounts are not yet loaded', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: null }));
    expect(result.current.hasExistingWork).toBe(false);
    expect(result.current.isGateActive).toBe(false);
  });

  it('is unresolved in Triage until tabCounts load, then resolves', () => {
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

  it('does NOT intercept unlocks to High-and-above', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(HIGH_PRIORITY_THRESHOLD, null);
    });
    expect(intercepted).toBe(false);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('intercepts unlocks below the floor and opens the modal', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    let intercepted = false;
    act(() => {
      intercepted = result.current.requestUnlock(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(true);
    expect(result.current.isModalOpen).toBe(true);
  });

  it('does NOT intercept when there is no existing work (normal one-click unlock)', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: NO_WORK }));
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD);
    });
    expect(intercepted).toBe(false);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('completeUnlock returns the deferred target and unlocks the session', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    act(() => {
      result.current.requestUnlock(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD);
    });

    let target: { minPriority: number; maxPriority: number | null } | null = null;
    act(() => {
      target = result.current.completeUnlock();
    });

    expect(target).toEqual({ minPriority: MEDIUM_PRIORITY_THRESHOLD, maxPriority: HIGH_PRIORITY_THRESHOLD });
    expect(result.current.isUnlocked).toBe(true);
    expect(result.current.isGateActive).toBe(false);
    expect(result.current.isModalOpen).toBe(false);

    // After unlocking, further low-tier unlocks are frictionless for the session.
    let intercepted = true;
    act(() => {
      intercepted = result.current.requestUnlock(MEDIUM_PRIORITY_THRESHOLD, null);
    });
    expect(intercepted).toBe(false);
  });

  it('re-locks when leaving Triage and returning', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => useDistractionFriction({ mode, tabCounts: WORK }),
      { initialProps: { mode: 'triage' as InboxMode } }
    );
    act(() => {
      result.current.completeUnlock();
    });
    expect(result.current.isUnlocked).toBe(true);

    // Switch away to Action…
    rerender({ mode: 'action' as const });
    // …and back to Triage — the gate should be active again.
    rerender({ mode: 'triage' as const });

    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isGateActive).toBe(true);
  });

  it('opens the pre-screen (not the modal) when gated', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    expect(result.current.isPreScreenOpen).toBe(true);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('does NOT open the pre-screen when there is no existing work', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: NO_WORK }));
    expect(result.current.isPreScreenOpen).toBe(false);
  });

  it('proceedFromPreScreen closes the pre-screen and opens the friction modal with no deferred target', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    act(() => {
      result.current.proceedFromPreScreen();
    });
    expect(result.current.isPreScreenOpen).toBe(false);
    expect(result.current.isModalOpen).toBe(true);

    // No deferred tier target: completing the exercise reveals everything.
    let target: { minPriority: number; maxPriority: number | null } | null = null;
    act(() => {
      target = result.current.completeUnlock();
    });
    expect(target).toBeNull();
    expect(result.current.isUnlocked).toBe(true);
  });

  it('re-shows the pre-screen (resets preScreenDone) when leaving Triage and returning', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => useDistractionFriction({ mode, tabCounts: WORK }),
      { initialProps: { mode: 'triage' as InboxMode } }
    );
    act(() => {
      result.current.proceedFromPreScreen();
    });
    expect(result.current.isPreScreenOpen).toBe(false);
    expect(result.current.isModalOpen).toBe(true);

    rerender({ mode: 'action' as const });
    rerender({ mode: 'triage' as const });

    expect(result.current.isPreScreenOpen).toBe(true);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('dismissModal closes the modal without unlocking', () => {
    const { result } = renderHook(() => useDistractionFriction({ mode: 'triage', tabCounts: WORK }));
    act(() => {
      result.current.requestUnlock(MEDIUM_PRIORITY_THRESHOLD, null);
    });
    act(() => {
      result.current.dismissModal();
    });
    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isGateActive).toBe(true);
  });
});
