import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ToneCheckToast } from './ToneCheckToast';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ToneCheckToast', () => {
  it('renders nothing when not visible', () => {
    render(<ToneCheckToast visible={false} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('tone-check-toast')).not.toBeInTheDocument();
  });

  it('renders toast with status text when visible', () => {
    render(<ToneCheckToast visible onCancel={jest.fn()} />);
    expect(screen.getByText('toneCheck.toastChecking')).toBeInTheDocument();
  });

  it('renders a cancel link', () => {
    render(<ToneCheckToast visible onCancel={jest.fn()} />);
    expect(screen.getByText('toneCheck.cancelSend')).toBeInTheDocument();
  });

  it('calls onCancel when cancel link is clicked', () => {
    const onCancel = jest.fn();
    render(<ToneCheckToast visible onCancel={onCancel} />);
    fireEvent.click(screen.getByText('toneCheck.cancelSend'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has role="status" for accessibility', () => {
    render(<ToneCheckToast visible onCancel={jest.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has a test id for easy querying', () => {
    render(<ToneCheckToast visible onCancel={jest.fn()} />);
    expect(screen.getByTestId('tone-check-toast')).toBeInTheDocument();
  });
});
