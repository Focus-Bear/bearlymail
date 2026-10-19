import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { Email } from 'types/email';

import { LONG_TIMEOUT_MS } from 'constants/numbers';
import categoryReducer, { setExpandedKeys } from 'store/slices/categorySlice';

import { hasVisibleProcessingEmail, useEmailProcessingPolling } from './useEmailProcessingPolling';

const email = (categoryKey: string, isProcessingPriority: boolean): Email =>
  ({ id: `${categoryKey}-email`, category_id: categoryKey, category: 'Work', isProcessingPriority }) as unknown as Email;

describe('hasVisibleProcessingEmail', () => {
  it('is true only for processing rows in an open category', () => {
    const emails = [email('open', false), email('closed', true)];
    expect(hasVisibleProcessingEmail(emails, new Set(['open']))).toBe(false);
    expect(hasVisibleProcessingEmail(emails, new Set(['open', 'closed']))).toBe(true);
  });
});

describe('useEmailProcessingPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPolling(emails: Email[], expandedKeys: string[]) {
    const store = configureStore({ reducer: { category: categoryReducer } });
    store.dispatch(setExpandedKeys(expandedKeys));
    const onPoll = vi.fn().mockResolvedValue(undefined);
    const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(Provider, { store, children });
    const hook = renderHook(({ rows }) => useEmailProcessingPolling({ emails: rows, onPoll }), {
      wrapper: Wrapper,
      initialProps: { rows: emails },
    });
    return { ...hook, onPoll, store };
  }

  it('polls while a visible row is processing', () => {
    const { onPoll } = renderPolling([email('open', true)], ['open']);
    act(() => {
      vi.advanceTimersByTime(LONG_TIMEOUT_MS * 2);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it('does not poll when the only processing rows are in collapsed categories', () => {
    const { onPoll } = renderPolling([email('closed', true)], ['open']);
    act(() => {
      vi.advanceTimersByTime(LONG_TIMEOUT_MS * 2);
    });
    expect(onPoll).not.toHaveBeenCalled();
  });

  it('stops polling once nothing visible is processing', () => {
    const { onPoll, rerender } = renderPolling([email('open', true)], ['open']);
    act(() => {
      vi.advanceTimersByTime(LONG_TIMEOUT_MS);
    });
    rerender({ rows: [email('open', false)] });
    act(() => {
      vi.advanceTimersByTime(LONG_TIMEOUT_MS * 3);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
  });
});
