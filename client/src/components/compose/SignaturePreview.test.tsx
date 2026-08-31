import React from 'react';
import { render, screen } from '@testing-library/react';

import { SignaturePreview } from './SignaturePreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { mockUseEmailSignature } = vi.hoisted(() => ({ mockUseEmailSignature: vi.fn() }));
vi.mock('hooks/useEmailSignature', () => ({
  useEmailSignature: () => mockUseEmailSignature(),
}));

describe('SignaturePreview', () => {
  it('renders the labelled, distinguished signature preview', () => {
    mockUseEmailSignature.mockReturnValue('Regards,\nEkaterine');

    render(<SignaturePreview />);

    // Clear "added automatically" label so users know it's already configured.
    expect(screen.getByText('compose.signature.autoAdded')).toBeInTheDocument();
    // Signature text is shown (line breaks preserved via white-space: pre-line).
    const preview = screen.getByTestId('signature-preview');
    expect(preview).toHaveTextContent('Regards, Ekaterine');
  });
});
