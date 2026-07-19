/**
 * Unit tests for AutoResponderPreview helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { buildTemplatePreviews, getFirstName, QueueStats } from './autoResponderPreview.helpers';

describe('getFirstName', () => {
  it('returns "the user" for undefined', () => {
    expect(getFirstName(undefined)).toBe('the user');
  });

  it('returns "the user" for empty string', () => {
    expect(getFirstName('')).toBe('the user');
  });

  it('returns the full string for a single-word name', () => {
    expect(getFirstName('Alice')).toBe('Alice');
  });

  it('returns only the first name from a full name', () => {
    expect(getFirstName('Alice Smith')).toBe('Alice');
  });

  it('returns only the first name from a multi-part name', () => {
    expect(getFirstName('Bob Charles Smith')).toBe('Bob');
  });
});

describe('buildTemplatePreviews', () => {
  const stats: QueueStats = {
    actionCount: 5,
    triageCount: 3,
    avgResponseTime: '2h',
    urgentResponseTime: '30m',
  };

  it('returns all three template keys', () => {
    const result = buildTemplatePreviews('Alice', stats);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['standard', 'highPriority', 'lowPriority']));
  });

  it('includes firstName in template bodies', () => {
    const result = buildTemplatePreviews('Alice', stats);
    expect(result.standard.body).toContain("Alice's AI email assistant");
    expect(result.highPriority.body).toContain("Alice's AI email assistant");
  });

  it('includes stat values in template bodies', () => {
    const result = buildTemplatePreviews('Alice', stats);
    expect(result.standard.body).toContain('5 emails flagged for action');
    expect(result.standard.body).toContain('3 emails still to triage');
    expect(result.standard.body).toContain('2h');
  });

  it('truncates actionCount to "100+" when > 100', () => {
    const result = buildTemplatePreviews('Bob', { ...stats, actionCount: 200 });
    expect(result.standard.body).toContain('100+');
  });

  it('truncates triageCount to "100+" when > 100', () => {
    const result = buildTemplatePreviews('Bob', { ...stats, triageCount: 150 });
    expect(result.standard.body).toContain('100+');
  });

  it('each template has a label and emoji', () => {
    const result = buildTemplatePreviews('Alice', stats);
    expect(result.standard.label).toBeTruthy();
    expect(result.standard.emoji).toBeTruthy();
    expect(result.highPriority.label).toBeTruthy();
    expect(result.lowPriority.label).toBeTruthy();
  });
});
