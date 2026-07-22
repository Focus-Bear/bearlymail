/**
 * Visual stories for the everyday priority/category popover, focused on the new
 * "Categorised by: …" line that tells the user WHICH process assigned the
 * category (AI priority model / deterministic rule / local model / suggested
 * category / manual override).
 *
 * Renders the real PriorityTooltipContent so the screenshot reflects the
 * production popover (Priority Score → CATEGORY → SCORE BREAKDOWN). Wrapped with
 * a scoped i18n instance, MemoryRouter (useHref in the category buttons) and a
 * mocked AuthContext (useAuth).
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { CategorizationSource } from 'types/email';

import { PriorityTooltipContent } from 'components/priority/tooltip/PriorityTooltipContent';
import { AuthContext } from 'contexts/AuthContext';

const tooltipI18n = i18n.createInstance();
tooltipI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        'common.close': 'Close',
        'common.loading': 'Loading…',
        'email.calculating': 'Calculating…',
        'emailDetail.priorityScore': 'Priority Score: {{score}}',
        'emailDetail.scoreBreakdown': 'Score Breakdown',
        'emailDetail.totalScore': 'Total Score',
        'priority.tooltip.correctPrioritization': 'Correct this prioritisation',
        'priority.tooltip.category': 'Category',
        'priority.tooltip.showCategoryExplanation': 'Show why this category was chosen',
        'priority.tooltip.editCategoryRule': 'Edit the rule that matched this category',
        'priority.tooltip.suggestedCategory': 'Suggested Category',
        'priority.tooltip.categorisedBy.label': 'Categorised by: <ruleLink>{{sourceLabel}}</ruleLink>',
        'priority.tooltip.categorisedBy.ai': 'AI priority model',
        'priority.tooltip.categorisedBy.rule': 'Deterministic rule',
        'priority.tooltip.categorisedBy.local': 'Local model',
        'priority.tooltip.categorisedBy.proto': 'Suggested category (pending promotion)',
        'priority.tooltip.categorisedBy.user': 'Your manual choice',
        'priority.categoryOverride.buttonTitle': 'Change category',
        'priority.categoryDebug.buttonTitle': 'Category debug',
      },
    },
  },
});

const mockAuthValue = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
};

const priorityExplanation = {
  score: 72,
  breakdown: [
    { factor: 'Sender importance', value: 30, description: 'From a known VIP contact' },
    { factor: 'Urgency', value: 22, description: 'Time-sensitive request' },
    { factor: 'Goal alignment', value: 20, description: 'Relates to a current project' },
  ],
};

const meta = {
  title: 'Priority/CategorisedByLine',
  parameters: { layout: 'padded' },
};
export default meta;

const Popover: React.FC<{
  category: string;
  categorizationSource: CategorizationSource;
  categoryExplanation?: string;
}> = ({ category, categorizationSource, categoryExplanation }) => (
  <I18nextProvider i18n={tooltipI18n}>
    {/* @ts-expect-error — partial auth mock is sufficient for isolation */}
    <AuthContext.Provider value={mockAuthValue}>
      <MemoryRouter>
        <div
          style={{
            width: 340,
            padding: 16,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <PriorityTooltipContent
            loadingPriorityExplanation={false}
            priorityExplanation={priorityExplanation}
            category={category}
            categoryExplanation={categoryExplanation}
            categorizationSource={categorizationSource}
            emailId="story-email-1"
            onClose={() => {}}
          />
        </div>
      </MemoryRouter>
    </AuthContext.Provider>
  </I18nextProvider>
);

export const AiPriorityModel = {
  name: 'Categorised by — AI priority model',
  render: () => (
    <Popover
      category="Customer Support"
      categorizationSource="ai"
      categoryExplanation="Sender is asking for help resolving a billing issue."
    />
  ),
};

export const DeterministicRule = {
  name: 'Categorised by — Deterministic rule (links to the matched rule)',
  render: () => (
    <Popover
      category="🔧 Human GitHub issue status updates"
      categorizationSource="rule"
      categoryExplanation={
        'Matched deterministic rule (composite): category="🔧 Human GitHub issue status updates" (rule:9f1c2b7a-3d44-4e0a-9c11-a2f6e0d81234)'
      }
    />
  ),
};

export const LocalModel = {
  name: 'Categorised by — Local model',
  render: () => <Popover category="Sales & Prospecting" categorizationSource="local" />,
};

export const SuggestedCategory = {
  name: 'Categorised by — Suggested category',
  render: () => <Popover category="Other" categorizationSource="proto" />,
};

export const ManualOverride = {
  name: 'Categorised by — Your manual choice',
  render: () => <Popover category="Finance" categorizationSource="user" />,
};

export const AllVariants = {
  name: 'All source labels',
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
      <Popover category="Customer Support" categorizationSource="ai" categoryExplanation="Sender is asking for help resolving a billing issue." />
      <Popover category="Newsletters" categorizationSource="rule" />
      <Popover category="Sales & Prospecting" categorizationSource="local" />
      <Popover category="Other" categorizationSource="proto" />
      <Popover category="Finance" categorizationSource="user" />
    </div>
  ),
};
