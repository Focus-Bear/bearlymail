import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StatusOption, StatusSelector } from './StatusSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    colors: {
      background: { subtle: '#f9fafb', paper: '#fff' },
      border: { medium: '#d1d5db' },
      text: { primary: '#111' },
      primary: { main: '#E9902C', subtle: '#FEF3C7' },
    },
    borderRadius: { md: '6px' },
    typography: { fontSize: { sm: '14px' }, fontWeight: { medium: 500 } },
  },
}));

const OPTIONS: StatusOption[] = [
  { id: 'opt1', name: 'Backlog' },
  { id: 'opt2', name: 'In Progress' },
  { id: 'opt3', name: 'Done' },
];

describe('StatusSelector', () => {
  it('renders the input', () => {
    render(<StatusSelector options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows placeholder when loading', () => {
    render(<StatusSelector options={[]} value="" onChange={vi.fn()} loading />);
    expect(screen.getByPlaceholderText('Loading statuses…')).toBeInTheDocument();
  });

  it('shows dropdown options on focus', async () => {
    render(<StatusSelector options={OPTIONS} value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('textbox'));
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('filters options as user types', async () => {
    const onChange = vi.fn();
    render(<StatusSelector options={OPTIONS} value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'prog');
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByText('Backlog')).not.toBeInTheDocument();
  });

  it('calls onChange with the option name when an option is clicked', async () => {
    const onChange = vi.fn();
    render(<StatusSelector options={OPTIONS} value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('Done'));
    expect(onChange).toHaveBeenCalledWith('Done');
  });

  it('renders label from translation key', () => {
    render(<StatusSelector options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByText('quickActions.github.status')).toBeInTheDocument();
  });
});
