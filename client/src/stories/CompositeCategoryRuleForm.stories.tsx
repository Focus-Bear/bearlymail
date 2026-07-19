/**
 * Composite category rule form modal: add / edit modes with v1 and v2 specs.
 * Static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import type { CompositeSpec } from 'types/category-rules.types';
import { specSenders, specSubjects } from 'types/category-rules.types';

import { CompositeCategoryRuleFormFields } from 'components/settings/category-rules/CompositeCategoryRuleFormFields';
import { CompositeCategoryRuleFormFooter } from 'components/settings/category-rules/CompositeCategoryRuleFormFooter';

const meta: Meta = {
  title: 'Settings/CategoryRules/CompositeRuleForm',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const noop = () => {};

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        background: '#fff',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {children}
    </div>
  </I18nextProvider>
);

const MOCK_CATEGORY_OPTIONS = [
  { id: 'cat-1', name: 'Invoices' },
  { id: 'cat-2', name: 'GitHub Notifications' },
  { id: 'cat-3', name: 'Newsletters' },
];

/** Add mode — empty form */
export const AddMode: Story = {
  render: () => (
    <Wrapper>
      <h3 style={{ margin: '0 0 16px' }}>Add composite rule</h3>
      <CompositeCategoryRuleFormFields
        categoryOptions={MOCK_CATEGORY_OPTIONS}
        categoryId=""
        senderLines=""
        subjectLines=""
        bodyLines=""
        onCategoryChange={noop}
        onSenderLinesChange={noop}
        onSubjectLinesChange={noop}
        onBodyLinesChange={noop}
        subjectNotLines=""
        bodyNotLines=""
        onSubjectNotLinesChange={noop}
        onBodyNotLinesChange={noop}
      />
      <div style={{ marginTop: 16 }}>
        <CompositeCategoryRuleFormFooter saving={false} onClose={noop} onSave={noop} />
      </div>
    </Wrapper>
  ),
};

/** Edit mode — pre-filled with a v1 spec (single sender/subject) */
export const EditModeV1: Story = {
  render: () => {
    const v1Spec: CompositeSpec = {
      v: 1,
      sender: 'billing@acme.com',
      subjectContains: 'Invoice',
      bodyContainsAny: ['Amount due', 'Please pay'],
    };
    return (
      <Wrapper>
        <h3 style={{ margin: '0 0 16px' }}>Edit composite rule (v1)</h3>
        <CompositeCategoryRuleFormFields
          categoryOptions={MOCK_CATEGORY_OPTIONS}
          categoryId="cat-1"
          senderLines={specSenders(v1Spec).join('\n')}
          subjectLines={specSubjects(v1Spec).join('\n')}
          bodyLines={v1Spec.bodyContainsAny.join('\n')}
          subjectNotLines=""
          bodyNotLines=""
          onCategoryChange={noop}
          onSenderLinesChange={noop}
          onSubjectLinesChange={noop}
          onBodyLinesChange={noop}
          onSubjectNotLinesChange={noop}
          onBodyNotLinesChange={noop}
        />
        <div style={{ marginTop: 16 }}>
          <CompositeCategoryRuleFormFooter saving={false} onClose={noop} onSave={noop} />
        </div>
      </Wrapper>
    );
  },
};

/** Edit mode — pre-filled with a v2 spec (multiple senders/subjects) */
export const EditModeV2: Story = {
  render: () => {
    const v2Spec: CompositeSpec = {
      v: 2,
      senderMatchesAny: ['billing@acme.com', 'invoices@acme.com', 'noreply@stripe.com'],
      subjectContainsAny: ['Invoice', 'Receipt', 'Payment confirmation'],
      bodyContainsAny: ['Amount due', 'Please pay', 'Total charged'],
    };
    return (
      <Wrapper>
        <h3 style={{ margin: '0 0 16px' }}>Edit composite rule (v2 — multi-condition)</h3>
        <CompositeCategoryRuleFormFields
          categoryOptions={MOCK_CATEGORY_OPTIONS}
          categoryId="cat-1"
          senderLines={v2Spec.senderMatchesAny.join('\n')}
          subjectLines={v2Spec.subjectContainsAny.join('\n')}
          bodyLines={v2Spec.bodyContainsAny.join('\n')}
          subjectNotLines=""
          bodyNotLines=""
          onCategoryChange={noop}
          onSenderLinesChange={noop}
          onSubjectLinesChange={noop}
          onBodyLinesChange={noop}
          onSubjectNotLinesChange={noop}
          onBodyNotLinesChange={noop}
        />
        <div style={{ marginTop: 16 }}>
          <CompositeCategoryRuleFormFooter saving={false} onClose={noop} onSave={noop} />
        </div>
      </Wrapper>
    );
  },
};

/** Saving state — disabled Save button */
export const SavingState: Story = {
  render: () => (
    <Wrapper>
      <h3 style={{ margin: '0 0 16px' }}>Saving...</h3>
      <CompositeCategoryRuleFormFields
        categoryOptions={MOCK_CATEGORY_OPTIONS}
        categoryId="cat-1"
        senderLines="billing@acme.com"
        subjectLines="Invoice"
        bodyLines="Amount due"
        onCategoryChange={noop}
        onSenderLinesChange={noop}
        onSubjectLinesChange={noop}
        onBodyLinesChange={noop}
        subjectNotLines=""
        bodyNotLines=""
        onSubjectNotLinesChange={noop}
        onBodyNotLinesChange={noop}
      />
      <div style={{ marginTop: 16 }}>
        <CompositeCategoryRuleFormFooter saving onClose={noop} onSave={noop} />
      </div>
    </Wrapper>
  ),
};
