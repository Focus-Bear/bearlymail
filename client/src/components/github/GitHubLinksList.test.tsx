import React from 'react';
import { render, screen, within } from '@testing-library/react';
import type { GitHubLink } from 'types/email';

import type { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

import { GitHubLinksList } from './GitHubLinksList';

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    colors: {
      background: { subtle: '#f9fafb', paper: '#fff', default: '#f3f4f6' },
      border: { light: '#e5e7eb', medium: '#d1d5db' },
      text: { primary: '#111', secondary: '#6b7280' },
      primary: { main: '#E9902C', light: '#F0A859', dark: '#D87A1A' },
    },
    borderRadius: { sm: '4px', md: '6px', lg: '8px' },
    typography: { fontSize: { xs: '12px', sm: '14px' }, fontWeight: { medium: 500, semibold: 600 } },
    shadows: { md: '0 1px 3px rgba(0,0,0,.1)' },
  },
}));

vi.mock('constants/strings', () => ({
  GITHUB_STATE_OPEN: 'open',
  GITHUB_STATUS_MERGED: 'merged',
  LINK_TYPE_ISSUE: 'issue',
  ACTION_TYPE_GITHUB_ADD_COMMENT: 'github_add_comment',
  ACTION_TYPE_GITHUB_CREATE_ISSUE: 'github_create_issue',
  ACTION_TYPE_GITHUB_SEARCH_ISSUES: 'github_search_issues',
  ACTION_TYPE_GITHUB_UPDATE_STATUS: 'github_update_status',
  STRING_NONE: 'none',
}));

vi.mock('constants/emojis', () => ({
  EMOJI_CLIPBOARD: '📋',
}));

// Stub out sub-components so we can focus on routing logic
vi.mock('./GitHubLinkCard', () => ({
  GitHubLinkCard: ({ link, suggestedActions }: { link: GitHubLink; suggestedActions?: SuggestedAction[] }) => (
    <div data-testid={`card-${link.owner}-${link.repo}-${link.number}`}>
      {suggestedActions?.map((suggestedAction: SuggestedAction) => (
        <span key={suggestedAction.type} data-testid={`action-${suggestedAction.type}`}>
          {suggestedAction.type}
        </span>
      ))}
    </div>
  ),
}));

const makeLink = (owner: string, repo: string, number: number): GitHubLink => ({
  type: 'issue',
  owner,
  repo,
  number,
  url: `https://github.com/${owner}/${repo}/issues/${number}`,
  status: { state: 'open' },
});

const makeAction = (type: string, owner: string, repo: string, number?: number): SuggestedAction => ({
  type,
  confidence: 0.9,
  reason: 'test',
  metadata: {
    issueInfo: number != null ? { owner, repo, number } : { owner, repo },
  },
});

describe('GitHubLinksList', () => {
  it('routes suggested actions to the matching link card by owner/repo/number', () => {
    const links = [makeLink('acme', 'app', 42), makeLink('acme', 'app', 99)];
    const actions: SuggestedAction[] = [
      makeAction('github_add_comment', 'acme', 'app', 42),
      makeAction('github_update_status', 'acme', 'app', 99),
    ];
    render(<GitHubLinksList links={links} suggestedActions={actions} />);

    const card42 = screen.getByTestId('card-acme-app-42');
    expect(card42).toBeInTheDocument();
    expect(within(card42).getByTestId('action-github_add_comment')).toBeInTheDocument();
    expect(within(card42).queryByTestId('action-github_update_status')).not.toBeInTheDocument();

    const card99 = screen.getByTestId('card-acme-app-99');
    expect(card99).toBeInTheDocument();
    expect(within(card99).getByTestId('action-github_update_status')).toBeInTheDocument();
    expect(within(card99).queryByTestId('action-github_add_comment')).not.toBeInTheDocument();
  });

  it('falls back to repo-level actions when no issue-number match', () => {
    const links = [makeLink('acme', 'backend', 7)];
    const actions: SuggestedAction[] = [makeAction('github_create_issue', 'acme', 'backend')];
    render(<GitHubLinksList links={links} suggestedActions={actions} />);

    const card = screen.getByTestId('card-acme-backend-7');
    expect(within(card).getByTestId('action-github_create_issue')).toBeInTheDocument();
  });

  it('deduplicates links by owner/repo/number', () => {
    const links = [makeLink('org', 'repo', 1), makeLink('org', 'repo', 1)];
    render(<GitHubLinksList links={links} />);
    expect(screen.getAllByTestId('card-org-repo-1')).toHaveLength(1);
  });
});
