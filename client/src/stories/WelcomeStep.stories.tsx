/**
 * WelcomeStep stories — uses the real WelcomeStep component.
 *
 * Covers:
 * 1. Default state — consent unchecked, Continue button disabled
 * 2. Consent accepted state — checkbox checked, Continue button enabled
 *
 * Related: PR #1441, issue #1430 (WelcomeStep UX polish)
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { userEvent, within } from 'storybook/test';

import { WelcomeStep } from 'components/setup-wizard/WelcomeStep';

// ---------------------------------------------------------------------------
// Wrapper to supply required props
// ---------------------------------------------------------------------------
const WelcomeStepWrapper = () => {
  const [completed, setCompleted] = useState(false);

  if (completed) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#16A34A',
          fontSize: '18px',
          fontWeight: 600,
        }}
      >
        ✅ onComplete fired — setup wizard would advance to next step.
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px' }}>
        <WelcomeStep onComplete={() => setCompleted(true)} refreshUser={async () => {}} />
      </div>
    </I18nextProvider>
  );
};

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta<typeof WelcomeStep> = {
  title: 'Onboarding/WelcomeStep',
  component: WelcomeStep,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The first step of the BearlyMail setup wizard. Displays a welcome message, privacy notice, and a consent checkbox. The Continue button is disabled until consent is accepted.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof WelcomeStep>;

/**
 * Default state: consent checkbox is unchecked.
 * The Continue button is disabled and visually greyed out.
 */
export const Default: Story = {
  name: 'Default — consent unchecked (button disabled)',
  render: () => <WelcomeStepWrapper />,
};

/**
 * Consent accepted state: the play function clicks the consent checkbox
 * within the story canvas so Storybook's interactions addon can record and
 * replay the interaction. The Continue button is enabled and ready to submit.
 */
export const ConsentAccepted: Story = {
  name: 'Consent accepted — button enabled',
  render: () => <WelcomeStepWrapper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = await canvas.findByRole('checkbox');
    await userEvent.click(checkbox);
  },
};
