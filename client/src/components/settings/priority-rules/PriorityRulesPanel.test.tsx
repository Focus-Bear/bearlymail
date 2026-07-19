import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PriorityRuleDto } from 'types/priority-rules.types';

import { PriorityRulesPanel } from './PriorityRulesPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { light: '#e0e0e0', medium: '#ccc' },
    },
    borderRadius: { sm: '4px' },
    typography: { fontSize: { xs: '11px', sm: '12px', lg: '16px' }, fontWeight: { semibold: 600 } },
  },
}));

const makeRule = (overrides: Partial<PriorityRuleDto> = {}): PriorityRuleDto => ({
  id: 'r1',
  sender: 'boss@acme.com',
  senders: ['boss@acme.com'],
  subjectContainsAny: [],
  bodyContainsAny: [],
  band: 'high',
  representativeScore: 80,
  source: 'mined',
  sampleCount: 30,
  dominantBandShare: 0.95,
  hitCount: 12,
  shadowSampleCount: 0,
  shadowDivergenceCount: 0,
  divergenceRate: null,
  isEnabled: true,
  lastValidatedAt: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const noop = { onToggleEnabled: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };

describe('PriorityRulesPanel', () => {
  it('shows the empty message when there are no rules', () => {
    render(<PriorityRulesPanel rules={[]} {...noop} />);
    expect(screen.getByText('settings.priorityRules.empty')).toBeInTheDocument();
  });

  it('renders the sender and learned-from stats for a mined rule', () => {
    render(<PriorityRulesPanel rules={[makeRule()]} {...noop} />);
    expect(screen.getByText('boss@acme.com')).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.priorityRules\.learnedFrom.*"count":30.*"share":95/),
    ).toBeInTheDocument();
  });

  it('toggles a rule off when the checkbox is unchecked', () => {
    const onToggleEnabled = vi.fn();
    render(<PriorityRulesPanel rules={[makeRule()]} {...noop} onToggleEnabled={onToggleEnabled} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleEnabled).toHaveBeenCalledWith('r1', false);
  });

  it('calls onEdit and onDelete with the rule', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const rule = makeRule();
    render(<PriorityRulesPanel rules={[rule]} {...noop} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('common.edit'));
    fireEvent.click(screen.getByText('common.delete'));
    expect(onEdit).toHaveBeenCalledWith(rule);
    expect(onDelete).toHaveBeenCalledWith(rule);
  });
});
