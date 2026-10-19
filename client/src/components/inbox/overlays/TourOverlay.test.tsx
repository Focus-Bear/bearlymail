/**
 * The onboarding tour must point at what each step describes (founder feedback:
 * "it didn't actually highlight anything"), fall back to a centred card only when
 * the element isn't on screen, and be keyboard operable.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TOUR_SPOTLIGHT_PADDING_PX, TOUR_SPOTLIGHT_RADIUS_PX, TourOverlay } from 'components/inbox/overlays/TourOverlay';
import { toJoyrideStep, TOUR_PLACEMENT_CENTER, TourStep } from 'components/inbox/overlays/tourSteps';
import { TOUR_TARGETS } from 'constants/tour';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const TAB_RECT = { x: 40, y: 10, top: 10, left: 40, width: 120, height: 36, right: 160, bottom: 46 };

const triageStep: TourStep = {
  title: 'Triage tab',
  content: 'New emails land here',
  targets: [TOUR_TARGETS.TRIAGE_TAB],
  placement: 'bottom-start',
};
const steps: TourStep[] = [
  { title: 'Welcome', content: 'Quick tour', targets: [] },
  triageStep,
  {
    title: 'Your emails',
    content: 'Each card…',
    targets: [TOUR_TARGETS.EMAIL_ROW, TOUR_TARGETS.CATEGORY_ACCORDION],
    placement: 'bottom',
  },
];

function mountTarget(target: string, rect: Partial<DOMRect> = TAB_RECT): HTMLElement {
  const element = document.createElement('button');
  element.setAttribute('data-tour', target);
  element.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tour step targeting', () => {
  it('anchors the step to its element when it is on screen', () => {
    const tab = mountTarget(TOUR_TARGETS.TRIAGE_TAB);

    const step = toJoyrideStep(triageStep);

    expect(step.target).toBe(tab);
    expect(step.placement).toBe('bottom-start');
  });

  it('falls back to a centred card when the element is missing', () => {
    const step = toJoyrideStep(triageStep);

    expect(step.placement).toBe(TOUR_PLACEMENT_CENTER);
  });

  it('falls back when the element exists but is not laid out (hidden in this layout)', () => {
    mountTarget(TOUR_TARGETS.TRIAGE_TAB, { width: 0, height: 0 });

    expect(toJoyrideStep(triageStep).placement).toBe(TOUR_PLACEMENT_CENTER);
  });

  it('uses the next candidate when the preferred element is absent', () => {
    const accordion = mountTarget(TOUR_TARGETS.CATEGORY_ACCORDION);

    expect(toJoyrideStep(steps[2]).target).toBe(accordion);
  });
});

describe('TourOverlay', () => {
  function renderTour(tourStep: number) {
    const handlers = { onSkipTour: vi.fn(), onNextTourStep: vi.fn(), onPrevTourStep: vi.fn() };
    render(<TourOverlay tourStep={tourStep} tourSteps={steps} {...handlers} />);
    return handlers;
  }

  it('shows the current step card and cuts the spotlight around its target', async () => {
    mountTarget(TOUR_TARGETS.TRIAGE_TAB);
    renderTour(1);

    expect(await screen.findByText('New emails land here')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Triage tab');
    // The dimmed overlay's cut-out traces the target rect grown by the padding,
    // starting after the top-left corner radius.
    const cutOut = screen.getByTestId('spotlight').querySelectorAll('path')[1].getAttribute('d') ?? '';
    const left = TAB_RECT.left - TOUR_SPOTLIGHT_PADDING_PX;
    const top = TAB_RECT.top - TOUR_SPOTLIGHT_PADDING_PX;
    const right = TAB_RECT.right + TOUR_SPOTLIGHT_PADDING_PX;
    const bottom = TAB_RECT.bottom + TOUR_SPOTLIGHT_PADDING_PX;
    expect(cutOut.startsWith(`M${left + TOUR_SPOTLIGHT_RADIUS_PX} ${top}H${right - TOUR_SPOTLIGHT_RADIUS_PX}`)).toBe(true);
    expect(cutOut).toContain(` ${bottom}H${left + TOUR_SPOTLIGHT_RADIUS_PX}`);
  });

  it('centres the card with no cut-out when the target is missing', async () => {
    renderTour(1);

    expect(await screen.findByText('New emails land here')).toBeInTheDocument();
    expect(screen.getByTestId('spotlight').querySelectorAll('path')).toHaveLength(1);
  });

  it('spotlights a target that mounts after the tour opens (e.g. inbox still rendering)', async () => {
    renderTour(1);
    await screen.findByText('New emails land here');

    mountTarget(TOUR_TARGETS.TRIAGE_TAB);

    await waitFor(() => expect(screen.getByTestId('spotlight').querySelectorAll('path')).toHaveLength(2));
  });

  it('Esc skips, → advances and ← goes back', async () => {
    mountTarget(TOUR_TARGETS.TRIAGE_TAB);
    const handlers = renderTour(1);
    await screen.findByText('New emails land here');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(handlers.onNextTourStep).toHaveBeenCalledTimes(1);
    expect(handlers.onPrevTourStep).toHaveBeenCalledTimes(1);
    expect(handlers.onSkipTour).toHaveBeenCalledTimes(1);
  });

  it('does not go back from the first step', async () => {
    const handlers = renderTour(0);
    await screen.findByText('Quick tour');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });

    expect(handlers.onPrevTourStep).not.toHaveBeenCalled();
  });

  it('keeps the arrow keys away from the inbox shortcuts underneath', async () => {
    const inboxShortcut = vi.fn();
    window.addEventListener('keydown', inboxShortcut);
    renderTour(0);
    await screen.findByText('Quick tour');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    expect(inboxShortcut).not.toHaveBeenCalled();
    window.removeEventListener('keydown', inboxShortcut);
  });
});
