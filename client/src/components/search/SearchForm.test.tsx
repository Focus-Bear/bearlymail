import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchForm } from './SearchForm';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SEARCH_INPUT_PLACEHOLDER = 'search.placeholder';

function renderSearchForm(props: { query: string; loading: boolean }) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<SearchForm query={props.query} loading={props.loading} onQueryChange={vi.fn()} onSubmit={onSubmit} />);
  return { onSubmit };
}

describe('SearchForm', () => {
  it('submits when Enter is pressed in the search input', async () => {
    const { onSubmit } = renderSearchForm({ query: 'invoice', loading: false });

    await userEvent.type(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('still submits on Enter while a previous search is loading', async () => {
    const { onSubmit } = renderSearchForm({ query: 'invoice', loading: true });

    await userEvent.type(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit an empty query', async () => {
    const { onSubmit } = renderSearchForm({ query: '  ', loading: false });

    await userEvent.type(screen.getByPlaceholderText(SEARCH_INPUT_PLACEHOLDER), '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'search.search' })).toBeDisabled();
  });
});
