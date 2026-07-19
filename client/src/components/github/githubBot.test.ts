import { getBotLabel } from './githubBot';

describe('getBotLabel', () => {
  it('returns friendly name for known bot logins', () => {
    expect(getBotLabel({ login: 'renovate[bot]', type: 'Bot' })).toBe('Renovate');
    expect(getBotLabel({ login: 'dependabot[bot]', type: 'Bot' })).toBe('Dependabot');
    expect(getBotLabel({ login: 'github-actions[bot]', type: 'Bot' })).toBe('GitHub Actions');
    expect(getBotLabel({ login: 'codeql[bot]', type: 'Bot' })).toBe('CodeQL');
    expect(getBotLabel({ login: 'mergify[bot]', type: 'Bot' })).toBe('Mergify');
  });

  it('maps Claude bot variants to "Claude"', () => {
    expect(getBotLabel({ login: 'claude[bot]', type: 'Bot' })).toBe('Claude');
    expect(getBotLabel({ login: 'claude-code[bot]', type: 'Bot' })).toBe('Claude');
    expect(getBotLabel({ login: 'anthropic-claude[bot]', type: 'Bot' })).toBe('Claude');
  });

  it('maps Gemini bot variants to "Gemini"', () => {
    expect(getBotLabel({ login: 'gemini-code-assist[bot]', type: 'Bot' })).toBe('Gemini');
    expect(getBotLabel({ login: 'gemini[bot]', type: 'Bot' })).toBe('Gemini');
  });

  it('matches known bots case-insensitively', () => {
    expect(getBotLabel({ login: 'Renovate[bot]', type: 'Bot' })).toBe('Renovate');
    expect(getBotLabel({ login: 'DEPENDABOT[BOT]', type: 'Bot' })).toBe('Dependabot');
  });

  it('returns the stripped login for unknown bots when type is Bot', () => {
    expect(getBotLabel({ login: 'somenewbot[bot]', type: 'Bot' })).toBe('somenewbot');
  });

  it('returns the raw login when an unknown bot has no [bot] suffix', () => {
    expect(getBotLabel({ login: 'unusual-bot', type: 'Bot' })).toBe('unusual-bot');
  });

  it('returns null for human authors', () => {
    expect(getBotLabel({ login: 'alice', type: 'User' })).toBeNull();
    expect(getBotLabel({ login: 'octocat', type: 'User' })).toBeNull();
  });

  it('returns null for organization authors', () => {
    expect(getBotLabel({ login: 'focus-bear', type: 'Organization' })).toBeNull();
  });

  it('returns null when author is undefined', () => {
    expect(getBotLabel(undefined)).toBeNull();
  });
});
