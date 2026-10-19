import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ConfirmModal } from './ConfirmModal';

const baseProps = {
  isOpen: true,
  title: 'Discard this draft?',
  message: 'Your reply has not been sent.',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
};

describe('ConfirmModal', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmModal {...baseProps} isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses the cancel button so Enter picks the safe option', () => {
    render(<ConfirmModal {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' }));
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...baseProps} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders an optional secondary action between cancel and confirm', () => {
    const onSecondary = vi.fn();
    render(
      <ConfirmModal
        {...baseProps}
        secondaryLabel="Save draft"
        onSecondary={onSecondary}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const labels = screen.getAllByRole('button').map(button => button.textContent);
    expect(labels).toEqual(['Keep editing', 'Save draft', 'Discard']);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('omits the secondary action by default', () => {
    render(<ConfirmModal {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
