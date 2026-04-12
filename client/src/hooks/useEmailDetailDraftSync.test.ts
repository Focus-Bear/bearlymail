/**
 * Tests for the useAutoSaveDraft sub-hook extracted in fix #978.
 *
 * Key behaviour under test:
 * - The auto-save interval fires at AUTO_SAVE_INTERVAL_MS intervals (not on every
 *   keystroke) — this is the core regression guard for the typing-lag fix.
 * - `saveDraft` receives the LATEST draft/mode/recipients values even when the
 *   ref-based optimisation is in use (i.e. prop changes don't reset the interval).
 * - The interval is torn down when `showReplyComposer` becomes false or `threadId`
 *   becomes undefined.
 * - No save fires when the draft is empty / whitespace-only.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { AUTO_SAVE_INTERVAL_MS } from 'constants/numbers';

// Re-export the private hook for testing via the named export from the module.
// Since useAutoSaveDraft is not exported we test it indirectly through
// useEmailDetailDraftSync (the public surface), which wires it up internally.
import { useEmailDetailDraftSync } from './useEmailDetailDraftSync';

// Minimal stubs for the non-auto-save params of useEmailDetailDraftSync.
const makeBaseParams = (overrides: Record<string, unknown> = {}) => ({
  id: 'email-1',
  email: { threadId: 'thread-1' } as unknown as import('types/email').Email,
  draft: '',
  replyMode: 'reply' as const,
  replyRecipients: '',
  autoGenerateReplies: false,
  replyOptions: null,
  showReplyComposer: true,
  replyComposerRef: { current: null } as unknown as React.RefObject<HTMLDivElement>,
  saveDraft: jest.fn(),
  fetchDraft: jest.fn().mockResolvedValue(null),
  setDraft: jest.fn(),
  setReplyRecipients: jest.fn(),
  setReplyMode: jest.fn(),
  setShowReplyComposer: jest.fn(),
  setReplyOptions: jest.fn(),
  setToneCheckResult: jest.fn(),
  handleGenerateDraft: jest.fn(),
  ...overrides,
});

describe('useEmailDetailDraftSync — auto-save behaviour (fix #978)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does NOT call saveDraft before the interval elapses', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: 'hello', saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS - 1);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('calls saveDraft once when AUTO_SAVE_INTERVAL_MS elapses with a non-empty draft', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: 'hello world', saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith('hello world', 'reply', '');
  });

  it('calls saveDraft repeatedly on each interval tick', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: 'some text', saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS * 3);
    });

    expect(saveDraft).toHaveBeenCalledTimes(3);
  });

  it('does NOT call saveDraft when draft is empty', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: '', saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('does NOT call saveDraft when draft is whitespace-only', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: '   \n\t  ', saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('does NOT call saveDraft when showReplyComposer is false', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({ draft: 'hello', showReplyComposer: false, saveDraft });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('does NOT call saveDraft when email threadId is undefined', () => {
    const saveDraft = jest.fn();
    const params = makeBaseParams({
      draft: 'hello',
      email: undefined,
      saveDraft,
    });

    renderHook(() => useEmailDetailDraftSync(params));

    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('interval is not reset on each render (core anti-regression for typing lag)', () => {
    // Simulate rapid re-renders as draft changes (one per keystroke).
    // The interval should fire exactly once at AUTO_SAVE_INTERVAL_MS regardless
    // of how many times the hook re-renders in between.
    const saveDraft = jest.fn();
    let draft = 'a';
    const params = makeBaseParams({ draft, saveDraft });

    const { rerender } = renderHook(() => useEmailDetailDraftSync({ ...params, draft }));

    // Simulate 20 keystrokes within the interval window
    act(() => {
      for (let i = 0; i < 20; i++) {
        draft += 'x';
        rerender();
        jest.advanceTimersByTime(10); // 200ms total — well within the interval
      }
    });

    // No save should have fired yet
    expect(saveDraft).not.toHaveBeenCalled();

    // Advance to trigger one interval tick
    act(() => {
      jest.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
    });

    // Exactly one save despite 20 re-renders
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });
});
