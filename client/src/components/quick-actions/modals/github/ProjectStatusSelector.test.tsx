import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProjectStatusOption, ProjectStatusSelector } from './ProjectStatusSelector';

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
      border: { medium: '#d1d5db', light: '#e5e7eb' },
      text: { primary: '#111', secondary: '#6b7280' },
      primary: { main: '#E9902C', subtle: '#FEF3C7' },
    },
    borderRadius: { md: '6px' },
    typography: { fontSize: { sm: '14px' }, fontWeight: { medium: 500 } },
  },
}));

const OPTIONS: ProjectStatusOption[] = [
  { id: 'opt1', name: 'Backlog', color: 'GRAY' },
  { id: 'opt2', name: 'In Progress', color: 'BLUE' },
  { id: 'opt3', name: 'Done', color: 'GREEN' },
];

describe('ProjectStatusSelector', () => {
  it('renders the combobox input', () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows loading text when loading is true', () => {
    render(<ProjectStatusSelector options={[]} selectedId="" onSelect={vi.fn()} loading />);
    expect(screen.getByText('Loading statuses…')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows empty state when there are no options and not loading', () => {
    render(<ProjectStatusSelector options={[]} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByText('No status options found for this project.')).toBeInTheDocument();
  });

  it('shows dropdown options on focus', async () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('filters options as user types', async () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'prog');
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByText('Backlog')).not.toBeInTheDocument();
  });

  it('calls onSelect with option id when an option is clicked', async () => {
    const onSelect = vi.fn();
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByText('Done'));
    expect(onSelect).toHaveBeenCalledWith('opt3');
  });

  it('pre-fills input with the selected option name', () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="opt2" onSelect={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveValue('In Progress');
  });

  it('renders color dots in the dropdown', async () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    // Each option renders a color dot span (data-testid="color-dot")
    const dots = screen.getAllByTestId('color-dot');
    expect(dots.length).toBeGreaterThanOrEqual(OPTIONS.length);
  });

  it('renders the status label from translation key', () => {
    render(<ProjectStatusSelector options={OPTIONS} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByText('quickActions.github.status')).toBeInTheDocument();
  });
});
