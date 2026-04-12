/**
 * LoginFormSection.stories.tsx — Storybook stories for the LoginFormSection component.
 *
 * LoginFormSection is the main login form used on the /login page. It supports:
 *
 *   1. Default      — empty form, no error, standard login UI with Forgot Password link
 *   2. WithError    — server-side login error displayed as an alert
 *   3. OAuthOnly    — user signed up via Google; password login not available
 *   4. FilledIn     — email and password pre-populated (as a user would see mid-fill)
 *
 * All stories import and render the REAL LoginFormSection component.
 * The component uses react-router-dom Link, so stories are wrapped in MemoryRouter.
 *
 * Related: PR #1546, issue #1539
 */
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';

import { LoginFormSection } from 'components/auth/LoginFormSection';

const meta: Meta<typeof LoginFormSection> = {
  title: 'Auth/LoginFormSection',
  component: LoginFormSection,
  decorators: [
    Story => (
      <MemoryRouter>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: '#f5f5f5',
          }}
        >
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Login form with email/password fields, Google OAuth button, and a "Forgot password?" link inline with the Password label. Covers: default, error, OAuth-only account, and pre-filled states.',
      },
    },
  },
  args: {
    email: '',
    password: '',
    error: '',
    isOAuthOnlyError: false,
    onEmailChange: () => undefined,
    onPasswordChange: () => undefined,
    onSubmit: ev => ev.preventDefault(),
    onGoogleLogin: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof LoginFormSection>;

/**
 * Default: empty login form with Forgot Password link visible next to the Password label.
 */
export const Default: Story = {
  name: 'Default — empty form with Forgot Password link',
};

/**
 * WithError: a login attempt failed; error message shown as an alert above the form.
 */
export const WithError: Story = {
  name: 'With Error — invalid credentials',
  args: {
    error: 'Invalid email or password. Please try again.',
  },
};

/**
 * OAuthOnly: the account was created via Google sign-in; password login is not available.
 * Shows a contextual message with a link to /forgot-password to set a password.
 */
export const OAuthOnly: Story = {
  name: 'OAuth-Only Account — no password set',
  args: {
    isOAuthOnlyError: true,
    error: 'This account was created with Google sign-in.',
  },
};

/**
 * FilledIn: email and password fields pre-populated (mid-fill state).
 */
export const FilledIn: Story = {
  name: 'Filled In — email and password entered',
  args: {
    email: 'user@example.com',
    password: 'hunter2',
  },
};
