import { act, renderHook } from '@testing-library/react';

import { useEmailDetailDraftHandlers } from './useEmailDetailDraftHandlers';

describe('useEmailDetailDraftHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeSetters = () => ({
    setDraft: vi.fn(),
    setSelectedReplyOption: vi.fn(),
    setReplyOptions: vi.fn(),
    setToneCheckResult: vi.fn(),
    setShowReplyComposer: vi.fn(),
  });

  const replyOptions = [
    { label: 'Custom', text: '' },
    { label: 'Suggestion A', text: 'Hello from A' },
    { label: 'Suggestion B', text: 'Hello from B' },
  ];

  it('handleDraftChange sets draft and clears tone check result', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    act(() => {
      result.current.handleDraftChange('new draft text');
      vi.runAllTimers();
    });

    expect(setters.setDraft).toHaveBeenCalledWith('new draft text');
    expect(setters.setToneCheckResult).toHaveBeenCalledWith(null);
  });

  it('handleDraftChange persists user content to customDraftRef', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    act(() => {
      result.current.handleDraftChange('my typed text');
    });

    expect(result.current.customDraftRef.current).toBe('my typed text');
  });

  it('handleDraftChange during programmatic selection does NOT overwrite customDraftRef', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    // User generates a custom reply — this sets customDraftRef via handleDraftChange
    act(() => {
      result.current.handleDraftChange('my generated reply');
    });
    expect(result.current.customDraftRef.current).toBe('my generated reply');

    // User clicks a suggestion tab — Tiptap fires handleDraftChange with the suggestion text
    act(() => {
      result.current.handleReplyOptionSelect(1, 'Hello from A');
      // Tiptap onUpdate fires synchronously with the suggestion text
      result.current.handleDraftChange('Hello from A');
    });

    // customDraftRef must still hold the user's own content, not the suggestion text
    expect(result.current.customDraftRef.current).toBe('my generated reply');
  });

  it('handleReplyOptionSelect restores custom draft when switching back to Custom tab', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    // User types something in the custom tab
    act(() => {
      result.current.handleDraftChange('user typed content');
    });

    // User switches to a suggestion tab (idx 1 = 'Suggestion A', not Custom)
    act(() => {
      result.current.handleReplyOptionSelect(1, 'Hello from A');
    });
    expect(setters.setDraft).toHaveBeenLastCalledWith('Hello from A');

    // User switches back to Custom tab (idx 0 = 'Custom')
    act(() => {
      result.current.handleReplyOptionSelect(0, '');
    });
    expect(setters.setDraft).toHaveBeenLastCalledWith('user typed content');
  });

  it('handleReplyOptionSelect sets suggestion draft for non-custom tabs', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    act(() => {
      result.current.handleReplyOptionSelect(2, 'Hello from B');
    });

    expect(setters.setSelectedReplyOption).toHaveBeenCalledWith(2);
    expect(setters.setDraft).toHaveBeenCalledWith('Hello from B');
  });

  // Tests for #886: active-state mismatch when selecting a suggested reply option
  it('handleReplyOptionSelect preserves selected option index even when handleDraftChange fires immediately after (simulating Tiptap cascade)', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    act(() => {
      // Simulate: user clicks "Suggestion A" (idx 1, not Custom at 0)
      result.current.handleReplyOptionSelect(1, 'Hello from A');
      // Simulate: Tiptap fires handleDraftChange synchronously in the same tick
      result.current.handleDraftChange('Hello from A');
    });

    // setSelectedReplyOption should have been called with 1 (Suggestion A) and
    // the subsequent handleDraftChange must NOT override it back to Custom (idx 0).
    const calls = setters.setSelectedReplyOption.mock.calls.map(call => call[0]);
    // The last call must be idx 1, not the Custom idx (0)
    expect(calls[calls.length - 1]).toBe(1);
  });

  it('handleDraftChange without prior handleReplyOptionSelect still switches to Custom', async () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    // No option selection — user is typing directly
    act(() => {
      result.current.handleDraftChange('user typed something');
    });

    // Should switch to Custom tab (idx 0, since Custom is first)
    expect(setters.setSelectedReplyOption).toHaveBeenCalledWith(0);
  });

  it('handleDraftChange after setTimeout clears flag — subsequent typing resets to Custom', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    // Select option A
    act(() => {
      result.current.handleReplyOptionSelect(1, 'Hello from A');
    });

    // Advance timers to fire the setTimeout(0) that clears the flag
    act(() => {
      vi.runAllTimers();
    });

    // Now user types — should reset to Custom
    act(() => {
      result.current.handleDraftChange('user typing after selection');
    });

    const calls = setters.setSelectedReplyOption.mock.calls.map(call => call[0]);
    // Last call should be Custom idx (0)
    expect(calls[calls.length - 1]).toBe(0);
  });

  it('handleReplyClose clears all reply state', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers({
        replyOptions: replyOptions,
        setDraft: setters.setDraft,
        setSelectedReplyOption: setters.setSelectedReplyOption,
        setReplyOptions: setters.setReplyOptions,
        setToneCheckResult: setters.setToneCheckResult,
        setShowReplyComposer: setters.setShowReplyComposer,
      })
    );

    act(() => {
      result.current.handleDraftChange('some content');
    });
    act(() => {
      result.current.handleReplyClose();
    });

    expect(setters.setShowReplyComposer).toHaveBeenCalledWith(false);
    expect(setters.setDraft).toHaveBeenLastCalledWith('');
    expect(setters.setReplyOptions).toHaveBeenCalledWith(null);
    expect(setters.setSelectedReplyOption).toHaveBeenCalledWith(-1);
    expect(setters.setToneCheckResult).toHaveBeenLastCalledWith(null);
    expect(result.current.customDraftRef.current).toBe('');
  });
});
