import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FLY_ANIMATION_MS,
  INITIAL_ACTION,
  INITIAL_TRIAGE,
  RESET_AFTER_MS,
  TOAST_VISIBLE_MS,
} from './constants';
import { LiveDemo } from './LiveDemo';

// The mocked t() echoes the key (first key when a fallback list is passed), so
// assertions target stable i18n keys rather than display copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string | string[]) => (Array.isArray(key) ? key[0] : key),
  }),
}));

const key = (suffix: string): string => `landing.v2.demo.${suffix}`;

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveDemo', () => {
  it('shows the try-the-demo cue until the first interaction', () => {
    render(<LiveDemo />);
    expect(screen.getByText(key('calloutLabel'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tabs\.action/ }));
    expect(screen.queryByText(key('calloutLabel'))).not.toBeInTheDocument();
  });

  it('archives the email, shows a toast, and reveals the empty state', () => {
    render(<LiveDemo />);
    fireEvent.click(screen.getByRole('button', { name: key('actions.archive') }));

    expect(screen.getByText(key('email.subject'))).not.toBeVisible();
    expect(screen.getByText(key('routed.archiveDone'))).toBeInTheDocument();
    expect(screen.getByText(key('empty.triage.title'))).toBeInTheDocument();
  });

  it('puts the card above the skeleton rows in Action after "Oh sh$t"', () => {
    vi.useFakeTimers();
    render(<LiveDemo />);

    fireEvent.click(screen.getByText(key('prioritise.ohShit')));
    act(() => {
      vi.advanceTimersByTime(FLY_ANIMATION_MS + 50);
    });
    fireEvent.click(screen.getByRole('button', { name: /tabs\.action/ }));

    const card = screen.getByText(key('email.subject'));
    expect(card).toBeVisible();
    const firstSkeleton = screen.getByText(key('skeleton.first.sender'));
    expect(
      card.compareDocumentPosition(firstSkeleton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('places the card after the first skeleton row for "Get on it"', () => {
    vi.useFakeTimers();
    render(<LiveDemo />);

    fireEvent.click(screen.getByText(key('prioritise.getOnIt')));
    act(() => {
      vi.advanceTimersByTime(FLY_ANIMATION_MS + 50);
    });
    fireEvent.click(screen.getByRole('button', { name: /tabs\.action/ }));

    const card = screen.getByText(key('email.subject'));
    const firstSkeleton = screen.getByText(key('skeleton.first.sender'));
    const secondSkeleton = screen.getByText(key('skeleton.second.sender'));
    expect(
      firstSkeleton.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      card.compareDocumentPosition(secondSkeleton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('restores the initial state via the restart control', () => {
    render(<LiveDemo />);
    fireEvent.click(screen.getByRole('button', { name: key('actions.archive') }));
    fireEvent.click(screen.getByRole('button', { name: key('restart') }));

    expect(screen.getByText(key('email.subject'))).toBeVisible();
    expect(screen.queryByText(key('empty.triage.title'))).not.toBeInTheDocument();
    expect(screen.getByText(key('calloutLabel'))).toBeInTheDocument();
  });

  it('cancels pending animation timers when restarting mid-animation', () => {
    vi.useFakeTimers();
    render(<LiveDemo />);

    fireEvent.click(screen.getByText(key('prioritise.ohShit')));
    // Restart while the card is still mid-fly, then let every pending timer
    // window elapse. The stale fly callback must not fire and corrupt the
    // freshly reset state.
    fireEvent.click(screen.getByRole('button', { name: key('restart') }));
    act(() => {
      vi.advanceTimersByTime(FLY_ANIMATION_MS + TOAST_VISIBLE_MS);
    });

    expect(screen.getByRole('button', { name: /tabs\.triage/ })).toHaveTextContent(
      String(INITIAL_TRIAGE)
    );
    expect(screen.getByRole('button', { name: /tabs\.action/ })).toHaveTextContent(
      String(INITIAL_ACTION)
    );
    expect(screen.queryByText(key('routed.ohShit'))).not.toBeInTheDocument();
    expect(screen.getByText(key('email.subject'))).toBeVisible();
    expect(screen.getByText(key('calloutLabel'))).toBeInTheDocument();
  });

  it('pauses the auto-reset while hovering and resumes it on leave', () => {
    vi.useFakeTimers();
    const { container } = render(<LiveDemo />);
    const wrap = container.querySelector('.demo-wrap') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: key('actions.archive') }));
    fireEvent.mouseEnter(wrap);
    act(() => {
      vi.advanceTimersByTime(RESET_AFTER_MS * 2);
    });
    expect(screen.getByText(key('email.subject'))).not.toBeVisible();

    fireEvent.mouseLeave(wrap);
    act(() => {
      vi.advanceTimersByTime(RESET_AFTER_MS + 50);
    });
    expect(screen.getByText(key('email.subject'))).toBeVisible();
  });
});
