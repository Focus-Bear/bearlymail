/**
 * AcceptInvite.stories.tsx — Storybook stories for the AcceptInvite page.
 *
 * AcceptInvite is a guest-facing full-page component with 5 distinct visual states:
 *
 *   1. Loading    — invite token is being validated (spinner-less, shows "Validating…" text)
 *   2. Invalid    — token is expired/invalid (`valid: false` from API)
 *   3. ReadyGuest — valid invite but user is not logged in ("Log in to Accept")
 *   4. ReadyLoggedIn — valid invite and user is authenticated ("Accept Invite")
 *   5. AcceptError — mutation failed after clicking Accept (error message shows)
 *
 * All stories import and render the REAL AcceptInvite component.
 * Data is supplied via React Query cache seeding; auth is mocked via AuthContext.Provider.
 *
 * Related: PR #1448, issue #1112
 */
import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from 'storybook/test';

import { AcceptInviteDemo } from './storyHelpers/AcceptInviteDemo';

const meta: Meta<typeof AcceptInviteDemo> = {
  title: 'Pages/AcceptInvite',
  component: AcceptInviteDemo,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Guest-facing invite acceptance page. Validates the invite token on mount, then presents the accept flow. Covers: loading, invalid token, guest (unauthenticated), logged-in, and accept-error states.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof AcceptInviteDemo>;

/**
 * Loading state: the invite token is being validated.
 * The component renders "Validating invite link…" while the query is in flight.
 * (No cache is pre-seeded; the component renders its loading branch on first paint.)
 */
export const Loading: Story = {
  name: 'Loading — validating invite token',
  args: { scenario: 'loading' },
};

/**
 * Invalid state: the token is expired, already used, or does not exist.
 * Shows the "Invalid or Expired Invite" card with a "Go to Login" button.
 */
export const Invalid: Story = {
  name: 'Invalid — token expired or not found',
  args: { scenario: 'invalid' },
};

/**
 * Ready (guest): valid invite, user is NOT logged in.
 * The button reads "Log in to Accept" and a prompt to log in is shown.
 */
export const ReadyGuest: Story = {
  name: 'Ready — valid invite, not logged in',
  args: { scenario: 'readyGuest' },
};

/**
 * Ready (logged in): valid invite, user IS authenticated.
 * The button reads "Accept Invite" and is immediately actionable.
 */
export const ReadyLoggedIn: Story = {
  name: 'Ready — valid invite, user logged in',
  args: { scenario: 'readyLoggedIn' },
};

/**
 * Accept error: the accept mutation failed (network/API error).
 * The play function clicks "Accept Invite" — since no API is available in Storybook,
 * the mutation rejects and the error message renders below the button.
 */
export const AcceptError: Story = {
  name: 'Accept error — mutation failed',
  args: { scenario: 'acceptError' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /accept invite/i });
    await userEvent.click(button);
  },
};

/**
 * Accepting (pending): the accept mutation is in-flight.
 * Click "Accept Invite" to observe the button's disabled/loading state
 * (button text changes to "Accepting…" and opacity reduces).
 * Note: in Storybook without an API backend the mutation will quickly error out.
 */
export const Accepting: Story = {
  name: 'Accepting — mutation in-flight (click to trigger)',
  args: { scenario: 'accepting' },
};
