/**
 * GitHubStatusSection stories — demonstrates the fix for #1673 where the
 * GitHub card was not visible when the email's plain text didn't include
 * the word "github" but the server had already resolved GitHub links.
 *
 * Static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { GitHubLink } from 'types/email';

import { GitHubStatusSection } from 'components/github/GitHubStatusSection';

const sampleLink: GitHubLink = {
  type: 'pr',
  repo: 'bearlymail',
  owner: 'Focus-Bear',
  number: 42,
  url: 'https://github.com/Focus-Bear/BearlyMail/pull/42',
};

const meta: Meta<typeof GitHubStatusSection> = {
  title: 'GitHub/GitHubStatusSection',
  component: GitHubStatusSection,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof GitHubStatusSection>;

/** Email body mentions "github" — classic path, should always show */
export const KeywordMatch: Story = {
  args: {
    links: [sampleLink],
    loading: false,
    hasToken: true,
    onRefresh: () => undefined,
    emailSubject: 'Your PR review on github',
    emailBody: 'Please review the pull request.',
  },
};

/**
 * #1673 fix: email body does NOT mention "github" in plain text,
 * but the server already found links — card should still render.
 */
export const LinksFoundWithoutKeyword: Story = {
  args: {
    links: [sampleLink],
    loading: false,
    hasToken: true,
    onRefresh: () => undefined,
    emailSubject: 'Your weekly digest',
    emailBody: 'Here is your weekly digest.',
    emailHtmlBody: '<p>Review <a href="https://github.com/Focus-Bear/BearlyMail/pull/42">PR #42</a></p>',
  },
};

/** Loading state */
export const Loading: Story = {
  args: {
    links: [],
    loading: true,
    hasToken: true,
    onRefresh: () => undefined,
    emailSubject: 'PR review requested',
    emailBody: 'github action triggered',
  },
};

/** No token — shows connection prompt */
export const NoToken: Story = {
  args: {
    links: [],
    loading: false,
    hasToken: false,
    onRefresh: () => undefined,
    emailSubject: 'github PR feedback',
    emailBody: 'Please review.',
  },
};

/** Non-GitHub email — section should stay hidden */
export const Hidden: Story = {
  args: {
    links: [],
    loading: false,
    hasToken: true,
    onRefresh: () => undefined,
    emailSubject: 'Lunch plans',
    emailBody: 'Are you free Tuesday?',
  },
};
