import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';

import {
  ANCHOR_FIND_TIMEOUT_MS,
  ANCHOR_HIGHLIGHT_MS,
  ANCHOR_POLL_MS,
  ANCHOR_TRACK_MS,
  useSettingsAnchorScroll,
} from './useSettingsAnchorScroll';

const ANCHOR = 'auto-archive-proposals';
const HIGHLIGHT_CLEARED_AFTER_MS = ANCHOR_HIGHLIGHT_MS + 1000;

const renderAt = (url: string, isReady = true) =>
  renderHook(({ ready }) => useSettingsAnchorScroll(ready), {
    initialProps: { ready: isReady },
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    ),
  });

/** Adds the target section; `top` is where layout puts it (changing it simulates a layout shift). */
const addSection = (top = 1000) => {
  const element = document.createElement('section');
  element.id = ANCHOR;
  const layout = { top };
  element.getBoundingClientRect = () => ({ top: layout.top }) as DOMRect;
  document.body.appendChild(element);
  return { element, layout };
};

describe('useSettingsAnchorScroll', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo.mockClear();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('waits for a section that renders late, then scrolls to it and highlights it', () => {
    renderAt(`/settings#${ANCHOR}`);
    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS * 3);
    });
    expect(scrollTo).not.toHaveBeenCalled();

    const { element } = addSection();
    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS);
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 976, behavior: 'smooth' });
    expect(element.style.outline).toContain('solid');

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_CLEARED_AFTER_MS);
    });
    expect(element.style.outline).toBe('');
  });

  it('scrolls again when sections above it finish loading and push it down', () => {
    const { layout } = addSection();
    renderAt(`/settings#${ANCHOR}`);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS * 2);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    layout.top = 1600;
    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS);
    });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('stops moving the page once the user scrolls', () => {
    const { layout } = addSection();
    renderAt(`/settings#${ANCHOR}`);
    window.dispatchEvent(new Event('wheel'));

    layout.top = 1600;
    act(() => {
      vi.advanceTimersByTime(ANCHOR_TRACK_MS);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('waits until the page has loaded', () => {
    addSection();
    const { rerender } = renderAt(`/settings#${ANCHOR}`, false);
    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS * 2);
    });
    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly on a section that never renders', () => {
    renderAt('/settings#not-a-section');
    act(() => {
      vi.advanceTimersByTime(ANCHOR_FIND_TIMEOUT_MS + ANCHOR_POLL_MS);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves scrolling to the categories list when a category is deep-linked', () => {
    addSection();
    renderAt(`/settings?category=Receipts#${ANCHOR}`);
    act(() => {
      vi.advanceTimersByTime(ANCHOR_POLL_MS * 2);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
