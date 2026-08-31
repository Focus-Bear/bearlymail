import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SignaturePreview } from './SignaturePreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { mockSignature, mockSaveSignature } = vi.hoisted(() => ({
  mockSignature: { current: 'Regards,\nEkaterine' },
  mockSaveSignature: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('hooks/useEmailSignature', () => ({
  useEmailSignature: () => ({ signature: mockSignature.current, saveSignature: mockSaveSignature }),
}));

describe('SignaturePreview', () => {
  beforeEach(() => {
    mockSignature.current = 'Regards,\nEkaterine';
    mockSaveSignature.mockReset().mockResolvedValue(undefined);
  });

  it('renders the labelled, distinguished signature preview', () => {
    render(<SignaturePreview />);

    expect(screen.getByText('compose.signature.autoAdded')).toBeInTheDocument();
    const preview = screen.getByTestId('signature-preview');
    expect(preview).toHaveTextContent('Regards, Ekaterine');
  });

  it('opens an editor seeded with the current signature when Edit is clicked', () => {
    render(<SignaturePreview />);

    fireEvent.click(screen.getByLabelText('compose.signature.edit'));

    const textarea = screen.getByLabelText('compose.signature.autoAdded') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Regards,\nEkaterine');
  });

  it('saves the edited signature to the profile and exits edit mode', async () => {
    render(<SignaturePreview />);

    fireEvent.click(screen.getByLabelText('compose.signature.edit'));
    const textarea = screen.getByLabelText('compose.signature.autoAdded');
    fireEvent.change(textarea, { target: { value: 'Best,\nEk' } });
    fireEvent.click(screen.getByText('compose.signature.save'));

    await waitFor(() => expect(mockSaveSignature).toHaveBeenCalledWith('Best,\nEk'));
    // Editor closes on success — the Edit button is back.
    await waitFor(() => expect(screen.getByLabelText('compose.signature.edit')).toBeInTheDocument());
  });

  it('cancels without saving', () => {
    render(<SignaturePreview />);

    fireEvent.click(screen.getByLabelText('compose.signature.edit'));
    fireEvent.click(screen.getByText('compose.signature.cancel'));

    expect(mockSaveSignature).not.toHaveBeenCalled();
    expect(screen.getByLabelText('compose.signature.edit')).toBeInTheDocument();
  });

  it('shows an error and stays in edit mode when the save fails', async () => {
    mockSaveSignature.mockRejectedValueOnce(new Error('network'));
    render(<SignaturePreview />);

    fireEvent.click(screen.getByLabelText('compose.signature.edit'));
    fireEvent.click(screen.getByText('compose.signature.save'));

    await waitFor(() => expect(screen.getByText('compose.signature.saveError')).toBeInTheDocument());
    // Still editing (Cancel visible), so the user doesn't lose their change.
    expect(screen.getByText('compose.signature.cancel')).toBeInTheDocument();
  });
});
