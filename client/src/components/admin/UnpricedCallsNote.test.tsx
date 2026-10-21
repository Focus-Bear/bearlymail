import React from 'react';
import { render, screen } from '@testing-library/react';

import { getOperationLabel } from './tokenUsageUtils';
import { UnpricedCallsNote } from './UnpricedCallsNote';

// The mocked t() echoes the key plus interpolation values so assertions can
// check the count that reaches the copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

describe('UnpricedCallsNote', () => {
  it('renders nothing when every call was priced', () => {
    const { container } = render(<UnpricedCallsNote unpricedCallCount={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a backend that predates the field', () => {
    const { container } = render(<UnpricedCallsNote />);

    expect(container).toBeEmptyDOMElement();
  });

  it('flags the cost as excluding unpriced calls', () => {
    render(<UnpricedCallsNote unpricedCallCount={1500} />);

    const options = JSON.stringify({ count: 1500, formattedCount: '1.5K' });
    const note = screen.getByText(`admin.tokenUsage.unpricedCalls:${options}`);
    expect(note).toHaveAttribute('title', `admin.tokenUsage.unpricedCallsHint:${options}`);
  });
});

describe('getOperationLabel', () => {
  it('uses the server-provided label', () => {
    expect(getOperationLabel({ operation: 'confirm_phishing', operationLabel: 'Confirm Phishing (second opinion)' })).toBe(
      'Confirm Phishing (second opinion)'
    );
  });

  it('falls back to the raw operation id when the server sends no label', () => {
    expect(getOperationLabel({ operation: 'categorise_summary' })).toBe('categorise_summary');
  });
});
