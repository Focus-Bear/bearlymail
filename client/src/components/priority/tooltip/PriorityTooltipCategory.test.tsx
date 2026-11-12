import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { PriorityTooltipCategory } from './PriorityTooltipCategory';

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockWindowOpen = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  // Render the i18nKey (so it stays findable) plus any injected component such
  // as the "Deterministic rule" link, so its href/testid can be asserted.
  Trans: ({
    i18nKey,
    values,
    components,
  }: {
    i18nKey: string;
    values?: { sourceLabel?: string };
    components?: Record<string, React.ReactElement>;
  }) => (
    <span>
      {i18nKey}
      <span data-testid="categorised-by-source-label">{values?.sourceLabel}</span>
      {components?.ruleLink}
    </span>
  ),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin: false } }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { light: '#e0e0e0' },
      primary: { main: '#E9902C' },
    },
    borderRadius: { sm: '4px' },
    typography: {
      fontSize: { xs: '11px', sm: '12px' },
      fontWeight: { semibold: 600, medium: 500 },
    },
  },
}));

vi.mock('components/priority/CategoryDebugModal', () => ({
  CategoryDebugModal: () => null,
}));

vi.mock('components/priority/CategoryOverrideModal', () => ({
  CategoryOverrideModal: () => null,
}));

vi.mock('constants/strings', () => ({
  CATEGORY_OTHER: 'Other',
  ROUTE_SETTINGS: '/settings',
}));

const RULE_ID = '263666e4-b0a6-47c6-b310-a1dcdb42e4e3';
const RULE_EDIT_HREF = `/settings?openEditRuleId=${RULE_ID}#category-rules`;
const RULES_LIST_HREF = '/settings#category-rules';

const defaultProps = {
  category: 'Human GitHub issue status updates',
  emailId: 'email-123',
};

describe('PriorityTooltipCategory', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
    vi.spyOn(window, 'open').mockImplementation(mockWindowOpen);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show edit rule button when categoryExplanation is absent', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} />);
    expect(screen.queryByTestId('edit-category-rule-btn')).not.toBeInTheDocument();
  });

  it('renders a labelled, actionable category edit button', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} />);
    const editBtn = screen.getByTestId('edit-category-btn');
    expect(editBtn).toBeInTheDocument();
    // Visible "Edit" label (mocked t returns the key) makes it discoverable.
    expect(editBtn).toHaveTextContent('priority.categoryOverride.editButton');
    expect(editBtn).toHaveAttribute('aria-label', 'priority.categoryOverride.buttonTitle');
  });

  it('does not show edit rule button when categoryExplanation does not indicate a deterministic rule', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation="LLM assigned this category with high confidence"
      />
    );
    expect(screen.queryByTestId('edit-category-rule-btn')).not.toBeInTheDocument();
  });

  it('shows edit rule button when categoryExplanation records the matched rule ID', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation={`Matched deterministic rule (composite): category="Human GitHub issue status updates" (rule:${RULE_ID})`}
      />
    );
    expect(screen.getByTestId('edit-category-rule-btn')).toBeInTheDocument();
  });

  it('hides the edit rule button when the explanation does not record which rule matched', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation='Matched deterministic rule (composite): category="Human GitHub issue status updates"'
      />
    );
    expect(screen.queryByTestId('edit-category-rule-btn')).not.toBeInTheDocument();
  });

  it('opens the matched rule by ID only — the category name is never in the link', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="📅 Meeting Reschedule Requests"
        categoryExplanation={`Matched deterministic rule (composite): category="📅 Meeting Reschedule Requests" (rule:${RULE_ID})`}
      />
    );

    fireEvent.click(screen.getByTestId('edit-category-rule-btn'));

    expect(mockWindowOpen).toHaveBeenCalledWith(RULE_EDIT_HREF, '_blank', 'noopener,noreferrer');
  });

  it('renders the "Categorised by" line when a categorisationSource is provided', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} categorizationSource="ai" />);
    expect(screen.getByText('priority.tooltip.categorisedBy.label')).toBeInTheDocument();
  });

  it.each([
    ['openai', 'priority.tooltip.aiProvider.openai'],
    ['gemini', 'priority.tooltip.aiProvider.gemini'],
    ['bedrock', 'priority.tooltip.aiProvider.bedrock'],
    ['jev', 'priority.tooltip.aiProvider.jev'],
  ] as const)('names the AI engine (%s) behind an AI-decided category', (provider, labelKey) => {
    renderWithRouter(
      <PriorityTooltipCategory {...defaultProps} categorizationSource="ai" categorizationProvider={provider} />
    );
    expect(screen.getByTestId('categorised-by-source-label')).toHaveTextContent(labelKey);
  });

  it('falls back to the generic AI label when the provider was not recorded', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} categorizationSource="ai" />);
    expect(screen.getByTestId('categorised-by-source-label')).toHaveTextContent('priority.tooltip.aiProvider.unknown');
  });

  it('keeps the rule label for a rule-decided category even if a provider is present', () => {
    renderWithRouter(
      <PriorityTooltipCategory {...defaultProps} categorizationSource="rule" categorizationProvider="gemini" />
    );
    expect(screen.getByTestId('categorised-by-source-label')).toHaveTextContent('priority.tooltip.categorisedBy.rule');
  });

  it('does not render the "Categorised by" line when categorisationSource is absent', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} />);
    expect(screen.queryByText('priority.tooltip.categorisedBy.label')).not.toBeInTheDocument();
  });

  it('links "Deterministic rule" to the specific matched rule by ID when the source is a rule', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="GitHub PR Updates"
        categorizationSource="rule"
        categoryExplanation={`Matched deterministic rule (composite): category="GitHub PR Updates" (rule:${RULE_ID})`}
      />
    );

    const link = screen.getByTestId('categorised-by-rule-link');
    expect(link).toHaveAttribute('href', RULE_EDIT_HREF);
    expect(link).toHaveAttribute('title', 'priority.tooltip.editCategoryRule');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it.each([
    [
      'a retro-applied rule',
      'Deterministic rule (category "🐛 Human GitHub issue status updates") applied retroactively — the rule was created or updated after this thread was last processed.',
    ],
    [
      'a priority+category rule',
      'Deterministic priority+category rule (category "🐛 Human GitHub issue status updates")',
    ],
    ['no explanation', null],
  ])(
    'links "Deterministic rule" to the rules list, never a rule picked by name, when %s recorded no rule ID',
    (_case, categoryExplanation) => {
      renderWithRouter(
        <PriorityTooltipCategory
          {...defaultProps}
          category="🐛 Human GitHub issue status updates"
          categorizationSource="rule"
          categoryExplanation={categoryExplanation}
        />
      );

      const link = screen.getByTestId('categorised-by-rule-link');
      expect(link).toHaveAttribute('href', RULES_LIST_HREF);
      expect(link.getAttribute('href')).not.toContain('openEditRule');
      expect(link).toHaveAttribute('title', 'priority.tooltip.openCategoryRulesList');
    }
  );

  it('opens the matched rule in a new tab when the "Deterministic rule" link is clicked', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="GitHub PR Updates"
        categorizationSource="rule"
        categoryExplanation={`Matched deterministic rule (composite): category="GitHub PR Updates" (rule:${RULE_ID})`}
      />
    );

    fireEvent.click(screen.getByTestId('categorised-by-rule-link'));

    expect(mockWindowOpen).toHaveBeenCalledWith(RULE_EDIT_HREF, '_blank', 'noopener,noreferrer');
  });

  it.each(['ai', 'local', 'proto', 'user'] as const)(
    'does not link the categorisation source for non-rule source "%s"',
    source => {
      renderWithRouter(
        <PriorityTooltipCategory {...defaultProps} category="GitHub PR Updates" categorizationSource={source} />
      );

      expect(screen.getByText('priority.tooltip.categorisedBy.label')).toBeInTheDocument();
      expect(screen.queryByTestId('categorised-by-rule-link')).not.toBeInTheDocument();
    }
  );

  it('edit rule button has correct accessible title and aria-label', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation={`Matched deterministic rule (composite): category="Test" (rule:${RULE_ID})`}
      />
    );

    const btn = screen.getByTestId('edit-category-rule-btn');
    expect(btn).toHaveAttribute('title', 'priority.tooltip.editCategoryRule');
    expect(btn).toHaveAttribute('aria-label', 'priority.tooltip.editCategoryRule');
  });
});
