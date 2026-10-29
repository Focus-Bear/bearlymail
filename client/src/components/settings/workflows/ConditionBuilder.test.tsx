import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConditionBuilder } from './ConditionBuilder';
import { WorkflowCondition } from './types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

const condition: WorkflowCondition = {
  fromPatterns: ['notifications@github.com'],
  subjectPatterns: [],
  categories: [],
  priorityLevels: [],
  naturalLanguageCondition: null,
};

describe('ConditionBuilder', () => {
  it('adds a body pattern alongside sender and subject patterns', async () => {
    const onChange = vi.fn();
    render(<ConditionBuilder condition={condition} onChange={onChange} categoryNamesById={{}} />);

    expect(screen.getByText('settings.workflows.condition.bodyLabel')).toBeInTheDocument();
    await userEvent.type(
      screen.getByPlaceholderText('settings.workflows.condition.bodyPlaceholder'),
      'new issue in{enter}'
    );

    expect(onChange).toHaveBeenCalledWith({ ...condition, bodyPatterns: ['new issue in'] });
  });

  it('shows existing patterns of every field as removable chips', async () => {
    const onChange = vi.fn();
    render(
      <ConditionBuilder
        condition={{ ...condition, subjectPatterns: ['check translations'], bodyPatterns: ['some jobs'] }}
        onChange={onChange}
        categoryNamesById={{}}
      />
    );

    expect(screen.getByText('check translations')).toBeInTheDocument();
    expect(screen.getByText('some jobs')).toBeInTheDocument();
    const removeButtons = screen.getAllByLabelText('common.remove');
    await userEvent.click(removeButtons[removeButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bodyPatterns: [] }));
  });

  it('names the category a category-scoped workflow runs on', () => {
    render(
      <ConditionBuilder
        condition={{ ...condition, fromPatterns: [], categories: ['cat-1'] }}
        onChange={vi.fn()}
        categoryNamesById={{ 'cat-1': 'GitHub Bot PR Updates' }}
      />
    );

    expect(
      screen.getByText('settings.workflows.condition.categoryScopeNote:{"category":"GitHub Bot PR Updates"}')
    ).toBeInTheDocument();
  });

  it('shows no category note for a workflow that is not category-scoped', () => {
    render(<ConditionBuilder condition={condition} onChange={vi.fn()} categoryNamesById={{}} />);

    expect(screen.queryByText(/categoryScopeNote/)).not.toBeInTheDocument();
  });
});
