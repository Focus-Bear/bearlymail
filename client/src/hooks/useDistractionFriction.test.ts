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

  it('does NOT re-trigger the gate when the user moves an email to Action mid-session', () => {
    // Session starts with no pre-existing work…
    const { result, rerender } = renderHook(
      ({ tabCounts }) => useDistractionFriction({ mode: 'triage', tabCounts }),
      { initialProps: { tabCounts: NO_WORK } }
    );
    expect(result.current.isGateActive).toBe(false);

    // …the user stars an email into Action, so live counts now show work.
    rerender({ tabCounts: { triage: 4, action: 1, followUp: 0 } });

    // The snapshot is frozen at session start — the gate must NOT activate, and a
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

  it('keeps the session-start snapshot even as live counts change', () => {
    const { result, rerender } = renderHook(
      ({ tabCounts }) => useDistractionFriction({ mode: 'triage', tabCounts }),
      { initialProps: { tabCounts: WORK } }
    );
    expect(result.current.existingActionCount).toBe(2);

    rerender({ tabCounts: { triage: 5, action: 9, followUp: 4 } });
    // Snapshot unchanged despite the live counts climbing.
    expect(result.current.existingActionCount).toBe(2);
    expect(result.current.existingFollowUpCount).toBe(1);
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
      ({ mode, tabCounts }) => useDistractionFriction({ mode, tabCounts }),
      { initialProps: { mode: 'triage' as InboxMode, tabCounts: WORK } }
    );
    act(() => {
      result.current.completeUnlock();
    });
    expect(result.current.isUnlocked).toBe(true);

    // Switch away to Action…
    rerender({ mode: 'action' as const, tabCounts: WORK });
    // …and back to Triage — the gate should be active again with a fresh snapshot.
    rerender({ mode: 'triage' as const, tabCounts: WORK });

    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isGateActive).toBe(true);
    expect(result.current.existingActionCount).toBe(2);
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
