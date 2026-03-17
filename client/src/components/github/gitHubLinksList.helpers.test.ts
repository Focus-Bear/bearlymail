/**
 * Unit tests for GitHubLinksList helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { GitHubLink } from 'types/email';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';

import { getActionKey, getDedupeKey } from './gitHubLinksList.helpers';

function makeLink(overrides: Partial<GitHubLink> = {}): GitHubLink {
  return {
    type: 'issue',
    repo: 'my-repo',
    owner: 'my-org',
    number: 42,
    url: 'https://github.com/my-org/my-repo/issues/42',
    ...overrides,
  };
}

function makeAction(metadata: Record<string, unknown> = {}): SuggestedAction {
  return { type: 'create-issue', confidence: 0.9, reason: 'test', metadata };
}

describe('getDedupeKey', () => {
  it('returns lowercase owner/repo#number string', () => {
    const link = makeLink({ owner: 'My-Org', repo: 'My-Repo', number: 42 });
    expect(getDedupeKey(link)).toBe('my-org/my-repo#42');
  });

  it('normalises to lowercase', () => {
    const link = makeLink({ owner: 'UpperOrg', repo: 'UpperRepo', number: 1 });
    expect(getDedupeKey(link)).toBe('upperorg/upperrepo#1');
  });
});

describe('getActionKey', () => {
  it('returns full owner/repo#number key when issueInfo has all fields', () => {
    const action = makeAction({
      issueInfo: { owner: 'my-org', repo: 'my-repo', number: 42 },
    });
    expect(getActionKey(action)).toBe('my-org/my-repo#42');
  });

  it('returns repo-level key when issueInfo has owner/repo but no number', () => {
    const action = makeAction({
      issueInfo: { owner: 'my-org', repo: 'my-repo' },
    });
    expect(getActionKey(action)).toBe('my-org/my-repo');
  });

  it('falls back to defaultRepo when issueInfo is absent', () => {
    const action = makeAction({
      defaultRepo: { owner: 'fallback-org', repo: 'fallback-repo' },
    });
    expect(getActionKey(action)).toBe('fallback-org/fallback-repo');
  });

  it('returns null when no metadata is present', () => {
    const action = makeAction({});
    expect(getActionKey(action)).toBeNull();
  });

  it('normalises to lowercase', () => {
    const action = makeAction({
      issueInfo: { owner: 'UpperOrg', repo: 'UpperRepo', number: 1 },
    });
    expect(getActionKey(action)).toBe('upperorg/upperrepo#1');
  });
});
