/**
 * Unit tests for templateUtils — renderPreviewWithMergeTags
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { renderPreviewWithMergeTags } from './templateUtils';

// renderPreviewWithMergeTags

describe('renderPreviewWithMergeTags', () => {
  const baseStats = {
    actionCount: 5,
    triageCount: 3,
    avgResponseTime: '2h',
    urgentResponseTime: '30m',
  };

  it('replaces {{userName}} with the provided name', () => {
    const view = renderPreviewWithMergeTags('Hello {{userName}}!', 'Alice', baseStats);
    expect(view).toBe('Hello Alice!');
  });

  it('replaces {{actionCount}} with the count when <= 100', () => {
    const view = renderPreviewWithMergeTags('Count: {{actionCount}}', 'Alice', {
      ...baseStats,
      actionCount: 42,
    });
    expect(view).toBe('Count: 42');
  });

  it('replaces {{actionCount}} with "100+" when count > 100', () => {
    const view = renderPreviewWithMergeTags('Count: {{actionCount}}', 'Alice', {
      ...baseStats,
      actionCount: 150,
    });
    expect(view).toBe('Count: 100+');
  });

  it('replaces {{triageCount}} with "100+" when count > 100', () => {
    const view = renderPreviewWithMergeTags('Triage: {{triageCount}}', 'Alice', {
      ...baseStats,
      triageCount: 200,
    });
    expect(view).toBe('Triage: 100+');
  });

  it('replaces {{triageCount}} with numeric string when <= 100', () => {
    const view = renderPreviewWithMergeTags('Triage: {{triageCount}}', 'Alice', {
      ...baseStats,
      triageCount: 7,
    });
    expect(view).toBe('Triage: 7');
  });

  it('expands {{#if hasAiAnswer}}...{{/if}} block (preview shows as always-true)', () => {
    const template = '{{#if hasAiAnswer}}AI block content{{/if}}';
    const view = renderPreviewWithMergeTags(template, 'Alice', baseStats);
    expect(view).toBe('AI block content');
  });

  it('removes {{#unless hasAiAnswer}}...{{/unless}} block', () => {
    const template = '{{#unless hasAiAnswer}}No AI fallback{{/unless}}';
    const view = renderPreviewWithMergeTags(template, 'Alice', baseStats);
    expect(view).toBe('');
  });

  it('replaces {{aiAnswer}} with placeholder text', () => {
    const view = renderPreviewWithMergeTags('Answer: {{aiAnswer}}', 'Alice', baseStats);
    expect(view).toContain('[AI-generated answer would appear here');
  });

  it('replaces {{senderName}} with "John Smith"', () => {
    const view = renderPreviewWithMergeTags('Hi {{senderName}}', 'Alice', baseStats);
    expect(view).toBe('Hi John Smith');
  });

  it('replaces {{avgResponseTime}} with the value from stats', () => {
    const view = renderPreviewWithMergeTags('Avg: {{avgResponseTime}}', 'Alice', {
      ...baseStats,
      avgResponseTime: '3h',
    });
    expect(view).toBe('Avg: 3h');
  });

  it('handles template with no merge tags unchanged', () => {
    const view = renderPreviewWithMergeTags('Plain text.', 'Alice', baseStats);
    expect(view).toBe('Plain text.');
  });
});
