/**
 * The bulk bar's snooze flow: the Snooze button swaps the action buttons for a
 * duration input, and only a non-blank duration reaches onBulkSnooze.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

function renderBar(selectedCount = 3) {
  const onBulkSnooze = vi.fn();
  const onBulkArchive = vi.fn();
  const onClearSelection = vi.fn();
  render(
    <BulkOperationsBar
      selectedCount={selectedCount}
      onBulkArchive={onBulkArchive}
      onBulkSnooze={onBulkSnooze}
      onClearSelection={onClearSelection}
    />
  );
  return { onBulkSnooze, onBulkArchive, onClearSelection };
}

function openSnoozeForm(): HTMLElement {
  fireEvent.click(screen.getByText('inbox.bulk.snooze'));
  return screen.getByTestId('bulk-snooze-input');
}

describe('BulkOperationsBar', () => {
  it('renders nothing when no emails are selected', () => {
    const { container } = render(
      <BulkOperationsBar selectedCount={0} onBulkArchive={vi.fn()} onBulkSnooze={vi.fn()} onClearSelection={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('snoozes the whole selection with the entered duration', () => {
    const { onBulkSnooze } = renderBar();

    const input = openSnoozeForm();
    fireEvent.change(input, { target: { value: ' tomorrow 9am ' } });
    fireEvent.click(screen.getByText('common.confirm'));

    expect(onBulkSnooze).toHaveBeenCalledWith('tomorrow 9am');
  });

  it('snoozes on Enter', () => {
    const { onBulkSnooze } = renderBar();

    const input = openSnoozeForm();
    fireEvent.change(input, { target: { value: '4h' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onBulkSnooze).toHaveBeenCalledWith('4h');
  });

  it('does not snooze on a blank duration', () => {
    const { onBulkSnooze } = renderBar();

    const input = openSnoozeForm();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByText('common.confirm'));

    expect(onBulkSnooze).not.toHaveBeenCalled();
  });

  it('returns to the action buttons on Escape without snoozing', () => {
    const { onBulkSnooze } = renderBar();

    const input = openSnoozeForm();
    fireEvent.change(input, { target: { value: '4h' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onBulkSnooze).not.toHaveBeenCalled();
    expect(screen.getByText('inbox.bulk.archive')).toBeInTheDocument();
    expect(screen.queryByTestId('bulk-snooze-input')).not.toBeInTheDocument();
  });
});
