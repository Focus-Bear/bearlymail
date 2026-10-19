import en from 'locales/en.json';
import es from 'locales/es.json';

import {
  AI_PROVIDER_LABEL_KEYS,
  getAiProviderLabelKey,
  getCategorisationSourceLabelKey,
  getPrioritySourceLabelKey,
  UNKNOWN_AI_PROVIDER_LABEL_KEY,
} from './decisionSourceLabels';

type LocaleTree = { [key: string]: string | LocaleTree };

function lookup(locale: LocaleTree, key: string): string | undefined {
  const value = key.split('.').reduce<string | LocaleTree | undefined>(
    (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
    locale
  );
  return typeof value === 'string' ? value : undefined;
}

describe('decisionSourceLabels', () => {
  it('maps each AI provider to its own label key', () => {
    expect(getAiProviderLabelKey('openai')).toBe('priority.tooltip.aiProvider.openai');
    expect(getAiProviderLabelKey('gemini')).toBe('priority.tooltip.aiProvider.gemini');
    expect(getAiProviderLabelKey('bedrock')).toBe('priority.tooltip.aiProvider.bedrock');
    expect(getAiProviderLabelKey('jev')).toBe('priority.tooltip.aiProvider.jev');
  });

  it('uses the generic AI label when the provider is unknown', () => {
    expect(getAiProviderLabelKey(null)).toBe(UNKNOWN_AI_PROVIDER_LABEL_KEY);
    expect(getAiProviderLabelKey(undefined)).toBe(UNKNOWN_AI_PROVIDER_LABEL_KEY);
  });

  it('names the provider only for AI categorisation; other sources keep their labels', () => {
    expect(getCategorisationSourceLabelKey('ai', 'jev')).toBe('priority.tooltip.aiProvider.jev');
    expect(getCategorisationSourceLabelKey('rule', 'jev')).toBe('priority.tooltip.categorisedBy.rule');
    expect(getCategorisationSourceLabelKey('local', null)).toBe('priority.tooltip.categorisedBy.local');
    expect(getCategorisationSourceLabelKey('user', null)).toBe('priority.tooltip.categorisedBy.user');
    expect(getCategorisationSourceLabelKey('proto', null)).toBe('priority.tooltip.categorisedBy.proto');
  });

  it('names the provider only for LLM priority scores; rule/local keep their labels', () => {
    expect(getPrioritySourceLabelKey('llm', 'gemini')).toBe('priority.tooltip.aiProvider.gemini');
    expect(getPrioritySourceLabelKey('llm', null)).toBe(UNKNOWN_AI_PROVIDER_LABEL_KEY);
    expect(getPrioritySourceLabelKey('rule', 'gemini')).toBe('priority.tooltip.scoredBy.rule');
    expect(getPrioritySourceLabelKey('local', null)).toBe('priority.tooltip.scoredBy.local');
  });

  it('has the agreed wording in English', () => {
    expect(lookup(en, AI_PROVIDER_LABEL_KEYS.openai)).toBe('LLM (OpenAI)');
    expect(lookup(en, AI_PROVIDER_LABEL_KEYS.gemini)).toBe('LLM (Gemini)');
    expect(lookup(en, AI_PROVIDER_LABEL_KEYS.bedrock)).toBe('LLM (Amazon Bedrock)');
    expect(lookup(en, AI_PROVIDER_LABEL_KEYS.jev)).toBe('TypeSafe AI (Jev)');
  });

  it('has every label key translated in every locale', () => {
    const keys = [
      ...Object.values(AI_PROVIDER_LABEL_KEYS),
      UNKNOWN_AI_PROVIDER_LABEL_KEY,
      'priority.tooltip.scoredBy.label',
      'priority.tooltip.scoredBy.rule',
      'priority.tooltip.scoredBy.local',
    ];
    for (const locale of [en, es] as LocaleTree[]) {
      for (const key of keys) {
        expect(lookup(locale, key)).toEqual(expect.any(String));
      }
    }
  });
});
