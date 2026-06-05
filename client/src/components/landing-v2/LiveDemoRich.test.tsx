import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveDemoRich } from './LiveDemoRich';

// The mocked t() echoes the key, so assertions target stable i18n keys rather
// than display copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const key = (suffix: string): string => `landing.v2.demo.${suffix}`;

beforeEach(() => {
  // Suppress the once-per-session auto tour so it doesn't overlay interactions.
  sessionStorage.setItem('bm_tour_v1', '1');
});

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('LiveDemoRich', () => {
  it('renders the "Try the live demo" callout and the three triage emails', () => {
    render(<LiveDemoRich />);
    expect(screen.getByText(key('calloutLabel'))).toBeInTheDocument();
    expect(screen.getByText(key('cards.aria.sender'))).toBeInTheDocument();
    expect(screen.getByText(key('cards.sam.sender'))).toBeInTheDocument();
    expect(screen.getByText(key('cards.notion.sender'))).toBeInTheDocument();
  });

  it('reveals the locked reply CTA when an email is opened', () => {
    render(<LiveDemoRich />);
    expect(screen.queryByText(key('replyLock.cta'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(key('cards.sam.subject')));
    expect(screen.getByText(key('replyLock.cta'))).toBeInTheDocument();
  });

  it('switches panes when a tab is selected', () => {
    render(<LiveDemoRich />);
    const danielSender = screen.getByText(key('cards.daniel.sender'));
    expect(danielSender).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /tabs\.action/ }));
    expect(danielSender).toBeVisible();
  });

  it('routes a triaged email out of Triage when a reaction is chosen', () => {
    vi.useFakeTimers();
    render(<LiveDemoRich />);
    expect(screen.getByText(key('cards.aria.subject'))).toBeInTheDocument();

    const canWaitLabels = screen.getAllByText(key('prioritise.canWait'));
    fireEvent.click(canWaitLabels[0]);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByText(key('cards.aria.subject'))).not.toBeInTheDocument();
  });
});
