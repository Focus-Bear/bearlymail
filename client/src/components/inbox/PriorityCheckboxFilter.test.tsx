import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

import { PRIORITY_CHECKBOX_TEST_ID_PREFIX, PriorityCheckboxFilter } from './PriorityCheckboxFilter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const checkboxFor = (bucketKey: string) =>
  screen.getByTestId(`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}${bucketKey}`).querySelector('input') as HTMLInputElement;

describe('PriorityCheckboxFilter', () => {
  it('renders one checkbox per bucket, Very High first and Very Low last', () => {
    render(<PriorityCheckboxFilter selectedMin={null} selectedMax={null} onChange={vi.fn()} />);
    const labels = screen.getAllByRole('checkbox').map(input => input.getAttribute('aria-label'));
    expect(labels).toEqual([
      'inbox.filters.buckets.veryHigh',
      'inbox.filters.buckets.high',
      'inbox.filters.buckets.medium',
      'inbox.filters.buckets.low',
      'inbox.filters.buckets.veryLow',
    ]);
  });

  it('ticks only High and Very High for the guided default', () => {
    render(<PriorityCheckboxFilter selectedMin={HIGH_PRIORITY_THRESHOLD} selectedMax={null} onChange={vi.fn()} />);
    expect(checkboxFor('veryHigh').checked).toBe(true);
    expect(checkboxFor('high').checked).toBe(true);
    expect(checkboxFor('medium').checked).toBe(false);
  });

  it('ticking Medium asks for the Medium-and-above range', () => {
    const onChange = vi.fn();
    render(<PriorityCheckboxFilter selectedMin={HIGH_PRIORITY_THRESHOLD} selectedMax={null} onChange={onChange} />);
    fireEvent.click(checkboxFor('medium'));
    expect(onChange).toHaveBeenCalledWith(MEDIUM_PRIORITY_THRESHOLD, null);
  });

  it('shows per-bucket counts', () => {
    render(
      <PriorityCheckboxFilter
        selectedMin={null}
        selectedMax={null}
        onChange={vi.fn()}
        bucketCounts={{ 'Very High': 3, High: 7, Medium: 22, Low: 40, 'Very Low': 423 }}
      />
    );
    expect(screen.getByTestId(`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}veryLow`).textContent).toContain('423');
  });

  it('locks the last ticked box so the filter can never be empty', () => {
    render(<PriorityCheckboxFilter selectedMin={50} selectedMax={null} onChange={vi.fn()} />);
    expect(checkboxFor('veryHigh').disabled).toBe(true);
  });
});
