/**
 * Deterministic category rules: legacy auto rules and user composite rules (sender + subject + body).
 * Static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import type { CategoryRuleDto } from 'types/category-rules.types';

import { DeterministicCategoryRulesPanel } from 'components/settings/category-rules/DeterministicCategoryRulesPanel';

const meta: Meta<typeof DeterministicCategoryRulesPanel> = {
  title: 'Settings/CategoryRules/DeterministicRules',
  component: DeterministicCategoryRulesPanel,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DeterministicCategoryRulesPanel>;

const MOCK_RULES: CategoryRuleDto[] = [
  {
    id: 'c1',
    categoryName: 'Invoices',
    ruleKind: 'composite',
    ruleType: null,
    pattern: '',
    subjectPrefix: null,
    compositeSpec: {
      v: 1,
      sender: 'billing@acme.com',
      subjectContains: 'Invoice',
      bodyContainsAny: ['Amount due', 'Please pay'],
    },
    isEnabled: true,
    hitCount: 7,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'r1',
    categoryName: 'GitHub — QA notifications',
    ruleKind: 'legacy',
    ruleType: 'exact_sender',
    pattern: 'notifications@github.com',
    subjectPrefix: null,
    compositeSpec: null,
    isEnabled: true,
    hitCount: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'r2',
    categoryName: 'Jira updates',
    ruleKind: 'legacy',
    ruleType: 'sender_domain_and_subject_prefix',
    pattern: '@acme.atlassian.net',
    subjectPrefix: '[JIRA]',
    compositeSpec: null,
    isEnabled: true,
    hitCount: 18,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'r3',
    categoryName: 'Newsletter',
    ruleKind: 'legacy',
    ruleType: 'subject_prefix',
    pattern: '[Newsletter]',
    subjectPrefix: null,
    compositeSpec: null,
    isEnabled: false,
    hitCount: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const noop = () => {};

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <div style={{ maxWidth: 640, margin: '0 auto' }}>{children}</div>
  </I18nextProvider>
);

export const Default: Story = {
  render: () => (
    <Wrapper>
      <DeterministicCategoryRulesPanel rules={MOCK_RULES} onToggleEnabled={noop} onDelete={noop} onEditComposite={noop} />
    </Wrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <Wrapper>
      <DeterministicCategoryRulesPanel rules={[]} onToggleEnabled={noop} onDelete={noop} />
    </Wrapper>
  ),
};
