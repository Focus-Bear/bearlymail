import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { InfoTooltip } from './InfoTooltip';

const CONTENT = 'Tooltip content';
const HIDE_DELAY_MS = 300;

describe('InfoTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderTooltip = () => render(<InfoTooltip content={CONTENT} />);
  const getTrigger = () => screen.getByRole('button');

  it('shows the tooltip when the pointer enters the trigger', () => {
    renderTooltip();
    fireEvent.mouseOver(getTrigger());
    expect(screen.getByText(CONTENT)).toBeInTheDocument();
  });

  it('keeps the tooltip visible during the hide delay, then hides it', () => {
    renderTooltip();
    fireEvent.mouseOver(getTrigger());
    fireEvent.mouseOut(getTrigger());

    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
    });
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });

  it('cancels the scheduled hide when the pointer re-enters the trigger', () => {
    renderTooltip();
    fireEvent.mouseOver(getTrigger());
    fireEvent.mouseOut(getTrigger());
    fireEvent.mouseOver(getTrigger());

    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
    });
    expect(screen.getByText(CONTENT)).toBeInTheDocument();
  });

  it('keeps the tooltip open while the pointer is inside the tooltip body', () => {
    renderTooltip();
    fireEvent.mouseOver(getTrigger());
    fireEvent.mouseOut(getTrigger());
    fireEvent.mouseOver(screen.getByText(CONTENT));

    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
    });
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    fireEvent.mouseOut(screen.getByText(CONTENT));
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and hides it after blur plus the delay', () => {
    renderTooltip();
    fireEvent.focus(getTrigger());
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    fireEvent.blur(getTrigger());
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });

  it('closes the tooltip when Escape is pressed on the trigger', () => {
    renderTooltip();
    fireEvent.mouseOver(getTrigger());
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    fireEvent.keyDown(getTrigger(), { key: 'Escape' });
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });

  it('toggles the tooltip on click', () => {
    renderTooltip();
    fireEvent.click(getTrigger());
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    fireEvent.click(getTrigger());
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });
it('toggles the tooltip with Enter and Space', () => {
    renderTooltip();
    fireEvent.keyDown(getTrigger(), { key: 'Enter' });
    expect(screen.getByText(CONTENT)).toBeInTheDocument();

    fireEvent.keyDown(getTrigger(), { key: 'Enter' });
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();

    fireEvent.keyDown(getTrigger(), { key: ' ' });
    expect(screen.getByText(CONTENT)).toBeInTheDocument();
  });
});
