/**
 * The onboarding tour's "Why is this one here?" step, spotlighting the real
 * priority badge on a real email card, with the Next button filling up while
 * the step is still locked.
 */
// The tour's Next fill animation lives in the app stylesheet, which Storybook doesn't load by itself.
import '../App.css';

import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';

import { TourOverlay } from 'components/inbox/overlays/TourOverlay';
import { INBOX_TOUR_STEPS, TourStep } from 'components/inbox/overlays/tourSteps';
import { TOUR_NEXT_STEP_DELAY_MS } from 'constants/tour';
import en from 'locales/en.json';

import { ItemDemo } from './storyHelpers/EmailListItemDemo';

const tourI18n = i18n.createInstance();
tourI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const TOUR_KEY_PREFIX = 'onboarding.tour.';
const TOUR_COPY: Record<string, string> = en.onboarding.tour;
const PRIORITY_BADGE_STEP_KEY = 'onboarding.tour.priorityBadgeTitle';

const TRANSLATED_STEPS: TourStep[] = INBOX_TOUR_STEPS.map(step => ({
  title: TOUR_COPY[step.titleKey.slice(TOUR_KEY_PREFIX.length)],
  content: TOUR_COPY[step.contentKey.slice(TOUR_KEY_PREFIX.length)],
  targets: step.targets,
  placement: step.placement,
}));

const PRIORITY_BADGE_STEP_INDEX = INBOX_TOUR_STEPS.findIndex(step => step.titleKey === PRIORITY_BADGE_STEP_KEY);

const noop = () => undefined;

/** SAMPLE_EMAIL only sets `date`, which the card doesn't read, so give it a real receive time. */
const STORY_RECEIVED_AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const PriorityBadgeTourStep: React.FC<{ nextStepDelayMs: number }> = ({ nextStepDelayMs }) => (
  <I18nextProvider i18n={tourI18n}>
    <ItemDemo emailOverrides={{ receivedAt: STORY_RECEIVED_AT }} />
    <TourOverlay
      tourStep={PRIORITY_BADGE_STEP_INDEX}
      tourSteps={TRANSLATED_STEPS}
      onSkipTour={noop}
      onNextTourStep={noop}
      onPrevTourStep={noop}
      nextStepDelayMs={nextStepDelayMs}
    />
  </I18nextProvider>
);

const meta: Meta<typeof PriorityBadgeTourStep> = {
  title: 'Inbox/Tour priority badge step',
  component: PriorityBadgeTourStep,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PriorityBadgeTourStep>;

/** As shipped: Next fills up over the real lock delay, then becomes clickable. */
export const PriorityBadgeStep: Story = { args: { nextStepDelayMs: TOUR_NEXT_STEP_DELAY_MS } };
