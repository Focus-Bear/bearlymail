import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { CompositeCategoryRuleFormFields } from './CompositeCategoryRuleFormFields';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px' },
    colors: {
      border: { medium: '#ccc' },
      text: { tertiary: '#999' },
      error: { main: '#ef4444' },
    },
    borderRadius: { sm: '4px' },
    typography: { fontSize: { xs: '11px', sm: '12px' } },
  },
}));

const OPTIONS = [
  { id: 'cat-1', name: 'Invoices' },
  { id: 'cat-2', name: '🎧 Media & Communications' },
];

const noop = () => {};

function renderFields(overrides?: { categoryId?: string; onCategoryChange?: (id: string) => void }) {
  return render(
    <CompositeCategoryRuleFormFields
      categoryOptions={OPTIONS}
      categoryId={overrides?.categoryId ?? ''}
      senderLines=""
      subjectLines=""
      bodyLines=""
      subjectNotLines=""
      bodyNotLines=""
      onCategoryChange={overrides?.onCategoryChange ?? noop}
      onSenderLinesChange={noop}
      onSubjectLinesChange={noop}
      onBodyLinesChange={noop}
      onSubjectNotLinesChange={noop}
      onBodyNotLinesChange={noop}
    />,
  );
}

describe('CompositeCategoryRuleFormFields category picker', () => {
  it('submits the category UUID (not the name) when an option is chosen', () => {
    const onCategoryChange = vi.fn();
    renderFields({ onCategoryChange });

    const select = screen.getByRole('combobox');
    // Even an emoji-prefixed category resolves to its id — the reason names break.
    fireEvent.change(select, { target: { value: 'cat-2' } });

    expect(onCategoryChange).toHaveBeenCalledWith('cat-2');
  });

  it('preselects the option matching the provided categoryId', () => {
    renderFields({ categoryId: 'cat-1' });
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('cat-1');
  });
});
