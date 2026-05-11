/**
 * Unit tests for githubUtils.ts
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { emailMentionsGitHub } from './githubUtils';

describe('emailMentionsGitHub', () => {
  it('returns false when all fields are undefined', () => {
    expect(emailMentionsGitHub()).toBe(false);
  });

  it('returns false when no field mentions github', () => {
    expect(emailMentionsGitHub('Meeting notes', 'See you tomorrow', '<p>Thanks!</p>')).toBe(false);
  });

  it('returns true when subject contains "github"', () => {
    expect(emailMentionsGitHub('New PR on GitHub', '', '')).toBe(true);
  });

  it('returns true when body contains "github"', () => {
    expect(emailMentionsGitHub('Update', 'Check the github repo for details', '')).toBe(true);
  });

  it('returns true when htmlBody contains "github"', () => {
    expect(emailMentionsGitHub('Hi', 'Plain text', '<a href="https://github.com/org/repo">View PR</a>')).toBe(true);
  });

  it('is case-insensitive — matches GitHub, GITHUB, gitHub', () => {
    expect(emailMentionsGitHub('GitHub notification')).toBe(true);
    expect(emailMentionsGitHub('GITHUB notification')).toBe(true);
    expect(emailMentionsGitHub('gitHub notification')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(emailMentionsGitHub('', '', '')).toBe(false);
  });

  it('returns true when from is notifications@github.com even with no github in content', () => {
    expect(emailMentionsGitHub('Meeting notes', 'See you tomorrow', '<p>Thanks!</p>', 'notifications@github.com')).toBe(
      true
    );
  });

  it('returns true when from contains notifications@github.com with display name', () => {
    expect(emailMentionsGitHub('Issue update', '', '', 'GitHub <notifications@github.com>')).toBe(true);
  });

  it('is case-insensitive for sender check', () => {
    expect(emailMentionsGitHub('Issue update', '', '', 'NOTIFICATIONS@GITHUB.COM')).toBe(true);
  });

  it('returns true when from is a repo-specific noreply address (e.g. windows-app-v2@noreply.github.com)', () => {
    expect(
      emailMentionsGitHub('Meeting notes', 'See you tomorrow', '<p>Thanks!</p>', 'windows-app-v2@noreply.github.com')
    ).toBe(true);
  });

  it('returns true when from is noreply@github.com', () => {
    expect(emailMentionsGitHub('Update', 'body', '', 'noreply@github.com')).toBe(true);
  });

  it('returns false when from is a different sender with no github in content', () => {
    expect(emailMentionsGitHub('Meeting notes', 'See you tomorrow', '<p>Thanks!</p>', 'someone@example.com')).toBe(
      false
    );
  });
});
