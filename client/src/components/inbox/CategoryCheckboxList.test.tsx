import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  CATEGORY_CHECKBOX_TEST_ID_PREFIX,
  CATEGORY_SHOW_ALL_TEST_ID,
  CategoryCheckboxList,
} from './CategoryCheckboxList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CATEGORIES = [
  { id: 'clients', label: 'Clients' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'team', label: 'Team' },
];
const MANY_CATEGORIES = Array.from({ length: 9 }, (_, index) => ({ id: `cat-${index}`, label: `Category ${index}` }));
const SEARCH_LABEL = 'inbox.filters.searchCategories';

const rowFor = (id: string) => screen.getByTestId(`${CATEGORY_CHECKBOX_TEST_ID_PREFIX}${id}`);
const checkboxFor = (id: string) => rowFor(id).querySelector('input') as HTMLInputElement;

const renderList = (props: Partial<React.ComponentProps<typeof CategoryCheckboxList>> = {}) =>
  render(<CategoryCheckboxList categories={CATEGORIES} selectedIds={[]} onChange={vi.fn()} {...props} />);

describe('CategoryCheckboxList', () => {
  it('lists every category with its count, ticking the selected ones', () => {
    renderList({ selectedIds: ['receipts'], categoryCounts: { clients: 6, receipts: 3 } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(CATEGORIES.length);
    expect(checkboxFor('receipts').checked).toBe(true);
    expect(checkboxFor('clients').checked).toBe(false);
    expect(rowFor('clients').textContent).toContain('6');
  });

  it('adds a ticked category to the selection and removes an unticked one', () => {
    const onChange = vi.fn();
    renderList({ selectedIds: ['receipts'], onChange });
    fireEvent.click(checkboxFor('team'));
    expect(onChange).toHaveBeenLastCalledWith(['receipts', 'team']);
    fireEvent.click(checkboxFor('receipts'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('clears the selection with "show all", offered only once something is selected', () => {
    const onChange = vi.fn();
    const { rerender } = renderList({ onChange });
    expect(screen.queryByTestId(CATEGORY_SHOW_ALL_TEST_ID)).toBeNull();

    rerender(<CategoryCheckboxList categories={CATEGORIES} selectedIds={['team']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId(CATEGORY_SHOW_ALL_TEST_ID));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('can clear a selected category that is no longer listed', () => {
    const onChange = vi.fn();
    renderList({ selectedIds: ['deleted-category'], onChange });
    fireEvent.click(screen.getByTestId(CATEGORY_SHOW_ALL_TEST_ID));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('holds counts back while they are being refetched', () => {
    renderList({ categoryCounts: { clients: 6 }, loading: true });
    expect(rowFor('clients').textContent).not.toContain('6');
  });

  it('says so when there are no categories, but not while they are still loading', () => {
    const { rerender } = renderList({ categories: [], loading: true });
    expect(screen.queryByText('inbox.filters.noCategories')).toBeNull();
    rerender(<CategoryCheckboxList categories={[]} selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByText('inbox.filters.noCategories')).toBeTruthy();
  });

  it('offers a search box only for a long list, and narrows the rows as the user types', () => {
    const { unmount } = renderList();
    expect(screen.queryByLabelText(SEARCH_LABEL)).toBeNull();
    unmount();

    renderList({ categories: MANY_CATEGORIES });
    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: 'category 4' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value: 'zzz' } });
    expect(screen.getByText('inbox.filters.noMatchingCategories')).toBeTruthy();
  });
});
