import { TFunction } from 'i18next';

import { describeWorkflowCondition } from './describeWorkflowCondition';
import { WorkflowCondition } from './types';

const translate = ((key: string, options?: Record<string, string>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction;

const EMPTY_CONDITION: WorkflowCondition = {
  fromPatterns: [],
  subjectPatterns: [],
  categories: [],
  priorityLevels: [],
  naturalLanguageCondition: null,
};

const NAMES = { 'cat-1': 'GitHub Bot PR Updates', 'cat-2': 'Receipts' };

describe('describeWorkflowCondition', () => {
  it('describes a category-only rule as any email in that category, not any email at all', () => {
    expect(describeWorkflowCondition({ ...EMPTY_CONDITION, categories: ['cat-1'] }, NAMES, translate)).toBe(
      'settings.workflows.list.conditionCategory:{"category":"GitHub Bot PR Updates"}'
    );
  });

  it('lists every category a rule is scoped to', () => {
    expect(describeWorkflowCondition({ ...EMPTY_CONDITION, categories: ['cat-1', 'cat-2'] }, NAMES, translate)).toBe(
      'settings.workflows.list.conditionCategory:{"category":"GitHub Bot PR Updates, Receipts"}'
    );
  });

  it('falls back to "a specific category" when the name is unknown, never the raw id', () => {
    const description = describeWorkflowCondition({ ...EMPTY_CONDITION, categories: ['gone'] }, NAMES, translate);
    expect(description).toBe(
      'settings.workflows.list.conditionCategory:{"category":"settings.workflows.list.unknownCategory"}'
    );
  });

  it('puts the category first when the rule also has patterns', () => {
    const condition = { ...EMPTY_CONDITION, categories: ['cat-2'], fromPatterns: ['*@shop.com'] };
    expect(describeWorkflowCondition(condition, NAMES, translate)).toBe(
      'settings.workflows.list.conditionInCategory:{"category":"Receipts"}; ' +
        'settings.workflows.list.conditionFrom:{"value":"*@shop.com"}'
    );
  });

  it('mentions the AI check instead of claiming the rule matches any email', () => {
    const condition = { ...EMPTY_CONDITION, naturalLanguageCondition: 'invoices from freelancers' };
    expect(describeWorkflowCondition(condition, NAMES, translate)).toBe(
      'settings.workflows.list.conditionAi:{"value":"invoices from freelancers"}'
    );
  });

  it('still says any email for a rule with no conditions at all', () => {
    expect(describeWorkflowCondition(EMPTY_CONDITION, NAMES, translate)).toBe('settings.workflows.list.conditionAny');
  });
});
