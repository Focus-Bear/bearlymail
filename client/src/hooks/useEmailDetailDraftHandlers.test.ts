import { act, renderHook } from '@testing-library/react';

import { useEmailDetailDraftHandlers } from './useEmailDetailDraftHandlers';

describe('useEmailDetailDraftHandlers', () => {
  const makeSetters = () => ({
    setDraft: jest.fn(),
    setSelectedReplyOption: jest.fn(),
    setReplyOptions: jest.fn(),
    setToneCheckResult: jest.fn(),
    setShowReplyComposer: jest.fn(),
  });

  const replyOptions = [
    { label: 'Suggestion A', text: 'Hello from A' },
    { label: 'Suggestion B', text: 'Hello from B' },
    { label: 'Custom', text: '' },
  ];

  it('handleDraftChange sets draft and clears tone check result', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers(replyOptions, setters.setDraft, setters.setSelectedReplyOption, setters.setReplyOptions, setters.setToneCheckResult, setters.setShowReplyComposer)
    );

    act(() => { result.current.handleDraftChange('new draft text'); });

    expect(setters.setDraft).toHaveBeenCalledWith('new draft text');
    expect(setters.setToneCheckResult).toHaveBeenCalledWith(null);
  });

  it('handleDraftChange persists user content to customDraftRef', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers(replyOptions, setters.setDraft, setters.setSelectedReplyOption, setters.setReplyOptions, setters.setToneCheckResult, setters.setShowReplyComposer)
    );

    act(() => { result.current.handleDraftChange('my typed text'); });

    expect(result.current.customDraftRef.current).toBe('my typed text');
  });

  it('handleReplyOptionSelect restores custom draft when switching back to Custom tab', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers(replyOptions, setters.setDraft, setters.setSelectedReplyOption, setters.setReplyOptions, setters.setToneCheckResult, setters.setShowReplyComposer)
    );

    // User types something in the custom tab
    act(() => { result.current.handleDraftChange('user typed content'); });

    // User switches to a suggestion tab (idx 0 = 'Suggestion A', not Custom)
    act(() => { result.current.handleReplyOptionSelect(0, 'Hello from A'); });
    expect(setters.setDraft).toHaveBeenLastCalledWith('Hello from A');

    // User switches back to Custom tab (idx 2 = 'Custom')
    act(() => { result.current.handleReplyOptionSelect(2, ''); });
    expect(setters.setDraft).toHaveBeenLastCalledWith('user typed content');
  });

  it('handleReplyOptionSelect sets suggestion draft for non-custom tabs', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers(replyOptions, setters.setDraft, setters.setSelectedReplyOption, setters.setReplyOptions, setters.setToneCheckResult, setters.setShowReplyComposer)
    );

    act(() => { result.current.handleReplyOptionSelect(1, 'Hello from B'); });

    expect(setters.setSelectedReplyOption).toHaveBeenCalledWith(1);
    expect(setters.setDraft).toHaveBeenCalledWith('Hello from B');
  });

  it('handleReplyClose clears all reply state', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useEmailDetailDraftHandlers(replyOptions, setters.setDraft, setters.setSelectedReplyOption, setters.setReplyOptions, setters.setToneCheckResult, setters.setShowReplyComposer)
    );

    act(() => { result.current.handleDraftChange('some content'); });
    act(() => { result.current.handleReplyClose(); });

    expect(setters.setShowReplyComposer).toHaveBeenCalledWith(false);
    expect(setters.setDraft).toHaveBeenLastCalledWith('');
    expect(setters.setReplyOptions).toHaveBeenCalledWith(null);
    expect(setters.setToneCheckResult).toHaveBeenLastCalledWith(null);
    expect(result.current.customDraftRef.current).toBe('');
  });
});
