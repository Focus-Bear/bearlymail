/**
 * The background-sorting and Snooze steps render as real tour cards with their
 * English copy, anchored to the progress bar and the Snooze button.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { TourOverlay } from 'components/inbox/overlays/TourOverlay';
import { INBOX_TOUR_STEPS, TourStep } from 'components/inbox/overlays/tourSteps';
import { TOUR_TARGETS, TourTarget } from 'constants/tour';
import en from 'locales/en.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const RECT = { x: 40, y: 10, top: 10, left: 40, width: 120, height: 36, right: 160, bottom: 46 };
const TOUR_KEY_PREFIX = 'onboarding.tour.';
const TOUR_COPY: Record<string, string> = en.onboarding.tour;

function translateTourKey(key: string): string {
  return TOUR_COPY[key.slice(TOUR_KEY_PREFIX.length)];
}

const TRANSLATED_STEPS: TourStep[] = INBOX_TOUR_STEPS.map(step => ({
  title: translateTourKey(step.titleKey),
  content: translateTourKey(step.contentKey),
  targets: step.targets,
  placement: step.placement,
}));

function mountTarget(target: TourTarget): void {
  const element = document.createElement('button');
  element.setAttribute('data-tour', target);
  element.getBoundingClientRect = () => ({ ...RECT, toJSON: () => RECT }) as DOMRect;
  document.body.appendChild(element);
}

function renderStep(titleKey: string) {
  const index = INBOX_TOUR_STEPS.findIndex(step => step.titleKey === titleKey);
  render(
    <TourOverlay
      tourStep={index}
      tourSteps={TRANSLATED_STEPS}
      onSkipTour={vi.fn()}
      onNextTourStep={vi.fn()}
      onPrevTourStep={vi.fn()}
    />
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('inbox tour — new steps', () => {
  it('explains that the rest of the inbox is still sorting in the background', async () => {
    mountTarget(TOUR_TARGETS.BACKGROUND_SORTING);
    renderStep('onboarding.tour.backgroundSortingTitle');

    expect(await screen.findByText(TOUR_COPY.backgroundSortingContent)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(TOUR_COPY.backgroundSortingTitle);
    expect(TOUR_COPY.backgroundSortingContent).toMatch(/background/);
    expect(screen.getByTestId('spotlight').querySelectorAll('path')).toHaveLength(2);
  });

  it('explains what Snooze does and how to use it, spotlighting the Snooze button', async () => {
    mountTarget(TOUR_TARGETS.EMAIL_SNOOZE);
    renderStep('onboarding.tour.snoozeTitle');

    expect(await screen.findByText(TOUR_COPY.snoozeContent)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(TOUR_COPY.snoozeTitle);
    expect(screen.getByTestId('spotlight').querySelectorAll('path')).toHaveLength(2);
  });
});
