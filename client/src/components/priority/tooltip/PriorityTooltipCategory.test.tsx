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
  Trans: ({ i18nKey, components }: { i18nKey: string; components?: Record<string, React.ReactElement> }) => (
    <span>
      {i18nKey}
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
}));

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

  it('does not show edit rule button when categoryExplanation does not indicate a deterministic rule', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation="LLM assigned this category with high confidence"
      />
    );
    expect(screen.queryByTestId('edit-category-rule-btn')).not.toBeInTheDocument();
  });

  it('shows edit rule button when categoryExplanation indicates a deterministic rule match', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        categoryExplanation='Matched deterministic rule (composite): category="Human GitHub issue status updates"'
      />
    );
    expect(screen.getByTestId('edit-category-rule-btn')).toBeInTheDocument();
  });

  it('opens settings in a new tab with encoded category name when edit rule button is clicked', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="Human GitHub issue status updates"
        categoryExplanation='Matched deterministic rule (composite): category="Human GitHub issue status updates"'
      />
    );

    fireEvent.click(screen.getByTestId('edit-category-rule-btn'));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      '/settings?openEditRule=Human%20GitHub%20issue%20status%20updates#guide-our-ai',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens settings in new tab with correct encoding for category names with special characters', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="Bills & Invoices"
        categoryExplanation='Matched deterministic rule (legacy): category="Bills & Invoices"'
      />
    );

    fireEvent.click(screen.getByTestId('edit-category-rule-btn'));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      '/settings?openEditRule=Bills%20%26%20Invoices#guide-our-ai',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens settings in new tab by rule ID when categoryExplanation includes a rule marker (#1789)', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="GitHub PR Updates"
        categoryExplanation='Matched deterministic rule (composite): category="GitHub PR Updates" (rule:abc123-def-456)'
      />
    );

    fireEvent.click(screen.getByTestId('edit-category-rule-btn'));

    // Should open by ruleId, not category name — even when the displayed
    // category has multiple rules, this opens the SPECIFIC matching rule.
    expect(mockWindowOpen).toHaveBeenCalledWith(
      '/settings?openEditRuleId=abc123-def-456#guide-our-ai',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('renders the "Categorised by" line when a categorisationSource is provided', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} categorizationSource="ai" />);
    expect(screen.getByText('priority.tooltip.categorisedBy.label')).toBeInTheDocument();
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
        categoryExplanation='Matched deterministic rule (composite): category="GitHub PR Updates" (rule:abc123-def-456)'
      />
    );

    const link = screen.getByTestId('categorised-by-rule-link');
    expect(link).toHaveAttribute('href', '/settings?openEditRuleId=abc123-def-456#guide-our-ai');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links "Deterministic rule" by category name when there is no rule-ID marker', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="Human GitHub issue status updates"
        categorizationSource="rule"
        categoryExplanation='Matched deterministic rule (composite): category="Human GitHub issue status updates"'
      />
    );

    const link = screen.getByTestId('categorised-by-rule-link');
    expect(link).toHaveAttribute(
      'href',
      '/settings?openEditRule=Human%20GitHub%20issue%20status%20updates#guide-our-ai'
    );
  });

  it('opens the matched rule in a new tab when the "Deterministic rule" link is clicked', () => {
    renderWithRouter(
      <PriorityTooltipCategory
        {...defaultProps}
        category="GitHub PR Updates"
        categorizationSource="rule"
        categoryExplanation='Matched deterministic rule (composite): category="GitHub PR Updates" (rule:abc123-def-456)'
      />
    );

    fireEvent.click(screen.getByTestId('categorised-by-rule-link'));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      '/settings?openEditRuleId=abc123-def-456#guide-our-ai',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('renders "Deterministic rule" as plain text (no link) when the rule cannot be resolved (Other)', () => {
    renderWithRouter(<PriorityTooltipCategory {...defaultProps} category="Other" categorizationSource="rule" />);

    expect(screen.getByText('priority.tooltip.categorisedBy.label')).toBeInTheDocument();
    expect(screen.queryByTestId('categorised-by-rule-link')).not.toBeInTheDocument();
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
        categoryExplanation='Matched deterministic rule (composite): category="Test"'
      />
    );

    const btn = screen.getByTestId('edit-category-rule-btn');
    expect(btn).toHaveAttribute('title', 'priority.tooltip.editCategoryRule');
    expect(btn).toHaveAttribute('aria-label', 'priority.tooltip.editCategoryRule');
  });
});
