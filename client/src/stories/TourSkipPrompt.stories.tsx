/**
 * TourSkipPrompt stories — clicking Skip on the onboarding tour no longer skips:
 * it asks the user to stay and makes skipping a 10-second press-and-hold.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';

import { TourModalContent } from 'components/inbox/overlays/TourModalContent';
import en from 'locales/en.json';

const tourI18n = i18n.createInstance();
tourI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const STEPS = [
  { title: en.onboarding.tour.welcome, content: en.onboarding.tour.welcomeContent },
  { title: en.onboarding.tour.triageTitle, content: en.onboarding.tour.triageContent },
];

const noop = () => undefined;

const TourCard: React.FC<{ isSkipPromptVisible: boolean }> = ({ isSkipPromptVisible }) => (
  <I18nextProvider i18n={tourI18n}>
    <TourModalContent
      tourStep={0}
      tourSteps={STEPS}
      isFirstStep
      isLastStep={false}
      isSkipPromptVisible={isSkipPromptVisible}
      onRequestSkip={noop}
      onCancelSkip={noop}
      onSkipTour={noop}
      onNextTourStep={noop}
      onPrevTourStep={noop}
    />
  </I18nextProvider>
);

const meta: Meta<typeof TourCard> = {
  title: 'Inbox/TourSkipPrompt',
  component: TourCard,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TourCard>;

export const TourCardWithSkip: Story = { args: { isSkipPromptVisible: false } };

export const SkipPromptShown: Story = { args: { isSkipPromptVisible: true } };
